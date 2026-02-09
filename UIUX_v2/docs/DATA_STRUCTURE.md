# 軌跡數據結構規範

## 核心原則

**"Bad programmers worry about the code. Good programmers worry about data structures."**

這份文檔定義了整個系統的數據流，消除所有不必要的格式轉換。

---

## 1. 後端 API 輸出格式 (Source of Truth)

### 1.1 可疑船只列表 API

**路徑**: `GET /suspiciousVessels?lat={lat}&lon={lon}&radius={radius}`

**返回**: `Array<SuspiciousVessel>`

```typescript
interface SuspiciousVessel {
  mmsi: string,                  // Ship identifier
  threatScore: number,           // -1 表示未計算
  aisFlag: boolean,              // AIS 開關狀態
  coord: [number, number]        // [Latitude, Longitude] - 當前位置
}
```

**實際範例**:
```json
[
  {
    "mmsi": "41200003",
    "threatScore": -1,
    "aisFlag": true,
    "coord": [23.1862, 119.7894]
  }
]
```

**用途**: 區域事件監控，初始化 shipDataMap

---

### 1.2 船只軌跡 API

**路徑**: `GET /vesselTrack?mmsi={mmsi}`

**返回**: `Array<TrajectoryPoint>`

```typescript
interface TrajectoryPoint {
  coord: [number, number],      // [Latitude, Longitude] - 前端直接使用
  timestamp: string,             // ISO 8601 string - "2026-01-30T12:34:56.789Z"
  sog: number,                   // Speed Over Ground (knots)
  cog: number,                   // Course Over Ground (degrees)
  navStatus: number              // Navigational Status code
}
```

**排序**: 從新到舊 (`Record_Time DESC`)

**實際範例**:
```json
[
  {
    "coord": [23.974, 120.973],
    "timestamp": "2026-01-30T04:23:15.000Z",
    "sog": 12.3,
    "cog": 45.2,
    "navStatus": 0
  },
  {
    "coord": [23.971, 120.970],
    "timestamp": "2026-01-30T03:18:42.000Z",
    "sog": 11.8,
    "cog": 44.9,
    "navStatus": 0
  }
]
```

---

### 1.3 船只詳細信息 API

**路徑**: `GET /vesselInfo?mmsi={mmsi}`

**返回**: `VesselInfo`

```typescript
interface VesselInfo {
  vesselType: number,            // 船舶類型代碼 (70=貨船, 30=漁船)
  imoNum: string,                // IMO 編號 ("0" 表示無)
  navStatus: string,             // 航行狀態代碼
  cog: number,                   // Course Over Ground (degrees)
  sog: number,                   // Speed Over Ground (knots)
  rfFreq: string,                // RF 頻率 ("9999" 表示無 RF 數據)
  coord: [number, number],       // [Latitude, Longitude] - 當前位置
  accuracy: string,              // RF 精度 ("HIGH" | "MEDIUM" | "LOW")
  pulsesDuration: string,        // RF 脈衝持續時間 (μs)
  pulsesFreq: string,            // RF 脈衝頻率 (Hz)
  waveform: string               // 波形類型
}
```

**實際範例**:
```json
{
  "vesselType": 70,
  "imoNum": "0",
  "navStatus": "0",
  "cog": 124.8,
  "sog": 0.2,
  "rfFreq": "9999",
  "coord": [7.735375, 103.524487],
  "accuracy": "HIGH",
  "pulsesDuration": "150",
  "pulsesFreq": "3000",
  "waveform": "Pulsed"
}
```

**用途**: 詳情面板顯示，合併到 shipDataMap

**特殊值**:
- `imoNum: "0"` → 無 IMO 編號
- `rfFreq: "9999"` → 無 RF 檢測數據
- `navStatus: "0"` → Under way using engine

---

## 2. 前端内部数据结构

