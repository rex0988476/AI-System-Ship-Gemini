import json
import os
import sys
import time
from collections import Counter
from multiprocessing import cpu_count
from pathlib import Path
import numpy as np
from sklearn.model_selection import train_test_split
from tqdm import tqdm

# Ensure project root is on sys.path for local imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import get_db

# USER SETTINGS
DB_NAME = "ais_data_test"
COLLECTION_NAME = "vesselPosition"
UPDATE_DATA = True
LOAD_RECORDS_MULTIPROCESS = False
NUM_WORKERS = max(1, cpu_count() - 1)
MP_CHUNK_SIZE = 64
DB_SKIP_DOCS = 8
DB_CURSOR_BATCH_SIZE = 1024
SEQ_LEN = 10
TRAIN_RATIO = 0.8
SHIPTYPE_FILTER = "70"  # Set to None to include all ship types

BASE_DIR = Path(__file__).resolve().parent
OUTPUT_NPZ = str(BASE_DIR / "data.npz")
NORM_STATS_JSON = str(BASE_DIR / "norm_stats.json")
# [lat, lon, speed, course, dist]
NORM_FEATURE_IDX = (2, 3, 4)
FEATURE_NAMES = ["lat", "lon", "speed", "course", "dist"]
FEATURE_INDEX = {name: i for i, name in enumerate(FEATURE_NAMES)}

def _to_float(v):
    try:
        return float(v)
    except Exception:
        return None

def norm(x, stats, feature_index=None, features=("speed", "course", "dist")):
    if feature_index is None:
        feature_index = {"lat": 0, "lon": 1, "speed": 2, "course": 3, "dist": 4}
    for feature_name in features:
        s = stats[feature_name]
        idx = feature_index[feature_name]
        mean = float(s["mean"])
        std = float(s["std"])
        if std < 1e-8:
            std = 1.0
        x[..., idx] = (x[..., idx] - mean) / std
    return x

def denorm(x, stats, feature_index=None, features=("speed", "course", "dist")):
    if feature_index is None:
        feature_index = {"lat": 0, "lon": 1, "speed": 2, "course": 3, "dist": 4}
    for feature_name in features:
        s = stats[feature_name]
        idx = feature_index[feature_name]
        mean = float(s["mean"])
        std = float(s["std"])
        if std < 1e-8:
            std = 1.0
        x[..., idx] = x[..., idx] * std + mean
    return x

def lat_lon_rate_transform(x, lat_idx=0, lon_idx=1):
    """
    Convert lat/lon to normalized changes:
    1) scale lat/lon to [-1, 1]
    2) use point-to-point delta
    3) scale delta for model signal
    """
    out = x.copy()
    lat_scaled = np.clip(out[..., lat_idx] / 90.0, -1.0, 1.0)
    lon_scaled = np.clip(out[..., lon_idx] / 180.0, -1.0, 1.0)

    """
    lat_delta = np.zeros_like(lat_scaled, dtype=np.float32)
    lon_delta = np.zeros_like(lon_scaled, dtype=np.float32)
    if out.shape[0] > 1:
        lat_delta[1:] = lat_scaled[1:] - lat_scaled[:-1]
        lon_delta[1:] = lon_scaled[1:] - lon_scaled[:-1]

    """
    out[..., lat_idx] = lat_scaled
    out[..., lon_idx] = lon_scaled 
    return out

def append_step_distance_feature(x, lat_idx=0, lon_idx=1):
    """Append point-to-point haversine distance in meters as the last feature."""
    if x.shape[0] == 0:
        return np.concatenate([x, np.zeros((0, 1), dtype=np.float32)], axis=1)

    # Vectorized haversine for faster per-trajectory distance computation.
    dist = np.zeros((x.shape[0],), dtype=np.float32)
    if x.shape[0] > 1:
        lat1 = np.deg2rad(x[:-1, lat_idx].astype(np.float64))
        lon1 = np.deg2rad(x[:-1, lon_idx].astype(np.float64))
        lat2 = np.deg2rad(x[1:, lat_idx].astype(np.float64))
        lon2 = np.deg2rad(x[1:, lon_idx].astype(np.float64))

        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = np.sin(dlat / 2.0) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2.0) ** 2
        c = 2.0 * np.arcsin(np.sqrt(a))
        dist[1:] = (6371000.0 * c).astype(np.float32)

    dist = dist.reshape(-1, 1)
    return np.concatenate([x, dist], axis=1)

def recover_next_lat_lon(pred, latest_point=None, lat_idx=0, lon_idx=1):
    out = pred.copy()
    # lat_lon_rate_transform currently stores absolute scaled lat/lon in [-1, 1].
    pred_lat_scaled = np.clip(float(out[lat_idx]), -1.0, 1.0)
    pred_lon_scaled = np.clip(float(out[lon_idx]), -1.0, 1.0)

    out[lat_idx] = pred_lat_scaled * 90.0
    out[lon_idx] = pred_lon_scaled * 180.0
    return out

