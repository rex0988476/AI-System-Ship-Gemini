#!/usr/bin/env python3
"""Test script for database update functionality in LangChain RAG system"""

import sys
import os
from pathlib import Path

# Add the project root to the path
sys.path.append(str(Path(__file__).parent))

from ragsys.langchain import RAGSystem

def test_database_update():
    """Test the database update functionality"""
    print("Testing LangChain RAG database update functionality...")
    
    # Initialize RAG system with update_database=True
    rag_system = RAGSystem(
        data_dir="./data/",
        vector_store_dir="./test_database/",
        update_database=True,
        model_provider="google_genai",
        model_name="gemini-1.5-pro-latest",
        embedding_model_provider="google_genai",
        embedding_model="models/text-embedding-004"
    )
    
    print("✓ RAGSystem initialized with update_database=True")
    
    # Test query to verify the system works
    test_query = "What is the main topic of the documents?"
    response = rag_system.query(test_query)
    print(f"✓ Test query successful: {test_query}")
    print(f"Response length: {len(response)} characters")
    
    # Test update_database method
    print("\nTesting update_database() method...")
    rag_system.update_database()
    print("✓ update_database() method executed")
    
    # Test add_document method (if there are test files)
    test_files = list(Path("./data/").rglob("*.txt"))
    if test_files:
        print(f"\nTesting add_document() with file: {test_files[0]}")
        rag_system.add_document(str(test_files[0]))
        print("✓ add_document() method executed")
    else:
        print("No .txt files found for add_document() test")
    
    # Test rebuild_database method
    print("\nTesting rebuild_database() method...")
    rag_system.rebuild_database()
    print("✓ rebuild_database() method executed")
    
    # Final query test
    final_response = rag_system.query(test_query)
    print(f"✓ Final test query successful")
    print(f"Final response length: {len(final_response)} characters")
    
    print("\n✅ All database update functionality tests completed successfully!")

if __name__ == "__main__":
    test_database_update()