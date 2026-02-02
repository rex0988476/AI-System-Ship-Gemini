from enum import Enum
from typing import Dict, List, Optional, Union, Any
from pathlib import Path

from autogen import ConversableAgent
from ragsys.langchain import RAGSystem as LangChainRAGSys
from ragsys.lightrag import RAGSystem as LightRAGSys
from data.ieee_search import search_papers, download_paper

class RAGBackend(Enum):
    """Supported RAG backend types"""
    LANGCHAIN = "langchain"
    LIGHTRAG = "lightrag"

class RAGConfig:    
    """Configuration for individual agents"""
    
    def __init__(self, 
                 name: str,
                 system_prompt: str,
                 rag_backend: Optional[RAGBackend] = RAGBackend.LANGCHAIN,
                 log_dir: str = "./log/",
                 data_dir: str = "./data/",
                 working_dir: str = "./rag_storage/",
                 model_provider: Optional[Any] = "google_genai",
                 model_name: str = "gemini-1.5-pro-latest",
                 embedding_model_provider: str = "google_genai",
                 embedding_model: str = "gemini-embedding-001",
                 chunk_size: int = 1000,
                 chunk_overlap: int = 200,
                 temperature: float = 0.1,
                 max_tokens: int = 4096,
                 top_k: int = 1000,
                 top_p: float = 1.0,
                 update_database: bool = False,
                 skip_document_processing: bool = False,
                 ieee_search_keywords: Optional[List[str]] = None,
                 ieee_max_papers: int = 10,
                 auto_fetch_ieee: bool = False):
        self.name = name
        self.system_prompt = system_prompt
        self.rag_backend = rag_backend
        self.log_dir = Path(log_dir)
        self.data_dir = Path(data_dir)
        self.working_dir = Path(working_dir)
        self.model_provider = model_provider
        self.model_name = model_name
        self.embedding_model_provider = embedding_model_provider
        self.embedding_model = embedding_model
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_k = top_k
        self.top_p = top_p
        self.update_database = update_database
        self.skip_document_processing = skip_document_processing
        self.ieee_search_keywords = ieee_search_keywords or []
        self.ieee_max_papers = ieee_max_papers
        self.auto_fetch_ieee = auto_fetch_ieee

class RAGTool:
    """Unified RAG tool supporting both LangChain and LightRAG backends with enhanced configuration"""
    
    @staticmethod
    def initialize_langchain(config: RAGConfig):
        """Initialize LangChain RAG system"""
        
        rag_system = LangChainRAGSys(
            data_dir=config.data_dir,
            log_dir=config.log_dir / "ragsys",
            vector_store_dir=config.working_dir / "langchain",
            model_provider=config.model_provider,
            model_name=config.model_name,
            embedding_model_provider=config.embedding_model_provider,
            embedding_model=config.embedding_model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
            top_k=config.top_k,
            top_p=config.top_p,
            update_database=config.update_database
            )

        return rag_system

    @staticmethod
    def initialize_lightrag(config: RAGConfig):
        """Initialize LightRAG system"""
            
        rag_system = LightRAGSys(
            working_dir=config.working_dir/ "lightrag",
            log_dir=config.log_dir / "ragsys",
            data_dir=config.data_dir,
            model_provider=config.model_provider,
            model_name=config.model_name,
            embedding_model_provider=config.embedding_model_provider,
            embedding_model=config.embedding_model,
            temperature=config.temperature,
            max_tokens=config.max_tokens,
            chunk_size=config.chunk_size,
            chunk_overlap=config.chunk_overlap,
            top_k=config.top_k,
            top_p=config.top_p,
            reset_db=config.update_database,
            skip_document_processing=config.skip_document_processing
            )

        return rag_system

class CrawlTool:
    """Crawl the internet to get more data"""

    @staticmethod
    def fetch_ieee_papers(config: RAGConfig):
        """Fetch IEEE papers based on configured keywords"""
        if not config.ieee_search_keywords:
            return
            
        ieee_papers_dir = config.data_dir / "ieee_papers"
        ieee_papers_dir.mkdir(exist_ok=True)
        
        cache_file = ieee_papers_dir / "downloaded_links.json"
        
        print(f"Fetching IEEE papers for keywords: {config.ieee_search_keywords}")
        
        for keyword in config.ieee_search_keywords:
            print(f"Searching for: {keyword}")
            papers = search_papers(keyword, max_results=config.ieee_max_papers)
            
            if papers:
                print(f"Found {len(papers)} papers for '{keyword}'")
                
                for paper in papers:
                    try:
                        download_paper(
                            paper['link'], 
                            save_dir=str(ieee_papers_dir) + "/",
                            cache_file=str(cache_file)
                        )
                    except Exception as e:
                        print(f"Error downloading {paper['title']}: {e}")
            else:
                print(f"No papers found for '{keyword}'")
    
class RAGAgent(ConversableAgent):
    """Enhanced RAG-enabled agent with configuration support"""
    
    def __init__(self, rag_config: RAGConfig = None, **kwargs):
        """Initialize RAG agent with configuration"""
        super().__init__(**kwargs)

        # If not use rag
        if rag_config is None:
            self.rag_system = None
            return 
        
        # Rag config
        self.rag_config = rag_config

        # Fetch IEEE papers if configured
        if rag_config.auto_fetch_ieee:
            CrawlTool.fetch_ieee_papers(rag_config)

        # Initialize the appropriate RAG system
        if rag_config.rag_backend == RAGBackend.LANGCHAIN:
            self.rag_system = RAGTool.initialize_langchain(rag_config)
        elif rag_config.rag_backend == RAGBackend.LIGHTRAG:
            self.rag_system = RAGTool.initialize_lightrag(rag_config)
        else:
            error_msg = f"Unsupported backend: {rag_config.rag_backend}"
            raise ValueError(error_msg)
            
    def generate_reply(self, messages=None, sender=None, **kwargs):
        """Generate reply with RAG context"""
        if self.rag_system is None:
            return super().generate_reply(messages=messages, sender=sender, **kwargs)

        if messages is None:
            messages = self._oai_messages[sender]
        last_msg = messages[-1]["content"]

        # Get context from RAG system with role-specific filtering
        context = self.rag_system.search_doc_context(last_msg)
        # print("++++++++++++++++++++++")
        # print(context)
        # print("++++++++++++++++++++++")
        
        enriched_prompt = (
            f"從以下 context 找資訊並回覆訊息:\n\n"
            f"context: {context}\n\n"
            f"訊息:\n{last_msg}\n\n回答:"
        )
        enriched_messages = messages[:-1] + [{
            'content': enriched_prompt,
            'name': messages[-1].get('name', 'user'),
            'role': messages[-1].get('role', 'user')
        }]
        
        return super().generate_reply(messages=enriched_messages, sender=sender, **kwargs)
    
    '''
    def fetch_ieee_papers_manual(self, keywords: List[str], max_papers: int = 10):
        """Manually fetch IEEE papers for given keywords"""
        if not self.rag_config:
            print("No RAG configuration available")
            return
            
        # Update config temporarily
        self.rag_config.ieee_search_keywords = keywords
        self.rag_config.ieee_max_papers = max_papers
        
        # Fetch papers
        CrawlTool.fetch_ieee_papers(self.rag_config)
        
        # Trigger database update if needed
        if hasattr(self.rag_system, 'update_database'):
            self.rag_system.update_database = True
    '''
