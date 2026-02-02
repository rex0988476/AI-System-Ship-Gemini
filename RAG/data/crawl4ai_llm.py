import os
import asyncio
import json
from pydantic import BaseModel, Field
from typing import List
from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig, CacheMode, LLMConfig
from crawl4ai import LLMExtractionStrategy

class Product(BaseModel):
    name: str
    price: str

async def crawl_ai(url: str, instruction: str):
    # 1. Define the LLM extraction strategy
    llm_strategy = LLMExtractionStrategy(
        llm_config = LLMConfig(provider="gemini/gemini-1.5-pro-latest", api_token=os.getenv('GOOGLE_API_KEY')),
        # schema=Product.schema_json(), # Or use model_json_schema()
        extraction_type="schema",
        instruction= instruction, # Extract all product objects with 'name' and 'price' from the content.",
        chunk_token_threshold=1000,
        overlap_rate=0.0,
        apply_chunking=True,
        input_format="markdown",   # or "html", "fit_markdown"
        extra_args={"temperature": 0.0, "max_tokens": 800}
    )

    # 2. Build the crawler config
    crawl_config = CrawlerRunConfig(
        extraction_strategy=llm_strategy,
        cache_mode=CacheMode.BYPASS
    )

    # 3. Create a browser config if needed
    browser_cfg = BrowserConfig(headless=True)

    async with AsyncWebCrawler(config=browser_cfg) as crawler:
        # 4. Let's say we want to crawl a single page
        result = await crawler.arun(
            url= url, # "https://docs.crawl4ai.com/extraction/llm-strategies/",
            config=crawl_config
        )

        data = None
        if result.success:
            # 5. The extracted content is presumably JSON
            data = json.loads(result.extracted_content)
            print("Extracted items:", type(data))

            # 6. Show usage stats
            # llm_strategy.show_usage()  # prints token usage

        else:
            print("Error:", result.error_message)

    return data

if __name__ == "__main__":
    asyncio.run(crawl_ai())
