#!/usr/bin/env python3

import sys
sys.path.append('..')

from rag_agent import RAGAgent, RAGConfig, RAGBackend

def test_ieee_integration():
    """Test IEEE search integration with RAG agent"""
    
    # Configure RAG agent with IEEE search
    rag_config = RAGConfig(
        name="IEEE Research Agent",
        system_prompt="You are a research assistant specialized in IEEE papers.",
        rag_backend=RAGBackend.LANGCHAIN,
        data_dir="../data",
        working_dir="../rag_storage",
        ieee_search_keywords=["ship detection", "computer vision"],
        ieee_max_papers=5,
        auto_fetch_ieee=True,  # Automatically fetch papers on initialization
        update_database=True   # Update RAG database with new papers
    )
    
    # Create RAG agent
    agent = RAGAgent(
        name="ieee_agent",
        rag_config=rag_config,
        llm_config={"config_list": [{"model": "gpt-3.5-turbo", "api_key": "your_key"}]}
    )
    
    print("RAG Agent with IEEE integration initialized successfully!")
    
    # Test manual paper fetching
    print("\nTesting manual paper fetching...")
    agent.fetch_ieee_papers_manual(["deep learning", "neural networks"], max_papers=3)
    
    return agent

if __name__ == "__main__":
    agent = test_ieee_integration()
    print("\nIntegration test completed!")