def load_records_from_db():
    records = []
    db = get_db(DB_NAME)
    col = db[COLLECTION_NAME]

    if LOAD_RECORDS_MULTIPROCESS:
        print("LOAD_RECORDS_MULTIPROCESS is ignored in streaming DB mode.")

    query = {}
    shiptype_filter = None if SHIPTYPE_FILTER is None else str(SHIPTYPE_FILTER)
    if shiptype_filter is not None:
        query = {"data.SHIPTYPE": shiptype_filter}

    cursor = col.find(query, {"data": 1, "_id": 0}).skip(DB_SKIP_DOCS).batch_size(DB_CURSOR_BATCH_SIZE)
    extend_records = records.extend
    for doc in tqdm(cursor, desc=f"Loading records from DB (batch={DB_CURSOR_BATCH_SIZE})"):
        data = doc.get("data", [])
        if not data:
            continue
        if shiptype_filter is None:
            extend_records(data)
        else:
            extend_records(
                d for d in data
                if str(d.get("SHIPTYPE")) == shiptype_filter
            )
    return records

def load_trajectory_map_from_db():
    """Stream DB data via aggregation and build trajectory map directly."""
    db = get_db(DB_NAME)
    col = db[COLLECTION_NAME]

    shiptype_filter = None if SHIPTYPE_FILTER is None else str(SHIPTYPE_FILTER)

    pipeline = [
        {"$skip": DB_SKIP_DOCS},
        {"$project": {"_id": 0, "data": 1}},
        {"$unwind": "$data"},
    ]
    if shiptype_filter is not None:
        col.create_index([("data.SHIPTYPE", 1)])
        pipeline.append(
            {
                "$match": {"data.SHIPTYPE": shiptype_filter}
            }
        )
    pipeline.append(
        {
            "$project": {
                "_id": 0,
                "MMSI": "$data.MMSI",
                "LAT": "$data.LAT",
                "LON": "$data.LON",
                "SPEED": "$data.SPEED",
                "COURSE": "$data.COURSE",
                "TIMESTAMP": "$data.TIMESTAMP",
                "SHIPTYPE": {"$ifNull": ["$data.SHIPTYPE", "$data.shiptype"]},
            }
        }
    )

    traj_map = {}
    ship_type_counts = Counter()
    valid_point_count = 0

    cursor = col.aggregate(pipeline, allowDiskUse=True, batchSize=DB_CURSOR_BATCH_SIZE)
    for r in tqdm(cursor, desc=f"Loading+building trajectories agg (batch={DB_CURSOR_BATCH_SIZE})"):
        ship_type = r.get("SHIPTYPE")
        ship_key = str(ship_type) if ship_type is not None else "UNKNOWN"
        ship_type_counts[ship_key] += 1

        mmsi = r.get("MMSI")
        lat = _to_float(r.get("LAT"))
        lon = _to_float(r.get("LON"))
        speed = _to_float(r.get("SPEED"))
        course = _to_float(r.get("COURSE"))
        ts = r.get("TIMESTAMP")
        if mmsi is None or lat is None or lon is None or speed is None or course is None:
            continue
        traj_map.setdefault(mmsi, []).append((ts, lat, lon, speed, course))
        valid_point_count += 1

    return traj_map, ship_type_counts, valid_point_count

def count_ship_types(records):
    counts = Counter()
    for r in records:
        ship_type = r.get("SHIPTYPE", r.get("shiptype"))
        if ship_type is None:
            ship_type = "UNKNOWN"
        counts[str(ship_type)] += 1
    return counts


def sorted_ship_type_counts(counts):
    return sorted(counts.items(), key=lambda x: x[1], reverse=True)

def build_trajectories(records):
    traj_map = {}
    for r in tqdm(records, desc="Building trajectories"):
        ship_type = r.get("SHIPTYPE", r.get("shiptype"))
        if SHIPTYPE_FILTER is not None and str(ship_type) != str(SHIPTYPE_FILTER):
            continue
        mmsi = r.get("MMSI")
        lat = _to_float(r.get("LAT"))
        lon = _to_float(r.get("LON"))
        speed = _to_float(r.get("SPEED"))
        course = _to_float(r.get("COURSE"))
        ts = r.get("TIMESTAMP")
        if mmsi is None or lat is None or lon is None or speed is None or course is None:
            continue
        traj_map.setdefault(mmsi, []).append((ts, lat, lon, speed, course))
    return traj_map
    
def build_features(traj_map):
    trajectories = []
    for mmsi, trajectory in traj_map.items():
        trajectory.sort(key=lambda x: x[0] or "")
        arr = np.array([[p[1], p[2], p[3], p[4]] for p in trajectory], dtype=np.float32)
        arr = append_step_distance_feature(arr)
        trajectories.append(lat_lon_rate_transform(arr))
    return trajectories

