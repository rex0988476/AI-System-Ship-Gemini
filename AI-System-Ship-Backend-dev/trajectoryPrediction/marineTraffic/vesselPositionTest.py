import requests
import json
import pickle
import os
import sys
from pathlib import Path
from datetime import datetime, timezone

# Read API key from environment
API_KEY = os.getenv("MT_API_KEY")
if not API_KEY:
    raise RuntimeError("Missing MT_API_KEY environment variable")
API_URL = f"https://services.marinetraffic.com/api/exportvessels-custom-area/{API_KEY}"

params = {
    "v": 2,
    "timespan": 5,
    "protocol": "jsono"
    }

def main():
    try:
        r = requests.get(API_URL, params=params, timeout=60)
        r.raise_for_status()
        print(f"Response status code: {r.status_code}")

        # Parse JSON response if possible
        try:
            data = r.json()
        except ValueError as e:
            print("Failed to parse JSON response:", e)
            data = {"raw_text": r.text}
            pickle_path = "vessel_position.pkl"
            with open(pickle_path, "wb") as f:
                pickle.dump(data, f)
            print(f"Saved pickle to {pickle_path}")

        json_path = "vessel_position_example.json"
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Saved JSON to {json_path}")
    
    except Exception as e:
        print(f"Error: {e}")
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
