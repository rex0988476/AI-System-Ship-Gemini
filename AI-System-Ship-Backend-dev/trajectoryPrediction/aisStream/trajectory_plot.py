"""
Export AIS trajectories to a JSON file for Leaflet to read.
"""
import json
import os
from pymongo import MongoClient
from tqdm import tqdm

MONGO_URL = "mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP"
DB_NAME = "general_test"
COL_NAME = "aisStreamPositionReport"

# Fields to keep (based on preprocess comments)


def load_trajectories():
    print("Loading trajectories from MongoDB...")
    client = MongoClient(MONGO_URL)
    col = client[DB_NAME][COL_NAME]
    trajectories = {}
    for doc in tqdm(col.find(), desc="Loading documents", total=col.count_documents({})):
        mmsi = doc.get("meta_data", {}).get("MMSI")
        data = doc.get("data") or {}
        if mmsi not in trajectories:
            trajectories[mmsi] = [data]
        else:
            trajectories[mmsi].append(data)
    client.close()
    return trajectories


def write_json(trajs, out_path):
    # trajs: list of list of [lat, lon]
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump({"trajectories": trajs}, f)


def main():
    trajectories = load_trajectories()
    if not trajectories:
        print("No trajectories found.")
        return
    trajs = []
    for traj in trajectories.values():
        points = [
            [p.get("Latitude"), p.get("Longitude")]
            for p in traj
            if p.get("Latitude") is not None and p.get("Longitude") is not None
        ]
        if points:
            trajs.append(points)
    if not trajs:
        print("No valid points to plot.")
        return
    out_path = os.path.join(os.path.dirname(__file__), "trajectory_tmp.json")
    write_json(trajs, out_path)
    print(f"Saved trajectories to: {out_path}")


if __name__ == "__main__":
    main()
