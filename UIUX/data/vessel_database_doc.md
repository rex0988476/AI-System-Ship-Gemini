# 船舶資料庫系統文件

## 概述

船舶資料庫系統 (`vessel_database.js`) 是一個模擬動態即時船舶監控系統，包含完整的船舶資訊、威脅評估和自動警告功能。

## 核心功能

### 1. 船舶資料管理
- **MMSI 管理**: 符合國際海事標準的 9 位數字識別碼
- **即時位置追蹤**: 包含緯度、經度、航向、速度
- **船舶規格**: 長度、寬度、噸位、最大速度、建造年份
- **AIS 狀態監控**: 信號強度、導航狀態、目的地、預計到達時間

### 2. 威脅評估系統
- **自動威脅計算**: 基於多項因子的綜合評估
- **即時更新**: 每 5 秒重新評估所有船舶威脅級別
- **智能警告**: 威脅級別 > 60 時自動觸發警告事件

### 3. 動態資料更新
- **模擬移動**: 基於真實物理模型的船舶移動模擬
- **狀態變化**: AIS 開關、速度調整、航向改變
- **歷史記錄**: 自動保存位置歷史和事件記錄

## 技術規格

### 初始化參數
```javascript
- 船舶數量: 50 艘
- 更新頻率: 5000ms (5秒)
- 監控區域: 台海、南海區域
- 支援船舶類型: 6 種 (貨船、漁船、油輪、客船、軍艦、研究船)
- 支援國籍: 8 個 (台灣、中國、日本、韓國、越南、菲律賓、美國、新加坡)
```

### 資料結構

#### 船舶物件結構
```javascript
{
  mmsi: "416123456",           // 海事移動業務識別碼
  name: "海運王號",            // 船舶名稱
  type: "cargo",               // 船舶類型
  country: "TW",               // 國家代碼
  flagState: "中華民國（台灣）", // 船旗國

  position: {                  // 位置資訊
    lat: 24.1234,             // 緯度
    lon: 120.5678,            // 經度
    course: 045,              // 航向 (0-359度)
    speed: 15.2,              // 速度 (節)
    heading: 045              // 船首向
  },

  specifications: {            // 船舶規格
    length: 200,              // 長度 (米)
    width: 30,                // 寬度 (米)
    tonnage: 50000,           // 噸位
    maxSpeed: 25,             // 最大速度 (節)
    buildYear: 2015           // 建造年份
  },

  ais: {                       // AIS 資訊
    status: "active",         // 狀態: active/inactive
    lastUpdate: Date,         // 最後更新時間
    signalStrength: -55.2,    // 信號強度 (dBm)
    navigationStatus: "Under way using engine",
    destination: "KAOHSIUNG", // 目的地
    eta: Date                 // 預計到達時間
  },

  threat: {                    // 威脅評估
    level: 65,                // 威脅級別 (0-100)
    factors: ["AIS信號關閉", "異常高速"],
    lastAssessment: Date,     // 最後評估時間
    riskCategory: "high"      // 風險分類: low/medium/high
  },

  history: {                   // 歷史記錄
    positions: [],            // 位置歷史
    events: [],               // 事件記錄
    alerts: []                // 警告記錄
  }
}
```

## API 文件

### 核心類別: VesselDatabase

#### 建構函式
```javascript
const vesselDB = new VesselDatabase();
```

#### 主要方法

##### 監控控制
```javascript
vesselDB.startDynamicUpdates()    // 開始即時監控
vesselDB.stopDynamicUpdates()     // 停止監控
```

##### 資料查詢
```javascript
vesselDB.getVesselByMMSI(mmsi)                    // 根據 MMSI 取得船舶
vesselDB.getAllVessels()                          // 取得所有船舶
vesselDB.getVesselsByThreatLevel(minLevel)        // 根據威脅級別篩選
vesselDB.getVesselsByType(type)                   // 根據類型篩選
vesselDB.getVesselsByCountry(country)             // 根據國籍篩選
vesselDB.getVesselsInArea(bounds)                 // 根據區域篩選
```

##### 統計資料
```javascript
vesselDB.getStatistics()          // 取得完整統計資料
```

統計資料結構：
```javascript
{
  total: 50,                     // 總船舶數
  byType: {                      // 按類型分類
    cargo: 12,
    fishing: 8,
    // ...
  },
  byCountry: {                   // 按國籍分類
    TW: 10,
    CN: 8,
    // ...
  },
  byThreatLevel: {               // 按威脅級別分類
    low: 30,
    medium: 15,
    high: 5
  },
  aisActive: 42,                 // AIS 開啟數量
  aisInactive: 8                 // AIS 關閉數量
}
```

##### 資料管理
```javascript
vesselDB.addVessel(vesselData)    // 新增船舶
vesselDB.removeVessel(mmsi)       // 移除船舶
```

## 威脅評估演算法

### 評分因子

| 因子 | 分數 | 說明 |
|------|------|------|
| AIS 關閉 | +30 | 基礎威脅 |
| 連續 AIS 中斷 | +25-40 | 根據連續次數 |
| 異常高速 (>30節) | +35 | 超速行為 |
| 異常低速 (<0.5節) | +30 | 可疑停留 |
| 嚴重偏離航線 (>10km) | +40 | 航線異常 |
| 進入禁航區域 | +50 | 違法行為 |
| 夜間活動 (22:00-05:00) | +10 | 時間因子 |
| 距台灣 <50km | +60 | 極度接近 |
| 距台灣 50-100km | +40 | 接近威脅 |
| 距台灣 100-200km | +20 | 周邊監控 |
| 距台灣 200-300km | +10 | 外圍警戒 |
| 軍用船舶 | +20 | 船舶類型 |
| 中國船籍 | +10 | 國籍因子 |

