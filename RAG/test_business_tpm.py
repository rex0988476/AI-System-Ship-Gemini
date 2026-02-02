from datetime import datetime
from pathlib import Path
import logging
from socket import getnameinfo

from autogen import GroupChat, GroupChatManager
from rag_agent import RAGAgent, RAGConfig, RAGBackend
from prompt import *
from autogen_llm_config import *

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

def terminate_when_done(msg):
    return "DONE" in (msg.get("content") or "")

def test_create_agents():
    """Create unified autogen agents with configurable RAG backend"""
    # Create RAG config with working embedding model
    business_rag_config = RAGConfig(
        name="Business",
        data_dir="./data/rag_database/Business/",
        working_dir="./data/rag_storage/Business/",
        system_prompt=business_system_prompt,
        rag_backend=RAGBackend.LANGCHAIN,
        temperature=0.3, # temperature for rag reply, not autogen reply
        )
    fde_rag_config = RAGConfig(
        name="FDE",
        data_dir="./data/rag_database/FDE/",
        working_dir="./data/rag_storage/FDE/",
        system_prompt=fde_agent_system_prompt,
        rag_backend=RAGBackend.LANGCHAIN,
        temperature=0.5,
        )
    tpm_rag_config = RAGConfig(
        name="TPM",
        data_dir="./data/rag_database/TPM/",
        working_dir="./data/rag_storage/TPM/",
        system_prompt=tpm_system_prompt,
        rag_backend=RAGBackend.LANGCHAIN,
        temperature=0.0,
        update_database=True,
        )
    
    # Autogen llm config
    business_llm_config = gemini_config
    business_llm_config["temperature"] = 0.0
    fde_llm_config = gemini_config
    fde_llm_config["temperature"] = 0.0
    tpm_llm_config = gemini_config
    tpm_llm_config["temperature"] = 0.0

    # Create agents
    business_agent = RAGAgent(
        name="Business", 
        system_message=business_system_prompt,
        llm_config=business_llm_config,
        # is_termination_msg=terminate_when_done,
        # rag_config=business_rag_config
        )
    fde_agent = RAGAgent(
        name="FDE", 
        system_message=fde_agent_system_prompt, 
        llm_config=fde_llm_config,
        # is_termination_msg=terminate_when_done,
        rag_config=fde_rag_config
        )
    tpm_agent = RAGAgent(
        name="TPM", 
        system_message=tpm_system_prompt, 
        llm_config=tpm_llm_config,
        # is_termination_msg=terminate_when_done,
        rag_config=tpm_rag_config,
        )
    
    return business_agent, fde_agent, tpm_agent

def test_run_chat(query: str, max_rounds: int = 5):
    """Run a unified multi-agent conversation with configurable RAG backend"""
    # Setup logging for conversation
    logger = setup_logging("./log/", "business_tpm_conversation")
    logger.info("=== Starting Autogen RAG Conversation ===")
    logger.info(f"Query: {query}")
    logger.info(f"Max rounds: {max_rounds}")
    
    print(f"Query: {query}")
    
    # Create agents
    business_agent, fde_agent, tpm_agent = test_create_agents()
    
    # Create GroupChat
    groupchat = GroupChat(
        agents=[business_agent, tpm_agent], # , fde_agent
        messages=[],
        max_round=max_rounds,
        speaker_selection_method= "round_robin" # "auto" # 
        )
    
    # Create GroupChat Manager
    manager = GroupChatManager(
        groupchat=groupchat,
        system_message= group_chat_manager_system_prompt, # "You are managing a conversation between Business, FDE, and TPM agents.",
        llm_config=gemini_config
        )
    
    # Start conversation
    business_agent.initiate_chat(manager, message=query)
    
    print("="*100)

    # Log all conversation messages
    logger.info("=== Full Conversation Messages ===")
    for i, msg in enumerate(groupchat.messages, 1):
        speaker = msg.get("name", "Unknown")
        content = msg.get("content", "")
        logger.info(f"\n# Message {i} - {speaker}: \n{content}")
    
    logger.info("=== Conversation Completed ===")

def main():
    # Simple test query
    query = "我是業務，客戶有暗船辨識的需求，想詢問客戶需求的相關技術問題。"
    test_run_chat(query, max_rounds=10)  
        

if __name__ == "__main__":
    main()