### 2.1 Ship Data (shipDataMap)
**用途**: 前端全局船只数据缓存，存储在 `Map<string, ShipData>`
**Key**: MMSI (string)
**Value**: `ShipData` 对象

```typescript
interface ShipData {
  // Identity
  mmsi: string,                   // Ship MMSI (primary key)
  
  // AIS Data
  aisFlag: boolean | null,        // AIS 开关状态
  vesselType: number | null,      // 船舶类型代码
  imoNum: string | null,          // IMO 编号
  navStatus: string | null,       // 航行状态
  cog: number | null,             // Course Over Ground
  sog: number | null,             // Speed Over Ground
  
  // Position
  coord: [number, number] | null, // [Latitude, Longitude]
  
  // RF Detection Data
  rfFreq: string | null,          // RF 频率 ("9999" = 无数据)
  accuracy: string | null,        // "HIGH" | "MEDIUM" | "LOW"
  pulsesDuration: string | null,  // 脉冲持续时间 (μs)
  pulsesFreq: string | null,      // 脉冲频率 (Hz)
  waveform: string | null,        // 波形类型
  
  // Threat Assessment
  threatScore: number | null,     // 威胁分数 (-1 = 未计算)
  
  // Special Flags
  isUnknownIdentity: boolean,     // 是否为"未知"目标
}
```

**实际示例 (从 API 合并后)**:
```javascript
{
  mmsi: "41200003",
  aisFlag: true,
  vesselType: 70,
  imoNum: "0",
  navStatus: "0",
  cog: 124.8,
  sog: 0.2,
  coord: [23.1862, 119.7894],
  rfFreq: "9999",
  accuracy: "HIGH",
  pulsesDuration: "150",
  pulsesFreq: "3000",
  waveform: "Pulsed",
  threatScore: 85,
  threat: { score: 85 },
  isUnknownIdentity: false
}
```

**数据来源**:
1. `/suspiciousVessels` API → 初始数据
2. `/vesselInfo` API → 合并详细信息
3. `ThreatService` → 计算威胁分数
4. `isUnknownIdentity` → 是否能辨識身分

---

### 2.2 Related Functions for ShipData

#### 2.2.1 Data Normalization

**normalizeShipDetail** (detailPanel.js)
```javascript
/**
 * Normalize raw ship data to standard format
 * @param {object} raw - Raw ship data from API or cache
 * @returns {ShipData | null} - Normalized ship data
 */
const normalizeShipDetail = (raw) => {
  if (!raw) return null;
  const mmsi = raw.mmsi ?? raw.id;
  if (!mmsi) return null;
  
  return {
    mmsi: String(mmsi),
    threatScore: raw.threatScore ?? raw.threat?.score ?? null,
    aisFlag: typeof raw.aisFlag === "boolean" ? raw.aisFlag : null,
    coord: Array.isArray(raw.coord) ? raw.coord : null,
    vesselType: raw.vesselType ?? null,
    imoNum: raw.imoNum ?? null,
    navStatus: raw.navStatus ?? null,
    cog: raw.cog ?? null,
    sog: raw.sog ?? null,
    rfFreq: raw.rfFreq ?? null,
    accuracy: raw.accuracy ?? null,
    pulsesDuration: raw.pulsesDuration ?? null,
    pulsesFreq: raw.pulsesFreq ?? null,
    waveform: raw.waveform ?? null,
    isUnknownIdentity: raw.isUnknownIdentity,
    threat: { score: raw.threatScore ?? raw.threat?.score ?? null }
  };
};
```

**convertSuspiciousToShip** (cardManager.js)
```javascript
/**
 * Convert suspicious vessel API response to ShipData format
 * @param {SuspiciousVessel} vessel - Vessel from /suspiciousVessels API
 * @returns {ShipData} - Minimal ship data for card rendering
 */
const convertSuspiciousToShip = (vessel) => ({
  mmsi: vessel.mmsi,
  threatScore: vessel.threatScore ?? vessel.threat?.score ?? -1,
  aisFlag: vessel.aisFlag,
  coord: vessel.coord,
  vesselType: null,
  imoNum: null,
  navStatus: null,
  cog: null,
  sog: null,
  rfFreq: null,
  accuracy: null,
  pulsesDuration: null,
  pulsesFreq: null,
  waveform: null,
  isUnknownIdentity: vessel.isUnknownIdentity
});
```

