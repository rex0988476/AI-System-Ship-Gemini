# 威脅警示功能規格

## 概述
實作即時威脅警示系統，每10秒自動生成模擬船隻資料，當威脅分數≥70時觸發警示並顯示在事件卡上。

## 核心需求

### 1. 自動生成船隻資料
- **頻率**: 每10秒生成一次
- **資料來源**: 模擬資料（目前無資料庫）
- **生成內容**:
  - MMSI（隨機生成）
  - 座標（海域範圍內隨機）
  - 威脅分數（0-100隨機，30%機率≥70）
  - 船舶名稱
  - AIS狀態
  - 其他船舶資訊

### 2. 威脅警示觸發條件
- **閥值**: 威脅分數 ≥ 70
- **觸發時機**:
  - 新船隻資料生成時
  - 現有船隻分數更新時

### 3. 警示顯示方式
選擇以下一種或多種方式：
- **方案A**: 彈出通知（Toast notification）
  - 顯示位置：右上角
  - 顯示時長：3-5秒
  - 內容：船隻ID + 威脅分數

- **方案B**: 事件卡發亮/閃爍
  - 高威脅事件卡添加閃爍動畫
  - 紅色邊框 + 脈動效果
  - 持續時間：直到用戶點擊查看

- **方案C**: 聲音警報（可選）
  - 播放警示音效

**建議**: 使用方案A + 方案B組合

### 4. 警示資料流程
```
每10秒 → 生成船隻資料 → 檢查威脅分數
    ↓
  ≥70?
    ↓ Yes
自動建立船舶事件 → 添加到事件列表 → 觸發警示動畫 → 顯示通知
    ↓ No
  忽略
```

## 數據結構設計

### 模擬船隻資料結構
```javascript
{
  mmsi: '416' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0'),
  vesselName: generateRandomVesselName(),
  coordinates: generateSeaCoordinate(),
  riskScore: Math.floor(Math.random() * 100),
  aisStatus: Math.random() > 0.5 ? '已開啟' : '未開啟',
  speed: Math.random() * 30,
  course: Math.floor(Math.random() * 360),
  timestamp: new Date().toISOString()
}
```

### 事件資料結構（擴充）
```javascript
{
  id: 'vessel-xxx',
  type: 'vessel',
  mmsi: '416123456',
  riskScore: 85,
  createTime: '14:30',
  alertTime: '14:35',      // 已有
  isAlertActive: true,     // 新增：警示是否激活
  alertViewed: false,      // 新增：用戶是否已查看
  // ... 其他欄位
}
```

## 實作步驟

### Step 1: 建立船隻資料生成器
**檔案**: `UIUX/utils/vesselDataGenerator.js`

```javascript
class VesselDataGenerator {
  constructor() {
    this.vesselNames = ['海龍號', '遠洋之星', '藍鯨', '金剛', '勝利號'];
  }

  generateRandomVessel() {
    const riskScore = this.generateRiskScore();

    return {
      mmsi: this.generateMMSI(),
      vesselName: this.getRandomVesselName(),
      coordinates: this.generateSeaCoordinate(),
      riskScore: riskScore,
      aisStatus: Math.random() > 0.5 ? '已開啟' : '未開啟',
      speed: Math.random() * 30,
      course: Math.floor(Math.random() * 360),
      timestamp: new Date().toISOString(),
      investigationReason: riskScore >= 70 ? this.getHighRiskReason() : '例行監控'
    };
  }

  generateRiskScore() {
    // 30% 機率生成高風險（≥70）
    if (Math.random() < 0.3) {
      return Math.floor(Math.random() * 30) + 70; // 70-100
    }
    return Math.floor(Math.random() * 70); // 0-69
  }

  generateMMSI() {
    return '416' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  }

  getRandomVesselName() {
    return this.vesselNames[Math.floor(Math.random() * this.vesselNames.length)];
  }

  generateSeaCoordinate() {
    const lat = 10 + Math.random() * 15; // 10°N - 25°N
    const lon = 109 + Math.random() * 12; // 109°E - 121°E
    return `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
  }

  getHighRiskReason() {
    const reasons = [
      'AIS 信號異常關閉',
      '航線嚴重偏離',
      '進入禁航區域',
      '異常高速航行',
      '頻繁變更航向'
    ];
    return reasons[Math.floor(Math.random() * reasons.length)];
  }
}

window.vesselDataGenerator = new VesselDataGenerator();
```

### Step 2: 建立威脅警示管理器
**檔案**: `UIUX/utils/threatAlertManager.js`

```javascript
class ThreatAlertManager {
  constructor() {
    this.alertThreshold = 70;
    this.checkInterval = 10000; // 10秒
    this.intervalId = null;
  }

