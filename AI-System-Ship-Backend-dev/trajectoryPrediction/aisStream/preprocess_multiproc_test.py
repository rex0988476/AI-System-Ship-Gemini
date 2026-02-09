"""
Test multiprocess MongoDB fetch by MMSI.
"""
from multiprocessing import Pool, cpu_count
from pymongo import MongoClient
import time

MONGO_URL = "mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP"
DB_NAME = "general_test"
COL_NAME = "aisStreamPositionReport"


def _fetch_mmsi(mmsi):
    client = MongoClient(MONGO_URL)
    col = client[DB_NAME][COL_NAME]
    cursor = col.find({"meta_data.MMSI": mmsi}, {"data": 1, "meta_data": 1, "_id": 0})
    traj = []
    for doc in cursor:
        data = doc.get("data", {})
        meta = doc.get("meta_data", {})
        data["time_utc"] = meta.get("time_utc")
        data["ShipName"] = meta.get("ShipName")
        traj.append(data)
    client.close()
    return mmsi, traj


def main():
    client = MongoClient(MONGO_URL)
    col = client[DB_NAME][COL_NAME]
    mmsi_list = col.distinct("meta_data.MMSI")
    client.close()

    workers = max(1, cpu_count() - 1)
    print(f"Workers: {workers}, MMSI count: {len(mmsi_list)}")

    start = time.perf_counter()
    with Pool(workers) as pool:
        results = pool.map(_fetch_mmsi, mmsi_list)
    elapsed = time.perf_counter() - start

    trajectories = dict(results)
    print(f"Total unique MMSI: {len(trajectories)}")
    print(f"Elapsed: {elapsed:.2f}s")


if __name__ == "__main__":
    main()
