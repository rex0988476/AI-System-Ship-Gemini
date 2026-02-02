#!/usr/bin/env python3
"""Test script for incremental database update functionality in LangChain RAG system"""

import sys
import os
import tempfile
from pathlib import Path

# Add the project root to the path
sys.path.append(str(Path(__file__).parent))

from ragsys.langchain import RAGSystem

def test_incremental_database_update():
    """Test the incremental database update functionality"""
    print("Testing LangChain RAG incremental database update functionality...")
    
    # Create a temporary test directory structure
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_path = Path(temp_dir)
        data_dir = temp_path / "test_data"
        vector_dir = temp_path / "test_vector_store"
        
        data_dir.mkdir()
        
        # Create some test files
        test_file1 = data_dir / "test1.txt"
        test_file2 = data_dir / "test2.txt"
        
        test_file1.write_text("This is the first test document. It contains information about testing.")
        test_file2.write_text("This is the second test document. It discusses database updates.")
        
        print(f"✓ Created test files in {data_dir}")
        
        # Initialize RAG system without auto-update
        rag_system = RAGSystem(
            data_dir=str(data_dir),
            vector_store_dir=str(vector_dir),
            update_database=False,  # Don't auto-update during init
            model_provider="google_genai",
            model_name="gemini-1.5-pro-latest",
            embedding_model_provider="google_genai",
            embedding_model="models/text-embedding-004"
        )
        
        print("✓ RAGSystem initialized without auto-update")
        
        # Test initial incremental update (should process both files)
        print("\n--- Testing initial incremental update ---")
        rag_system.update_database(incremental=True)
        print("✓ Initial incremental update completed")
        
        # Verify processed files were tracked
        print(f"Processed files count: {len(rag_system.processed_files)}")
        assert len(rag_system.processed_files) == 2, "Should have tracked 2 processed files"
        
        # Test query to verify documents were processed
        response = rag_system.query("What is this document about?")
        print(f"✓ Query successful, response length: {len(response)} characters")
        
        # Add a new file
        test_file3 = data_dir / "test3.txt"
        test_file3.write_text("This is the third test document. It covers new functionality.")
        print("✓ Added new test file")
        
        # Test incremental update (should only process the new file)
        print("\n--- Testing incremental update with new file ---")
        rag_system.update_database(incremental=True)
        print("✓ Incremental update with new file completed")
        
        # Verify only the new file was processed
        print(f"Processed files count after new file: {len(rag_system.processed_files)}")
        assert len(rag_system.processed_files) == 3, "Should now have tracked 3 processed files"
        
        # Modify an existing file
        test_file1.write_text("This is the MODIFIED first test document. It now contains updated information about testing.")
        print("✓ Modified existing test file")
        
        # Test incremental update (should only process the modified file)
        print("\n--- Testing incremental update with modified file ---")
        rag_system.update_database(incremental=True)
        print("✓ Incremental update with modified file completed")
        
        # Test clearing cache
        print("\n--- Testing cache clearing ---")
        rag_system.clear_processed_files_cache()
        print("✓ Processed files cache cleared")
        assert len(rag_system.processed_files) == 0, "Cache should be empty after clearing"
        
        # Test update after cache clear (should process all files again)
        print("\n--- Testing update after cache clear ---")
        rag_system.update_database(incremental=True)
        print("✓ Update after cache clear completed")
        assert len(rag_system.processed_files) == 3, "Should have reprocessed all 3 files"
        
        # Test non-incremental update
        print("\n--- Testing non-incremental (full) update ---")
        rag_system.update_database(incremental=False)
        print("✓ Non-incremental update completed")
        
        # Final query test
        final_response = rag_system.query("What new functionality is covered?")
        print(f"✓ Final query successful, response length: {len(final_response)} characters")
        
        print("\n✅ All incremental database update functionality tests completed successfully!")
        
        # Display some stats
        print(f"\nStats:")
        print(f"- Total processed files: {len(rag_system.processed_files)}")
        print(f"- Processed files cache location: {rag_system.processed_files_path}")

if __name__ == "__main__":
    test_incremental_database_update()