import os
# from autogen import LLMConfig, ModelFamily

openai_config = {
            "config_list": [{
                "model": "gpt-4o-mini",
                "api_key": os.environ.get("OPENAI_API_KEY"),
                "api_type": "openai",
            }],
            "temperature": 0.7,
            "max_tokens": 4000,
        }

gemini_config = {
        "config_list": [
            {
                "model": "gemini-2.5-pro",  # Or "gemini-1.5-pro", "gemini-pro"
                "api_key": os.getenv("GOOGLE_API_KEY"),  # Assuming gemini_key is an attribute of self
                "api_type": "google",        # Crucial for Gemini integration
            }
        ],
        "temperature": 0.0,
        "max_tokens": 4096,
        "cache_seed": 42,
    }