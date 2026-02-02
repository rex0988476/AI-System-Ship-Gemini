import os
import getpass
import logging
import json
import hashlib
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Set

from langchain.chat_models import init_chat_model
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_chroma import Chroma
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_core.documents import Document
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.runnables import RunnablePassthrough
from langchain_core.output_parsers import StrOutputParser
from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_unstructured import UnstructuredLoader
from langchain.retrievers.multi_query import MultiQueryRetriever
from prompt import *

class RAGSystem:
    def __init__(self, 
        data_dir: str = "./data/",
        log_dir: str = "./log/",
        vector_store_dir: str = "./database/",
        model_provider: str = "google_genai",
        model_name: str = "gemini-1.5-pro-latest",
        embedding_model_provider: str = "google_genai",
        embedding_model: str = "models/text-embedding-004",
        collection_name: str = "rag_documents",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        top_k: int = 1000,
        top_p: float = 1.0,
        update_database: bool = False):
        
        # Validate parameters
        if chunk_size <= 0:
            raise ValueError("chunk_size must be positive")
        if chunk_overlap < 0 or chunk_overlap >= chunk_size:
            raise ValueError("chunk_overlap must be non-negative and less than chunk_size")
        if not (0.0 <= temperature <= 2.0):
            raise ValueError("temperature must be between 0.0 and 2.0")
        if max_tokens <= 0:
            raise ValueError("max_tokens must be positive")
        if top_k <= 0:
            raise ValueError("top_k must be positive")
        if not (0.0 <= top_p <= 1.0):
            raise ValueError("top_p must be between 0.0 and 1.0") 

        self.data_dir = Path(data_dir)
        self.log_dir = Path(log_dir)
        self.vector_store_dir = Path(vector_store_dir)
        self.model_provider = model_provider
        self.model_name = model_name
        self.embedding_model_provider = embedding_model_provider
        self.embedding_model = embedding_model
        self.collection_name = collection_name
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_k = top_k
        self.top_p = top_p
        self.update_database = update_database
        
        # Track processed files
        # self.texts = ""
        self.processed_files_path = self.vector_store_dir / "processed_files.json"
        self.texts2update = None
        
        # Create instance
        self._setup_logging()
        self._initialize_embedding()
        self._initialize_llm()
        self._create_vectorstore()
        self._create_retriever()
        self._create_rag_chain()
        
    def _setup_logging(self):
        """Setup logging configuration"""
        self.log_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = self.log_dir / f"langchain_{timestamp}.log"
        
        logging.basicConfig(
            level=logging.INFO,
            format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
            handlers=[
                logging.FileHandler(log_file),
                logging.StreamHandler()
            ]
        )
        
        self.logger = logging.getLogger(__name__)
        self.logger.info("RAG System logging initialized")
    
    def _initialize_embedding(self):
        """Initialize LLM, embeddings, and vector store"""
        # Initialize embeddings based on the embedding model
        if self.embedding_model_provider == "google_genai":
            try:
                self.embeddings = GoogleGenerativeAIEmbeddings(model=self.embedding_model)
                self.logger.info(f"Initialized Google GenAI embeddings with model: {self.embedding_model}")
            except Exception as e:
                self.logger.error(f"Failed to initialize Google GenAI embeddings: {e}")
                raise ValueError(f"Failed to initialize Google GenAI embeddings: {e}")
        else:
            supported_providers = ["google_genai"]
            raise ValueError(f"Unsupported embedding model provider: {self.embedding_model_provider}. Supported providers: {supported_providers}")
        
    def _initialize_llm(self):
        """Initialize LLM"""
        try:
            self.llm = init_chat_model(
                self.model_name, 
                model_provider=self.model_provider,
                temperature=self.temperature,
                max_tokens=self.max_tokens,
                top_p=self.top_p
            )
            self.logger.info(f"Initialized LLM: {self.model_provider}/{self.model_name}")
        except Exception as e:
            self.logger.error(f"Failed to initialize LLM: {e}")
            raise ValueError(f"Failed to initialize LLM {self.model_provider}/{self.model_name}: {e}") 
        
    def _load_document(self, file_path) -> List[Document]:
        """Load only new documents from the data directory"""
        self.logger.info(f"Loading documents from {self.data_dir}")
        if not self.data_dir.exists():
            error_msg = f"Data directory {self.data_dir} does not exist"
            self.logger.error(error_msg)
            raise ValueError(error_msg)
        
        try:
            self.logger.info(f"Processing new file: {file_path}")
            if file_path.suffix == ".txt":
                loader = TextLoader(str(file_path))
            elif file_path.suffix == ".pdf":
                loader = PyPDFLoader(str(file_path))
            elif file_path.suffix == ".docx":
                loader = UnstructuredLoader(str(file_path))
            elif file_path.suffix == ".md":
                loader = UnstructuredLoader(str(file_path))
            else:
                loader = UnstructuredLoader(str(file_path))
            doc = loader.load()
            return doc
        except Exception as e:
            self.logger.info(f"Error loading {file_path}: {e}")
            return [Document(page_content="")]

    def _add_document(self): # _process_documents(self)
        """Load, split, and store documents in vector database"""
        self.logger.info(f"Starting document processing from {self.data_dir}")
        if not self.data_dir.exists():
            error_msg = f"Data directory {self.data_dir} does not exist"
            self.logger.error(error_msg)
            raise ValueError(error_msg)
        
        # Get processed files
        processed_files = set()
        try:
            if self.processed_files_path.exists():
                with open(self.processed_files_path, 'r') as f:
                    processed_files = set(json.load(f))
        except Exception:
            self.logger.warning(f"Could not load processed files from {self.processed_files_path}")        
        
        # Track newly processed files and load the document
        documents = []
        supported_extensions = ('.pdf', '.txt', '.docx', '.md')
        for file_path in Path(self.data_dir).rglob("*"):
            if (file_path.is_file() and 
                file_path.suffix.lower() in supported_extensions and 
                str(file_path) not in processed_files):
                self.logger.info(f"Processing new file: {file_path}")
                documents.extend(self._load_document(file_path))
                processed_files.add(str(file_path))
        
        # Return if no document
        if len(documents) == 0:
            return 

        # Split documents into chunks
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap,
            length_function=len,
            )
        self.texts2update = self.text_splitter.split_documents(documents)
        self.logger.info(f"Split {len(documents)} new documents into {len(self.texts2update)} text chunks")
        
        # If self.texts2udpate not None, update database
        if self.texts2update is not None:
            self.logger.info(f"Adding {len(self.texts2update)} text chunks to vector store")
            # Add documents in batches to avoid ChromaDB batch size limits
            batch_size = 1000  # Safe batch size for ChromaDB
            for i in range(0, len(self.texts2update), batch_size):
                batch = self.texts2update[i:i + batch_size]
                self.logger.info(f"Adding batch {i//batch_size + 1}/{(len(self.texts2update) + batch_size - 1)//batch_size} ({len(batch)} documents)")
                self.vector_store.add_documents(batch)
        
        # Save updated processed files list
        self.vector_store_dir.mkdir(exist_ok=True)
        with open(self.processed_files_path, 'w') as f:
            json.dump(list(processed_files), f) # , indent=4
        
    def _create_vectorstore(self):

        # self.vector_store = InMemoryVectorStore(self.embeddings)
        self.vector_store = Chroma(
            collection_name=self.collection_name,
            embedding_function=self.embeddings,
            persist_directory=str(self.vector_store_dir),
        )

        # Get texts for udpate
        if (not os.path.exists(self.vector_store_dir) or
            self.update_database):
            self._add_document()
            self._del_document()

        # Peek inside
        """
        print(f"Check vector store documents, directory: {self.vector_store_dir}")
        docs = self.vector_store.get()
        unique_docs = set()
        for meta in docs["metadatas"]:
            unique_docs.add(meta.get("source"))
        unique_docs = sorted(unique_docs)
        for doc in unique_docs:
            print(doc)
        """
    
    def _create_retriever(self): 
        # Create retriever
        self.retriever = self.vector_store.as_retriever(
            search_type="similarity",
            search_kwargs={"k": self.top_k}
        )

        # llm = ChatOpenAI(model="gpt-4.1-nano", temperature=0)
        self.retriever_from_llm = MultiQueryRetriever.from_llm(
            retriever=self.vector_store.as_retriever(), llm=self.llm
        )
                
    def _create_rag_chain(self):
        """Create the RAG chain for question answering"""
        self.logger.info("Creating RAG chain")
        
        # Create prompt template
        template = ("從以下context找資訊並回答問題:\n"
            "{context}\n"
            "問題: {question}\n"
            "回答:")
        
        prompt = ChatPromptTemplate.from_template(template)
        
        # Create the RAG chain
        def format_docs(docs):
            return "\n\n".join(doc.page_content for doc in docs)
        
        self.rag_chain = (
            {"context": self.retriever | format_docs, "question": RunnablePassthrough()}
            | prompt
            | self.llm
            | StrOutputParser()
        )
        
        self.logger.info("RAG chain created successfully")
    
    def query(self, question: str) -> str:
        """Query the RAG system with a question"""
        self.logger.info(f"Processing query: {question}")

        response = self.rag_chain.invoke(question)
        self.logger.info(f"Query processed successfully. Response length: {len(response)} characters")
        return response
    
    def search_doc_context(self, query: str) -> List[Document]:
        """Search for similar documents"""
        # No multiquery:
        docs = self.retriever.get_relevant_documents(query)
        """
        # Multiquery
        docs = self.retriever_from_llm.invoke(query)
        # With similarity search
        docs = self.vector_store.similarity_search(query, k=k)
        return docs
        """
        return docs
    
    def _del_document(self):
        pass        
        # db = Chroma(persist_directory="./chroma_store", embedding_function=embedding)
        # Find all docs
        all_docs = self.vector_store.get()

        # Find IDs where the source matches a file
        ids_to_delete = [
            doc_id
            for doc_id, meta in zip(all_docs["ids"], all_docs["metadatas"])
            if "exclude_this.pdf" in meta.get("source", "")
        ]

        # Delete them
        if ids_to_delete:
            self.vector_store.delete(ids=ids_to_delete)
            print("Removed:", ids_to_delete)
        

    # ======
    '''
    def update_database(self, incremental: bool = True):
        """Public method to update the database"""
        if incremental:
            self.logger.info("Starting incremental database update")
        else:
            self.logger.info("Starting full database update")
            # For non-incremental, clear processed files cache
            self.clear_processed_files_cache()
        
        self._get_texts2update()
        self._create_vectorstore_retriever()
    
    def add_document(self, file_path: str):
        """Add a single document to the database"""
        self.logger.info(f"Adding document: {file_path}")
        file_path = Path(file_path)
        if not file_path.exists():
            raise ValueError(f"File does not exist: {file_path}")
        
        # Load and process the document
        documents = self._load_document(file_path)
        if documents:
            # Split document into chunks
            text_splitter = RecursiveCharacterTextSplitter(
                chunk_size=self.chunk_size,
                chunk_overlap=self.chunk_overlap,
                length_function=len,
            )
            chunks = text_splitter.split_documents(documents)
            
            # Add to vector store in batches
            batch_size = 1000
            for i in range(0, len(chunks), batch_size):
                batch = chunks[i:i + batch_size]
                self.vector_store.add_documents(batch)
            
            # Update processed files
            self._add_to_processed_files(str(file_path))
            
            self.logger.info(f"Added document {file_path} with {len(chunks)} chunks")
    
    def rebuild_database(self):
        """Rebuild the entire database from scratch"""
        self.logger.info("Rebuilding database from scratch")
        
        # Clear processed files cache
        self.clear_processed_files_cache()
        
        # Delete existing vector store
        import shutil
        if self.vector_store_dir.exists():
            shutil.rmtree(self.vector_store_dir)
        
        # Recreate everything
        self._get_texts2update()
        self._create_vectorstore_retriever()
        
        self.logger.info("Database rebuilt successfully")
    
    @property
    def processed_files(self) -> Set[str]:
        """Get the set of processed files"""
        try:
            if self.processed_files_path.exists():
                with open(self.processed_files_path, 'r') as f:
                    return set(json.load(f))
        except Exception as e:
            self.logger.warning(f"Could not load processed files: {e}")
        return set()
    
    def clear_processed_files_cache(self):
        """Clear the processed files cache"""
        self.logger.info("Clearing processed files cache")
        if self.processed_files_path.exists():
            self.processed_files_path.unlink()
    
    def _add_to_processed_files(self, file_path: str):
        """Add a file to the processed files list"""
        processed_files = self.processed_files
        processed_files.add(file_path)
        
        self.vector_store_dir.mkdir(exist_ok=True)
        with open(self.processed_files_path, 'w') as f:
            json.dump(list(processed_files), f, indent=4)
    '''