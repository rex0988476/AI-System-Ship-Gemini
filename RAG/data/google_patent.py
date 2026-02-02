from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
import requests
from bs4 import BeautifulSoup
from typing import Optional
import os
import re
import time
from tqdm import tqdm


"""
NOTE: Elements of the web page
    <state-modifier class="result-title style-scope search-result-item" act="{&quot;type&quot;: &quot;OPEN_RESULT&quot;, &quot;result&quot;: &quot;$result&quot;}" data-result="patent/JP2883042B2/en"><a id="link" href="/patent/JP2883042B2/en?q=(ship+detection)&amp;oq=ship+detection&amp;peid=63c26aaec1f68%3A6b%3Aa8727cb4" class="style-scope state-modifier">
      <h3 class="style-scope search-result-item"><raw-html class="style-scope search-result-item"><span id="htmlContent" class="style-scope raw-html" style="display: inline;"> Target detection system for ship radar</span>
</raw-html></h3>
    </a></state-modifier>
"""

def download_patent_pdf(patent_number, save_path=None):
    os.mkdir(save_path) if not os.path.exists(save_path) else None
    # Construct PDF URL (most reliable)
    # https://patents.google.com/patent/AU2023270333B2/en?download=true
    pdf_url = f"https://patents.google.com/patent/{patent_number}/en?download=true"
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                      "AppleWebKit/537.36 (KHTML, like Gecko) "
                      "Chrome/113.0.0.0 Safari/537.36"
    }    
    response = requests.get(pdf_url, headers=headers)
    response.raise_for_status()
    soup = BeautifulSoup(response.content, 'html.parser')
    pdf_meta_tag = soup.find('meta', {'name': 'citation_pdf_url'})

    if pdf_meta_tag:
        pdf_url = pdf_meta_tag.get("content")
        response = requests.get(pdf_url, headers=headers)
        # print(response.content)
        if response.status_code == 200:
            with open(save_path + f"{patent_number}.pdf", "wb") as f:
                f.write(response.content)
            # print(f"Downloaded {patent_number} to {save_path}")
        else:
            pass
            # print(f"Failed to download patent {patent_number}, HTTP {response.status_code}")

def search_patent_numbers(keyword, max_results, delay=5):
    """
    Dynamic website
    Use selenium to search
    """
    options = Options()
    options.add_argument("--headless")
    # options.headless = True
    
    patent_numbers = []

    for page in tqdm(range(max_results // 10), desc="Get urls of patents"):
        if page == 0:
            # https://patents.google.com/?q=ship+detection&page=1
            url = f"https://patents.google.com/?q={keyword.replace(' ', '+')}"
        else:
            url = f"https://patents.google.com/?q={keyword.replace(' ', '+')}&page={page}"

        driver = webdriver.Chrome(options=options)  # Make sure chromedriver is installed and in PATH
        driver.get(url)
        
        # Wait for page to load JS content
        time.sleep(delay)
        
        # Find all patent links
        elems = driver.find_elements(By.CLASS_NAME, "result-title")
        
        for elem in elems:
            patent_number = elem.get_attribute("data-result")
            if patent_number:
                patent_numbers.append(patent_number.split('/')[1])
        
        driver.quit()

    return patent_numbers

# Example:
patents = search_patent_numbers("ship detection", max_results=100)
for patent in tqdm(patents, desc="Download patents"):
    download_patent_pdf(patent, save_path="./google_patents_pdfs/")


