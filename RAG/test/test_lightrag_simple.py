#!/usr/bin/env python3
"""Simple LightRAG test without autogen complexity"""

import os
import sys
from pathlib import Path

# Add the project root to the path
sys.path.append(str(Path(__file__).parent))

from ragsys.lightrag import RAGSystem

def test_lightrag_basic():
    """Basic LightRAG functionality test"""
    print("🧪 Starting simple LightRAG test...")
    
    try:
        # Initialize LightRAG with minimal config
        print("📋 Initializing LightRAG...")
        rag_system = RAGSystem(
            data_dir="./data/Business/",
            working_dir="./rag_storage/test_lightrag/",
            embedding_model="all-MiniLM-L6-v2",
            skip_document_processing=True,  # Skip for speed
            temperature=0.7
        )
        print("✅ LightRAG initialized successfully!")
        
        # Test query
        test_query = "What is the main purpose of this system?"
        print(f"❓ Testing query: {test_query}")
        
        response = rag_system.query(test_query)
        print(f"💬 Response: {response[:200]}...")
        
        # Test search
        print("🔍 Testing document search...")
        docs = rag_system.search_doc_context(test_query)
        print(f"📄 Search result: {str(docs)[:100]}...")
        
        print("🎉 Test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_lightrag_basic()