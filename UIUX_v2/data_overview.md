UIUX v2 資料與系統概覽

目的
- 提供 UIUX_v2 的資料結構（schema）與系統執行時資料容器的對照
- 方便開發者理解資料從 API 到 UI 的流向

資料結構定義（Schema）
- 檔案：`UIUX_v2/static/js/dataStructures/uiuxDataSchema.js`
- 核心結構：
  - `region`
  - `vessels[]`
  - `stats`
- `vessels[]` 重要欄位：
  - 基本資料：`mmsi`、`vesselType`、`aisFlag`、`status`、`coord`
  - 航行資料：`imoNum`、`navStatus`、`cog`、`sog`
  - RF 資料：`rfFreq`、`accuracy`、`pulsesDuration`、`pulsesFreq`、`waveform`
  - 威脅資料：`threatScore`、`threatDetails`
  - 航跡：`trajectory[]`
  - 派遣任務：`dispatch`

執行時資料容器（Runtime）
- 檔案：`UIUX_v2/static/js/main.js`
- 主要容器：
  - `shipDataMap`：MMSI -> 船舶資料（主資料表）
  - `trackedShipIds` / `dispatchedShipIds`：追蹤/派遣狀態集合
  - `dispatchMissions`：派遣任務清單（記憶體）
  - `cardDataMap`：卡片 DOM -> 資料映射
- UI 容器引用：
  - `shipListContainers` / `trackingListContainer` / `dispatchListContainer`

資料流向（API -> UI）
1) `VesselService.initShipData` 取得船舶資料並寫入 `shipDataMap`
2) `ThreatService.fetchBatchThreatScores` 補上 `threatScore`
3) UI 讀取 `shipDataMap` 更新列表與詳情視圖
4) `ThreatService.fetchThreatDetails` 取得威脅細節，對齊 `threatDetails` 結構
5) `ThreatDetail` 顯示威脅詳情（讀 `ship.threatDetails` 或 API 回傳的 `details.threatDetails`）

整合原則
- UI 只讀取 schema 定義的欄位
- Service 層負責正規化（normalize）API 回傳
- 避免在 UI 層做結構猜測或補丁
