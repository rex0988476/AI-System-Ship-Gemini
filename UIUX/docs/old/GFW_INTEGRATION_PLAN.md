# 📋 GFW 真實數據整合計劃（更新版）

> **更新日期：** 2025-10-12
> **規劃者：** Linus-style Code Reviewer
> **狀態：** ✅ 階段 1 完成 | ⏳ 階段 2-6 待執行

---

## 一、問題分析

### 核心數據流
```
GFW API (Python Flask) → JavaScript 前端 → 事件系統
```

### 現有問題
1. **數據孤島**：Flask API 已就緒，但前端仍使用完全隨機數據
2. **未整合**：`vesselDataGenerator.js` 的 `generateVesselDataByMMSI()` 仍是同步函數，未調用 API
3. **格式不匹配**：GFW API 格式 ≠ 事件系統格式（需轉換層）
4. **新增複雜度**：多個船舶事件創建入口（原計劃只考慮一個）

---

## 二、Linus 式思考

### 數據結構分析
```
GFW API → VesselDataGenerator → 事件系統
                ↓
            (降級方案)
          隨機生成數據
```

### 關鍵洞察
- ✅ Flask API 已完成，別破壞它
- ✅ 前端結構清晰，只需加 async/await
- ❌ 別搞複雜的狀態管理，保持降級路徑簡單

### 複雜度消除
- **特殊情況1：多個創建入口**
  → 解法：統一使用 `vesselDataGenerator`，一次修改全部受益

- **特殊情況2：同步/異步混用**
  → 解法：只改必要的函數為 async，降級保持同步

---

## 三、現有系統分析（更新）

### 船舶事件創建流程追蹤

**1. 手動創建船舶事件（MMSI 輸入）**
```
script.js:97 createNewEvent()
    ↓
vesselDataGenerator.generateVesselDataByMMSI(mmsi)  [同步]
    ↓
完全隨機生成 ❌（未查詢 GFW API）
```

**2. 從區域監控創建船舶事件**
```
script.js:845 createVesselEventFromArea()
    ↓
使用候選船舶資料（來自 areaEvents.js 的可疑列表）
    ↓
建立事件 + trackPoints（已修正座標 bug）
```

**3. 從 RF 信號創建船舶事件**
```
script.js:1070 createVesselEventFromRFSignal()
    ↓
使用 VesselDataAdapter.getVesselByMMSI(mmsi)  [同步]
    ↓
查詢 VesselDatabase（目前無真實數據） ❌
```

**4. 威脅警示自動創建**
```
threatAlertManager.js:38 checkForThreats()
    ↓
vesselDataGenerator.fetchRandomVessel()  [async] ✅
    ↓
目前嘗試呼叫 API，失敗則降級隨機生成
```

### 現有模組狀態

| 模組 | 位置 | 功能 | 狀態 | GFW 整合 |
|------|------|------|------|---------|
| **gfw_server.py** | `api/gfw_server.py` | Flask API | ✅ 已完成 | ✅ 階段 1 |
| **vesselDataGenerator** | `utils/vesselDataGenerator.js` | 船舶數據生成 | ⚠️ 部分整合 | 🔄 `fetchRandomVessel()` 已支援 API<br>❌ `generateVesselDataByMMSI()` 仍是同步 |
| **VesselDataAdapter** | `data/simulated_database/vesselDataAdapter.js` | 適配器 | ⚠️ 存在但同步 | ❌ 未整合 GFW |
| **VesselDatabase** | ❌ 已刪除 | 動態資料庫 | ❌ 不存在 | ❌ 不適用 |

### 關鍵發現（更新）

**✅ 已完成：**
- Flask API 後端正常運作
- `fetchRandomVessel()` 已支援 async + GFW API 調用
- `ThreatAlertManager` 使用 `fetchRandomVessel()`，已整合

**❌ 待整合：**
- `generateVesselDataByMMSI()` 仍是同步函數，完全隨機生成
- `createNewEvent()` 調用同步方法，無法使用 API
- `VesselDataAdapter` 存在但未整合 GFW
- **VesselDatabase 已被刪除**，原計劃需調整