### 威脅級別分類

| 分數範圍 | 威脅級別 | 風險分類 | 建議行動 |
|----------|----------|----------|----------|
| 0-39 | 低威脅 | low | 標準監控 |
| 40-69 | 中威脅 | medium | 加強追蹤 |
| 70-100+ | 高威脅 | high | 立即調查 |

## 事件系統

### 威脅警告事件
當船舶威脅級別超過 60 時，系統會發送 `vesselThreatAlert` 事件：

```javascript
window.addEventListener('vesselThreatAlert', (event) => {
  const vessel = event.detail.vessel;
  const alert = event.detail.alert;

  console.log('威脅警告:', vessel.name, vessel.threat.level);
});
```

事件詳情結構：
```javascript
{
  vessel: {船舶完整資料},
  alert: {
    timestamp: Date,
    type: 'high_threat',
    level: 75,
    factors: ["AIS信號關閉", "接近台灣海域"],
    position: {lat: 24.0, lon: 120.5},
    description: "高威脅船舶警告: 海運王號 (416123456)"
  }
}
```

## 模擬真實性

### 移動模擬
- **物理模型**: 基於船舶速度和時間間隔的真實移動計算
- **航向變化**: 每次更新±10度的自然航向調整
- **速度變化**: ±2節的隨機速度調整，不超過最大速度

### AIS 模擬
- **信號變化**: 5%機率改變 AIS 開關狀態
- **信號強度**: 動態調整 -45 到 -85 dBm 範圍
- **狀態更新**: 模擬真實 AIS 更新頻率

### 地理真實性
- **監控區域**: 台灣海峽、南海、東海南部、巴士海峽
- **航線模擬**: 基於真實海運航線的位置分布
- **距離計算**: 使用 Haversine 公式精確計算地球表面距離

## 整合指南

### 在現有系統中使用

1. **載入模組**:
```html
<script src="data/vessel_database.js"></script>
```

2. **初始化**:
```javascript
// 系統會自動創建 window.vesselDatabase 實例
const vesselDB = window.vesselDatabase;

// 開始監控
vesselDB.startDynamicUpdates();
```

3. **監聽威脅警告**:
```javascript
window.addEventListener('vesselThreatAlert', handleThreatAlert);
```

### 與現有威脅評估系統整合

船舶資料庫可與現有的 `ui/threat_assessment.js` 整合：

```javascript
// 使用船舶資料庫的資料進行威脅評估
if (window.vesselDatabase && typeof assessThreatLevel === 'function') {
  const vessels = window.vesselDatabase.getAllVessels();

  vessels.forEach(vessel => {
    // 轉換船舶資料為威脅評估所需格式
    const trackPoint = {
      lat: vessel.position.lat,
      lon: vessel.position.lon,
      speed: vessel.position.speed,
      status: vessel.ais.status === 'active' ? 'AIS' : 'No AIS',
      signalStrength: vessel.ais.signalStrength,
      deviationFromRoute: Math.random() * 5, // 模擬偏航數據
      inRestrictedZone: false,
      timestamp: vessel.lastSeen.toISOString()
    };

    // 使用現有威脅評估函數
    const threatAssessment = assessThreatLevel(trackPoint, vessel.history.positions);

    // 更新船舶威脅級別（可選）
    vessel.threat.level = threatAssessment.score;
    vessel.threat.factors = threatAssessment.factors;
  });
}
```

## 效能考量

### 記憶體使用
- **船舶資料**: 約 50KB (50艘船舶)
- **歷史記錄**: 每艘船舶最多保留 50 筆位置記錄
- **總記憶體**: 約 100-200KB

### CPU 使用
- **更新頻率**: 每 5 秒一次完整掃描
- **計算複雜度**: O(n) 線性時間，n = 船舶數量
- **威脅評估**: 每艘船舶約 10-15 個判斷條件

### 網路需求
- **純前端**: 無需伺服器連接
- **本地運行**: 所有計算在瀏覽器中完成
- **事件驅動**: 使用 JavaScript 原生事件系統

## 測試文件

系統提供兩個測試頁面：

1. **完整測試**: `test_vessel_database.html`
   - 完整的 UI 介面
   - 即時統計圖表
   - 船舶列表和篩選功能

2. **簡單測試**: `test_vessel_simple.html`
   - 基本功能測試
   - 系統日誌顯示
   - 適合開發和除錯

## 常見問題

### Q: 如何調整更新頻率？
A: 修改建構函式中的 `this.updateFrequency` 值（毫秒）

### Q: 如何新增新的船舶類型？
A: 在 `initializeVesselData()` 方法中新增到 `vesselTypes` 陣列

### Q: 如何調整威脅評估演算法？
A: 修改 `calculateThreatLevel()` 方法中的評分邏輯

### Q: 如何擴展到更多船舶？
A: 修改初始化迴圈中的船舶數量（預設 50 艘）

### Q: 與現有系統的相容性？
A: 船舶資料庫獨立運行，通過事件系統與其他模組通信，不會影響現有功能

## 版本資訊

- **版本**: 1.0.0
- **建立日期**: 2025-09-30
- **相容性**: ES6+, 現代瀏覽器
- **依賴**: 無外部依賴

## 授權

本系統為內部使用，請遵循專案授權條款。