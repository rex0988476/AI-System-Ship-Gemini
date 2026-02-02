# REFACTOR_UIUX.md

目的

本文件提出一套可執行、分段且可回滾的重構計畫，目的是把大型的 `UIUX/script.js` 拆分為責任單一、可測試與易維護的模組，同時解決現有已知問題（例如：歷史軌跡 icon 樣式不一致、Current 點 popup 行為不穩定）。

成功標準

- 所有既有功能在每個分段 PR 完成後仍能通過 smoke test。
- 歷史軌跡顯示預期的三角形 icon（或依專案樣式決定）。
- 點擊 Current 點時穩定顯示 popup。
- 代碼可讀性、可測試性提升；主要 pure functions 有基本 unit tests。

約束與假設

- 優先保留純靜態 HTML + JS 的部署流程（不強制引入 bundler）。
- 採用 ES modules（`<script type="module">`）或短期 global-bridge 方式進行過渡。
- 所有重構以小步驟進行並在每步做 smoke test。

主要模組與檔案結構建議

UIUX/
- map/
  - SeaDotManager.js       # marker lifecycle 與存取（add/update/remove/get）
  - icons.js               # createSeaDotIcon 與各種 icon helper（單一樣式來源）
  - track.js               # 歷史軌跡渲染與管理（render/clear）
- ui/
  - popups.js              # popup HTML 建構與更新
- utils/
  - constants.js           # 常數（type 列舉、顏色、size）
  - dom.js                 # DOM 安全 helper（safeInnerHTML）
- script.js                # 入口（初始化、註冊事件、少量 glue code）
- styles.css / index.html  # 現有檔案，僅在必要時更新

主要模組的 API 契約（範例）

- icons.js
  - createSeaDotIcon(dotData, sizes = {w:14,h:14}, isTrack=false) -> L.DivIcon
    - inputs: dotData { id, lat, lon, type, status, backgroundColor, borderStyle, isTrackPoint }
    - output: Leaflet divIcon（或 HTML string）
    - 行為：若缺少必要欄位回傳預設 icon（不 throw）

- popups.js
  - createRFSignalPopupContent(dotData) -> string
  - updateRFSignalPopupContent(marker, dotData) -> void
    - 行為：統一 popup HTML 建構與更新，避免重新 bind 多次

- SeaDotManager.js
  - class SeaDotManager(map, options)
    - addDot(dotData) -> marker
    - updateDot(id, dotData) -> marker
    - removeDot(id) -> void
    - getMarkerById(id) -> marker | null
    - clearAll() -> void
  - 行為：以 id 做索引管理，內部使用 icons 與 popups

- track.js
  - renderHistoryTrack(points, seaDotManager) -> LayerGroup
  - clearHistoryTrack(layerGroup) -> void

邊緣情況（必須處理）

- dotData 缺少 lat/lon 或 type 為 null
- 重複 add 同一 id（必須 dedupe）
- 多事件同時更新同一 marker（race conditions）
- popup 已存在但內容需更新（應更新內容並 open）
- 歷史軌跡資料量大時效能問題（採用 cluster、canvas 或簡化 marker）

逐步執行計畫（分階段、每步小且可回滾）

階段 0 - 準備
- 建分支：`git checkout -b refactor/uiux-modular`
- 在 repo 建立模組目錄與空檔案（icons.js、popups.js、constants.js），並保留原行為不變。
- 驗證：啟 server、打開頁面，檢查 console。

階段 A - 抽出 icons（Quick win）
- 把現在的 `createSeaDotIcon` 複製到 `UIUX/map/icons.js`（先不改邏輯），export 函式。
- 在 `script.js` 引入並使用 `icons.createSeaDotIcon`。
- commit 與 smoke test。

驗證：頁面行為不變。

階段 B - 讓 track marker 使用 icons（修復方形問題）
- 修改 `createTrackMarker` 改為呼叫 `icons.createSeaDotIcon(dotData, sizes, true)`（或透過參數告知是 track），避免重複 CSS。
- commit 與 smoke test。

驗證：歷史軌跡呈現三角形。

階段 C - 抽出 popups 與改進 popup 行為
- 把 `createRFSignalPopupContent` 移到 `UIUX/ui/popups.js`。
- 在 `createMarker` 改為：若 marker 尚未綁 popup：bindPopup(content)，否則 updateRFSignalPopupContent(marker, dotData) 並 marker.openPopup()。
- commit 與 smoke test。

驗證：點擊 Current 時穩定 open popup，且更新內容時不會重複 bind。

階段 D - 抽出 SeaDotManager
- 建 `UIUX/map/SeaDotManager.js`，封裝 add/update/remove/get 的行為。
- 逐步把 `script.js` 中 marker 相關呼叫替換為 SeaDotManager 的方法（每次替換後 smoke test）。

驗證：功能相同，且 marker 以 id 管理可去重。

階段 E - 測試與 lint
- 新增 `package.json`（devDependencies: eslint, prettier, jest/vitest 等）
- 為 icons 與 popups 加入幾個單元測試（檢查輸出是否包含預期欄位或 class）

階段 F - 提交 PR 與合併
- 每個階段以小分支小 PR 的方式提交，執行 smoke test 與 code review，確定無誤後合併回 `dev`。

具體程式碼範例片段（範本）

- UIUX/map/icons.js（範例骨架）

```javascript
// UIUX/map/icons.js
export function createSeaDotIcon(dotData, sizes = {w:14,h:14}, isTrack = false) {
  const w = sizes.w || 14;
  const h = sizes.h || 14;
  const background = dotData.backgroundColor || '#1e90ff';
  // 如果是 track point 並且希望三角形
  let html = '';
  if (isTrack) {
    // triangle CSS
    html = `<div style="width:0;height:0;border-left:${w/2}px solid transparent;border-right:${w/2}px solid transparent;border-bottom:${h}px solid ${background};"></div>`;
  } else {
    html = `<div style="width:${w}px;height:${h}px;background:${background};border-radius:50%;box-shadow:0 0 4px rgba(0,0,0,0.2);"></div>`;
  }
  return L.divIcon({ html, className: 'sea-dot-icon', iconSize: [w, h], iconAnchor: [w/2, h] });
}
```

- UIUX/ui/popups.js（範例骨架）

```javascript
export function createRFSignalPopupContent(dotData) {
  return `<div class="sea-popup"><h4>${dotData.id || 'Unknown'}</h4><div>Type: ${dotData.type}</div></div>`;
}

export function updateRFSignalPopupContent(marker, dotData) {
  const content = createRFSignalPopupContent(dotData);
  if (marker.getPopup()) {
    marker.setPopupContent(content);
  } else {
    marker.bindPopup(content);
  }
}
```

風險、回滾與測試策略

- 風險：一次大改可能導致事件重複綁定或行為回退。
- 回滾策略：每步小 commit（若出問題，使用 `git revert` 或 reset 到前一 commit）。
- 測試策略：每 PR 執行 smoke test（啟 server，載入頁面，檢查 console，點擊 Current/History），並在完成 icons/popups 抽出後加入單元測試。

下一步建議（你選一項）

- A) 我現在在 `refactor/uiux-modular` 分支做 Quick Win：抽出 icons 並修改 track marker 呼叫（我會 push 分支並回報）。
- B) 我先在 repo 建立模組 skeleton 檔供你審閱（不改變行為）。
- C) 只建立本文件 `REFACTOR_UIUX.md`（我已完成）。


---

文件建立者：自動化重構建議工具
日期：2025-09-15