**🆕 新增發現：**
- `createVesselEventFromArea()` 不依賴 `vesselDataGenerator`
- `createVesselEventFromRFSignal()` 使用 `VesselDataAdapter`（但無真實數據）
- 多個創建入口需要分別處理

---

## 四、更新實施方案

### ✅ 階段 1：後端 API（已完成）

**文件：** `api/gfw_server.py`

**功能：**
- ✅ `GET /api/vessel/<mmsi>` - 單一船舶查詢
- ✅ `GET /api/vessels?mmsi=xxx,yyy` - 批次查詢
- ✅ `GET /api/health` - 健康檢查
- ✅ GFW 格式轉換邏輯

**狀態：** ✅ 完成，已測試運行

---

### ⏳ 階段 2：vesselDataGenerator 整合 GFW API

**修改：** `utils/vesselDataGenerator.js:143-173`

**現況：**
```javascript
// 當前：同步函數，完全隨機生成
generateVesselDataByMMSI(mmsi) {
    const riskScore = this.generateRiskScore();
    const coordinates = this.generateSeaCoordinate();
    // ... 完全隨機邏輯
    return { mmsi, vesselName: ..., ... };
}
```

**目標改動：**
```javascript
// 改為 async 函數，優先查詢 GFW API
async generateVesselDataByMMSI(mmsi) {
    console.log(`🔍 查詢船舶資料: ${mmsi}`);

    // 1. 優先使用 GFW API
    if (this.useRealAPI) {
        try {
            const response = await fetch(`${this.apiBaseUrl}/vessel/${mmsi}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' },
                timeout: 5000
            });

            if (response.ok) {
                const gfwData = await response.json();
                console.log(`✅ 從 GFW 獲取船舶: ${mmsi}`);

                // 轉換為事件格式 + 補充缺失資料
                return this.convertGFWToEventFormat(gfwData);
            }
        } catch (error) {
            console.warn('⚠️ GFW API 查詢失敗:', error);
        }
    }

    // 2. 降級：返回隨機生成（保留現有邏輯）
    console.warn(`⚠️ MMSI ${mmsi} 無真實資料，使用模擬資料`);
    return this.generateRandomVesselByMMSI(mmsi);
}

// 新增：GFW 格式轉換 + 補充資料
convertGFWToEventFormat(gfwData) {
    const riskScore = this.generateRiskScore();
    const coordinates = this.generateSeaCoordinate();  // GFW API 無實時位置，需補充
    const trackPoints = this.generateTrackPoints(coordinates.lat, coordinates.lon, 5);

    return {
        mmsi: gfwData.mmsi,
        vesselName: gfwData.name,
        vesselType: this.mapVesselType(gfwData.type),
        coordinates: coordinates.string,
        lat: coordinates.lat,
        lon: coordinates.lon,
        threatScore: riskScore,
        aisStatus: '已開啟',  // GFW 資料通常代表 AIS 已開啟
        speed: gfwData.position?.speed || 0,
        course: gfwData.position?.course || 0,
        timestamp: new Date().toISOString(),
        trackPoints: trackPoints,
        alertTime: riskScore >= 70 ? this.generateAlertTime() : null,

        // 新增：GFW 真實資料標記
        source: 'gfw_api',
        specifications: gfwData.specifications
    };
}

// 新增：船舶類型對應
mapVesselType(gfwType) {
    const typeMap = {
        'FISHING': '漁船',
        'CARGO': '貨輪',
        'TANKER': '油輪',
        'PASSENGER': '客輪',
        'TUG': '拖船',
        'UNKNOWN': '不明'
    };
    return typeMap[gfwType] || '貨輪';
}

