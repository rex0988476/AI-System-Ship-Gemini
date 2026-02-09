from pymongo import MongoClient

MONGO_URL = "mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP"

# Exported helpers for reuse
def get_client():
    return MongoClient(MONGO_URL)

def get_db(name="general_test"):
    return get_client()[name]


if __name__ == "__main__":
    client = get_client()
    db = client["ais_data_test"]
    col = db["vesselPosition"]

    print(client.list_database_names())
    print(db.list_collection_names())

    # Read a sample
    for doc in col.find().limit(1):
        continue
        print(doc)
    
    error_cnt = 0
    for doc in col.find({}):
        for d in doc.get("data", []):
            lat = d.get("lat")
            lon = d.get("lon")
            timestamp = d.get("timestamp")
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

