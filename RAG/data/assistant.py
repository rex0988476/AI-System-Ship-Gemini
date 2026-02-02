# Import the necessary libraries.
import google.generativeai as genai
import os
import time

class Gemini():
    def __init__(self, system_prompt: str = "None"):
        try:
            API_KEY = os.environ.get('GOOGLE_API_KEY')
            if not API_KEY:
                raise ValueError("GEMINI_API_KEY not found in environment variables.")
            genai.configure(api_key=API_KEY)
        except Exception as e:
            print(f"Error during API key configuration: {e}")
            exit()

        self.model = genai.GenerativeModel(
            'gemini-1.5-pro-latest', # 'gemini-2.5-pro',
            system_instruction=system_prompt
            )

    def generate_reply(self, prompt, retries=5, delay=2):
        """
        Generates text from the Gemini API with a retry mechanism for rate limits.
        """
        for i in range(retries):
            try:
                # Use the generate_content method to send the prompt to the model.
                print("Sending request to Gemini API...")
                response = self.model.generate_content(prompt)
                return response.text
            except Exception as e:
                if "Resource has been exhausted" in str(e) and i < retries - 1:
                    print(f"Rate limit hit. Retrying in {delay} seconds...")
                    time.sleep(delay)
                    delay *= 2  # Exponential backoff
                else:
                    raise e
        return "Failed to generate content after multiple retries."

"""
NOTE: Test
system_prompt = "Extract useful information to markdown format file"
gemini = Gemini(system_prompt)
response = gemini.generate_reply("Hello, world!")
"""