// 重構：將原有隨機生成抽取為獨立方法
generateRandomVesselByMMSI(mmsi) {
    const riskScore = this.generateRiskScore();
    const coordinates = this.generateSeaCoordinate();
    const aisStatus = Math.random() > 0.5 ? '已開啟' : '未開啟';
    const speed = (Math.random() * 30).toFixed(1);
    const course = Math.floor(Math.random() * 360);
    const vesselTypes = ['貨輪', '漁船'];
    const vesselType = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];
    const trackPoints = this.generateTrackPoints(coordinates.lat, coordinates.lon, 5);

    return {
        mmsi: mmsi,
        vesselName: this.getRandomVesselName(),
        vesselType: vesselType,
        coordinates: coordinates.string,
        lat: coordinates.lat,
        lon: coordinates.lon,
        threatScore: riskScore,
        aisStatus: aisStatus,
        speed: parseFloat(speed),
        course: course,
        timestamp: new Date().toISOString(),
        trackPoints: trackPoints,
        alertTime: riskScore >= 70 ? this.generateAlertTime() : null,

        // 新增：模擬資料標記
        source: 'simulated'
    };
}
```

**修改點：**
- Line 143: `generateVesselDataByMMSI(mmsi)` → `async generateVesselDataByMMSI(mmsi)`
- Line 144-173: 新增 GFW API 查詢邏輯
- 新增方法：`convertGFWToEventFormat()`, `mapVesselType()`, `generateRandomVesselByMMSI()`

**破壞性分析：** ❌ 無，保留降級邏輯

---

### ⏳ 階段 3：script.js 支援 async（手動創建）

**修改：** `script.js:97-326`

**現況（Line 278）：**
```javascript
// 當前：同步調用
if (window.vesselDataGenerator) {
    vesselData = window.vesselDataGenerator.generateVesselDataByMMSI(mmsi);
    console.log(`✅ 已為 MMSI ${mmsi} 生成船舶資料:`, vesselData);
}
```

**目標改動：**
```javascript
// Line 97: 改為 async 函數
async function createNewEvent() {
    const eventId = `${selectedEventType.toUpperCase()}-${String(++eventCounter).padStart(3, '0')}`;

    // ... 省略其他邏輯 ...

    } else if (selectedEventType === 'vessel') {
        const mmsi = document.getElementById('vesselMMSI').value || '未知';

        // Line 278: ✅ 關鍵修改：使用 await 調用 async 方法
        let vesselData;
        if (window.vesselDataGenerator) {
            vesselData = await window.vesselDataGenerator.generateVesselDataByMMSI(mmsi);
            console.log(`✅ 已為 MMSI ${mmsi} 獲取船舶資料:`, vesselData);
        } else {
            console.warn('⚠️ VesselDataGenerator 不可用');
            vesselData = {
                mmsi: mmsi,
                vesselName: '未知船舶',
                vesselType: '未知',
                coordinates: '未知',
                lat: null,
                lon: null,
                threatScore: 30,
                aisStatus: '未知',
                speed: 0,
                course: 0,
                trackPoints: [],
                source: 'fallback'
            };
        }

        // 建立事件資料，整合船舶資料
        eventData = {
            ...eventData,
            mmsi: vesselData.mmsi,
            coordinates: vesselData.coordinates,
            lat: vesselData.lat,
            lon: vesselData.lon,
            vesselName: vesselData.vesselName,
            vesselType: vesselData.vesselType,
            threatScore: vesselData.threatScore,
            aisStatus: vesselData.aisStatus,
            speed: vesselData.speed,
            course: vesselData.course,
            trackPoints: vesselData.trackPoints,
            timestamp: vesselData.timestamp,
            source: vesselData.source  // 新增：標記資料來源
        };

        if (vesselData.threatScore >= 70 && vesselData.alertTime) {
            eventData.alertTime = vesselData.alertTime;
        }

        displayInfo.content = `MMSI: ${mmsi}<br>座標: ${vesselData.coordinates}<br>威脅分數: ${vesselData.threatScore}`;
    }

    closeEventModal();
    createEventCard(eventId, selectedEventType, eventData, displayInfo);
}

