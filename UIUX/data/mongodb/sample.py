from pymongo import MongoClient
import pprint

db = "mongodb://spacevleo:spacevleo@125.228.92.179:27017"

# 1. Connect to your MongoDB server
# This connects to a local MongoDB instance by default.
client = MongoClient(db)

# Get the list of database names
database_names = client.list_database_names()

print("Available databases:")
print(database_names)

db = client['ais_data']  
print("Connected to database:", db.list_collection_names())

collection = db['Taiwan']
print(collection)

try:
    sample_documents = collection.find({}).limit(3)
    for doc in sample_documents:
        pprint.pprint(doc)
        print("-" * 20)

except Exception as e:
    print(f"An error occurred: {e}")


# Close the connection
client.close()