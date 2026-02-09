# 陸地檢測方案

## 問題定義

**需求**: 檢查船只預測位置是否在陸地上，防止不合理的航線預測

**當前狀態**: `routePredictionService.js` 使用簡單的直線外推，不考慮陸地邊界

---

## 方案對比

### 方案 1: Overpass API (在線，免費)

**原理**: 查詢 OpenStreetMap 數據判斷座標是否在陸地多邊形內

**優點**:
- ✅ 免費，無需 API key
- ✅ 數據準確且持續更新
- ✅ 無需本地存儲地理數據

**缺點**:
- ❌ 需要網絡請求 (延遲 ~200ms)
- ❌ 有請求頻率限制
- ❌ 離線環境不可用

**實現**:
```javascript
async function isOnLand(lat, lng) {
  const query = `
    [out:json];
    is_in(${lat},${lng})->.a;
    area.a[natural=coastline];
    out;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  const data = await res.json();
  return data.elements.length > 0;
}
```

---

### 方案 2: Reverse Geocoding API (在線，需付費)

**選項**:
- Google Maps Geocoding API (需要信用卡)
- Mapbox Geocoding API ($0.005/請求)

**優點**:
- ✅ 可靠性高
- ✅ 返回地理類型 (land, water, ocean)

**缺點**:
- ❌ 需要付費
- ❌ 需要 API key 管理
- ❌ 成本隨請求量增長

---

### 方案 3: 簡化邊界多邊形 (離線，推薦)

**原理**: 使用簡化的海岸線 GeoJSON，在瀏覽器內用 Turf.js 做點在多邊形內判斷

**數據源**:
- **Natural Earth** (免費): https://www.naturalearthdata.com/
  - `ne_10m_land.geojson` - 10m 分辨率陸地多邊形
  - `ne_50m_land.geojson` - 50m 分辨率 (更小文件)

**優點**:
- ✅ 完全離線
- ✅ 零成本
- ✅ 響應速度快 (<1ms)
- ✅ 無請求限制

**缺點**:
- ❌ 需要下載 ~2-20MB GeoJSON 文件
- ❌ 首次加載時間較長
- ❌ 精度取決於簡化程度

**實現步驟**:

#### 3.1 下載數據
```bash
cd UIUX_v2/static/data
wget https://github.com/nvkelso/natural-earth-vector/raw/master/geojson/ne_50m_land.geojson
```

#### 3.2 安裝 Turf.js
```html
<!-- index.html -->
<script src="https://cdn.jsdelivr.net/npm/@turf/turf@6/turf.min.js"></script>
```

#### 3.3 創建 LandDetectionService
```javascript
// static/js/services/landDetectionService.js
(function(window) {
    'use strict';

    let landPolygons = null;
    let isLoaded = false;

    const init = async () => {
        if (isLoaded) return;
        
        try {
            const res = await fetch('/static/data/ne_50m_land.geojson');
            const geojson = await res.json();
            landPolygons = geojson;
            isLoaded = true;
            console.log('✅ Land polygons loaded');
        } catch (error) {
            console.error('❌ Failed to load land polygons:', error);
        }
    };

    const isOnLand = (lat, lng) => {
        if (!isLoaded || !landPolygons) {
            console.warn('⚠️ Land polygons not loaded');
            return false; // 默認視為海上
        }

        const point = turf.point([lng, lat]); // Turf 用 [lng, lat]
        
        // 遍歷所有陸地多邊形
        for (const feature of landPolygons.features) {
            if (turf.booleanPointInPolygon(point, feature)) {
                return true;
            }
        }
        
        return false;
    };

    // 批量檢查（用於預測路徑）
    const filterSeaPoints = (points) => {
        if (!isLoaded) return points;
        
        return points.filter(([lat, lng]) => !isOnLand(lat, lng));
    };

    window.LandDetectionService = {
        init,
        isOnLand,
        filterSeaPoints,
    };
})(window);
```

#### 3.4 在 main.js 初始化
```javascript
document.addEventListener("DOMContentLoaded", async () => {
    // ... 現有代碼 ...
    
    // 異步加載陸地數據（不阻塞其他功能）
    if (window.LandDetectionService) {
        window.LandDetectionService.init().catch(console.error);
    }
});
```

#### 3.5 修改 routePredictionService.js
```javascript
const getRoutePredictionPoints = (ship, options = {}) => {
    // ... 現有計算邏輯 ...
    
    const points = [];
    for (let i = 0; i < predictionPointCount; i += 1) {
        const distanceMeters = metersPerMinute * (predictionStepMinutes * i);
        const dLat = (distanceMeters * Math.cos(headingRad)) / 111320;
        const dLng = (distanceMeters * Math.sin(headingRad)) / (111320 * Math.cos(degreesToRadians(lat)));
        const newLat = lat + dLat;
        const newLng = lng + dLng;
        
        // 檢查是否在陸地上
        if (window.LandDetectionService?.isOnLand(newLat, newLng)) {
            console.warn(`⚠️ Prediction point on land: [${newLat}, ${newLng}], stopping prediction`);
            break; // 停止預測
        }
        
        points.push([Number(newLat.toFixed(6)), Number(newLng.toFixed(6))]);
    }

    return points;
};
```

---

### 方案 4: 簡單海域邊界框 (最快實現)

**原理**: 定義台灣海域矩形邊界，超出即視為不合理

**優點**:
- ✅ 實現極簡 (10 行代碼)
- ✅ 零依賴
- ✅ 性能最佳

**缺點**:
- ❌ 精度低，無法檢測複雜海岸線
- ❌ 只適用於特定區域

**實現**:
```javascript
// 台灣海域邊界 (可根據實際業務調整)
const TAIWAN_BOUNDS = {
  north: 26.5,   // 基隆外海
  south: 21.5,   // 恆春外海
  west: 118.0,   // 台灣海峽
  east: 123.0    // 太平洋
};