// 修改呼叫處（如果有）
// Line XXX: 確保呼叫處使用 await
await createNewEvent();
```

**修改點：**
- Line 97: `function createNewEvent()` → `async function createNewEvent()`
- Line 278: `vesselData = window.vesselDataGenerator.generateVesselDataByMMSI(mmsi)` → `vesselData = await window.vesselDataGenerator.generateVesselDataByMMSI(mmsi)`
- 新增 fallback 處理邏輯

**破壞性分析：** ❌ 無，所有呼叫處自動適配 async

---

### ⏳ 階段 4：VesselDataAdapter 整合 GFW（RF 信號事件）

**修改：** `data/simulated_database/vesselDataAdapter.js:37-51`

**現況：**
```javascript
// 當前：同步函數，查詢不存在的 VesselDatabase
static getVesselByMMSI(mmsi) {
    if (!window.vesselDatabase) {
        console.error('❌ VesselDatabase 未初始化');
        return null;
    }
    const vessel = window.vesselDatabase.getVesselByMMSI(mmsi);
    // ...
}
```

**目標改動：**
```javascript
// 改為 async 函數，直接調用 vesselDataGenerator
static async getVesselByMMSI(mmsi) {
    console.log(`🔍 VesselDataAdapter 查詢: ${mmsi}`);

    // 1. 使用 vesselDataGenerator 的 GFW 整合功能
    if (window.vesselDataGenerator && typeof window.vesselDataGenerator.generateVesselDataByMMSI === 'function') {
        try {
            const vesselData = await window.vesselDataGenerator.generateVesselDataByMMSI(mmsi);

            if (vesselData) {
                console.log(`✅ VesselDataAdapter 找到船舶: ${vesselData.vesselName} (${mmsi})`);
                return this.convertToAdapterFormat(vesselData);
            }
        } catch (error) {
            console.error('❌ VesselDataAdapter 查詢失敗:', error);
        }
    }

    console.warn(`⚠️ VesselDataAdapter 找不到 MMSI ${mmsi} 的船舶`);
    return null;
}

