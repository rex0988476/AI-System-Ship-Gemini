import argparse
import asyncio
import json
import sys
import time
from pathlib import Path

import numpy as np
from sklearn.model_selection import train_test_split

# Ensure project root is on sys.path for local imports
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from database import MONGO_URL
from marineTraffic import preprocess as pp

try:
    from motor.motor_asyncio import AsyncIOMotorClient
except ImportError:
    AsyncIOMotorClient = None


async def load_records_from_db_async(
    db_name=None,
    collection_name=None,
    skip=None,
    batch_size=None,
    progress_every=200,
    estimate_total=False,
):
    if AsyncIOMotorClient is None:
        print(
            "motor not installed; falling back to sync load_records_from_db(). "
            "Install with: ./trajectoryPrediction/.venv/bin/pip install motor"
        )
        return pp.load_records_from_db()

    db_name = pp.DB_NAME if db_name is None else db_name
    collection_name = pp.COLLECTION_NAME if collection_name is None else collection_name
    skip = 8 if skip is None else skip
    # Larger fetch size reduces round trips and async-iteration overhead.
    batch_size = 2048 if batch_size is None else batch_size

    records = []
    client = AsyncIOMotorClient(MONGO_URL, maxPoolSize=64)
    col = client[db_name][collection_name]

    total_docs = None
    if estimate_total:
        try:
            est_docs = await col.estimated_document_count()
            total_docs = max(0, int(est_docs) - skip)
        except Exception:
            total_docs = None

    loaded_docs = 0
    start = time.perf_counter()
    cursor = col.find({}, {"data": 1, "_id": 0}).skip(skip).batch_size(batch_size)
    extend_records = records.extend
    try:
        while True:
            docs = await cursor.to_list(length=batch_size)
            if not docs:
                break
            for doc in docs:
                data = doc.get("data")
                if data:
                    extend_records(data)
            loaded_docs += len(docs)

            if progress_every > 0 and loaded_docs % progress_every == 0:
                elapsed = time.perf_counter() - start
                if total_docs:
                    print(
                        f"Loaded docs: {loaded_docs}/{total_docs}, "
                        f"records: {len(records)}, elapsed: {elapsed:.1f}s"
                    )
                else:
                    print(
                        f"Loaded docs: {loaded_docs}, "
                        f"records: {len(records)}, elapsed: {elapsed:.1f}s"
                    )
    finally:
        cursor.close()
        client.close()

    return records


async def run_async_preprocess(
    sample_records=0,
    save=False,
    batch_size=2048,
    progress_every=200,
    estimate_total=False,
):
    t0 = time.perf_counter()
    records = await load_records_from_db_async(
        batch_size=batch_size,
        progress_every=progress_every,
        estimate_total=estimate_total,
    )
    t1 = time.perf_counter()

    if sample_records and sample_records > 0:
        records = records[:sample_records]

    ship_type_counts = pp.count_ship_types(records)
    sorted_counts = pp.sorted_ship_type_counts(ship_type_counts)
    if sorted_counts:
        most_type, most_cnt = sorted_counts[0]
        print(f"Most common ship type: {most_type} ({most_cnt})")
    t2 = time.perf_counter()

    trajectories = pp.build_trajectories(records)
    t3 = time.perf_counter()

    if len(trajectories) == 0:
        raise RuntimeError("No trajectories built. Check DB data/filter settings.")

    traj_indices = np.arange(len(trajectories))
    train_idx, test_idx = train_test_split(
        traj_indices, train_size=pp.TRAIN_RATIO, random_state=42
    )
    train_trajs = [trajectories[i] for i in train_idx]
    test_trajs = [trajectories[i] for i in test_idx]
    t4 = time.perf_counter()

    X_train, y_train = pp.make_windows(train_trajs, pp.SEQ_LEN)
    X_test, y_test = pp.make_windows(test_trajs, pp.SEQ_LEN)
    t5 = time.perf_counter()

    if len(X_train) == 0:
        raise RuntimeError("No training samples generated.")

    X_train, y_train, X_test, y_test, feature_stats = pp.normalize_selected_features(
        X_train, y_train, X_test, y_test, feature_idx=pp.NORM_FEATURE_IDX
    )

    X_mean = np.zeros(len(pp.FEATURE_NAMES), dtype=np.float32)
    X_std = np.ones(len(pp.FEATURE_NAMES), dtype=np.float32)
    for fname, stat in feature_stats.items():
        idx = pp.FEATURE_INDEX[fname]
        X_mean[idx] = stat["mean"]
        X_std[idx] = stat["std"]
    t6 = time.perf_counter()

    print("Async preprocess timing")
    print(f"records: {len(records)}")
    print(f"trajectories: {len(trajectories)}")
    print(f"train samples: {len(X_train)}, test samples: {len(X_test)}")
    print(f"load_records_from_db_async: {t1 - t0:.2f}s")
    print(f"count_ship_types: {t2 - t1:.2f}s")
    print(f"build_trajectories: {t3 - t2:.2f}s")
    print(f"split_trajectories: {t4 - t3:.2f}s")
    print(f"make_windows: {t5 - t4:.2f}s")
    print(f"normalize: {t6 - t5:.2f}s")
    print(f"total(before save): {t6 - t0:.2f}s")

    if save:
        np.savez(
            pp.OUTPUT_NPZ,
            X_train=X_train,
            y_train=y_train,
            X_test=X_test,
            y_test=y_test,
        )
        with open(pp.NORM_STATS_JSON, "w", encoding="utf-8") as f:
            json.dump(pp.build_norm_stats_payload(feature_stats), f, indent=2)
        t7 = time.perf_counter()
        print(f"saved_npz: {pp.OUTPUT_NPZ}")
        print(f"saved_norm_stats: {pp.NORM_STATS_JSON}")
        print(f"save_time: {t7 - t6:.2f}s")
        print(f"total(with save): {t7 - t0:.2f}s")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--sample-records",
        type=int,
        default=0,
        help="0 means use all loaded records.",
    )
    parser.add_argument(
        "--save",
        action="store_true",
        help="Save data.npz and norm_stats.json, like preprocess.py",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=2048,
        help="Async DB fetch batch size (larger is usually faster).",
    )
    parser.add_argument(
        "--progress-every",
        type=int,
        default=200,
        help="Print progress every N docs; 0 disables progress logs.",
    )
    parser.add_argument(
        "--estimate-total",
        action="store_true",
        help="Estimate total docs for progress reporting (extra DB call).",
    )
    args = parser.parse_args()

    asyncio.run(
        run_async_preprocess(
            sample_records=args.sample_records,
            save=args.save,
            batch_size=args.batch_size,
            progress_every=args.progress_every,
            estimate_total=args.estimate_total,
        )
    )


if __name__ == "__main__":
    main()