#### 2.2.2 Data Access

**getShipData** (main.js)
```javascript
/**
 * Get ship data from cache with normalization
 * @param {string} mmsi - Ship MMSI
 * @returns {ShipData | null} - Normalized ship data or null
 */
const getShipData = (mmsi) => {
  if (!mmsi) return null;
  const normalizedMmsi = String(mmsi);
  const raw = shipDataMap.get(normalizedMmsi) || null;
  return window.DetailPanel?.normalizeShipDetail
    ? window.DetailPanel.normalizeShipDetail(raw)
    : raw;
};
```

#### 2.2.3 Data Mutation

**shipDataMap.set** - 添加/更新船只数据
```javascript
// From suspicious vessel list
shipDataMap.set(vessel.mmsi, convertSuspiciousToShip(vessel));

// From vesselInfo API (merged with existing data)
const merged = { ...ship, ...(shipDetail || {}) };
shipDataMap.set(String(merged.mmsi), merged);

// Manual construction (special cases)
shipDataMap.set(mmsi, {
  mmsi,
  coord: [lat, lng],
  aisFlag: true,
  threatScore: 50,
  // ... other fields
});
```

**shipDataMap.delete** - 删除船只数据
```javascript
// Clean up suspicious vessels before re-rendering
Array.from(shipDataMap.keys()).forEach(mmsi => {
  const ship = shipDataMap.get(mmsi);
  if (ship?.isSuspicious) {
    shipDataMap.delete(mmsi);
  }
});
```

---

### 2.3 Trajectory Data (shipTrajectoryMap)


**用途**: 船只历史轨迹缓存，存储在 `Map<string, Array<NormalizedTrajectoryPoint>>`
**Key**: MMSI (string)
**Value**: 已在第 2 节定义的 `Array<NormalizedTrajectoryPoint>`
**用途**: `shipTrajectoryMap` cache 和所有內部處理

```typescript
interface NormalizedTrajectoryPoint {
  lat: number,              // 從 coord[0] 提取
  lng: number,              // 從 coord[1] 提取
  timestamp: number | null, // Unix timestamp (毫秒或秒)
  hoursAgo: number | null   // 相對於最新點的小時數
}
```

**生成規則**:
```javascript
// 1. 從 API 格式轉換
const point = {
  lat: entry.coord[0],
  lng: entry.coord[1],
  timestamp: new Date(entry.timestamp).getTime(), // ISO string → Unix ms
  hoursAgo: null  // 稍後由 computeHoursAgo() 計算
};

// 2. 計算 hoursAgo (自動檢測單位)
const latestTs = Math.max(...points.map(p => p.timestamp));
const isMilliseconds = latestTs > 1e12;  // 1e12 = 10^12
const divisor = isMilliseconds ? 36e5 : 3600;  // 3.6e6 ms/hr or 3600 s/hr
point.hoursAgo = (latestTs - point.timestamp) / divisor;
```

**排序**: 按 `hoursAgo` 升序 (最新在前: hoursAgo=0)

---

### 2.4 Related Functions for Trajectory Data

#### 2.4.1 Initialization

**TrajectoryUtils.init** (trajectoryUtils.js)
```javascript
/**
 * Initialize trajectory utilities with dependencies
 * @param {object} options - Configuration options
 * @param {string} options.apiBase - API base URL
 * @param {Map} options.cache - shipTrajectoryMap reference
 * @param {object} options.vesselService - VesselService reference
 */
window.TrajectoryUtils.init({
  apiBase: API_BASE,
  cache: shipTrajectoryMap,
  vesselService: window.VesselService
});
```

