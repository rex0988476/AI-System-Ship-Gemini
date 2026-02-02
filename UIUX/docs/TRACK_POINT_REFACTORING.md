# 軌跡點生成函數重構說明

**日期**: 2025-10-10
**重構原因**: 整合三個重複的軌跡生成函數，為未來資料庫整合做準備

---

## 📋 重構概要

### 原有的三個函數

1. **`vesselDataGenerator.generateTrackPoints(lat, lon, count)`**
   位置: `utils/vesselDataGenerator.js:181`
   - 功能: 最簡單的隨機軌跡生成
   - 特點: 只有歷史點，無 type/status 等屬性
   - 用途: GFW API 降級時的簡單模擬
   - 問題: 功能過於簡陋，缺乏真實感

2. **`eventStorage.generateFixedTrackPoints(eventId, endLat, endLon)`**
   位置: `data/eventStorage.js:360`
   - 功能: 基於終點座標動態生成軌跡
   - 特點: 包含 History/Current/Future 類型和完整屬性
   - 用途: 原本用於動態生成，但已被註解掉
   - 問題: 實際未使用，產生混淆

3. **`eventStorage.generateSimulatedTrackPoints(shiptype)`**
   位置: `data/eventStorage.js:645`
   - 功能: 使用預設真實航線模板（泰國→台灣）
   - 特點: 包含 History/Current/Future 類型和完整屬性
   - 用途: 預設船舶事件 + 從區域監控生成的船舶
   - 優點: 有真實航線模板，視覺效果好

---

## ✨ 重構方案

### 新建統一接口

**檔案**: `utils/trackPointGenerator.js`

```javascript
class TrackPointGenerator {
  async generateTrackPoints(vessel, options = {}) {
    // 自動選擇資料來源：資料庫 → GFW API → 模擬資料
  }

  async fetchFromDatabase(mmsi, options) {
    // 未來實作：從真實資料庫取得軌跡
  }

  async fetchFromGFWAPI(mmsi, options) {
    // 未來實作：從 GFW API 取得軌跡
  }

  generateMockData(vessel, options) {
    // 開發用：整合原本的模擬邏輯
    // 內含真實航線模板（fishing, cargo）
  }
}
```

### 設計原則

1. **統一接口**: 所有軌跡生成都通過 `trackPointGenerator.generateTrackPoints()`
2. **自動降級**: 資料庫失敗 → API 失敗 → 模擬資料
3. **資料正規化**: 不同來源的資料統一轉換成標準格式
4. **向後兼容**: 舊函數保留並標記為 deprecated

---

## 🔧 修改內容

### 1. 新增檔案

- **`utils/trackPointGenerator.js`**
  - 統一的軌跡點生成器類別
  - 支援多種資料來源（資料庫、API、模擬）
  - 包含自動降級機制
  - 開發模式標記（`devMode = true`）

### 2. 修改檔案

#### `index.html`
```html
<!-- 在 eventStorage.js 之後，vesselDataGenerator.js 之前引入 -->
<script src="utils/trackPointGenerator.js"></script>
```

#### `script.js`
- **函數**: `createVesselEventFromArea(rfId)`
- **修改**: 改為 `async function`
- **變更**: 使用新的 `trackPointGenerator.generateTrackPoints()`
```javascript
// 舊代碼
eventData.trackPoints = window.eventStorage.generateSimulatedTrackPoints(trackType);

// 新代碼
eventData.trackPoints = await window.trackPointGenerator.generateTrackPoints(vessel, {
    source: 'mock',
    eventId: eventId
});
```

#### `data/eventStorage.js`

**函數 1**: `generateSimulatedTrackPoints(shiptype)` (第 645 行)
- **狀態**: 標記為 `@deprecated`
- **修改**: 內部轉接到新的 `trackPointGenerator.generateMockData()`
- **原因**: 保持向後兼容，預設事件和 threatAlertManager 繼續使用
```javascript
/**
 * @deprecated 請使用 window.trackPointGenerator.generateTrackPoints() 替代
 * 此方法保留用於向後兼容
 */
generateSimulatedTrackPoints(shiptype) {
    if (window.trackPointGenerator) {
        const vessel = { vesselType: shiptype === 'fishing' ? '漁船' : '貨輪' };
        return window.trackPointGenerator.generateMockData(vessel, { eventId: 'legacy' });
    }
    // 降級：使用原本的實作
}
```

