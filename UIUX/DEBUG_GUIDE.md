# 追蹤事件列表消失問題 - 調試指南

## 問題描述
建立船舶追蹤事件後，點擊追蹤事件tab，左側清單會消失

## 已添加的調試工具

### 1. 控制台調試函數

在瀏覽器控制台中運行以下命令：

```javascript
// 檢查所有事件
debugAllEvents()

// 檢查區域事件
debugAreaEvent()
```

### 2. 自動調試日誌

打開瀏覽器控制台（F12），執行以下操作時會看到詳細日誌：

#### 當建立追蹤事件時：
- `🚢 [KeepView] 建立船舶追蹤事件`
- `✅ [KeepView] 船舶追蹤事件建立完成，當前 tab: XXX`
- `🔄 [KeepView] 重新渲染追蹤事件列表`

#### 當切換到追蹤事件 tab 時：
- `🔄 [switchStatsTab] 切換到 tracking Tab`
- `📦 [switchStatsTab] events-container 存在: true/false`
- `🔍 [renderTrackingEventsList] 開始渲染追蹤事件列表`
- `📦 [renderTrackingEventsList] eventStorage.events size: X`
- `檢查事件 xxx: type=vessel`
- `📊 [renderTrackingEventsList] 找到 X 個追蹤事件`
- `✅ 已渲染 X 個追蹤事件`

## 測試步驟

1. **打開瀏覽器並按 F12 打開控制台**

2. **加載頁面後，先檢查初始狀態：**
   ```javascript
   debugAllEvents()
   ```
   記錄輸出：區域事件、追蹤事件、RF 事件各有幾個

3. **選擇區域事件**（從左上角下拉選單）
   - 觀察左側是否顯示可疑船隻列表

4. **點擊某個可疑船隻的「建立追蹤」按鈕**
   - 觀察控制台日誌
   - 等待 500ms

5. **再次運行調試命令：**
   ```javascript
   debugAllEvents()
   ```
   - 檢查追蹤事件數量是否增加

6. **點擊右側的「追蹤事件」tab**
   - 觀察控制台日誌
   - 檢查左側是否顯示追蹤事件列表

## 可能的問題和原因

### 情況 1: eventStorage 中沒有追蹤事件
**症狀：** `debugAllEvents()` 顯示追蹤事件: 0

**原因：** 事件創建失敗或沒有正確保存

**檢查：**
- 查看 `🚢 開始建立船舶追蹤事件` 相關日誌
- 查看是否有 `💾 船舶事件已儲存到 eventStorage`

### 情況 2: events-container 找不到
**症狀：** `events-container 存在: false`

**原因：** DOM 結構問題

**檢查：**
- 在控制台運行：`document.querySelector('.events-container')`
- 檢查是否返回 null

### 情況 3: renderTrackingEventsList 沒有被調用
**症狀：** 沒有看到 `🔍 [renderTrackingEventsList] 開始渲染追蹤事件列表`

**原因：** switchStatsTab 沒有正確調用渲染函數

**檢查：**
- 確認是否看到 `🔄 [switchStatsTab] 切換到 tracking Tab`

### 情況 4: 事件類型不正確
**症狀：** `debugAllEvents()` 顯示有事件，但 `type` 不是 'vessel'

**原因：** 事件保存時類型設置錯誤

**檢查：**
- 查看 `debugAllEvents()` 輸出中每個事件的 type

### 情況 5: 渲染後立即被清空
**症狀：** 看到 `✅ 已渲染 X 個追蹤事件`，但列表仍然是空的

**原因：** 某個其他函數在渲染後清空了 events-container

**檢查：**
- 在 `renderTrackingEventsList()` 返回後立即檢查：
  ```javascript
  document.querySelector('.events-container').innerHTML
  ```

## 修改內容

### 1. createVesselEventFromAreaKeepView()
- 添加了對追蹤 tab 的支持
- 當在追蹤 tab 中建立事件時，會自動重新渲染追蹤列表

### 2. renderTrackingEventsList()
- 添加了詳細的調試日誌
- 每個步驟都會輸出到控制台

### 3. switchStatsTab()
- 添加了 events-container 存在性檢查
- 顯示當前內容長度

### 4. debugAllEvents()
- 新增的調試工具
- 列出所有事件及其類型和關鍵屬性

## 下一步

請按照上述測試步驟操作，並將控制台輸出截圖或複製文本發送給我。
