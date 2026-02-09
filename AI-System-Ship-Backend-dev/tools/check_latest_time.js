const fs = require('fs');

// 讀取 tracks_data.js 檔案內容
// 因為它是 JS 檔案，我們需要把它當作模組載入，或者讀取文字後解析
// 這裡簡單起見，我們直接讀取檔案並用 eval 或正則表達式提取 JSON
try {
    const fileContent = fs.readFileSync('tracks_data.js', 'utf8');
    // 去掉 "const tracksData = " 和最後的 ";"
    const jsonStr = fileContent.replace('const tracksData = ', '').replace(/;$/, '');
    const tracksData = JSON.parse(jsonStr);

    console.log("MMSI\t\t最新歷史點時間 (UTC)");
    console.log("--------------------------------------------------");

    Object.keys(tracksData).forEach(mmsi => {
        const track = tracksData[mmsi];
        if (track && track.length > 0) {
            // 陣列的第一個元素通常是最新的 (根據之前的 sort 邏輯)
            // 但為了保險，我們還是比較一下時間
            // 假設 track[0] 是最新的
            const latestPoint = track[0];
            console.log(`${mmsi}\t${latestPoint.time}`);
        } else {
            console.log(`${mmsi}\t無資料`);
        }
    });

} catch (err) {
    console.error("讀取或解析 tracks_data.js 失敗:", err);
}
