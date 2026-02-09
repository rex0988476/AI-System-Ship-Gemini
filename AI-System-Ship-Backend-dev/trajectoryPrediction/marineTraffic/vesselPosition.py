import requests
import json
import pickle
import os
import sys
import logging
from pathlib import Path
from datetime import datetime, timezone
import time

# Ensure project root is on sys.path for local imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import get_db

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# Read API key from environment
API_KEY = os.getenv("MT_API_KEY")
if not API_KEY:
    raise RuntimeError("Missing MT_API_KEY environment variable")
API_URL = f"https://services.marinetraffic.com/api/exportvessels-custom-area/{API_KEY}"

logger.info("Using API URL: %s", API_URL)

params = {
    "v": 2,
    "timespan": 5,
    "protocol": "jsono"
    }

def main():
    try:
        r = requests.get(API_URL, params=params, timeout=60)
        r.raise_for_status()
        logger.info("Response status code: %s", r.status_code)

        # Parse JSON response if possible
        data = r.json()

        # Save to MongoDB
        db = get_db("ais_data_test")
        col = db["vesselPosition"]
        record = {
            "fetched_at": datetime.now(timezone.utc).isoformat(),
            "metadata": data.get("METADATA", {}),
            "data": data.get("DATA", []),
        }
        col.insert_one(record)
        logger.info("Saved to MongoDB: ais_data_test.vesselPosition")
    except Exception as e:
        logger.exception("Failed to fetch/store vessel positions")
        return 0
    return 0


if __name__ == "__main__":
    # Run in a loop to avoid scheduler failures on transient API errors
    while True:
        main()
        time.sleep(60)
