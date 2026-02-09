import os
import sys
from pathlib import Path

# Ensure project root is on sys.path for local imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))
from database import get_db

# Check if data exists in MongoDB (match vesselPosition.py)
"""
- DB first to document are test, the timestamp may differ
"""
DB_NAME = "ais_data_test"
COLLECTION_NAME = "vesselPosition"
db = get_db(DB_NAME)
col = db[COLLECTION_NAME]

count = col.count_documents({})
print(f"{DB_NAME}.{COLLECTION_NAME} count: {count}")
docs = col.find({}, {"metadata": 1, "data": 1}).limit(3)
_keys = None
for i, doc in enumerate(docs):
    data = doc.get("data", [])
    if not data:
        print(f"Doc {i}: empty data")
        continue
    first_point = data[0]
    if _keys is not None:
        if _keys != first_point.keys():
            print("Warning: Document keys differ from previous document")
        else:
            print("Document keys match previous document")
    else:
        _keys = first_point.keys()
    print(f"\nSample doc {i}:")
    print("metadata keys:", list(doc.get("metadata", {}).keys()))
    print("first point:", first_point)
    print("point count:", len(data))
    break

error_cnt = 0
for doc in col.find({}, {"data": 1}):
    for d in doc.get("data", []):
        lat = d.get("LAT")
        lon = d.get("LON")
        timestamp = d.get("TIMESTAMP")
        if lat is None or lon is None or timestamp is None:
            error_cnt += 1
print("Error count:", error_cnt)

# DB stats
db_stats = db.command("dbstats")
print("db dataSize:", db_stats.get("dataSize"))
print("db storageSize:", db_stats.get("storageSize"))

# Collection stats
col_stats = db.command("collstats", col.name)
print("col count:", col_stats.get("count"))
print("col size:", col_stats.get("size"))
print("col storageSize:", col_stats.get("storageSize"))

# Counts
print("count_documents:", col.count_documents({}))
print("estimated_document_count:", col.estimated_document_count())

"""
# Delete from database
# col.delete_one({"_id": docs[0]["_id"]})
"""
