#!/usr/bin/env python3
"""LightRAG test with actual document processing"""

import os
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).parent))
from ragsys.lightrag import RAGSystem

def test_lightrag_with_docs():
    """Test LightRAG with document processing"""
    print("🧪 Testing LightRAG with documents...")
    
    try:
        # Check if data directory exists
        data_dir = Path("./data/Business/")
        if not data_dir.exists() or not any(data_dir.iterdir()):
            print(f"❌ No data found in {data_dir}")
            return
        
        print(f"📁 Found data directory: {data_dir}")
        
        # Initialize with document processing
        print("📋 Initializing LightRAG with document processing...")
        rag_system = RAGSystem(
            data_dir="./data/Business/",
            working_dir="./rag_storage/test_with_docs/",
            embedding_model="all-MiniLM-L6-v2",
            skip_document_processing=False,  # Process documents
            temperature=0.7,
            max_tokens=2000
        )
        print("✅ LightRAG initialized with documents!")
        
        # Test queries
        queries = [
            "What is the company culture like?",
            "Tell me about productivity and efficiency",
            "What are the main challenges mentioned?"
        ]
        
        for query in queries:
            print(f"\n❓ Query: {query}")
            response = rag_system.query(query)
            print(f"💬 Response: {response[:300]}...")
        
        print("\n🎉 Test completed successfully!")
        
    except Exception as e:
        print(f"❌ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_lightrag_with_docs()