#### 2.4.2 Data Fetching & Processing

**getTrajectoryEntries** (trajectoryUtils.js)
```javascript
/**
 * Get trajectory entries with auto-fetch and caching
 * @param {string} mmsi - Ship MMSI
 * @param {object} ship - Optional ship object for current position
 * @returns {Promise<Array<NormalizedTrajectoryPoint>>} - Normalized trajectory
 */
const getTrajectoryEntries = async (mmsi, ship = null) => {
  if (!mmsi) return [];
  const key = String(mmsi);
  
  // Return cached if available
  if (config.cache?.has(key)) {
    return config.cache.get(key);
  }
  
  // Fetch from API
  const trackRaw = await config.vesselService.fetchVesselTrajectory(mmsi, config.apiBase);
  if (!trackRaw || !trackRaw.length) return [];
  
  // Normalize points
  const points = trackRaw.map(normalizePoint).filter(Boolean);
  
  // Compute relative time
  const hasHoursAgo = points.some(p => p.hoursAgo !== null);
  if (!hasHoursAgo && points.length > 0) {
    computeHoursAgo(points);
  }
  
  // Add current position if not present
  if (ship?.coord) {
    const [shipLat, shipLng] = ship.coord;
    if (Number.isFinite(shipLat) && Number.isFinite(shipLng)) {
      const hasCurrent = points.some(p => p.hoursAgo === 0);
      if (!hasCurrent) {
        points.push({ lat: shipLat, lng: shipLng, hoursAgo: 0, timestamp: null });
      }
    }
  }
  
  // Sort by hoursAgo (ascending)
  points.sort((a, b) => {
    const aVal = a.hoursAgo ?? Infinity;
    const bVal = b.hoursAgo ?? Infinity;
    return aVal - bVal;
  });
  
  // Cache result
  if (config.cache) {
    config.cache.set(key, points);
  }
  
  return points;
};
```

**normalizePoint** (trajectoryUtils.js)
```javascript
/**
 * Normalize single trajectory point from API format
 * @param {TrajectoryPoint} entry - Raw point from API
 * @returns {NormalizedTrajectoryPoint | null} - Normalized point or null
 */
const normalizePoint = (entry) => {
  if (!entry) return null;
  
  const lat = Number(entry.coord?.[0] ?? entry.lat ?? entry[0]);
  const lng = Number(entry.coord?.[1] ?? entry.lng ?? entry[1]);
  if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
  
  const timestamp = Number(entry.timestamp);
  const hoursAgo = Number(entry.hoursAgo);
  
  return {
    lat,
    lng,
    timestamp: Number.isFinite(timestamp) ? timestamp : null,
    hoursAgo: Number.isFinite(hoursAgo) ? hoursAgo : null,
  };
};
```

**computeHoursAgo** (trajectoryUtils.js)
```javascript
/**
 * Compute hoursAgo for all points based on timestamps
 * Auto-detects milliseconds vs seconds
 * @param {Array<NormalizedTrajectoryPoint>} points - Points to process (mutated in-place)
 */
const computeHoursAgo = (points) => {
  const withTimestamps = points.filter(p => p.timestamp !== null);
  if (withTimestamps.length === 0) return;
  
  const latestTs = Math.max(...withTimestamps.map(p => p.timestamp));
  const isMilliseconds = latestTs > 1e12;
  const divisor = isMilliseconds ? 36e5 : 3600;
  
  points.forEach(point => {
    if (point.timestamp !== null) {
      point.hoursAgo = Math.max(0, (latestTs - point.timestamp) / divisor);
    }
  });
};
```

**findLatestTrajectoryEntry** (trajectoryUtils.js)
```javascript
/**
 * Find the most recent trajectory point
 * @param {Array<NormalizedTrajectoryPoint>} entries - Trajectory entries
 * @returns {NormalizedTrajectoryPoint | null} - Latest point or null
 */
const findLatestTrajectoryEntry = (entries = []) => {
  return entries.find(e => Number.isFinite(e?.hoursAgo)) || entries[0] || null;
};
```

