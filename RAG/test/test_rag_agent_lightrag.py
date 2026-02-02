from datetime import datetime
from pathlib import Path
import logging
import signal
import sys

from autogen import GroupChat, GroupChatManager
from rag_agent import RAGAgent, RAGConfig, RAGBackend
from prompt import *
from autogen_config import *

# TEST ===============================
def setup_logging(log_dir: str, name: str = "autogen_conversation") -> logging.Logger:
    """Setup logging configuration for autogen RAG system"""
    logs_dir = Path(log_dir)
    logs_dir.mkdir(exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    log_file = logs_dir / f"{name}-{timestamp}.log"
    
    logger = logging.getLogger(f"autogen_rag_{name}")
    logger.setLevel(logging.INFO)
    
    # Clear existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create formatter
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    
    # File handler
    file_handler = logging.FileHandler(log_file)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    logger.info(f"Logging initialized for {name}, log file: {log_file}")
    return logger

def test_create_single_agent(llm_config):
    """Create single RAG agent for faster testing"""
    print("Creating single Business agent for fast testing...")
    
    # Create RAG config with minimal processing
    rag_backend = RAGBackend.LIGHTRAG
    business_rag_config = RAGConfig(
        name="Business",
        data_dir="./data/Business/",
        working_dir="./rag_storage/Business/",
        system_prompt=business_system_prompt,
        embedding_model="all-MiniLM-L6-v2",
        rag_backend=rag_backend,
        temperature=0.7,
        skip_document_processing=True,  # Skip for speed
        max_tokens=1000  # Limit tokens for faster responses
        )
    
    # Create single agent
    business_agent = RAGAgent(
        name="Business", 
        system_message=business_system_prompt,
        llm_config=llm_config,
        rag_config=business_rag_config,
        )
    
    print("Agent created successfully!")
    return business_agent

def timeout_handler(signum, frame):
    """Handle timeout signal"""
    print("\n⏰ Test timeout reached! Exiting...")
    sys.exit(0)

def test_run_simple_chat(query: str = "Hello, test message", timeout_seconds: int = 30):
    """Run a simple single-agent test with timeout"""
    # Set timeout
    signal.signal(signal.SIGALRM, timeout_handler)
    signal.alarm(timeout_seconds)
    
    try:
        # Setup minimal logging
        logger = setup_logging("./log/", "lightrag_test")
        logger.info("=== Starting Fast LightRAG Test ===")
        logger.info(f"Query: {query}")
        logger.info(f"Timeout: {timeout_seconds}s")
        
        print(f"🚀 Starting LightRAG test with timeout {timeout_seconds}s")
        print(f"📝 Query: {query}")
        
        # Create single agent (faster)
        llm_config = gemini_config 
        logger.info("Creating single agent with Gemini configuration")
        business_agent = test_create_single_agent(llm_config)
        
        print("💬 Starting simple chat...")
        
        # Simple direct response (no group chat for speed)
        response = business_agent.generate_reply(
            messages=[{"role": "user", "content": query}]
        )
        
        print(f"✅ Agent Response: {response}")
        print("="*50)
        
        logger.info(f"Agent response: {response}")
        logger.info("=== Test Completed Successfully ===")
        
    except Exception as e:
        print(f"❌ Error during test: {e}")
        logger.error(f"Test error: {e}")
    finally:
        # Cancel timeout
        signal.alarm(0)
        print("🏁 Test finished!")

def main():
    """Fast test main function"""
    # Simple test query
    simple_query = "What is your role and how can you help?"
    print("🔬 Running fast LightRAG agent test...")
    test_run_simple_chat(simple_query, timeout_seconds=60)  # 1 minute timeout  
        

if __name__ == "__main__":
    main()