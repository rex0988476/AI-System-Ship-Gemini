import asyncio
import websockets
import json
import os
from datetime import datetime, timezone
from pathlib import Path

async def connect_ais_stream():

    output_path = Path(__file__).with_name("aisstream_position_reports.jsonl")
    async with websockets.connect("wss://stream.aisstream.io/v0/stream") as websocket:
        env_api_key = os.getenv("AIS_API_KEY")
        if not env_api_key:
            raise RuntimeError("Missing AIS_API_KEY environment variable")
        subscribe_message = {
            "APIKey": env_api_key,
            "BoundingBoxes": [[[-11, 178], [-10, 74]]],
            # "filtersShipMMSI": ["525033021"],
            "FilterMessageTypes": ["PositionReport"],
        }

        subscribe_message_json = json.dumps(subscribe_message)
        await websocket.send(subscribe_message_json)

        with output_path.open("a", encoding="utf-8") as f:
            async for message_json in websocket:
                message = json.loads(message_json)
                message_type = message.get("MessageType")
                metadata = message.get("MetaData", {})

                try:
                    payload = message.get("Message", {}).get("PositionReport")
                    if payload is None:
                        continue
                    record = {
                        "message_type": message_type,
                        "meta_data": metadata,
                        "data": payload,
                        "received_at": datetime.now(timezone.utc).isoformat(),
                    }
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    f.flush()
                    print(record)
                except KeyError:
                    print(message_type, message.get("Message", {}).keys())
                
if __name__ == "__main__":
    asyncio.run(connect_ais_stream())

