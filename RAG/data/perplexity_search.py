import os
import copy
import requests
import json
from dotenv import load_dotenv

load_dotenv()
# export SONAR_API_KEY="..."
# source ~/.bashrc
api_key = os.environ.get("SONAR_API_KEY")

api_url = "https://api.perplexity.ai/chat/completions"
headers = {
    "accept": "application/json",
    "authorization": f"Bearer {api_key}",
    "content-type": "application/json"
}

# Normal
normal_base_payload = {
    # "model": "sonar",
    "messages": [
        {"role": "system", "content":"""You are a helpful AI assistant.
    Your task is to review all retrieved search results and synthesize them into a single, coherent answer.
    Rules:
    1. Base your answer only on the provided search results.
    2. Merge overlapping information and resolve any contradictions using the most credible sources.
    3. Present the answer in a clear, well-structured format with concise language.
    4. If relevant, include key facts, dates, figures, and context to support the explanation.
    5. If search results do not fully answer the question, explicitly state the missing information."""},
            # {"role": "user", "content": "What is dark vessel detection?"}
        ],
        "stream": False,
    }

normal_base_payload = {
    # "model": "sonar",
    "messages": [
        {"role": "system", "content":"""You are a helpful AI assistant.
Your task is to review all retrieved search results and synthesize them into a single, coherent answer.
Rules:
1. Base your answer only on the provided search results.
2. Merge overlapping information and resolve any contradictions using the most credible sources.
3. Present the answer in a clear, well-structured format with concise language.
4. If relevant, include key facts, dates, figures, and context to support the explanation.
5. If search results do not fully answer the question, explicitly state the missing information."""},
        # {"role": "user", "content": "What is dark vessel detection?"}
    ],
    "stream": False,
}

# Academic
academic_base_payload = {
    **normal_base_payload,
    "search_mode": "academic",
    "search_after_date_filter": "8/1/2023",
    "web_search_options": {"search_context_size": "high"},
    "search_domain_filter": [
        "arxiv.org", # "ieee.org", 
    ]
}

def set_payload(model: str, user_input: str, search_mode: str):
    if search_mode == "normal":
        payload = copy.deepcopy(normal_base_payload)
    elif search_mode == "academic":
        payload = copy.deepcopy(academic_base_payload)

    payload["model"] = model
    payload["messages"].append({"role": "user", "content": user_input})

    return payload

def get_response(payload: dict) -> dict | None:
    try:
        response = requests.post(api_url, headers=headers, json=payload)

        # 檢查 HTTP 狀態碼
        if response.status_code != 200:
            print(f"HTTP Error {response.status_code}: {response.reason}")
            print(f"Response text: {response.text[:500]}")  # 顯示前500個字符
            return None
        
        # 檢查回應是否為空
        if not response.text.strip():
            print("Error: Empty response received")
            return None
        
        # 嘗試解析 JSON
        try:
            return response.json()
        except requests.exceptions.JSONDecodeError as e:
            print(f"JSON Decode Error: {e}")
            print(f"Response content: {response.text[:500]}")
            return None
            
    except requests.exceptions.RequestException as e:
        print(f"Request Error: {e}")
        return None

def get_unique_search_results(current_search_results: list, existing_search_results: list):
    key_field = "url"
    # 建立現有結果的集合（用於快速查找）
    existing_keys = {result.get(key_field) for result in existing_search_results if result.get(key_field)}
    
    # 篩選出非重複的新結果
    unique_search_results = []
    duplicates_found = 0

    print()
    for result in current_search_results:
        result_key = result.get(key_field)
        if result_key and result_key not in existing_keys:
            unique_search_results.append(result)
            existing_keys.add(result_key)  # 避免在新結果中也有重複
        else:
            print(f"Duplicated: {result['title']}")
            duplicates_found += 1
    
    print(f"Duplicate check: {duplicates_found} duplicates removed, {len(unique_search_results)} new items")

    return unique_search_results

def save_response(input: str, response: dict, current_search_results: list, response_md_dir: str):
    with open(response_md_dir, "a", encoding="utf-8") as f:
        markdown_links = []
        for i, result in enumerate(current_search_results, 1):
            title = result.get('title', 'Unknown Title')
            url = result.get('url', '#')
            date = result.get('date', 'No date')
            
            # 建立 Markdown 超連結格式
            markdown_link = f"{i}. [{title}]({url})"
            if date and date != 'No date':
                markdown_link += f" *(Date: {date})*"
            
            markdown_links.append(markdown_link)
        
        hyperlink_content = "**References**\n\n" + "\n".join(markdown_links)
        # complete_content = (
        #     f"# **{input.strip()}**\n\n"
        #     f"{response['choices'][0]['message']['content']}"
        #     f"\n\n---\n\n"
        #     f"{hyperlink_content}"
        #     f"\n\n---\n\n"
        # )
        complete_content = f"""# **{input.strip()}**

{response['choices'][0]['message']['content']}

---

{hyperlink_content}

---

"""
        f.write(complete_content)

def save_search_results(existing_search_results, unique_search_results, search_results_json_dir: str):
    final_search_results = existing_search_results + unique_search_results
    with open(search_results_json_dir, "w", encoding="utf-8") as f:
        json.dump(final_search_results, f, indent=2, ensure_ascii=False)


    
if __name__ == "__main__":
    import json

    payload = set_payload("sonar", "What is dark vessel detection?", "academic")

    print("Payload:")
    for key, value in payload.items():
        print(f"{key}: {value}")

    response = get_response(payload)
    print(f"\nResponse:\n{response['choices'][0]['message']['content']}")

    # citations = response.get("citations", [])
    # print(f"\nTotal {len(citations)} Citations:")
    # for citation in citations:
    #     print(citation)

    search_results = response.get("search_results", [])
    print(f"\nTotal {len(search_results)} Search Results:")
    for search_result in search_results:
        print(json.dumps(search_result, indent=2, ensure_ascii=False))