def make_windows(trajs, seq_len):
    X, y = [], []
    for traj in trajs:
        if traj.shape[0] < seq_len + 1:
            continue
        for i in range(traj.shape[0] - seq_len):
            X.append(traj[i:i + seq_len])
            y.append(traj[i + seq_len])
    return np.array(X), np.array(y)

def normalize_selected_features(X_train, y_train, X_test, y_test, feature_idx=(2, 3)):
    """Normalize selected feature columns using train-set stats only."""
    stats = {}

    for idx in feature_idx:
        mean = float(np.mean(X_train[:, :, idx]))
        std = float(np.std(X_train[:, :, idx]))
        if std < 1e-8:
            std = 1.0
        fname = FEATURE_NAMES[idx]
        stats[fname] = {"mean": mean, "std": std}

    X_train_norm = norm(X_train.copy(), stats)
    y_train_norm = norm(y_train.copy(), stats)
    X_test_norm = norm(X_test.copy(), stats)
    y_test_norm = norm(y_test.copy(), stats)
    return X_train_norm, y_train_norm, X_test_norm, y_test_norm, stats

def build_norm_stats_payload(feature_stats):
    return {
        "speed": {
            "mean": feature_stats["speed"]["mean"],
            "std": feature_stats["speed"]["std"],
        },
        "course": {
            "mean": feature_stats["course"]["mean"],
            "std": feature_stats["course"]["std"],
        },
        "dist": {
            "mean": feature_stats["dist"]["mean"],
            "std": feature_stats["dist"]["std"],
        },
    }

def main():
    """NOTE:
    - first 8 data are for test, remove then when train.
        - records = records[8:]
    """
    
    t0 = time.perf_counter()
    traj_map, ship_type_counts, valid_point_count = load_trajectory_map_from_db()
    t1 = time.perf_counter()
    print(f"Loaded valid points: {valid_point_count}")
    t2 = time.perf_counter()
    print(f"Unique ship types: {len(ship_type_counts)}")
    sorted_counts = sorted_ship_type_counts(ship_type_counts)
    if sorted_counts:
        most_type, most_cnt = sorted_counts[0]
        print(f"Most common ship type: {most_type} ({most_cnt})")
    """
    print("Ship type counts:")
    for ship_type, cnt in sorted_counts:
        print(f"  {ship_type}: {cnt}")
    """
    
    trajectories = build_features(traj_map)
    t3 = time.perf_counter()
    if SHIPTYPE_FILTER is not None:
        print(f"Filtered ship type: {SHIPTYPE_FILTER}")
    print(f"Built trajectories: {len(trajectories)}")
    
    traj_indices = np.arange(len(trajectories))
    train_idx, test_idx = train_test_split(traj_indices, train_size=TRAIN_RATIO, random_state=42)
    train_trajs = [trajectories[i] for i in train_idx]
    test_trajs = [trajectories[i] for i in test_idx]

    X_train, y_train = make_windows(train_trajs, SEQ_LEN)
    X_test, y_test = make_windows(test_trajs, SEQ_LEN)
    t4 = time.perf_counter()

    print(f"Train samples: {len(X_train)}, Test samples: {len(X_test)}")

    if len(X_train) == 0:
        raise RuntimeError("No training samples generated.")

    X_train, y_train, X_test, y_test, feature_stats = normalize_selected_features(
        X_train, y_train, X_test, y_test, feature_idx=NORM_FEATURE_IDX
    )
    t5 = time.perf_counter()
    X_mean = np.zeros(len(FEATURE_NAMES), dtype=np.float32)
    X_std = np.ones(len(FEATURE_NAMES), dtype=np.float32)
    for fname, stat in feature_stats.items():
        idx = FEATURE_INDEX[fname]
        X_mean[idx] = stat["mean"]
        X_std[idx] = stat["std"]

    if not UPDATE_DATA:
        return
    
    np.savez(
        OUTPUT_NPZ,
        X_train=X_train,
        y_train=y_train,
        X_test=X_test,
        y_test=y_test,
    )
    with open(NORM_STATS_JSON, "w", encoding="utf-8") as f:
        json.dump(build_norm_stats_payload(feature_stats), f, indent=2)
    t6 = time.perf_counter()
    print(f"Saved: {OUTPUT_NPZ}")
    print(f"Saved normalization stats: {NORM_STATS_JSON}")
    print(f"Timing load_trajectory_map_from_db: {t1 - t0:.2f}s")
    print(f"Timing count_ship_types: {t2 - t1:.2f}s")
    print(f"Timing build_trajectories: {t3 - t2:.2f}s")
    print(f"Timing make_windows/split: {t4 - t3:.2f}s")
    print(f"Timing normalize: {t5 - t4:.2f}s")
    print(f"Timing save: {t6 - t5:.2f}s")
    print(f"Timing total: {t6 - t0:.2f}s")


if __name__ == "__main__":
    main()
