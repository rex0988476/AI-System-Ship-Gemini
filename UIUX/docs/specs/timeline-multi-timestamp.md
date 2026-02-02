# 時間軸多時間點顯示功能規格

## 概述
為事件時間軸添加多時間點顯示功能，支持顯示事件建立時間、警示時間和任務時間，並過濾顯示最近七天內的資訊。

## 核心需求

### 1. 三個時間點定義
- **事件建立時間 (createTime)**: 事件首次建立的時間
- **警示時間 (alertTime)**: 當威脅程度（風險分數）≥70 時觸發的警示時間
- **任務時間 (taskTime/scheduledTime)**: 準備執行行動的排程時間

### 2. 顯示規則
- **預設時間軸**：空白，顯示提示訊息「點擊船舶事件以查看任務時間軸」
- **船舶任務時間軸**：點擊船舶事件後，時間軸顯示該船舶的任務（來自 trackPoints）
- 只顯示 **七天內**（相對當前時間前後七天）的任務節點
- 未來排程的任務也只顯示七天內的
- 時間軸模式：
  - `global` - 全局模式（空白狀態，顯示提示）
  - `vessel` - 船舶模式，顯示單一船舶的任務時間軸

### 3. 警示時間生成規則
- **觸發條件**: 船舶風險分數 (riskScore) ≥ 70
- **生成時機**:
  - 事件建立時，若符合條件立即生成
  - 事件更新時，若風險分數變更需重新評估
- **時間計算**: alertTime = createTime + 5分鐘（模擬延遲警示）

## 數據結構設計

### 事件數據擴充
```javascript
// eventStorage.js - 事件物件結構
{
  id: 'vessel-003',
  type: 'vessel',
  createTime: '12:30',           // 已存在
  alertTime: '12:35',            // 新增：風險≥70時自動生成
  riskScore: 85,
  // ... 其他欄位
}
```

### 時間節點統一結構
```javascript
// 時間軸渲染用的統一時間節點結構
{
  eventId: 'vessel-003',
  timeType: 'create' | 'alert' | 'task',
  timestamp: Date,               // 完整時間戳
  displayTime: '12:30',          // 顯示用時間字串
  title: '🚢 VESSEL-003',
  description: '事件建立' | '高風險警示' | '執行任務',
  icon: '📍' | '⚠️' | '🎯'
}
```

## 實作步驟

### Step 1: 擴充事件數據結構
**檔案**: `UIUX/data/eventStorage.js`

1. 修改 `initializeDefaultEvents()`:
   - 為 vessel-003 (riskScore=85) 添加 `alertTime: '12:35'`
   - vessel-004 (riskScore=28) 不添加 alertTime

2. 修改 `saveEvent()` 和 `updateEvent()`:
   - 自動檢查 riskScore
   - 若 ≥70 且無 alertTime，自動生成

3. 添加輔助函數 `generateAlertTime(createTime)`:
   ```javascript
   generateAlertTime(createTime) {
     const create = new Date(`2024-01-01 ${createTime}`);
     create.setMinutes(create.getMinutes() + 5);
     return create.toLocaleTimeString('zh-TW', {hour12: false, hour: '2-digit', minute: '2-digit'});
   }
   ```

### Step 2: 時間軸渲染邏輯重構
**檔案**: `UIUX/script.js`

**重要：現有函數處理**
- `restoreGlobalTimeline()` - **需要修改**，從硬編碼改為調用新的 `renderTimeline()`
- `addTimelineEvent()` - **需要修改**，改為調用 `renderTimeline()` 重新渲染
- `generateVesselTimeline()` - **保留不變**，專門處理船舶軌跡時間軸

