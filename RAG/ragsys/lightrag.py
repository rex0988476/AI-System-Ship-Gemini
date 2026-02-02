import os
import asyncio
import logging
import nest_asyncio
import numpy as np
import json
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types
import openai

from sentence_transformers import SentenceTransformer
from lightrag.utils import EmbeddingFunc
from lightrag import LightRAG, QueryParam
from lightrag.kg.shared_storage import initialize_pipeline_status

import PyPDF2

nest_asyncio.apply()
load_dotenv()

class RAGSystem:
    def __init__(self, 
        working_dir: str = "./dickens", # database dir
        data_dir: str = "./data/", 
        log_dir: str = "./log/",
        reset_db: bool = False, # reset database
        skip_document_processing: bool = False, # skip document processing entirely
        model_provider: str = "google_genai",
        model_name: str = "gemini-1.5-pro-latest",
        embedding_model_provider: str = None,
        embedding_model: str = "all-MiniLM-L6-v2",
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        temperature: float = 0.0,
        max_tokens: int = 4096,
        top_k: int = 1000,
        top_p: float = 1.0,
        enable_knowledge_graph: bool = True,  # Enable KG extraction with optimizations
        ):
        
        self.working_dir = Path(working_dir) # database
        self.log_dir = Path(log_dir)
        self.data_dir = Path(data_dir)
        self.db_exists = None
        self.reset_db = reset_db
        self.skip_document_processing = skip_document_processing
        self.model_provider = model_provider
        self.model_name = model_name
        self.embedding_model_provider = embedding_model_provider
        self.embedding_model_name = embedding_model
        self.rag = None
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_k = top_k 
        self.top_p = top_p
        self.enable_knowledge_graph = enable_knowledge_graph
        self.embedding_model = None  # Cache embedding model
        
        # File tracking for incremental processing
        self.processed_files_index = self.working_dir / "processed_files.json"

        # Set up API keys
        self.google_api_key = os.getenv("GOOGLE_API_KEY")
        self.openai_api_key = os.getenv("OPENAI_API_KEY")
        
        # Initialize components
        self._setup_logging()
        
        # Initialize RAG system first
        asyncio.run(self._initialize_rag())
        
        # Skip document processing entirely if requested
        if self.skip_document_processing:
            self.logger.info("Skipping document processing as requested")
            return
            
        # Check if we need to process documents
        db_empty = self._is_database_empty()
        self.process_data = not self.working_dir.exists() or self.reset_db or db_empty
        
        # Load documents if needed, using incremental processing
        if self.process_data:
            self.logger.info(f"Loading documents because: working_dir_missing={not self.working_dir.exists()}, reset_db={self.reset_db}, db_empty={db_empty}")
            asyncio.run(self._load_documents())
        else:
            # Even if DB exists, check for new/modified files
            self.logger.info("Database exists, checking for new or modified files...")
            asyncio.run(self._load_new_documents())
  
    def _setup_logging(self):
        """Setup logging configuration"""
        logs_dir = Path(self.log_dir)
        logs_dir.mkdir(exist_ok=True)
        
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        log_file = logs_dir / f"lightrag_{timestamp}.log"
        
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
    
    async def _llm_model_func(self, prompt, system_prompt=None, history_messages=[], keyword_extraction=False, **kwargs) -> str:
        if self.model_provider == "google_genai":
            client = genai.Client(api_key=self.google_api_key)
            
            combined_prompt = ""
            if system_prompt:
                combined_prompt += f"{system_prompt}\n"
            for msg in history_messages or []:
                combined_prompt += f"{msg['role']}: {msg['content']}\n"
            combined_prompt += f"user: {prompt}"
            
            # Optimize for speed: reduce output tokens for KG extraction
            max_tokens = 200 if keyword_extraction else 300  # Reduced from 500
            temp = 0.0  # Lower temperature for faster, more deterministic responses
            
            response = client.models.generate_content(
                model=self.model_name,
                contents=[combined_prompt],
                config=types.GenerateContentConfig(max_output_tokens=max_tokens, temperature=temp),
            )
            return response.text
        
        elif self.model_provider == "openai":
            client = openai.OpenAI(api_key=self.google_api_key)
            
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            
            for msg in history_messages or []:
                messages.append(msg)
            
            messages.append({"role": "user", "content": prompt})
            
            response = client.chat.completions.create(
                model=self.model_name,
                messages=messages,
                max_tokens=500,
                temperature=0.1
            )
            return response.choices[0].message.content
            
        else:
            raise ValueError(f"Unsupported model provider: {self.model_provider}")

    async def _embedding_func(self, texts: list[str]) -> np.ndarray:
        # Cache embedding model to avoid reloading
        if self.embedding_model is None:
            self.embedding_model = SentenceTransformer(self.embedding_model_name)
            self.logger.info(f"Loaded embedding model: {self.embedding_model_name}")
        return self.embedding_model.encode(texts, convert_to_numpy=True)

    async def _initialize_rag(self):
        """Initialize LightRAG"""
        self.logger.info("Initializing LightRAG...")
        
        # Determine embedding dimension based on model
        if self.embedding_model_name == "text-embedding-3-small":
            embedding_dim = 1536
        elif self.embedding_model_name == "all-MiniLM-L6-v2":
            embedding_dim = 384
        else:
            embedding_dim = 384  # Default
            
        # Configure LightRAG for speed vs accuracy trade-off
        rag_config = {
            "working_dir": self.working_dir,
            "llm_model_func": self._llm_model_func,
            "embedding_func": EmbeddingFunc(
                embedding_dim=embedding_dim,
                max_token_size=8192,
                func=self._embedding_func,
            ),
        }
        
        # Optimize knowledge graph extraction for speed while keeping functionality
        if self.enable_knowledge_graph:
            rag_config.update({
                "chunk_token_size": 800,  # Smaller chunks for faster processing
            })
        
        self.rag = LightRAG(**rag_config)
        await self.rag.initialize_storages()
        await initialize_pipeline_status()
        
        self.logger.info("LightRAG initialized successfully")

    def _is_database_empty(self):
        """Check if the LightRAG database is empty"""
        try:
            # Check if vector database files exist and have content
            vdb_files = [
                self.working_dir / "lightrag" / "vdb_entities.json",
                self.working_dir / "lightrag" / "vdb_relationships.json", 
                self.working_dir / "lightrag" / "vdb_chunks.json"
            ]
            
            for vdb_file in vdb_files:
                if vdb_file.exists():
                    # Read the JSON file and check if it has data
                    with open(vdb_file, 'r') as f:
                        data = json.load(f)
                        if isinstance(data, dict) and data.get('data') and len(data['data']) > 0:
                            return False  # Database has data
            return True  # Database is empty
        except Exception as e:
            self.logger.warning(f"Error checking if database is empty: {e}")
            return True  # Assume empty if we can't check

    def _load_processed_files_index(self):
        """Load the index of processed files"""
        try:
            if self.processed_files_index.exists():
                with open(self.processed_files_index, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            self.logger.warning(f"Error loading processed files index: {e}")
            return {}

    def _save_processed_files_index(self, index):
        """Save the index of processed files"""
        try:
            # Ensure the working directory exists
            self.working_dir.mkdir(parents=True, exist_ok=True)
            with open(self.processed_files_index, 'w') as f:
                json.dump(index, f, indent=2)
        except Exception as e:
            self.logger.error(f"Error saving processed files index: {e}")

    def _get_file_info(self, file_path):
        """Get file modification time and size"""
        try:
            stat = file_path.stat()
            return {
                'mtime': stat.st_mtime,
                'size': stat.st_size
            }
        except Exception:
            return None

    def _has_file_changed(self, file_path, processed_files):
        """Check if a file has changed since last processing"""
        file_key = str(file_path.resolve())
        current_info = self._get_file_info(file_path)
        
        if not current_info:
            return False
            
        if file_key not in processed_files:
            return True  # New file
            
        stored_info = processed_files[file_key]
        return (current_info['mtime'] != stored_info['mtime'] or 
                current_info['size'] != stored_info['size'])

    async def _load_new_documents(self):
        """Load only new or modified documents"""
        if not self.data_dir.exists():
            self.logger.warning(f"Data directory does not exist: {self.data_dir}")
            return

        processed_files = self._load_processed_files_index()
        
        # Collect all files
        text_files = list(Path(self.data_dir).glob("**/*.txt")) + list(Path(self.data_dir).glob("**/*.md"))
        pdf_files = list(Path(self.data_dir).glob("**/*.pdf"))
        
        # Find new or modified files
        new_text_files = [f for f in text_files if self._has_file_changed(f, processed_files)]
        new_pdf_files = [f for f in pdf_files if self._has_file_changed(f, processed_files)]
        
        total_new_files = len(new_text_files) + len(new_pdf_files)
        
        if total_new_files == 0:
            self.logger.info("No new or modified files found")
            return
            
        self.logger.info(f"Found {len(new_text_files)} new/modified text files and {len(new_pdf_files)} new/modified PDF files")
        
        documents_processed = 0
        
        # Process new text files
        for file_path in new_text_files:
            self.logger.info(f"Processing new/modified text file: {file_path.name}")
            result = await self._process_single_document(file_path, "text")
            if result:
                documents_processed += result
                processed_files[str(file_path.resolve())] = self._get_file_info(file_path)
        
        # Process new PDF files
        for file_path in new_pdf_files:
            self.logger.info(f"Processing new/modified PDF file: {file_path.name}")
            result = await self._process_single_document(file_path, "pdf")
            if result:
                documents_processed += result
                processed_files[str(file_path.resolve())] = self._get_file_info(file_path)
        
        # Save updated index
        self._save_processed_files_index(processed_files)
        
        if documents_processed > 0:
            self.logger.info(f"Incremental loading completed! {documents_processed} new/modified documents processed.")
        else:
            self.logger.info("No new documents were successfully processed.")

    async def _process_single_document(self, file_path, file_type="pdf"):
        """Process a single document"""
        try:
            if file_type == "text":
                with open(file_path, "r", encoding="utf-8") as file:
                    text = file.read()
                    if text.strip():
                        await self.rag.ainsert(text)
                        self.logger.info(f"✓ Processed text: {file_path.name}")
                        return 1
            elif file_type == "pdf":
                with open(file_path, "rb") as file:
                    reader = PyPDF2.PdfReader(file)
                    # Limit pages for speed (first 10 pages for KG)
                    max_pages = min(10, len(reader.pages))
                    text = "".join(
                        page.extract_text() + "\n" 
                        for page in reader.pages[:max_pages] 
                        if page.extract_text()
                    )
                    if text.strip():
                        # Truncate very long documents for faster KG extraction
                        if len(text) > 30000:  # 30k chars limit for KG
                            text = text[:30000] + "...[truncated]"
                        await self.rag.ainsert(f"Document: {file_path.name}\n\n{text}")
                        self.logger.info(f"✓ Processed PDF: {file_path.name} ({max_pages} pages)")
                        return 1
            return 0
        except Exception as e:
            self.logger.error(f"✗ Error processing {file_path}: {e}")
            return 0

    async def _load_documents(self):
        """Load and process documents with file tracking"""
        self.logger.info(f"Loading documents from {self.data_dir}...")
        
        if not self.data_dir.exists():
            self.logger.warning(f"Data directory does not exist: {self.data_dir}")
            return
        
        # Load existing processed files index
        processed_files = self._load_processed_files_index()
        
        # Collect all files
        text_files = list(Path(self.data_dir).glob("**/*.txt")) + list(Path(self.data_dir).glob("**/*.md"))
        pdf_files = list(Path(self.data_dir).glob("**/*.pdf"))
        
        total_files = len(text_files) + len(pdf_files)
        self.logger.info(f"Found {len(text_files)} text files and {len(pdf_files)} PDF files")
        
        # Process files sequentially for KG extraction (parallel can cause conflicts)
        documents_processed = 0
        
        # Process text files first (usually smaller/faster)
        for i, file_path in enumerate(text_files, 1):
            self.logger.info(f"Processing text file {i}/{len(text_files)}: {file_path.name}")
            result = await self._process_single_document(file_path, "text")
            if result:
                documents_processed += result
                # Track the processed file
                processed_files[str(file_path.resolve())] = self._get_file_info(file_path)
        
        # Process PDF files with progress tracking
        for i, file_path in enumerate(pdf_files, 1):
            self.logger.info(f"Processing PDF {i}/{len(pdf_files)}: {file_path.name}")
            result = await self._process_single_document(file_path, "pdf")
            if result:
                documents_processed += result
                # Track the processed file
                processed_files[str(file_path.resolve())] = self._get_file_info(file_path)
        
        # Save the updated processed files index
        self._save_processed_files_index(processed_files)
        
        self.logger.info(f"Document loading completed! {documents_processed}/{total_files} documents processed.")
    
    def query(self, query: str) -> str:
        """Query the RAG system"""
        self.logger.info(f"\n{'=' * 50}\nQuery: {query}\n{'=' * 50}")
        
        response = self.rag.query(
            query=query,
            param=QueryParam(
                mode="hybrid", 
                top_k=self.top_k, 
            ),
        )
        self.logger.info(f"Query processed successfully. Response length: {len(response)} characters")
        return response
    
    def search_doc_context(self, query: str) -> str:
        response = self.rag.query(
            query=query,
            param=QueryParam(only_need_context=True)
        )
        return response