  startMonitoring() {
    console.log('🚨 開始威脅警示監控 (每10秒檢查一次)');

    this.intervalId = setInterval(() => {
      this.checkForThreats();
    }, this.checkInterval);
  }

  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('🛑 停止威脅警示監控');
    }
  }

  checkForThreats() {
    // 生成新船隻資料
    const vesselData = window.vesselDataGenerator.generateRandomVessel();

    console.log(`🔍 檢查船隻: ${vesselData.mmsi}, 威脅分數: ${vesselData.riskScore}`);

    // 如果威脅分數 ≥70，觸發警示
    if (vesselData.riskScore >= this.alertThreshold) {
      this.triggerAlert(vesselData);
    }
  }

  triggerAlert(vesselData) {
    console.log(`🚨 威脅警示！船隻 ${vesselData.mmsi} 威脅分數: ${vesselData.riskScore}`);

    // 1. 建立船舶事件
    const eventId = this.createVesselEvent(vesselData);

    // 2. 顯示通知
    this.showNotification(vesselData, eventId);

    // 3. 事件卡發亮動畫
    this.highlightEventCard(eventId);
  }

  createVesselEvent(vesselData) {
    const eventId = `vessel-${String(++window.eventCounter).padStart(3, '0')}`;

    const eventData = {
      id: eventId,
      type: 'vessel',
      mmsi: vesselData.mmsi,
      vesselName: vesselData.vesselName,
      coordinates: vesselData.coordinates,
      riskScore: vesselData.riskScore,
      aisStatus: vesselData.aisStatus,
      createTime: new Date().toLocaleTimeString('zh-TW', {hour12: false, hour: '2-digit', minute: '2-digit'}),
      status: 'investigating',
      investigationReason: vesselData.investigationReason,
      isAlertActive: true,
      alertViewed: false,
      trackPoints: []
    };

    // 儲存事件（會自動生成 alertTime）
    window.eventStorage.saveEvent(eventId, eventData);

    // 建立事件卡
    if (typeof createEventCard === 'function') {
      createEventCard(eventId, eventData);
    }

    return eventId;
  }

  showNotification(vesselData, eventId) {
    // 建立通知元素
    const notification = document.createElement('div');
    notification.className = 'threat-notification';
    notification.innerHTML = `
      <div class="notification-icon">🚨</div>
      <div class="notification-content">
        <div class="notification-title">高威脅警示</div>
        <div class="notification-text">
          船隻 ${vesselData.mmsi}<br>
          威脅分數: <span style="color: #ef4444; font-weight: bold;">${vesselData.riskScore}</span>
        </div>
      </div>
    `;

    // 添加點擊事件 - 點擊通知跳轉到事件
    notification.onclick = () => {
      const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);
      if (eventCard) {
        eventCard.click();
      }
      notification.remove();
    };

    document.body.appendChild(notification);

    // 3秒後自動消失
    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  highlightEventCard(eventId) {
    setTimeout(() => {
      const eventCard = document.querySelector(`[data-event-id="${eventId}"]`);
      if (eventCard) {
        eventCard.classList.add('alert-active');

        // 10秒後移除閃爍效果
        setTimeout(() => {
          eventCard.classList.remove('alert-active');
        }, 10000);
      }
    }, 100);
  }
}

window.threatAlertManager = new ThreatAlertManager();
```

### Step 3: 添加 CSS 樣式
**檔案**: `UIUX/styles.css`

```css
/* 威脅通知樣式 */
.threat-notification {
  position: fixed;
  top: 20px;
  right: 20px;
  background: linear-gradient(135deg, #ef4444, #dc2626);
  color: white;
  padding: 15px 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(239, 68, 68, 0.5);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  cursor: pointer;
  animation: slideInRight 0.3s ease-out;
  min-width: 280px;
}

.threat-notification:hover {
  transform: translateX(-5px);
  box-shadow: 0 6px 16px rgba(239, 68, 68, 0.6);
}

.threat-notification.fade-out {
  animation: slideOutRight 0.3s ease-in;
}

@keyframes slideInRight {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutRight {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(400px);
    opacity: 0;
  }
}

.notification-icon {
  font-size: 24px;
}

.notification-content {
  flex: 1;
}

.notification-title {
  font-size: 14px;
  font-weight: bold;
  margin-bottom: 4px;
}

.notification-text {
  font-size: 12px;
  opacity: 0.9;
}

/* 事件卡警示動畫 */
.event-card.alert-active {
  animation: alertPulse 1s infinite;
  border: 2px solid #ef4444 !important;
  box-shadow: 0 0 20px rgba(239, 68, 68, 0.6) !important;
}

@keyframes alertPulse {
  0%, 100% {
    box-shadow: 0 0 20px rgba(239, 68, 68, 0.6);
  }
  50% {
    box-shadow: 0 0 30px rgba(239, 68, 68, 0.9);
  }
}
```

### Step 4: 初始化威脅監控
**檔案**: `UIUX/script.js`

在 DOMContentLoaded 中添加：
```javascript
// 初始化威脅警示監控
if (window.threatAlertManager) {
  window.threatAlertManager.startMonitoring();
  console.log('✅ 威脅警示系統已啟動');
}
```

### Step 5: 修改事件卡建立函數
**檔案**: `UIUX/script.js`

在 `createEventCard` 中添加 `data-event-id` 屬性：
```javascript
newCard.setAttribute('data-event-id', eventId);
```

## 測試案例

### 測試 1: 自動生成船隻
- 等待10秒
- 預期: Console 顯示「🔍 檢查船隻...」

### 測試 2: 高威脅警示
- 等待生成威脅分數≥70的船隻
- 預期:
  - ✅ 右上角顯示通知
  - ✅ 新事件卡自動建立
  - ✅ 事件卡閃爍動畫
  - ✅ 點擊通知跳轉到事件

### 測試 3: 低威脅忽略
- 等待生成威脅分數<70的船隻
- 預期: 不觸發警示，不建立事件

### 測試 4: 停止監控
- 調用 `threatAlertManager.stopMonitoring()`
- 預期: 停止生成船隻資料

## 完成標準
- [ ] 每10秒自動生成船隻資料
- [ ] 威脅分數≥70時自動建立事件
- [ ] 顯示右上角通知（3秒自動消失）
- [ ] 事件卡閃爍動畫（10秒）
- [ ] 點擊通知跳轉到事件
- [ ] 自動生成 alertTime
- [ ] Console 有完整日誌