1. 新增函數 `collectTimelineNodes()`:
   ```javascript
   // 從所有事件收集時間節點
   function collectTimelineNodes() {
     const nodes = [];
     const now = new Date();
     const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
     const sevenDaysLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

     // 遍歷所有事件
     eventStorage.getAllEvents().forEach(event => {
       // 1. 建立時間節點
       if (event.createTime) {
         const createTimestamp = parseTimeString(event.createTime);
         if (createTimestamp >= sevenDaysAgo && createTimestamp <= sevenDaysLater) {
           nodes.push({
             eventId: event.id,
             timeType: 'create',
             timestamp: createTimestamp,
             displayTime: event.createTime,
             title: getEventTitle(event),
             description: '事件建立',
             icon: '📍'
           });
         }
       }

       // 2. 警示時間節點（如果存在）
       if (event.alertTime) {
         const alertTimestamp = parseTimeString(event.alertTime);
         if (alertTimestamp >= sevenDaysAgo && alertTimestamp <= sevenDaysLater) {
           nodes.push({
             eventId: event.id,
             timeType: 'alert',
             timestamp: alertTimestamp,
             displayTime: event.alertTime,
             title: getEventTitle(event),
             description: '⚠️ 高風險警示',
             icon: '⚠️'
           });
         }
       }

       // 3. 任務時間節點（從 trackPoints 提取）
       if (event.trackPoints && Array.isArray(event.trackPoints)) {
         // 只處理有任務的軌跡點
         const taskPoints = event.trackPoints
           .filter(point => point.hasTask && point.timestamp)
           .slice(0, 3); // 每個事件最多3個任務節點

         taskPoints.forEach(point => {
           const taskTimestamp = new Date(point.timestamp);
           if (taskTimestamp >= sevenDaysAgo && taskTimestamp <= sevenDaysLater) {
             nodes.push({
               eventId: event.id,
               timeType: 'task',
               timestamp: taskTimestamp,
               displayTime: taskTimestamp.toLocaleTimeString('zh-TW', {hour12: false, hour: '2-digit', minute: '2-digit'}),
               title: getEventTitle(event),
               description: point.type === 'Future' ? '排程任務' : point.type === 'Current' ? '執行任務' : '已完成任務',
               icon: '🎯'
             });
           }
         });
       }
     });

     // 按時間排序（由近到遠）
     return nodes.sort((a, b) => b.timestamp - a.timestamp);
   }
   ```

2. 新增函數 `renderTimeline()`:
   ```javascript
   function renderTimeline() {
     const nodes = collectTimelineNodes();
     const timelineContainer = document.querySelector('.timeline-container');

     timelineContainer.innerHTML = '<div class="timeline-line"></div>';

     nodes.forEach(node => {
       const item = document.createElement('div');
       item.className = 'timeline-item';
       item.setAttribute('data-event-id', node.eventId);
       item.innerHTML = `
         <div class="timeline-time">${node.displayTime}</div>
         <div class="timeline-dot ${node.timeType}-dot"></div>
         <div class="timeline-content">
           <div class="timeline-title">${node.icon} ${node.title}</div>
           <div class="timeline-desc">${node.description}</div>
         </div>
       `;
       timelineContainer.appendChild(item);
     });
   }
   ```

3. 修改現有函數 `restoreGlobalTimeline()`:
   ```javascript
   // 修改前：硬編碼靜態時間軸
   // 修改後：調用新的動態渲染函數
   function restoreGlobalTimeline() {
     renderTimeline(); // 直接調用新函數
   }
   ```

4. 修改現有函數 `addTimelineEvent()`:
   ```javascript
   // 修改前：手動創建並插入時間節點
   // 修改後：重新渲染整個時間軸
   function addTimelineEvent(status, title, description, missionId) {
     renderTimeline(); // 重新渲染以包含新事件

     // 滾動到最新事件
     const timeline = document.querySelector('.mission-timeline');
     if (timeline) {
       timeline.scrollLeft = timeline.scrollWidth;
     }
   }
   ```

5. 初始化時間軸（在頁面載入時調用）:
   ```javascript
   // 在 DOMContentLoaded 或初始化代碼中添加
   document.addEventListener('DOMContentLoaded', () => {
     // ... 其他初始化代碼
     renderTimeline(); // 初始化全局時間軸
   });
   ```

