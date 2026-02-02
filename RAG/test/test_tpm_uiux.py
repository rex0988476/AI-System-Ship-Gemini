#!/usr/bin/env python3
"""
Test script for AutoGen group chat between TPM and UI/UX Engineer agents
"""

import sys
sys.path.append('..')

from datetime import datetime
from pathlib import Path
import logging

from rag_agent import RAGAgent, RAGConfig, RAGBackend
from prompt import tpm_system_prompt, uiux_system_prompt, uiux_senior_system_prompt, business_system_prompt
from autogen_llm_config import gemini_config
import autogen

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

def create_business_agent():
    """Create Business agent"""
    business_llm_config = gemini_config.copy()
    business_llm_config["temperature"] = 0.1
    
    business_agent = autogen.AssistantAgent(
        name="Business",
        system_message=business_system_prompt,
        llm_config=business_llm_config,
    )
    
    return business_agent

def create_tpm_agent():
    """Create TPM agent with RAG capabilities"""
    tpm_rag_config = RAGConfig(
        name="TPM_Agent",
        system_prompt=tpm_system_prompt,
        rag_backend=RAGBackend.LANGCHAIN,
        data_dir="./data/rag_database/TPM",
        working_dir="./data/rag_storage/TPM",
        log_dir="./log",
        temperature=0.0,
        update_database=True,
    )

    tpm_llm_config = gemini_config.copy()
    tpm_llm_config["temperature"] = 0.0
    
    tpm_agent = RAGAgent(
        name="TPM",
        rag_config=tpm_rag_config,
        system_message=tpm_system_prompt,
        llm_config=tpm_llm_config,
        is_termination_msg=terminate_when_done,
    )
    
    return tpm_agent

def create_uiux_junior_agent():
    """Create UI/UX Junior Engineer agent"""
    uiux_junior_llm_config = gemini_config.copy()
    uiux_junior_llm_config["temperature"] = 0.4
    
    uiux_junior_agent = RAGAgent(
        name="UIUX_Junior", 
        system_message=uiux_system_prompt,
        llm_config=uiux_junior_llm_config,
        # is_termination_msg=terminate_when_done,
    )
    
    return uiux_junior_agent

def create_uiux_senior_agent():
    """Create UI/UX Senior Engineer agent"""
    uiux_senior_llm_config = gemini_config.copy()
    uiux_senior_llm_config["temperature"] = 0.2
    
    uiux_senior_agent = RAGAgent(
        name="UIUX_Senior", 
        system_message=uiux_senior_system_prompt,
        llm_config=uiux_senior_llm_config,
        # is_termination_msg=terminate_when_done,
    )
    
    return uiux_senior_agent

def create_user_proxy():
    """Create user proxy for interaction"""
    user_proxy = autogen.UserProxyAgent(
        name="User",
        human_input_mode="NEVER",
        max_consecutive_auto_reply=0,
        code_execution_config=False,
    )
    
    return user_proxy

def test_two_agent_conversation(query: str = None, max_rounds: int = 6):
    """Test TPM and UI/UX conversation with full logging"""
    # Setup logging for conversation
    logger = setup_logging("./log/", "uiuxs_conversation")
    logger.info("=== Starting TPM and UI/UX RAG Conversation ===")    
    logger.info(f"Query: {query}")
    logger.info(f"Max rounds: {max_rounds}")    
    
    # Create agents
    # tpm = create_tpm_agent()
    uiux_junior = create_uiux_junior_agent()
    uiux_senior = create_uiux_senior_agent()
    
    print("✓ TPM, UI/UX Junior, and UI/UX Senior agents created")
    
    # Create group chat with all three agents
    groupchat = autogen.GroupChat(
        agents=[uiux_junior, uiux_senior],
        messages=[],
        max_round=max_rounds,
        speaker_selection_method="round_robin"
    )
    
    manager = autogen.GroupChatManager(
        groupchat=groupchat,
        system_message="You are managing a conversation between UI/UX Junior, and UI/UX Senior agents.",
        llm_config=gemini_config
    )
    
    try:
        # Start conversation with TPM
        uiux_senior.initiate_chat(manager, message=query)
        
        print("="*100)
        
        # Log all conversation messages
        logger.info("=== Full Conversation Messages ===")
        for i, msg in enumerate(groupchat.messages, 1):
            speaker = msg.get("name", "Unknown")
            content = msg.get("content", "")
            logger.info(f"\n# Message {i} - {speaker}: \n{content}")
        
        logger.info("=== Conversation Completed ===")
        print("\n✓ TPM, UI/UX Junior, and UI/UX Senior conversation completed successfully")
        return True
        
    except Exception as e:
        logger.error(f"Conversation failed: {e}")
        print(f"Two-agent conversation failed: {e}")
        return False

def main():
    """Main test function"""
    print("Starting TPM, UI/UX Junior, and UI/UX Senior AutoGen Conversation")
    print("=" * 70)

    query = """我是uiux senior engineer，客戶需要暗船辨識系統的用戶介面設計。    
    請UI/UX Junior 工程師看完客戶需求與我討論具體的介面設計方案。"""
    
    try:
        # Run the TPM and UI/UX conversation with logging
        success = test_two_agent_conversation(query=query, max_rounds=10)
        
        if success:
            print("\n" + "=" * 70)
            print("TPM, UI/UX Junior, and UI/UX Senior conversation completed successfully!")
            print("Check the log files in ./log/ directory for full conversation details.")
        else:
            print("\n" + "=" * 70)
            print("Conversation failed. Check the output above.")
            
    except Exception as e:
        print(f"Test failed with error: {e}")
        success = False
    
    return success

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)


