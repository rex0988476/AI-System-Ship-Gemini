# 未使用代碼報告 (Unused Code Report)

生成日期：2025-10-16

## 📋 總覽

本報告列出 AI-System-Ship 專案中已停用、已棄用或未使用的程式碼，以便後續清理和維護。

---

## 🔴 第一類：已明確停用的功能

### 1. RF 監控事件功能 (RF Event Management)

**狀態**: 已全面停用  
**影響範圍**: `script.js`, `eventStorage.js`

#### 停用位置列表：

**`script.js`**:
- Line 5: `// RFEventManager = window.RFEventManager; // 暫時停用 RF 監控事件功能`
- Line 178-236: Area 事件創建中的 RF 候選生成邏輯（已註解）
- Line 601-633: `createRFEventfromArea` 函數相關代碼（已註解）
- Line 635-756: 整個 RF 事件創建流程（已註解）
- Line 757-809: RF 事件到船舶事件的轉換邏輯（已註解）
- Line 771-809: `createVesselEventFromRF` 函數（已註解）
- Line 2204-2302: RF 事件詳情顯示邏輯（已註解）
- Line 3895-3928: 時間軸中的 RF 事件渲染（已註解）

**`eventStorage.js`**:
- Line 60-79: RF-002 事件初始化（已註解）
- Line 231-284: `reinitializeRFEvents` 函數（存在但可能不再調用）

#### 相關全域變數：
```javascript
let RFEventManager; // 已停用
```

#### 建議處理：
- [ ] 確認是否完全不需要 RF 功能
- [ ] 如確認，刪除所有 RF 相關代碼（約 500+ 行）
- [ ] 更新文檔說明功能移除原因

---

### 2. 時間軸全域模式 (Global Timeline Mode)

**狀態**: 部分停用，改為船舶專用時間軸  
**位置**: `script.js` Line 3878

```javascript
// 新增：添加时间轴事件（時間軸現在只在點擊船舶時顯示，此函數暫時保留但不執行渲染）
function addToTimeline(eventData) {
    // 函數存在但不再渲染到全域時間軸
}
```

#### 建議處理：
- [ ] 確認全域時間軸是否完全不需要
- [ ] 如確認，刪除 `addToTimeline` 函數及相關邏輯

---

## 🟡 第二類：已棄用但仍保留的函數

### 1. `generateFixedTrackPoints` (eventStorage.js)

**狀態**: @deprecated  
**位置**: `eventStorage.js` Line 369-509  
**替代方案**: `window.trackPointGenerator.generateTrackPoints()`

```javascript
/**
 * @deprecated 此函數已不再使用，請使用 window.trackPointGenerator.generateTrackPoints() 替代
 */
generateFixedTrackPoints(eventId, endLat, endLon) {
    // ... 約 140 行代碼
    console.log(`[DEPRECATED] generateFixedTrackPoints is deprecated. Use trackPointGenerator instead.`);
    return trackPoints;
}
```

#### 依賴檢查：
- [ ] 搜尋所有調用 `generateFixedTrackPoints` 的地方
- [ ] 確認是否已全部遷移到新 API
- [ ] 如確認，刪除此函數（約 140 行）

---

### 2. `generateMissionCardsFromTrackPoints` (eventStorage.js)

**狀態**: @deprecated，核心邏輯已停用  
**位置**: `eventStorage.js` Line 512-665

```javascript
/**
 * @deprecated This function is deprecated. It creates duplicate, unmanaged missions and should not be used.
 * Mission creation should be handled by a dedicated mission manager, not as a side effect of data generation.
 * This function is kept for historical reference but its core logic is disabled.
 */
generateMissionCardsFromTrackPoints(trackPoints, eventId) {
    // ... 核心任務創建邏輯已被註解
    console.warn(`[BUG] generateMissionCardsFromTrackPoints attempted to create ${missionsCreatedForThisVessel} duplicate missions`);
}
```

#### 建議處理：
- [x] 核心邏輯已停用（Line 526）
- [ ] 確認無調用後刪除整個函數（約 150 行）

---

### 3. `generateSimulatedTrackPoints` (eventStorage.js)

**狀態**: @deprecated  
**位置**: `eventStorage.js` Line 678-945  
**替代方案**: `window.trackPointGenerator.generateMockData()`

```javascript
/**
 * @deprecated 請使用 window.trackPointGenerator.generateTrackPoints() 替代
 * 此方法保留用於向後兼容
 */
generateSimulatedTrackPoints(shiptype, eventId) {
    // 如果新的 Generator 可用，使用它
    if (window.trackPointGenerator) {
        const vessel = { vesselType: shiptype === 'fishing' ? '漁船' : '貨輪' };
        return window.trackPointGenerator.generateMockData(vessel, { eventId: 'legacy' });
    }
    
    // 降級：使用原本的實作（約 250 行）
    // ...
}
```

#### 依賴檢查：
- [ ] 確認 `trackPointGenerator` 是否完全可用
- [ ] 遷移所有調用到新 API
- [ ] 刪除舊實作（保留降級邏輯或完全移除）

---

## 🟢 第三類：備註待處理的 TODO/FIXME

