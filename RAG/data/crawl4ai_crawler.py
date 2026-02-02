import shutil
import os
import asyncio
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode
import aiofiles
import re

def is_markdown_empty(markdown_content: str):
    """檢查 markdown 內容是否為空白或無意義"""
    if not markdown_content:
        return True
    
    # 移除空白字符、換行符等
    cleaned_content = markdown_content.strip()
    
    # 如果清理後內容為空
    if not cleaned_content:
        return True
    
    # 檢查是否只包含常見的無意義內容
    meaningless_patterns = [
        r'^#+\s*$',  # 只有標題符號
        r'^[#\-=\*\s]+$',  # 只有標記符號和空白
        r'^Request unsuccessful.*$',  # 請求失敗
        r'^(Are you a robot|正在驗證您是否是人類)*$',  # 檢查是否為機器人
        r'^(404|not found|error|access denied|Request unsuccessful).*$',  # 錯誤頁面
        r'^loading.*$',  # 載入頁面
    ]
    
    for pattern in meaningless_patterns:
        if re.match(pattern, cleaned_content, re.IGNORECASE):
            return True
    
    # 檢查內容長度是否過短（少於 50 個字符視為無意義）
    if len(cleaned_content) < 50:
        return True
    
    return False

async def crawl_single_url(crawler, url, title, md_docs_dir: str):
    try:
        run_conf = CrawlerRunConfig(cache_mode=CacheMode.BYPASS)
        result = await crawler.arun(url=url, config=run_conf)
        
        if result.success:
            if is_markdown_empty(result.markdown.raw_markdown):
                return {
                    "status": "failed", 
                    "title": title, 
                    "url": url, 
                    "error": "Empty or meaningless markdown content"
                }

            # 處理檔名
            safe_filename = re.sub(r'[^\w\s-]', '', title).strip()[:100]
            safe_filename = re.sub(r'[-\s]+', '-', safe_filename)
            filename = os.path.join(md_docs_dir, f"{safe_filename}.md")
            
            # 使用 aiofiles 進行異步文件寫入
            async with aiofiles.open(filename, "w", encoding="utf-8") as f:
                await f.write(result.markdown.raw_markdown)
            
            return {"status": "success", "title": title, "url": url}
        else:
            return {"status": "failed", "title": title, "url": url, "error": result.error_message}
    except Exception as e:
        return {"status": "error", "title": title, "url": url, "error": str(e)}

async def parallel_crawling(search_results: list, md_docs_dir: str):
    browser_conf = BrowserConfig(headless=True)
    
    async with AsyncWebCrawler(config=browser_conf) as crawler:
        # 建立所有爬取任務
        tasks = [
            crawl_single_url(crawler, sr['url'], sr['title'], md_docs_dir) 
            for sr in search_results
        ]
        
        # 並行執行所有任務
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 處理結果
        for result in results:
            if isinstance(result, dict):
                if result["status"] == "success":
                    print(f"✅ Saved: {result['title']}")
                else:
                    print(f"❌ Failed: {result['title']} - {result.get('error', 'Unknown error')}")
            else:
                print(f"❌ Exception: {result}")



if __name__ == "__main__":
    import json
    from perplexity_search import set_payload, get_response
    import time
    start_time = time.time()
    
    payload = set_payload("sonar", "What is dark vessel detection?", "academic")
    response = get_response(payload)
    print(f"\nResponse:\n{response['choices'][0]['message']['content']}")

    search_results = response.get("search_results", [])
    print(f"\nTotal {len(search_results)} Search Results:")
    for search_result in search_results:
        print(json.dumps(search_result, indent=2, ensure_ascii=False))

    # save_result(response, search_results)

    asyncio.run(parallel_crawling(search_results))

    end_time = time.time()
    elapsed_time = end_time - start_time
    print(f"\nTotal elapsed time: {elapsed_time:.2f} seconds")