import os
import sys
from pathlib import Path
import requests

# Ensure project root is on sys.path for local imports
PROJECT_ROOT = Path(__file__).resolve().parents[0]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import get_db

# Load trajectories from MongoDB (no output here)
DB_NAME = "ais_data_test"
COLLECTION_NAME = "vesselPosition"

def load_trajectories(limit=1):
    db = get_db(DB_NAME)
    col = db[COLLECTION_NAME]
    doc = col.find_one(sort=[("fetched_at", -1)])
    if not doc:
        return []
    return doc.get("data", [])

# Fetch trajectories via UIUX API 
def fetch_trajectories_via_api(mmsi, api_base=None, timeout=30):
    api_base = api_base or "http://140.115.53.51:3000/api/v1"
    if not api_base:
        raise RuntimeError("Missing UIUX_API_BASE or API_BASE environment variable")
    url = f"{api_base.rstrip('/')}/vesselTrack"
    params = {"mmsi": mmsi}
    res = requests.get(url, params=params, timeout=timeout)
    res.raise_for_status()
    data = res.json()
    # Basic checks
    if not isinstance(data, list):
        return []
    if data and not isinstance(data[0], dict):
        return []
    return data

if __name__ == "__main__":
    # Quick fetch check
    sample_mmsi = os.getenv("MMSI", "41200006")
    items = fetch_trajectories_via_api(sample_mmsi)
    print(f"Fetched {len(items)} points for MMSI {sample_mmsi}")
    if items:
        print("First item:", items[0])
