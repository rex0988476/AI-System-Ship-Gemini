import json
import asyncio
from ntpath import exists
from re import search
import time
import os
import shutil
import requests

from perplexity_search import set_payload, get_response, get_unique_search_results, save_response, save_search_results
from crawl4ai_crawler import parallel_crawling
from crawl4ai_llm import crawl_ai
from llm_ask import generate_questions
from assistant import Gemini

RESULT_DIR = "./survey/result"
MD_DOCS_DIR = os.path.join(RESULT_DIR, "md_docs")
PDFS_DIR = os.path.join(RESULT_DIR, "pdfs")
RESPONSE_MD_DIR = os.path.join(RESULT_DIR, "response.md")
SEARCH_RESULTS_JSON_DIR = os.path.join(RESULT_DIR, "search_results.json")
DOWNLOADED_FILES = os.path.join(MD_DOCS_DIR, "downloaded_files.json")

assistant = Gemini((
    "You are a helpful assistant that can find the 'download' link "
    "of the pdf file in the markdown content."
    "Return the link *only*"))

def single_research(input: str, search_mode: str):
    """
    Search papers, find the website of the papers
    """
    start_time = time.time()

    # Set payload and get response
    payload = set_payload("sonar", input, search_mode)
    response = get_response(payload)
    response_content = response['choices'][0]['message']['content']
    # print(f"\nResponse:\n{response_content}")

    # List search results
    current_search_results = response.get("search_results", [])
    # print(f"\nTotal {len(current_search_results)} Search Results:")
    # for search_result in current_search_results:
    #     print(json.dumps(search_result, indent=2, ensure_ascii=False))

    # Get unique search results
    with open(SEARCH_RESULTS_JSON_DIR, "r", encoding="utf-8") as f:
        existing_search_results = json.load(f)
    unique_search_results = get_unique_search_results(current_search_results, existing_search_results)
    # print(f"\nTotal {len(unique_search_results)} Unique Search Results:")
    for unique_search_result in unique_search_results:
        # print(json.dumps(unique_search_result, indent=2, ensure_ascii=False))
        pass

    # Save response and search results
    save_response(input, response, current_search_results, RESPONSE_MD_DIR)
    save_search_results(existing_search_results, unique_search_results, SEARCH_RESULTS_JSON_DIR)
    # print("\nResponse and search results saved successfully.\n")

    # Parallel crawling on search results
    # asyncio.run(parallel_crawling(unique_search_results, MD_DOCS_DIR))
    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"\nSingle searching time: {elapsed_time:.2f} seconds\n")

    search_results = unique_search_results
    return response_content, search_results

