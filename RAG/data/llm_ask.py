import re
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv()

system_prompt = """
You are a follow-up question generator. Given the user's provided information, produce 5 clear, specific follow-up questions to gather additional key facts or perspectives.

Guidelines:
1. Do not repeat known information.
2. Ensure each question is clear, easy to understand, and aims for a specific or quantifiable answer.
3. Focus on filling research gaps, validating hypotheses, or revealing emerging trends.
4. Move from key gaps → background context → comparisons/changes → details/impacts.
5. Avoid leading or biased wording; remain neutral and open-ended.
6. Exclude illegal, privacy-violating, or sensitive personal data.

Output format:
List exactly 5 numbered questions.  
Example:
1. <First question>  
2. <Second question>  
3. <Third question>  
4. <Fourth question>  
5. <Fifth question>
"""

def generate_questions(research_response_content: str):
    client = OpenAI()

    # 呼叫 Chat API
    response = client.chat.completions.create(
        model="gpt-4.1-nano",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": research_response_content}
        ]
    )
        
    # 取得回覆
    question_response_content = response.choices[0].message.content
    questions = re.findall(r'^\d+\.\s*(.+)', question_response_content, flags=re.MULTILINE)
    
    return questions