#### 2.4.3 Synchronous Wrapper (main.js)

**getTrajectoryEntries** (main.js)
```javascript
/**
 * Synchronous wrapper for trajectory access
 * Returns cached data only, used by map rendering
 * @param {object} ship - Ship object
 * @returns {Array<NormalizedTrajectoryPoint>} - Cached trajectory or empty array
 */
function getTrajectoryEntries(ship) {
  const mmsi = String(ship?.mmsi);
  if (!mmsi) return [];
  
  // Return cached data synchronously
  if (shipTrajectoryMap.has(mmsi)) {
    return shipTrajectoryMap.get(mmsi);
  }
  
  // If not cached, return empty array (detailPanel.js will fetch async)
  return [];
}
```

---

## 3. 地圖渲染格式 (Leaflet)

**用途**: `drawTrajectory()` 和 `drawPrediction()` 的 polyline

```typescript
type LeafletPoint = [number, number];  // [lat, lng]
```

**轉換**:
```javascript
const trackPoints = trajectoryEntries.map(e => [e.lat, e.lng]);
L.polyline(trackPoints, {...options});
```

---

## 4. 座標格式統一原則

**所有 API 統一使用** `coord: [lat, lng]` 格式：

```javascript
// ✅ 正確: 統一從 coord 提取
const lat = entry.coord[0];
const lng = entry.coord[1];

// ❌ 錯誤: 支持多種格式 (過度防禦)
const lat = entry.coord?.[0] ?? entry.lat ?? entry[0];  // 太複雜
```

**例外情況**:
- 內部標準化後使用 `{lat, lng}` 扁平格式
- Leaflet 渲染使用 `[lat, lng]` 數組格式

**轉換規則**:
```
API Response       → Normalized       → Leaflet
coord: [23, 120]   → {lat: 23, lng: 120}  → [23, 120]
```

---

## 5. 數據流向圖

```
┌─────────────────┐
│  MongoDB        │
│  Taiwan         │
│  Collection     │
└────────┬────────┘
         │ vesselTrack.js 查詢
         ↓
┌─────────────────────────────┐
│ API Response                │
│ [{coord, timestamp, ...}]   │  ← Source of Truth
└────────┬────────────────────┘
         │ TrajectoryUtils.getTrajectoryEntries()
         ↓
┌─────────────────────────────┐
│ normalizePoint()            │
│ - coord[0] → lat            │
│ - coord[1] → lng            │
│ - ISO string → Unix ts      │
└────────┬────────────────────┘
         ↓
┌─────────────────────────────┐
│ computeHoursAgo()           │
│ - 自動檢測 ms/s             │
│ - 計算相對時間              │
└────────┬────────────────────┘
         ↓
┌─────────────────────────────┐
│ shipTrajectoryMap.set()     │
│ Cache: Map<MMSI, Array>     │  ← Cache Layer
└────────┬────────────────────┘
         │
         ├──→ updateMapForShip() → drawTrajectory()
         │
         └──→ getRoutePredictionPoints() → drawPrediction()
```

---

## 5. 關鍵決策記錄

### ✅ 為什麼 API 返回 ISO string？
- **向後兼容**: 現有代碼可能依賴字符串格式
- **人類可讀**: 調試時直接看懂時間
- **標準化**: ISO 8601 是國際標準

### ✅ 為什麼內部轉換為 Unix timestamp？
- **數學運算**: `latestTs - timestamp` 需要數字
- **性能**: 數字比較比字符串快
- **精度保證**: 保留毫秒級精度

### ✅ 為什麼自動檢測 ms/s？
- **容錯**: 處理不同來源的數據
- **魯棒性**: MongoDB 可能存儲秒或毫秒
- **簡單**: 1e12 閾值清晰（2001年後）

