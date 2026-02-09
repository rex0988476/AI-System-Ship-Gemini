基於現有信息，我理解您的需求是：盤點專案中所有 fallback（`||`/`??`/`typeof` 等），找出那些不必要或掩蓋問題的 fallback。請確認我的理解是否準確？

**Linus式問題分解思考**

**第一層：資料結構分析**  
- 核心資料：ship / threat / region / dispatch  
- fallback 多數在 UI 層掩蓋缺資料

**第二層：特殊情況識別**  
- `|| 0` / `|| "-"` 會把錯誤吞掉  
- 多來源合併（mission/ship）讓資料來源不明

**第三層：複雜度審查**  
- fallback 分散，等於在 UI 層做資料修復

**第四層：破壞性分析**  
- 直接移除可能讓 UI 空白  
- 但能暴露真正資料錯誤

**第五層：實用性驗證**  
- 真問題：目前 fallback 太多，讓錯誤變成正常值

【核心判斷】  
✅ 值得做：需要清掉不必要 fallback，避免掩蓋資料錯誤。

【關鍵洞察】  
- 資料結構：fallback 應集中在資料標準化層  
- 複雜度：UI 層 fallback 是技術債  
- 風險點：移除會暴露上游資料問題

【Linus式方案】  
1. 先盤點所有 fallback  
2. 分類：顯示 fallback vs 資料 fallback  
3. 移除「資料 fallback」，保留必要的顯示 fallback  
4. 缺值就讓錯誤曝光

---

**目前掃到的 fallback（重點清單）**

**高風險 / 掩蓋錯誤**  
- `UIUX_v2/static/js/services/threatService.js`：`riskScore * weight || 0`  
- `UIUX_v2/static/js/main.js`：區域搜尋默認值 `lat/lon/radius`  

**中風險 / 資料來源混亂**  
- `UIUX_v2/static/js/ui/cardManager.js`：`mission?.x || ship.x || "預設"`  
- `UIUX_v2/static/js/ui/detailPanel.js`：多層 `vesselInfo?.x || ship.x || "-"`

**低風險 / 純 UI 顯示**  
- `UIUX_v2/static/js/ui/threatDetail.js`：`"-"` / `0` 顯示補值  
- `UIUX_v2/static/js/ui/mapManager.js`：tooltip 文字 fallback

**明顯錯誤**  
- `UIUX_v2/static/js/dataStructures/uiuxDataSchema.js:11`  
  `aisFlag: true || false` 永遠是 `true`
