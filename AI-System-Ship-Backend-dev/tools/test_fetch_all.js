const http = require('http');
const fs = require('fs');
const calculateLoiteringScore = require('./src/utils/loiteringAlgorithm');
const calculateSpeedDropScore = require('./src/utils/speedDropAlgorithm');
const calculateAisSwitchScore = require('./src/utils/aisSwitchAlgorithm');
const calculateMeanderingScore = require('./src/utils/meanderingAlgorithm');

const PORT = 3000;
const HOST = '140.115.53.51';

// 已知的測試 MMSI
const KNOWN_MMSIS = [41200000, 41200001, 41200002, 41200003, 41200004];

// Helper function to make HTTP requests
function makeRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', (e) => reject(e));

    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

// 轉換 API 格式回 Algorithm 格式
function convertToAlgoFormat(apiData) {
    return apiData.map(p => ({
        properties: {
            Record_Time: p.timestamp,
            Latitude: p.coord[0],
            Longitude: p.coord[1],
            SOG: p.sog,
            COG: p.cog,
            True_Heading: p.heading,
            Navigational_Status: p.navStatus,
            MMSI: p.mmsi // API response might not have MMSI in each point, but we can add it if needed
        }
    }));
}

async function runTests() {
  try {
    console.log('1. 嘗試從 vesselsCoord 取得船隻列表...');
    const vesselsRes = await makeRequest({
      hostname: HOST,
      port: PORT,
      path: '/api/v1/vesselsCoord?lat=23.5&lon=121.0&radius=500',
      method: 'GET'
    });

    let mmsiSet = new Set(KNOWN_MMSIS);
    if (vesselsRes.statusCode === 200 && Array.isArray(vesselsRes.data)) {
      console.log(`vesselsCoord 找到 ${vesselsRes.data.length} 艘船。`);
      vesselsRes.data.forEach(v => mmsiSet.add(v.mmsi));
    }

    const mmsiList = Array.from(mmsiSet).filter(m => m != null);
    console.log('待測試 MMSI 列表:', mmsiList);

    const allTracksData = {};

    for (const mmsi of mmsiList) {
      console.log(`\n==================================================`);
      console.log(`正在分析船隻 MMSI: ${mmsi}`);

      // 2. Fetch Vessel Track
      const trackRes = await makeRequest({
        hostname: HOST,
        port: PORT,
        path: `/api/v1/vesselTrack?mmsi=${mmsi}`,
        method: 'GET'
      });
      
      if (trackRes.statusCode !== 200 || !Array.isArray(trackRes.data)) {
        console.log(`=> 軌跡獲取失敗: ${trackRes.statusCode}`);
        continue;
      }

      const fullHistory = convertToAlgoFormat(trackRes.data);
      console.log(`=> 軌跡點數量: ${fullHistory.length}`);
      
      // 儲存軌跡資料
      if (fullHistory.length > 0) {
          allTracksData[mmsi] = fullHistory.map(p => ({
              lat: p.properties.Latitude,
              lon: p.properties.Longitude,
              time: p.properties.Record_Time,
              sog: p.properties.SOG,
              cog: p.properties.COG
          }));
      }

      if (fullHistory.length === 0) continue;

      // 3. 執行歷史回放分析 (Replay Analysis)
      console.log("=> 開始歷史回放分析...");
      
      let anomaliesFound = 0;
      let maxLoiterTime = 0;
      let maxSpeedDropScore = 0;
      let maxMeanderScore = 0;
      let maxMissingCount = 0;

      // 我們每隔 10 個點檢查一次，或者每個點都檢查 (如果點不多)
      // 241 點很少，可以每個點都檢查
      for (let i = 0; i < fullHistory.length; i++) {
          // 模擬在時間點 i 的情況
          // historyPoints 應該是從 i 開始往回 (倒序)
          // fullHistory 本身是倒序 (最新 -> 最舊) ? 
          // API sort({ 'properties.Record_Time': -1 }) -> 是的，index 0 是最新
          
          // 所以在 index i 的時候，"當下" 是 fullHistory[i]
          // 歷史是 fullHistory.slice(i)
          const currentHistory = fullHistory.slice(i);
          const currentTime = currentHistory[0].properties.Record_Time;

          // --- Loitering ---
          const loiterRes = calculateLoiteringScore(currentHistory, {
              speedThreshold: 2.0,
              radiusThreshold: 0.5,
              t0: 10,
              t1: 60
          });
          if (loiterRes.loiterTimeMinutes > maxLoiterTime) maxLoiterTime = loiterRes.loiterTimeMinutes;

          if (loiterRes.riskScore > 0 || loiterRes.loiterTimeMinutes > 0) {
              console.log(`[Loitering] Time: ${currentTime}, Score: ${loiterRes.riskScore}, Duration: ${loiterRes.loiterTimeMinutes}m`);
              anomaliesFound++;
          }

          // --- Speed Drop ---
          const speedRes = calculateSpeedDropScore(currentHistory, {
              t: 60,
              a_free: 0.005,
              a_full: 0.03
          });
          if (speedRes.riskScore > maxSpeedDropScore) maxSpeedDropScore = speedRes.riskScore;

          if (speedRes.riskScore > 0 || speedRes.dropCount > 0) {
              console.log(`[SpeedDrop] Time: ${currentTime}, Score: ${speedRes.riskScore}, Count: ${speedRes.dropCount}`);
              anomaliesFound++;
          }

          // --- Meandering ---
          const meanderRes = calculateMeanderingScore(currentHistory, {
              t: 60,
              s_crit: 0.5,
              f_crit: 500
          });
          if (meanderRes.totalMeanderingScore > maxMeanderScore) maxMeanderScore = meanderRes.totalMeanderingScore;

          if (meanderRes.riskScore > 0 || meanderRes.totalMeanderingScore > 0) {
              console.log(`[Meandering] Time: ${currentTime}, Score: ${meanderRes.riskScore}, F: ${meanderRes.totalMeanderingScore}`);
              anomaliesFound++;
          }

          // --- AIS Switch ---
          // AIS Switch 比較特別，它看的是一段長區間 (24h)
          // 如果我們每個點都跑，會重複很多。
          // 只要跑一次最新的 (i=0) 其實就涵蓋了過去 24h 的斷點
          // 但如果斷點發生在 25h 前，現在就看不到了。
          // 這裡我們只在 i=0 時跑一次，或者每隔一段時間跑一次。
          if (i === 0) {
             const aisRes = calculateAisSwitchScore(currentHistory, {
                 smugglingAreas: [
                    { lat: 22.6, lon: 120.3, radius: 10 },
                    { lat: 25.1, lon: 121.7, radius: 15 }
                 ],
                 t: 1440,
                 p_free: 0.05,
                 p_full: 0.3
             });
             if (aisRes.missingCountInArea > maxMissingCount) maxMissingCount = aisRes.missingCountInArea;

             if (aisRes.riskScore > 0 || aisRes.missingCountInArea > 0) {
                 console.log(`[AisSwitch] Time: ${currentTime}, Score: ${aisRes.riskScore}, Missing: ${aisRes.missingCountInArea}`);
                 anomaliesFound++;
             }
          }
      }

      console.log(`   Max Loiter Time: ${maxLoiterTime}m`);
      console.log(`   Max Speed Drop Score: ${maxSpeedDropScore}`);
      console.log(`   Max Meander Score: ${maxMeanderScore}`);
      console.log(`   Max Missing AIS: ${maxMissingCount}`);

      if (anomaliesFound === 0) {
          console.log("=> 未發現任何歷史異常。");
      }
    }

    // 輸出軌跡資料到檔案
    const outputPath = 'tracks_data.js';
    const fileContent = `const tracksData = ${JSON.stringify(allTracksData, null, 2)};`;
    fs.writeFileSync(outputPath, fileContent);
    console.log(`\n[Success] 所有船隻軌跡已儲存至 ${outputPath}`);

  } catch (error) {
    console.error('測試執行錯誤:', error);
  }
}

runTests();