function isInTaiwanWaters(lat, lng) {
  return lat >= TAIWAN_BOUNDS.south &&
         lat <= TAIWAN_BOUNDS.north &&
         lng >= TAIWAN_BOUNDS.west &&
         lng <= TAIWAN_BOUNDS.east;
}

// 在 routePredictionService.js 中使用
const newLat = lat + dLat;
const newLng = lng + dLng;

if (!isInTaiwanWaters(newLat, newLng)) {
  console.warn(`⚠️ Prediction out of bounds: [${newLat}, ${newLng}]`);
  break;
}
```

---

## 推薦方案

**階段 1 (快速實現)**: 方案 4 - 簡單邊界框
- 立即解決明顯錯誤（如預測到中國內陸）
- 開發成本 5 分鐘

**階段 2 (完整方案)**: 方案 3 - 離線 GeoJSON
- 精確檢測海岸線
- 開發成本 1 小時
- 適合生產環境

**不推薦**: 方案 1/2 (在線 API)
- 除非需要全球範圍且實時更新的數據
- 當前業務聚焦台灣海域，離線方案更優

---

## 性能對比

| 方案 | 響應時間 | 文件大小 | 網絡依賴 | 精度 |
|------|---------|---------|---------|------|
| Overpass API | ~200ms | 0 | ✅ | 最高 |
| Geocoding API | ~100ms | 0 | ✅ | 高 |
| GeoJSON 50m | <1ms | ~2MB | ❌ | 中 |
| GeoJSON 10m | <5ms | ~20MB | ❌ | 高 |
| 邊界框 | <0.1ms | 0 | ❌ | 低 |

---

## 實戰建議

### 對於當前項目 (UIUX_v2)

1. **立即實現**: 方案 4 (邊界框) + console.warn
   - 發現問題但不阻止渲染
   - 收集日誌確認是否真的有船只預測到陸地

2. **觀察數據**:
   ```javascript
   // 在 routePredictionService.js 添加日誌
   console.log('Prediction path:', points.map(p => ({
     lat: p[0], 
     lng: p[1],
     inBounds: isInTaiwanWaters(p[0], p[1])
   })));
   ```

3. **如果發現問題頻繁**: 升級到方案 3
   - 下載 `ne_50m_land.geojson` (~2MB)
   - 集成 Turf.js
   - 修改預測服務

### 數據結構設計

**擴展 NormalizedTrajectoryPoint**:
```typescript
interface NormalizedTrajectoryPoint {
  lat: number,
  lng: number,
  timestamp: number | null,
  hoursAgo: number | null,
  isOnLand?: boolean  // 新增：陸地檢測標記
}
```

**擴展 Prediction Point**:
```typescript
interface PredictionPoint {
  lat: number,
  lng: number,
  timeMinutes: number,     // 距離當前的分鐘數
  isValid: boolean,        // 是否在海上
  stopReason?: string      // 如果 invalid，原因是什麼
}
```

---

## 調試工具

### Console 檢查腳本
```javascript
// 在瀏覽器 Console 中運行
const ship = shipDataMap.get('41200003');
const predictions = window.RoutePredictionService.getRoutePredictionPoints(ship, {
  baseCoords: ship.coords,
  getTrajectoryEntries: () => []
});

predictions.forEach((p, i) => {
  console.log(`Point ${i}:`, {
    coords: p,
    onLand: window.LandDetectionService?.isOnLand(p[0], p[1]),
    inBounds: isInTaiwanWaters(p[0], p[1])
  });
});
```

### 地圖可視化
```javascript
// 在地圖上標記陸地預測點
predictions.forEach(([lat, lng]) => {
  if (window.LandDetectionService?.isOnLand(lat, lng)) {
    L.circleMarker([lat, lng], {
      radius: 5,
      color: 'red',
      fillColor: '#ff0000',
      fillOpacity: 0.8
    }).addTo(mapInstance).bindPopup('⚠️ On Land!');
  }
});
```

---

**總結**: 先用方案 4 快速驗證問題，再根據實際需求決定是否升級到方案 3。不要過度設計，解決真實存在的問題。