// 新增：將 vesselDataGenerator 格式轉換為 Adapter 格式（如需要）
static convertToAdapterFormat(vesselData) {
    // 如果格式已經一致，直接返回
    return vesselData;
}
```

**修改點：**
- Line 37: `static getVesselByMMSI(mmsi)` → `static async getVesselByMMSI(mmsi)`
- Line 38-51: 移除對不存在的 `vesselDatabase` 的依賴
- 改為調用 `vesselDataGenerator.generateVesselDataByMMSI()`

**破壞性分析：** ❌ 無，僅影響 RF 信號事件創建

---

### ⏳ 階段 5：script.js 支援 async（RF 信號創建）

**修改：** `script.js:1070-1200`

**現況（Line ~1100）：**
```javascript
// 當前：同步調用 VesselDataAdapter
function createVesselEventFromRFSignal(mmsi) {
    // ...
    const vessel = window.VesselDataAdapter.getVesselByMMSI(mmsi);  // 同步
    // ...
}
```

**目標改動：**
```javascript
// 改為 async 函數
async function createVesselEventFromRFSignal(mmsi) {
    console.log(`🔄 從 RF 信號創建船舶事件: ${mmsi}`);

    // 使用 await 調用 async 方法
    const vessel = await window.VesselDataAdapter.getVesselByMMSI(mmsi);

    if (!vessel) {
        console.error(`❌ 找不到 MMSI ${mmsi} 的船舶資料`);
        alert(`無法找到 MMSI ${mmsi} 的船舶資料`);
        return;
    }

    // 其餘邏輯保持不變...
}
```

**修改點：**
- Line ~1070: `function createVesselEventFromRFSignal(mmsi)` → `async function createVesselEventFromRFSignal(mmsi)`
- Line ~1100: `const vessel = window.VesselDataAdapter.getVesselByMMSI(mmsi)` → `const vessel = await window.VesselDataAdapter.getVesselByMMSI(mmsi)`

**破壞性分析：** ❌ 無，呼叫處自動適配

---

### ✅ 階段 6：ThreatAlertManager（已整合）

**文件：** `utils/threatAlertManager.js:38-58`

**現況：**
```javascript
// 已使用 async/await
async checkForThreats() {
    try {
        const vesselData = await window.vesselDataGenerator.fetchRandomVessel();
        // ...
    } catch (error) {
        console.error('❌ 檢查威脅時發生錯誤:', error);
    }
}
```

**狀態：** ✅ 已完成，無需修改

**說明：**
- `fetchRandomVessel()` 已整合 GFW API 調用
- 自動降級機制已存在
- 每 1 分鐘自動檢查

---

### ⏳ 階段 7：區域監控整合（可選）

**修改：** `script.js:845-1068`（`createVesselEventFromArea()`）

**現況：**
```javascript
// 當前：使用候選船舶資料（來自 areaEvents.js）
function createVesselEventFromArea(areaEventId) {
    // 使用區域監控提供的候選船舶資料
    const vesselCandidate = candidates[selectedCandidateIndex];
    // ...
}
```

**目標改動（可選）：**
```javascript
// 可選：如果候選船舶有 MMSI，查詢 GFW API 補充真實資料
async function createVesselEventFromArea(areaEventId) {
    const vesselCandidate = candidates[selectedCandidateIndex];

    // 如果候選船舶有 MMSI，嘗試獲取真實資料
    if (vesselCandidate.mmsi && window.vesselDataGenerator) {
        const realVesselData = await window.vesselDataGenerator.generateVesselDataByMMSI(vesselCandidate.mmsi);

        if (realVesselData && realVesselData.source === 'gfw_api') {
            console.log('✅ 使用 GFW 真實資料補充候選船舶');
            // 合併真實資料與候選資料
            vesselCandidate.vesselName = realVesselData.vesselName;
            vesselCandidate.vesselType = realVesselData.vesselType;
            // ... 其他欄位
        }
    }

    // 其餘邏輯保持不變...
}
```

**修改點：**
- Line 845: `function createVesselEventFromArea(areaEventId)` → `async function createVesselEventFromArea(areaEventId)`
- 新增 GFW API 查詢邏輯（可選）

**破壞性分析：** ❌ 無，為可選增強

**優先級：** 低（區域監控已有候選資料，GFW 整合為加分項）

---

## 五、檔案結構與修改清單（更新）

### 檔案結構
```
/UIUX/
├── api/
│   ├── gfw_server.py          ✅ [已完成] Flask API
│   ├── requirements.txt        ✅ [已完成] flask, requests, flask-cors
│   └── README.md              ✅ [已完成] API 說明文件
├── data/
│   ├── gfw_simple.py           ✅ [保留] 測試用
│   └── simulated_database/
│       └── vesselDataAdapter.js ⏳ [待修改] async getVesselByMMSI
├── utils/
│   ├── vesselDataGenerator.js  ⏳ [待修改] async generateVesselDataByMMSI
│   └── threatAlertManager.js  ✅ [已完成] 已使用 fetchRandomVessel()
├── script.js                    ⏳ [待修改] async createNewEvent, createVesselEventFromRFSignal
└── index.html                   ✅ [無需修改]
```

### 完整修改清單

| 階段 | 檔案 | 位置 | 修改內容 | 狀態 | 破壞性 |
|------|------|------|---------|------|--------|
| **1** | `gfw_server.py` | 新增檔案 | Flask API 後端 | ✅ 完成 | ❌ 無 |
| **2** | `vesselDataGenerator.js` | Line 143 | 將 `generateVesselDataByMMSI()` 改為 async，新增 GFW 查詢 | ⏳ 待執行 | ❌ 無 |
| **3** | `script.js` | Line 97, 278 | 將 `createNewEvent()` 改為 async，使用 await | ⏳ 待執行 | ❌ 無 |
| **4** | `vesselDataAdapter.js` | Line 37-51 | 將 `getVesselByMMSI()` 改為 async，調用 vesselDataGenerator | ⏳ 待執行 | ❌ 無 |
| **5** | `script.js` | Line 1070 | 將 `createVesselEventFromRFSignal()` 改為 async | ⏳ 待執行 | ❌ 無 |
| **6** | `threatAlertManager.js` | Line 38-58 | 已使用 async `fetchRandomVessel()` | ✅ 完成 | ❌ 無 |
| **7** | `script.js` | Line 845 | （可選）將 `createVesselEventFromArea()` 改為 async | ⏳ 可選 | ❌ 無 |

---

## 六、風險與降級

### 破壞性風險
- ❌ GFW API 掛了 → ✅ Fallback 到隨機數據
- ❌ MMSI 查無資料 → ✅ 降級生成模擬資料
- ❌ 跨域問題 → ✅ Flask CORS 已設定
- ❌ async 調用錯誤 → ✅ try-catch 包裹

### 向後相容保證
- ✅ 保留所有模擬數據功能
- ✅ UI 完全不變
- ✅ 事件系統零修改
- ✅ 原有的隨機生成邏輯完整保留作為 fallback
- ✅ 所有 async 函數都有降級路徑

### 降級路徑
```
用戶輸入 MMSI
    ↓