def download_pdfs() -> dict: # search_results: list[dict]
    """Download the new pdfs from search result"""
    # Get search results
    print(SEARCH_RESULTS_JSON_DIR)
    if os.path.exists(SEARCH_RESULTS_JSON_DIR):
        with open(SEARCH_RESULTS_JSON_DIR, "r", encoding="utf-8") as f:
            search_results = json.load(f)
    else:
        search_results = []
    # Get downloaded files
    if os.path.exists(DOWNLOADED_FILES):
        with open(DOWNLOADED_FILES, "r", encoding="utf-8") as f:
            downloaded_files = json.load(f)
        # replied_links = [link[0] for link in replied_links]
    else:
        downloaded_files = {}

    # Crawl ai instruction
    crawl_instruction = (
        "Find the link the pdf, return the link only"
        "Example: if the page is 'https://ieeexplore.ieee.org/document/11104622/', "
        "then the link to the pdf will be: "
        "https://ieeexplore.ieee.org/stamp/stamp.jsp?tp=&arnumber=11104622"
    )    

    # download pdf, update downloaded files if success
    for search_result in search_results:
        title = search_result['title']
        if title in downloaded_files:
            continue
        
        print(search_result["url"])
        try:
            pdf_link = asyncio.run(crawl_ai(search_result["url"], crawl_instruction))
        except Exception as e:
            print(f"Error crawling {search_result['url']}: {e}")
            continue
            
        print("=============================")
        
        if not pdf_link or len(pdf_link) == 0:
            print("No PDF link found, skipping...")
            continue
            
        keys = list(pdf_link[0].keys())
        actual_pdf_link = pdf_link[0][keys[0]]
        print(actual_pdf_link)
        print("=============================")
        
        print(f"Downloading: {actual_pdf_link}")
        output_dir = f"{PDFS_DIR}/{title}.pdf"
        try:
            response = requests.get(actual_pdf_link, stream=True)
            if response.status_code == 200:
                with open(output_dir, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                downloaded_files[title] = actual_pdf_link
                print(f"✅ Downloaded: {output_dir}")
            else:
                print("❌ Failed to download:", response.status_code)
        except:
            pass
    
    with open(DOWNLOADED_FILES, "w", encoding="utf-8") as f:
        json.dump(downloaded_files, f, indent=2, ensure_ascii=False)
    

if __name__ == "__main__":
    # download_pdfs()
    
    # * 使用者參數
    start_time = time.time()
    user_input = "What is dark vessel detection?"
    search_mode = "academic"
    target_md_docs_count = 5
    
    # Manage files
    # if os.path.exists(RESULT_DIR):
    #     shutil.rmtree(RESULT_DIR, ignore_errors=True)
    os.makedirs(RESULT_DIR, exist_ok=True)
    os.makedirs(MD_DOCS_DIR, exist_ok=True)
    os.makedirs(PDFS_DIR, exist_ok=True)
    with open(RESPONSE_MD_DIR, "w", encoding="utf-8") as f:
        f.write("")
    if not os.path.exists(SEARCH_RESULTS_JSON_DIR):
        print("Set result files")
        with open(SEARCH_RESULTS_JSON_DIR, "w", encoding="utf-8") as f:
            json.dump([], f, indent=2, ensure_ascii=False)

    questions = [user_input]
    index = 1

    for question in questions:
        # Check number of results
        # md_docs_count = len(os.listdir(MD_DOCS_DIR))
        with open(SEARCH_RESULTS_JSON_DIR, "r") as f:
            search_results = json.load(f)
        docs_count = len(search_results)
        if docs_count >= target_md_docs_count:
            break

        print(f"Question {index}: {question}")
        search_response_content, search_results = single_research(input=question, search_mode=search_mode)
        questions.pop(0)

        new_questions = generate_questions(search_response_content)
        questions.extend(new_questions)
        print(f"\nNew Questions:")
        for new_question in new_questions:
            print(f" - {new_question}")
        print("\n" + "=" * 50 + "\n")

        index += 1
        # if index > 10:
        #     break

    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"Research time: {elapsed_time:.2f} seconds")
    print(f"Total MD docs: {docs_count}")

    download_pdfs()  # Skip PDF download due to timeout issues
    

"""
def download_pdfs(pdf_links):
    
    downloaded_filepath = os.path.join(MD_DOCS_DIR, "downloaded_files.json")
    if os.path.exists(downloaded_filepath):
        with open(downloaded_filepath, "r", encoding="utf-8") as f:
            downloaded_files = json.load(f)
        # replied_links = [link[0] for link in replied_links]
    else:
        downloaded_files = {}
    
    # print(os.listdir(MD_DOCS_DIR))
    # replied_links = []    
    files = os.listdir(MD_DOCS_DIR)
    for filename in files:
        if not filename.endswith(".md") or filename in downloaded_files:
            continue
        filepath = os.path.join(MD_DOCS_DIR, filename)
        reply = find_pdf_link(filepath)
        downloaded_files[filename] = reply

        # url = "https://arxiv.org/pdf/2106.14834.pdf"  # replace with your PDF URL
        print(f"Downloading: {reply}")
        output_dir = f"{PDFS_DIR}/{filename}.pdf"
        try:
            response = requests.get(reply, stream=True)
            if response.status_code == 200:
                with open(output_dir, "wb") as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)
                print(f"✅ Downloaded: {output_dir}")
            else:
                print("❌ Failed to download:", response.status_code)
        except:
            pass
    
    with open(downloaded_filepath, "w", encoding="utf-8") as f:
        json.dump(downloaded_files, f, indent=2, ensure_ascii=False)
def find_pdf_link(filename: str):
    with open(filename, "r") as f:
        doc = f.read()
    reply = assistant.generate_reply(f"doc: {doc}")
    return reply
"""