### TODO 列表

**`script.js`**:
1. Line 773: `// TODO: 更新成從RF區域監控建立船舶追蹤事件`
2. Line 774: `// TODO 生成船舶追蹤事件後將可疑列表中的對應船隻移除`
3. Line 810: `// TODO 從 RF 事件生成船舶調查事件時的軌跡點生成機制`
4. Line 1499: `// TODO 整理 executeAction 內部相關 function 程式碼`

**`trackPointGenerator.js`**:
1. Line 192: `// TODO: 實作資料庫查詢`
2. Line 202: `// TODO: GFW API 目前只有船舶資訊，沒有軌跡端點`
3. Line 298: `// TODO: 將 GFW API 的資料格式轉換成標準格式`

### 建議處理：
- [ ] 評估每個 TODO 的優先級
- [ ] 完成或刪除過時的 TODO
- [ ] 更新文檔說明決策

---

## 🔵 第四類：可能冗餘的輔助函數

### 1. 座標生成相關

**`script.js`** Line 1506-1604:
```javascript
function generateCoordinatesInRange(latRange, lonRange) {
    // 約 100 行的座標生成邏輯
    // 包含台灣陸地檢測等複雜邏輯
}
```

#### 問題：
- 與 `generateSeaCoordinateForEvents` 功能重疊
- 複雜度高但可能使用頻率低

#### 建議處理：
- [ ] 統計實際調用次數
- [ ] 考慮簡化或合併功能

---

### 2. RF ID 生成器

**`script.js`** Line 3268-3280:
```javascript
function generateRandomRFCandidates(count = 3) {
    // RF 候選編號生成
}

function generateSingleRFId() {
    // 單個 RF ID 生成
}
```

#### 問題：
- 如果 RF 功能已停用，這些函數可能不再需要

#### 建議處理：
- [ ] 確認 RF 功能狀態
- [ ] 如停用，刪除相關生成器

---

### 3. 可疑船隻候選生成

**`script.js`** Line 2891-2941:
```javascript
function generateSuspiciousCandidates(eventData) {
    // 生成可疑船隻候選列表
    // AIS未開啟時使用
}
```

#### 問題：
- 與 RF 功能強耦合
- 如 RF 停用，此函數可能不需要

#### 建議處理：
- [ ] 確認是否仍需要此功能
- [ ] 考慮重構或刪除

---

## 📊 統計摘要

| 類別 | 項目數 | 估計行數 | 處理優先級 |
|------|-------|---------|-----------|
| 已停用功能 | 2 | ~500 | 🔴 高 |
| 已棄用函數 | 3 | ~540 | 🟡 中 |
| TODO/FIXME | 7 | N/A | 🟢 低 |
| 冗餘函數 | 3 | ~200 | 🔵 待評估 |
| **總計** | **15** | **~1240** | - |

---

## 🎯 清理行動計畫

### Phase 1: 高優先級（建議立即處理）
1. [ ] 確認 RF 監控事件功能是否永久停用
2. [ ] 如確認停用，刪除所有 RF 相關代碼（~500 行）
3. [ ] 更新文檔說明功能架構變更

### Phase 2: 中優先級（2週內處理）
1. [ ] 遷移所有軌跡點生成到新 API
2. [ ] 刪除已棄用的 `generateFixedTrackPoints` 等函數（~540 行）
3. [ ] 驗證系統功能完整性

### Phase 3: 低優先級（1個月內處理）
1. [ ] 評估並處理所有 TODO 項目
2. [ ] 重構或刪除冗餘輔助函數
3. [ ] 補充單元測試

### Phase 4: 持續優化
1. [ ] 定期掃描未使用代碼
2. [ ] 維護文檔同步
3. [ ] Code review 檢查

---

## 🔍 檢測方法

以下是檢測未使用代碼的方法：

### 1. 靜態分析
```bash
# 搜尋未調用的函數
grep -r "function functionName" UIUX/
grep -r "functionName(" UIUX/

# 檢查 @deprecated 標記
grep -r "@deprecated" UIUX/
```

### 2. 動態分析
- 在函數入口添加 `console.warn('Function X called')`
- 運行完整測試流程
- 檢查哪些警告沒有出現

### 3. 代碼覆蓋率
```bash
# 使用 Istanbul/NYC
npm install -g nyc
nyc mocha tests/
```

---

## 📝 附註

### 備份建議
在刪除任何代碼前：
1. 創建 git branch: `git checkout -b cleanup/unused-code`
2. 逐步刪除並測試
3. 保留刪除的代碼在此報告中以便回溯

### 風險評估
- **低風險**: 已明確標記 @deprecated 且有替代方案
- **中風險**: 已停用但未確認是否有隱藏依賴
- **高風險**: 功能複雜且可能有未知調用

---

## 📞 聯絡資訊

如有疑問或發現遺漏，請聯絡：
- 專案負責人：[Your Name]
- 最後更新：2025-10-16
- 版本：1.0

---

**生成命令**: 
```bash
# 重新生成此報告
grep -rn "@deprecated\|暫時停用\|TODO\|FIXME" UIUX/ > UNUSED_CODE_SCAN.txt
```
