# GFW API 伺服器使用指南

## 📋 概述

這是 Global Fishing Watch (GFW) API 的 Flask 後端服務，提供船舶資料查詢功能。

---

## 🚀 快速開始

### 1. 啟動 Conda 環境

```bash
conda activate ai-system-ship
```

### 2. 安裝依賴

```bash
cd /home/jacob/AI-System-Ship/UIUX/api
pip install -r requirements.txt
```

### 3. 啟動伺服器

```bash
python gfw_server.py
```

伺服器將在 `http://localhost:5000` 啟動

---

## 📡 API 端點

### 1. 查詢單一船舶

**端點：** `GET /api/vessel/<mmsi>`

**範例：**
```bash
curl http://localhost:5000/api/vessel/412440692
```

**回應：**
```json
{
  "mmsi": "412440692",
  "name": "VESSEL_NAME",
  "type": "FISHING",
  "country": "CHN",
  "position": {
    "lat": 0,
    "lon": 0,
    "speed": 0,
    "course": 0
  },
  "specifications": {
    "length": 50,
    "width": 10,
    "tonnage": 500
  }
}
```

---

### 2. 批次查詢船舶

**端點：** `GET /api/vessels?mmsi=xxx,yyy,zzz`

**範例：**
```bash
curl "http://localhost:5000/api/vessels?mmsi=412440692,416123456"
```

**回應：**
```json
{
  "total": 2,
  "vessels": [
    { "mmsi": "412440692", ... },
    { "mmsi": "416123456", ... }
  ]
}
```

---

### 3. 健康檢查

**端點：** `GET /api/health`

**範例：**
```bash
curl http://localhost:5000/api/health
```

**回應：**
```json
{
  "status": "ok",
  "service": "GFW API Server",
  "version": "1.0.0"
}
```

---

## 🧪 測試流程

### 使用 curl 測試

```bash
# 1. 健康檢查
curl http://localhost:5000/api/health

# 2. 查詢已知 MMSI（中國漁船）
curl http://localhost:5000/api/vessel/412440692

# 3. 查詢不存在的 MMSI（測試錯誤處理）
curl http://localhost:5000/api/vessel/999999999

# 4. 批次查詢
curl "http://localhost:5000/api/vessels?mmsi=412440692,416123456"
```

### 使用瀏覽器測試

直接在瀏覽器開啟：
- http://localhost:5000
- http://localhost:5000/api/health
- http://localhost:5000/api/vessel/412440692

---

## 🔧 整合到前端

前端 JavaScript 使用範例：

```javascript
// 查詢單一船舶
async function fetchVessel(mmsi) {
    const response = await fetch(`http://localhost:5000/api/vessel/${mmsi}`);
    if (!response.ok) {
        throw new Error('查詢失敗');
    }
    return await response.json();
}

// 使用
const vessel = await fetchVessel('412440692');
console.log(vessel);
```

---

## 📝 測試用 MMSI

| MMSI | 描述 | 用途 |
|------|------|------|
| `412440692` | 中國漁船 | GFW 有資料，測試成功案例 |
| `416123456` | 台灣船舶 | 可能無資料，測試降級處理 |
| `999999999` | 不存在 | 測試錯誤處理 |

---

## ⚠️ 錯誤處理

### 常見錯誤

**1. GFW API 呼叫失敗（500）**
```json
{
  "error": "GFW API 呼叫失敗",
  "mmsi": "412440692"
}
```

**2. 無船舶資料（404）**
```json
{
  "error": "無船舶資料",
  "mmsi": "999999999"
}
```

**3. 缺少參數（400）**
```json
{
  "error": "請提供 MMSI 參數"
}
```

---

## 🛠️ 開發模式

### 啟用 Debug 模式

伺服器預設已啟用 debug 模式，程式碼變更會自動重載。

### 查看日誌

```bash
# 啟動時會顯示：
🚀 啟動 GFW API 伺服器...
📍 http://localhost:5000
==================================================

# 每次查詢會顯示：
🔍 查詢船舶: 412440692
✅ 成功取得船舶: VESSEL_NAME (412440692)
```

---

## 📂 檔案結構

```
/UIUX/api/
├── gfw_server.py       # Flask 伺服器主程式
├── requirements.txt    # Python 依賴
└── README.md          # 本文檔
```

---

## 🔗 相關文檔

- [GFW API 文檔](https://globalfishingwatch.org/our-apis/)
- [整合計劃](/home/jacob/AI-System-Ship/UIUX/docs/GFW_INTEGRATION_PLAN.md)

---

## 📞 問題排查

### 問題：ImportError: No module named 'flask'
**解決：** 安裝依賴
```bash
pip3 install -r requirements.txt
```

### 問題：ImportError: cannot import name 'API_TOKEN' from 'gfw_simple'
**解決：** 確認 `/UIUX/data/gfw_simple.py` 存在且有 API_TOKEN

### 問題：CORS 錯誤
**解決：** 已安裝 flask-cors，確認前端使用 http://localhost:5000

### 問題：Port 5000 already in use
**解決：** 修改 `gfw_server.py` 最後一行的 port 參數
```python
app.run(host='0.0.0.0', port=5001, debug=True)  # 改為 5001
```

---

**建立時間：** 2025-10-09
**版本：** 1.0.0
