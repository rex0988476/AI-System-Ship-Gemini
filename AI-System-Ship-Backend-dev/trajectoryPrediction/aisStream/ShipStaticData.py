import asyncio
import websockets
import json
import os
from pathlib import Path
from datetime import datetime, timezone
from pymongo import MongoClient

"""
Database
fastify.register(fastifyMongo, {
    url: 'mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP'
  });
"""

MONGO_URL = "mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP"
client = MongoClient(MONGO_URL)
db = client["general_test"]
col = db[""]
buffer_size = 100

# Load fetch settings JSON
settings_path = Path(__file__).with_name("fetch_settings.json")
with settings_path.open("r", encoding="utf-8") as f:
    settings = json.load(f)
env_api_key = os.getenv("AIS_API_KEY")
if env_api_key:
    settings["APIKey"] = env_api_key
elif "APIKey" not in settings:
    raise RuntimeError("Missing AIS_API_KEY environment variable and APIKey in fetch_settings.json")

async def connect_ais_stream():

    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as websocket:
        subscribe_message = settings
        subscribe_message["FilterMessageTypes"] = ["ShipStaticData"]  
        subscribe_message_json = json.dumps(subscribe_message)
        await websocket.send(subscribe_message_json)

        buffer = []
        async for message_json in websocket:
            message = json.loads(message_json)
            try:
                payload = message.get("Message", {}).get("ShipStaticData")
                if payload is None:
                    continue
                record = {
                    "message_type": message.get("MessageType"),
                    "meta_data": message.get("MetaData", {}),
                    "data": payload,
                    "received_at": datetime.now(timezone.utc).isoformat(),
                }
                buffer.append(record)
            except KeyError:
                print(message.get("Message", {}).keys())
if __name__ == "__main__":
    asyncio.run(connect_ais_stream())
