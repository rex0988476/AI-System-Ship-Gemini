import json
import numpy as np
import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm
from trajectoryPrediction.dataset import TrajectoryDataset
from models.bigru import BiGRU
from config import model_config
from marineTraffic.preprocess import norm, denorm
import os

NORM_PATH = "marineTraffic/norm_stats.json"

# 檢查 GPU 狀態並設定 device
if torch.backends.mps.is_available():
    device = torch.device("mps")
elif torch.cuda.is_available():
    device = torch.device("cuda")
else:
    device = torch.device("cpu")

# 0. 參數設定
batch_size = 64
MODEL_NAME = model_config.MODEL_NAME
model_path = f"savedModel/{MODEL_NAME}_best.pth"  # Pretrained model path

import os
PROCESSED_DATA_PATH = 'marineTraffic/data.npz'
print(f"正在從 {PROCESSED_DATA_PATH} 載入預處理資料...")
with np.load(PROCESSED_DATA_PATH) as data:
    X_test = data['X_test']
    y_test = data['y_test']
print("成功載入預處理資料。")
print(f'測試樣本數: {len(X_test)}')

# 1.5 先把資料搬到裝置（避免每個 batch 重複搬運）
X_test = torch.tensor(X_test, dtype=torch.float32, device=device)
y_test = torch.tensor(y_test, dtype=torch.float32, device=device)

if not os.path.exists(NORM_PATH):
    raise FileNotFoundError(f"Normalization stats not found: {NORM_PATH}. Run marineTraffic/preprocess.py first.")
with open(NORM_PATH, "r", encoding="utf-8") as f:
    norm_stats = json.load(f)
if "speed" not in norm_stats or "course" not in norm_stats:
    raise ValueError(f"Invalid normalization stats format in {NORM_PATH}. Expected keys: speed, course.")

test_dataset = TrajectoryDataset(X_test, y_test)
test_loader = DataLoader(test_dataset, batch_size=batch_size)

model = BiGRU().to(device)
criterion = nn.MSELoss()
print("model device:", next(model.parameters()).device)

# 6. 載入模型權重（只測試，不訓練）
if os.path.exists(model_path):
    state = torch.load(model_path, map_location=device)
    model.load_state_dict(state)
    print(f"Loaded model from: {model_path}")
else:
    raise FileNotFoundError(f"Model not found: {model_path}")

# 7. 評估模型性能
model.eval()
test_loss_norm = 0
test_loss_denorm = 0
with torch.no_grad():
    for X_batch, y_batch in tqdm(test_loader):
        output = model(X_batch)
        loss_norm = criterion(output, y_batch)
        output_denorm = denorm(output.clone(), norm_stats)
        y_denorm = denorm(y_batch.clone(), norm_stats)
        loss_denorm = criterion(output_denorm, y_denorm)
        test_loss_norm += loss_norm.item() * X_batch.size(0)
        test_loss_denorm += loss_denorm.item() * X_batch.size(0)
test_loss_norm /= len(test_loader.dataset)
test_loss_denorm /= len(test_loader.dataset)
print(f"Test Loss (normalized): {test_loss_norm:.6f}")
print(f"Test Loss (denormalized): {test_loss_denorm:.6f}")
