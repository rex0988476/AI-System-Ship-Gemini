import os
import json
import sys
import numpy as np
import torch
from pathlib import Path

from load_trajectories import fetch_trajectories_via_api
from models.bigru import BiGRU
from marineTraffic.preprocess import (
    norm,
    denorm,
    lat_lon_rate_transform,
    recover_next_lat_lon,
    append_step_distance_feature,
)
from config import model_config

# Settings
SEQ_LEN = model_config.SEQ_LEN
BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = str(BASE_DIR / "savedModel" / f"{model_config.MODEL_NAME}_best.pth")
NORM_PATH = str(BASE_DIR / "marineTraffic" / "norm_stats.json")
MODEL_INPUT_SIZE = model_config.MODEL_INPUT_SIZE
MODEL_HIDDEN_SIZE = model_config.MODEL_HIDDEN_SIZE
MODEL_NUM_LAYERS = model_config.MODEL_NUM_LAYERS
MODEL_OUTPUT_SIZE = model_config.MODEL_OUTPUT_SIZE

NORM = True  # Set to False to disable normalization


def _extract_points(track):
    # Extract [lat, lon, speed, course] from track entries
    points = []
    for e in track:
        if not isinstance(e, dict):
            continue
        lat = None
        lon = None
        coord = e.get("coord")
        if coord and len(coord) >= 2:
            lat, lon = coord[0], coord[1]
        speed = e.get("sog", e.get("SPEED", 0))
        course = e.get("cog", e.get("COURSE", 0))
        if lat is None or lon is None:
            continue
        points.append([float(lat), float(lon), float(speed), float(course)])
    arr = np.array(points, dtype=np.float32)
    return append_step_distance_feature(arr)


def predict_next_point(mmsi):
    # Load trajectories from DB and filter by MMSI
    data = fetch_trajectories_via_api(mmsi)
    if not data:
        raise RuntimeError("No trajectory data returned from database")
    # track = [e for e in data if str(e.get("MMSI")) == str(mmsi)]
    # if not track:
    #     raise RuntimeError("No trajectory points for given MMSI")

    points = _extract_points(data)
    if points.shape[0] < SEQ_LEN:
        raise RuntimeError("Not enough points for prediction")

    latest_point = points[-1].copy()
    seq = lat_lon_rate_transform(points[-SEQ_LEN:])

    # Load normalization if available
    feature_norm_stats = None
    if NORM:
        if not os.path.exists(NORM_PATH):
            raise FileNotFoundError(f"Normalization stats not found: {NORM_PATH}. Run marineTraffic/preprocess.py first.")
        with open(NORM_PATH, "r", encoding="utf-8") as f:
            data_norm = json.load(f)
        if "speed" in data_norm and "course" in data_norm and "dist" in data_norm:
            feature_norm_stats = {
                "speed": data_norm["speed"],
                "course": data_norm["course"],
                "dist": data_norm["dist"],
            }
        else:
            raise ValueError(
                f"Invalid normalization stats format in {NORM_PATH}. "
                "Expected keys: speed, course, dist."
            )
        seq = norm(seq, feature_norm_stats)

    
    # Model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = BiGRU(
        input_size=MODEL_INPUT_SIZE,
        hidden_size=MODEL_HIDDEN_SIZE,
        num_layers=MODEL_NUM_LAYERS,
        output_size=MODEL_OUTPUT_SIZE,
    ).to(device)
    if not os.path.exists(MODEL_PATH):
        raise FileNotFoundError(f"Model not found: {MODEL_PATH}")
    state = torch.load(MODEL_PATH, map_location=device)
    model.load_state_dict(state)
    model.eval()

    with torch.no_grad():
        x = torch.tensor(seq, dtype=torch.float32, device=device).unsqueeze(0)
        pred = model(x).squeeze(0).cpu().numpy()

    if NORM:
        pred = denorm(pred, feature_norm_stats)

    pred = recover_next_lat_lon(pred, latest_point)
        
    print(f"latest_point: {latest_point.tolist()}", file=sys.stderr, flush=True)
    return pred


if __name__ == "__main__":
    sample_mmsi = os.getenv("MMSI", "41200006")
    pred = predict_next_point(sample_mmsi)
    print(json.dumps(pred.tolist()), flush=True)