### ❌ 不要做的事
1. **不要創建臨時變量再刪除** (`_tsMs` anti-pattern)
2. **不要支持多種調用方式** (`array | object` confusion)
3. **不要手動字符串解析** (`Date.parse()` 不可靠)
4. **不要使用魔法數字** (`minHours > 100`)

---

## 6. 測試數據範例

### 輸入 (API Response)
```javascript
[
  {
    coord: [23.974, 120.973],
    timestamp: "2026-01-30T04:00:00.000Z",
    sog: 10.5,
    cog: 45,
    heading: 47,
    navStatus: 0
  },
  {
    coord: [23.970, 120.970],
    timestamp: "2026-01-30T01:00:00.000Z",  // 3小時前
    sog: 9.8,
    cog: 44,
    heading: 46,
    navStatus: 0
  }
]
```

### 輸出 (Normalized)
```javascript
[
  {
    lat: 23.974,
    lng: 120.973,
    timestamp: 1738210800000,  // 2026-01-30T04:00:00.000Z in ms
    hoursAgo: 0
  },
  {
    lat: 23.970,
    lng: 120.970,
    timestamp: 1738200000000,  // 2026-01-30T01:00:00.000Z in ms
    hoursAgo: 3.0
  }
]
```

### 渲染 (Leaflet)
```javascript
[
  [23.974, 120.973],  // Current position
  [23.970, 120.970]   // 3 hours ago
]
```

---

## 7. Cache 策略

```javascript
// Cache key: MMSI (string)
const key = String(mmsi);

// Cache value: Array<NormalizedTrajectoryPoint>
shipTrajectoryMap.set(key, normalizedPoints);

// Cache hit: 同步返回
if (shipTrajectoryMap.has(key)) {
  return shipTrajectoryMap.get(key);
}

// Cache miss: 異步 fetch
const trackRaw = await vesselService.fetchVesselTrajectory(mmsi);
const normalized = trackRaw.map(normalizePoint);
shipTrajectoryMap.set(key, normalized);
return normalized;
```

**TTL**: 無 (直到頁面刷新)  
**失效**: 手動清除或頁面重載

---

## 8. 錯誤處理

```javascript
// 1. 無效座標 → 過濾掉
if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;

// 2. 無 timestamp → hoursAgo = null
timestamp: Number.isFinite(timestamp) ? timestamp : null

// 3. 空數組 → 返回 []
if (!trackRaw || !trackRaw.length) return [];

// 4. API 錯誤 → fallback 空數組
.catch(() => [])
```

---

## 9. 性能考量

**數組操作順序** (消除重複計算):
```javascript
// ✅ 正確: 一次遍歷
const points = trackRaw
  .map(normalizePoint)    // O(n)
  .filter(Boolean);       // O(n)
computeHoursAgo(points);  // O(n)
points.sort(...);         // O(n log n)

// ❌ 錯誤: 多次遍歷
trackRaw.forEach(e => normalize(e));     // O(n)
trackRaw.forEach(e => compute(e));       // O(n)
trackRaw.forEach(e => addCurrent(e));    // O(n)
```

**內存使用**:
- 每個船最多 ~100 點 × 64 bytes = 6.4 KB
- 100 艘船 = 640 KB (可接受)

---

## 10. 維護檢查清單

當修改代碼時，確認：

- [ ] API 格式沒有改變 (或更新此文檔)
- [ ] `coord[0]` 始終是 latitude
- [ ] `timestamp` 始終是 ISO string
- [ ] 排序始終是 `DESC` (新到舊)
- [ ] 內部格式保持 `{lat, lng, timestamp, hoursAgo}`
- [ ] 沒有引入新的格式變體
- [ ] 所有坐標訪問使用 `coord[0]/coord[1]` 或 `lat/lng`
- [ ] 時間計算使用 `hoursAgo` (不是 `timestamp` 直接比較)

---

**最後更新**: 2026-01-30  
**維護者**: Dev-J Team
