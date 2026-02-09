import torch
import torch.nn as nn

# 3. 定義 BiGRU 模型
# 使用 PyTorch 定義雙向 GRU 模型結構。
class BiGRU(nn.Module):
    def __init__(self, input_size=5, hidden_size=64, num_layers=2, output_size=5):
        super().__init__()
        self.gru = nn.GRU(input_size, hidden_size, num_layers, batch_first=True, bidirectional=True)
        self.fc = nn.Linear(hidden_size * 2, output_size)
    def forward(self, x):
        out, _ = self.gru(x)
        out = out[:, -1, :]  # 取最後一個時間步
        out = self.fc(out)
        return out
