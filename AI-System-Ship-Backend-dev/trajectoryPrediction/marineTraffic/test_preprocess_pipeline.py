import argparse
import asyncio
import time
from pathlib import Path
import sys

# Ensure project root is on sys.path
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from marineTraffic.preprocess import load_records_from_db
from marineTraffic.preprocess_async import load_records_from_db_async


def run_compare():
    # Sync load timing
    s0 = time.perf_counter()
    sync_records = load_records_from_db()
    s1 = time.perf_counter()
    sync_load_s = s1 - s0

    # Async load timing
    async_records = []
    async_load_s = None
    try:
        a0 = time.perf_counter()
        async_records = asyncio.run(load_records_from_db_async())
        a1 = time.perf_counter()
        async_load_s = a1 - a0
    except Exception as e:
        print(f"async_load_error: {e}")

    print("DB load timing compare")
    print(f"sync_records: {len(sync_records)}")
    print(f"async_records: {len(async_records)}")
    print(f"sync_load: {sync_load_s:.2f}s")
    if async_load_s is not None:
        print(f"async_load: {async_load_s:.2f}s")
        print(f"sync/async ratio: {sync_load_s / async_load_s:.3f}x")
    else:
        print("async_load: unavailable")


def main():
    argparse.ArgumentParser().parse_args()
    run_compare()


if __name__ == "__main__":
    main()