嘗試 GFW API 查詢（async fetch）
    ↓ (失敗)
降級到隨機生成（generateRandomVesselByMMSI）
    ↓
保證事件一定能建立
```

---

## 七、實施步驟（更新）

### 完整實施時間估計（約 4 小時）

```
✅ 階段 1：後端 API（2hr）                    [已完成]
   ├─ 創建 gfw_server.py
   ├─ 實作 GET /api/vessel/{mmsi}
   └─ GFW 格式轉換邏輯

⏳ 階段 2：vesselDataGenerator 整合（1hr）    [待執行]
   ├─ async generateVesselDataByMMSI()
   ├─ convertGFWToEventFormat()
   ├─ mapVesselType()
   └─ generateRandomVesselByMMSI()

⏳ 階段 3：script.js 手動創建 async（30min）  [待執行]
   └─ async createNewEvent() + await 調用

⏳ 階段 4：VesselDataAdapter 整合（30min）   [待執行]
   └─ async getVesselByMMSI()

⏳ 階段 5：script.js RF 創建 async（20min）  [待執行]
   └─ async createVesselEventFromRFSignal()

✅ 階段 6：ThreatAlertManager（0min）        [已完成]
   └─ 已使用 async fetchRandomVessel()

⏳ 階段 7：區域監控整合（30min）              [可選]
   └─ async createVesselEventFromArea()

⏳ 階段 8：整合測試（40min）                  [待執行]
   ├─ 真實 MMSI 查詢測試
   ├─ 降級機制測試
   └─ 端對端流程測試
```

### 分階段實施選項

**最小可行方案（2.5hr）：**
- 階段 2 + 3（手動創建船舶事件整合 GFW）
- 跳過 RF 信號整合（使用率較低）
- 跳過區域監控整合（已有候選資料）
- 基本測試

**推薦方案（3.5hr）：**
- 階段 2 + 3 + 4 + 5（全部必要整合）
- 跳過階段 7（區域監控為可選）
- 完整測試

**完整方案（4hr）：**
- 所有階段 2-8
- 包含可選增強與完整測試

---

## 八、核心判斷（更新）

### ✅ 值得做
1. Flask API 已就緒，前端整合只差臨門一腳
2. 降級機制保證零破壞性
3. 使用者體驗升級明顯（真實數據）
4. **只需修改 4 個函數為 async，不破壞任何現有功能**
5. ThreatAlertManager 已證明此架構可行

### 關鍵設計原則
- **第一步：簡化數據流** → 統一使用 `vesselDataGenerator`
- **第二步：消除特殊情況** → 統一 GFW/模擬數據格式
- **第三步：最笨但最清楚** → async/await + try-catch，不搞複雜狀態
- **第四步：零破壞性** → fallback 機制 + 保留模擬功能

### Linus 式評價
```
🟢 好品味
- 只改 4 個函數為 async，邏輯清晰
- 降級路徑完整，不會因為 API 掛掉就爆炸
- 保留所有舊代碼，不破壞用戶空間
- 統一數據來源（vesselDataGenerator），消除重複邏輯

⚠️ 唯一風險
- async/await 串接要小心，但 JavaScript 支援已經很成熟了
- 需確保所有呼叫處都支援 async（目前檢查結果：安全）

