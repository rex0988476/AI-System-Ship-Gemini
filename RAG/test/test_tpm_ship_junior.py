from datetime import datetime
from pathlib import Path
import logging

from autogen import GroupChat, GroupChatManager
from rag_agent import RAGAgent, RAGConfig, RAGBackend
from prompt import *
from autogen_llm_config import *

# TEST TPM + Ship Junior Engineer ===============================
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

def test_create_tpm_ship_agents():
    """Create TPM and Ship Junior Engineer agents"""
    
    # Create RAG config for TPM
    tpm_rag_config = RAGConfig(
        name="TPM",
        data_dir="./data/rag_database/TPM/",
        working_dir="./data/rag_storage/TPM/",
        system_prompt=TPMSystemPrompt.with_engineer,
        rag_backend=RAGBackend.LANGCHAIN,
        temperature=0.0,
        update_database=True,
    )
    
    # Autogen llm config
    tpm_llm_config = gemini_config.copy()
    tpm_llm_config["temperature"] = 0.0
    
    ship_junior_llm_config = gemini_config.copy()
    ship_junior_llm_config["temperature"] = 0.3
    
    # Create agents
    tpm_agent = RAGAgent(
        name="TPM", 
        system_message=TPMSystemPrompt.with_engineer,
        llm_config=tpm_llm_config,
        rag_config=tpm_rag_config,
    )
    
    ship_junior_agent = RAGAgent(
        name="Ship_Junior", 
        system_message=UserSystemPrompt.ship_system,
        llm_config=ship_junior_llm_config,
    )
    
    return tpm_agent, ship_junior_agent

def test_run_tpm_ship_chat(query: str, max_rounds: int = 8):
    """Run TPM and Ship Junior Engineer conversation"""
    # Setup logging for conversation
    logger = setup_logging("./log/", "tpm_ship_junior_conversation")
    logger.info("=== Starting TPM + Ship Junior Engineer Conversation ===")
    logger.info(f"Query: {query}")
    logger.info(f"Max rounds: {max_rounds}")
    
    print(f"Query: {query}")
    print("="*80)
    
    # Create agents
    tpm_agent, ship_junior_agent = test_create_tpm_ship_agents()
    
    # Create GroupChat
    groupchat = GroupChat(
        agents=[tpm_agent, ship_junior_agent],
        messages=[],
        max_round=max_rounds,
        speaker_selection_method="round_robin"
    )
    
    # Create GroupChat Manager
    manager = GroupChatManager(
        groupchat=groupchat,
        system_message=group_chat_manager_system_prompt,
        llm_config=gemini_config
    )
    
    # Start conversation - TPM initiates with the query
    ship_junior_agent.initiate_chat(manager, message=query)
    
    print("="*80)
    
    # Log all conversation messages
    logger.info("=== Full Conversation Messages ===")
    for i, msg in enumerate(groupchat.messages, 1):
        speaker = msg.get("name", "Unknown")
        content = msg.get("content", "")
        logger.info(f"\n# Message {i} - {speaker}: \n{content}")
        print(f"\n# Message {i} - {speaker}: \n{content}")
    
    logger.info("=== Conversation Completed ===")

def main():
    # Test scenario: TPM assigns ship detection development task to junior engineer
    query = """
    我們需要開發一個船隻辨識系統，請問要如何開始這項計畫的開發？你會有甚麼建議？
    """
    # 我們需要開發一個船隻辨識系統，主要功能包括：
    # 1. AIS 訊號處理和解析
    # 2. 基於衛星影像的視覺辨識
    # 3. 異常行為偵測（如關閉AIS的暗船）    
    # 請 Junior 工程師協助實作 AIS 訊號處理模組。這個模組需要能夠：
    # - 解析 AIS 訊息格式
    # - 提取船隻位置、速度、航向資訊
    # - 儲存到資料庫中
    # 請問你對這個任務有什麼問題？需要哪些技術細節的說明？
    
    test_run_tpm_ship_chat(query, max_rounds=10)

if __name__ == "__main__":
    main()