6. 輔助函數:
   ```javascript
   // 解析時間字串為 Date 物件（假設今天）
   function parseTimeString(timeStr) {
     const today = new Date().toISOString().split('T')[0];
     return new Date(`${today} ${timeStr}`);
   }

   // 取得事件標題
   function getEventTitle(event) {
     switch(event.type) {
       case 'vessel': return `🚢 ${event.id.toUpperCase()}`;
       case 'rf': return `📡 ${event.rfId || event.id.toUpperCase()}`;
       case 'area': return `🗺️ ${event.aoiName || event.id.toUpperCase()}`;
       default: return event.id.toUpperCase();
     }
   }
   ```

### Step 3: 樣式調整
**檔案**: `UIUX/styles.css`

添加不同類型時間節點的樣式區分：
```css
/* 建立時間節點 - 藍色 */
.timeline-dot.create-dot {
  background: #3b82f6;
}

/* 警示時間節點 - 紅色 */
.timeline-dot.alert-dot {
  background: #ef4444;
  animation: pulse 2s infinite;
}

/* 任務時間節點 - 綠色 */
.timeline-dot.task-dot {
  background: #10b981;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
```

## 測試案例

### 測試 1: 高風險船舶顯示三個時間節點
- vessel-003 (riskScore=85)
- 預期: 顯示建立時間(12:30)、警示時間(12:35)、任務時間(若有)

### 測試 2: 低風險船舶只顯示建立時間
- vessel-004 (riskScore=28)
- 預期: 只顯示建立時間(10:15)、任務時間(若有)

### 測試 3: 七天過濾
- 建立時間戳超過7天前的事件
- 預期: 不顯示在時間軸上

### 測試 4: 未來任務顯示
- 排程在未來3天的任務
- 預期: 顯示在時間軸上
- 排程在未來10天的任務
- 預期: 不顯示

## 潛在問題與解決方案

### 問題 1: 時間字串格式不一致
- **現象**: createTime 只有時:分，沒有日期
- **解決**: 假設所有時間都是今天，用 `parseTimeString()` 統一處理

### 問題 2: 任務時間數據來源
- **現象**: 任務時間可能在 trackPoints 或 missions 中
- **解決**: 優先從 missions 提取 scheduledTime，其次從 trackPoints 的 Future 類型提取

### 問題 3: 時間節點過多導致 UI 擁擠
- **現象**: 一個事件可能有10+個任務時間
- **解決**:
  - 每個事件最多顯示3個任務節點（最近的3個）
  - 或：任務節點合併顯示為「3個排程任務」

## 完成標準
- [ ] 所有高風險事件 (riskScore≥70) 自動生成 alertTime
- [ ] 時間軸正確顯示 1-3 個時間節點（建立、警示、任務）
- [ ] 只顯示七天內的時間節點（過去+未來）
- [ ] 不同類型時間節點有視覺區分（顏色/圖示）
- [ ] `restoreGlobalTimeline()` 已修改為調用新的 `renderTimeline()`
- [ ] `addTimelineEvent()` 已修改為調用新的 `renderTimeline()`
- [ ] 頁面載入時自動調用 `renderTimeline()` 初始化時間軸
- [ ] 通過所有測試案例

## 修改清單總結

### eventStorage.js (3 處修改)
1. ✅ `initializeDefaultEvents()` - vessel-003 添加 alertTime
2. ✅ `saveEvent()` - 添加自動生成 alertTime 邏輯
3. ✅ `generateAlertTime(createTime)` - 新增輔助函數

### script.js (6 處修改)
1. ✅ `collectTimelineNodes()` - **新增**，收集所有時間節點
2. ✅ `renderTimeline()` - **新增**，渲染時間軸
3. ✅ `restoreGlobalTimeline()` - **修改**，調用 renderTimeline()
4. ✅ `addTimelineEvent()` - **修改**，調用 renderTimeline()
5. ✅ `parseTimeString()` - **新增**，解析時間字串
6. ✅ `getEventTitle()` - **新增**，取得事件標題
7. ✅ DOMContentLoaded - **修改**，添加 renderTimeline() 初始化

### styles.css (4 處新增)
1. ✅ `.create-dot` - 建立時間節點樣式
2. ✅ `.alert-dot` - 警示時間節點樣式
3. ✅ `.task-dot` - 任務時間節點樣式
4. ✅ `@keyframes pulse` - 警示動畫