🔴 已修正問題
- 原計劃依賴的 VesselDatabase 已被刪除
- 改為直接使用 vesselDataGenerator，更簡潔
```

---

## 九、快速開始

### 1. 測試用 MMSI
```
412440692  - 中國漁船（GFW 有資料）
416123456  - 台灣船舶（可能無資料，測試 fallback）
999999999  - 不存在（測試降級路徑）
```

### 2. 啟動命令
```bash
# 後端 API
cd /home/jacob/AI-System-Ship/UIUX/api
python3 gfw_server.py

# 前端（開啟 index.html）
# 使用 Live Server 或任何靜態伺服器
```

### 3. 驗證流程

**手動創建船舶事件：**
```
1. 打開瀏覽器開發者工具（Console）
2. 新增船舶追蹤事件，輸入 MMSI: 412440692
3. 查看 Console log：
   ✅ "🔍 查詢船舶資料: 412440692"
   ✅ "✅ 從 GFW 獲取船舶: 412440692"
4. 輸入 MMSI: 999999999（不存在）
   ✅ "⚠️ GFW API 查詢失敗"
   ✅ "⚠️ MMSI 999999999 無真實資料，使用模擬資料"
```

**威脅警示自動創建：**
```
1. 等待 1 分鐘（威脅監控間隔）
2. 查看 Console log：
   ✅ "🌐 呼叫 GFW API..."
   ✅ "✅ 成功取得 GFW 船隻資料"（如 API 成功）
   或 "⚠️ GFW API 呼叫失敗，降級使用模擬資料"（如 API 失敗）
```

---

## 十、新增功能影響評估

### 最近新增功能與 GFW 整合相容性

| 功能 | 檔案 | 相容性 | 說明 |
|------|------|--------|------|
| **事件完成系統** | `script.js:1325-1392` | ✅ 完全相容 | 事件完成邏輯獨立，不影響資料獲取 |
| **Tab 切換（進行中/已結束）** | `script.js:1397-1466` | ✅ 完全相容 | UI 邏輯，不涉及資料來源 |
| **自動跳轉到新事件** | `script.js:1049-1062` | ✅ 完全相容 | 事件創建後的 UI 操作，與 async 無衝突 |
| **歷史軌跡修正** | `HistoryTrackManager.js:248-275` | ✅ 完全相容 | trackPoints 格式統一，GFW 資料會生成相容格式 |
| **威脅警示間隔調整** | `threatAlertManager.js:6` | ✅ 已整合 | 已使用 `fetchRandomVessel()`，GFW 整合完成 |

**結論：** 所有最近新增功能與 GFW 整合零衝突，可安全執行整合計劃。

---

## 十一、下一步行動

### 建議執行順序

**第一天（2hr）：核心整合**
```
1. 修改 vesselDataGenerator.js（階段 2）
2. 修改 script.js createNewEvent()（階段 3）
3. 測試手動創建船舶事件 + GFW API
```

**第二天（1.5hr）：RF 信號整合 + 測試**
```
4. 修改 vesselDataAdapter.js（階段 4）
5. 修改 script.js createVesselEventFromRFSignal()（階段 5）
6. 完整端對端測試
```

**可選（第三天，30min）：區域監控增強**
```
7. 修改 createVesselEventFromArea()（階段 7）
```

### 測試檢查表

- [ ] Flask API 正常運行（`http://localhost:5000/api/health`）
- [ ] 手動創建船舶事件（真實 MMSI）→ 查詢 GFW API
- [ ] 手動創建船舶事件（不存在 MMSI）→ 降級模擬資料
- [ ] 威脅警示自動創建 → 使用 GFW API（已驗證）
- [ ] RF 信號創建船舶事件 → 查詢 GFW API
- [ ] GFW API 關閉 → 所有功能降級正常
- [ ] 事件完成功能 → 正常運作
- [ ] Tab 切換 → 正常運作
- [ ] 歷史軌跡顯示 → 正常運作

---

**文檔更新時間：** 2025-10-12
**規劃者：** Linus-style Code Reviewer
**狀態：** ✅ 階段 1 完成 | ⏳ 階段 2-7 待執行 | 📋 計劃已更新
