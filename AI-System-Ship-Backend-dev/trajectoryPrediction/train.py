import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from tqdm import tqdm
import time
import os
import sys
from pathlib import Path
import numpy as np

# Ensure project root is on sys.path for local imports.
PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from utils.utils import print_macos_gpu_info
from trajectoryPrediction.dataset import TrajectoryDataset
from models.bigru import BiGRU
from config import model_config
from marineTraffic.preprocess import main as run_preprocess

# USER SETTINGS
PROCESS_DATA = False  # 是否重新處理數據
PROCESSED_DATA_PATH = "marineTraffic/data.npz"
BATCH_SIZE = 16
NUM_EPOCHS = 50
LEARNING_RATE = 1e-3
PREFERRED_CUDA_INDEX = 0  # 優先使用 cuda:0，若不存在則回退到 cuda:0

# Model settings (from config)
MODEL_INPUT_SIZE = model_config.MODEL_INPUT_SIZE
MODEL_HIDDEN_SIZE = model_config.MODEL_HIDDEN_SIZE
MODEL_NUM_LAYERS = model_config.MODEL_NUM_LAYERS
MODEL_OUTPUT_SIZE = model_config.MODEL_OUTPUT_SIZE
MODEL_NAME = model_config.MODEL_NAME

# 檢查 GPU 狀態並設定 device
if torch.cuda.is_available():
    if torch.cuda.device_count() > PREFERRED_CUDA_INDEX:
        device = torch.device(f"cuda:{PREFERRED_CUDA_INDEX}")
    else:
        device = torch.device("cuda:1")
elif torch.backends.mps.is_available():
    device = torch.device("mps")
else:
    device = torch.device("cpu")
print(f"使用的裝置: {device}")

print_macos_gpu_info()

# Data
if PROCESS_DATA:
    print("Running preprocessing...")
    run_preprocess()
print(f"Loading {PROCESSED_DATA_PATH} ")
with np.load(PROCESSED_DATA_PATH) as data:
    X_train = data['X_train']
    y_train = data['y_train']
print(f'X shape: {X_train.shape}, y shape: {y_train.shape}')
print(X_train[:5], y_train[:5])  # Debug: print first 5 samples

train_dataset = TrajectoryDataset(X_train, y_train)
train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)

# Device
DATA_ON_DEVICE = device.type != "cpu"
if DATA_ON_DEVICE:
    X_train = torch.tensor(X_train, dtype=torch.float32, device=device)
    y_train = torch.tensor(y_train, dtype=torch.float32, device=device)

model_path = f"savedModel/{MODEL_NAME}.pth"  # 若有預訓練模型，可指定路徑
best_model_path = f"savedModel/{MODEL_NAME}_best.pth"
model = BiGRU(
    input_size=MODEL_INPUT_SIZE,
    hidden_size=MODEL_HIDDEN_SIZE,
    num_layers=MODEL_NUM_LAYERS,
    output_size=MODEL_OUTPUT_SIZE,
).to(device)

if os.path.exists(model_path):
    try:
        model.load_state_dict(torch.load(model_path, map_location=device))
        print(f'Load model from: {model_path}')
    except RuntimeError as e:
        print(f"Skip loading existing model due to shape mismatch: {e}")

# 5. 設定訓練參數
# 設定損失函數、優化器、學習率等訓練參數。
optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)
criterion = nn.MSELoss()
# Cosine LR scheduler with 5-epoch period
scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=5)

# 6. 訓練模型
# 編寫訓練循環，對模型進行訓練並記錄損失。

best_loss = float("inf")
for epoch in range(NUM_EPOCHS):
    model.train()
    train_loss = 0
    data_time = 0.0
    compute_time = 0.0
    step_count = 0
    last_t = time.perf_counter()
    for inputs, targets in tqdm(train_loader, desc=f"Epoch {epoch+1}/{NUM_EPOCHS}"):
        data_time += time.perf_counter() - last_t
        X_batch = inputs.to(device)
        y_batch = targets.to(device)
        optimizer.zero_grad()
        start_compute = time.perf_counter()
        output = model(X_batch)
        loss = criterion(output, y_batch)
        loss.backward()
        optimizer.step()
        compute_time += time.perf_counter() - start_compute
        train_loss += loss.item() * X_batch.size(0)
        step_count += 1
        last_t = time.perf_counter()
    train_loss /= len(train_loader.dataset)
    print(f"Epoch {epoch+1}/{NUM_EPOCHS}, Train Loss: {train_loss:.6f}")
    if train_loss < best_loss:
        best_loss = train_loss
        torch.save(model.state_dict(), best_model_path)
        print(f"Best model updated: {best_model_path} (loss={best_loss:.6f})")
    scheduler.step()
    if step_count > 0:
        avg_data = data_time / step_count
        avg_compute = compute_time / step_count
        print(f"Avg data time/step: {avg_data:.6f}s, Avg compute time/step: {avg_compute:.6f}s")

# 7. 保存模型
# 保存訓練好的模型權重到檔案。

import datetime
timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
torch.save(model.state_dict(), f'{model_path}')
print(f'模型已保存至 {model_path}')