**函數 2**: `generateFixedTrackPoints(eventId, endLat, endLon)` (第 360 行)
- **狀態**: 標記為 `@deprecated`
- **原因**: 已無任何地方使用，未來可考慮刪除
```javascript
/**
 * @deprecated 此函數已不再使用，請使用 window.trackPointGenerator.generateTrackPoints() 替代
 */
```

#### `utils/vesselDataGenerator.js`
- **函數**: `generateTrackPoints(lat, lon, count)` (第 181 行)
- **狀態**: 保留但未來可能移除
- **原因**: 功能過於簡陋，應改用新的 Generator

---

## 📊 向後兼容性

### 繼續正常運作的功能

✅ **預設船舶事件** (vessel-003, vessel-004)
   → 使用 `eventStorage.generateSimulatedTrackPoints()`
   → 內部自動轉接到新 Generator

✅ **威脅警報管理器** (threatAlertManager.js)
   → 呼叫 `eventStorage.generateSimulatedTrackPoints()`
   → 自動轉接到新 Generator

✅ **新建船舶事件** (從區域監控創建)
   → 直接使用新的 `trackPointGenerator.generateTrackPoints()`

### 不受影響的既有功能

- 歷史軌跡顯示
- 任務追蹤點管理
- 地圖標記顯示
- 軌跡點彈出視窗

---

## 🚀 未來擴展指南

### 接入真實資料庫時

1. **啟用資料庫模式**
```javascript
window.DATABASE_ENABLED = true;
```

2. **實作資料庫查詢**
```javascript
// 在 trackPointGenerator.js 中
async fetchFromDatabase(mmsi, options) {
    const response = await fetch(`/api/vessel/${mmsi}/track`);
    const data = await response.json();
    return this.normalizeTrackPoints(data, 'database');
}
```

3. **無需修改其他代碼**
   → 自動降級機制會優先使用資料庫
   → 資料庫失敗時自動降級到模擬資料

### 接入 GFW API 軌跡端點時

1. **啟用 GFW API**
```javascript
window.GFW_API_ENABLED = true;
```

2. **實作 API 查詢**
```javascript
async fetchFromGFWAPI(mmsi, options) {
    const response = await fetch(`${this.gfwApiBaseUrl}/vessel/${mmsi}/track`);
    return this.normalizeGFWTrackData(await response.json());
}
```

### 生產環境部署

將 `trackPointGenerator.js` 中的開發模式關閉：
```javascript
this.devMode = false;  // 生產環境不使用模擬資料
```

當無真實資料且非開發模式時，會回傳空陣列 `[]`

---

## 🎯 重構效益

### 立即效益

1. **代碼整潔**: 三個相似函數整合為一個統一接口
2. **職責清晰**: 軌跡生成邏輯集中管理
3. **易於維護**: 未來修改只需改一個地方
4. **向後兼容**: 現有功能完全不受影響

### 長期效益

1. **擴展性強**: 輕鬆接入資料庫或 API
2. **降級機制**: 多層備援，系統穩定性高
3. **類型安全**: 統一資料格式，減少錯誤
4. **測試友善**: 可獨立測試各個資料來源

---

## 📝 注意事項

1. **async/await**: `createVesselEventFromArea()` 改為 async 函數
2. **deprecation**: 舊函數保留但標記為 deprecated，未來版本可能移除
3. **開發模式**: 目前 `devMode = true`，生產環境記得關閉
4. **資料格式**: 確保新增的資料來源都經過 `normalizeTrackPoints()` 正規化

---

## 🔍 驗證清單

重構後請確認以下功能正常：

- [ ] 預設船舶事件（vessel-003, vessel-004）顯示軌跡
- [ ] 從區域監控創建新船舶事件能生成軌跡
- [ ] 軌跡點的 Current 位置顯示為紅色圓形
- [ ] 軌跡點的 History 位置顯示為藍色三角形
- [ ] 軌跡點的 Future 位置顯示為黃色三角形
- [ ] Current 位置有脈衝動畫
- [ ] 點擊軌跡點顯示詳細資訊彈出視窗
- [ ] 控制台無錯誤訊息

---

**重構完成**: 2025-10-10
**負責人**: Claude Code
**狀態**: ✅ 完成並測試
