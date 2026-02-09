const { getDistanceFromLatLonInKm } = require('./geoUtils');

/**
 * 計算定點停留威脅分數
 * @param {Array} historyPoints - 歷史軌跡點 (需按時間倒序排列: 最新 -> 最舊)
 * @param {Object} params - 參數 { speedThreshold, radiusThreshold, t0, t1 }
 * @returns {Object} - 計算結果
 */
function calculateLoiteringScore(historyPoints, params) {
  const { speedThreshold, radiusThreshold, t0, t1, lookBackMinutes } = params;

  if (!historyPoints || historyPoints.length === 0) {
    return { 
      riskScore: 0, 
      startTime: null, 
      loiterTimeMinutes: 0, 
      thresholds: { t1 }, 
      loiterArea: null, 
      message: "No data" 
    };
  }

  const currentPoint = historyPoints[0]; // 最新的點
  const currentTime = new Date(currentPoint.properties.Record_Time).getTime();
  const t0_ms = t0 * 60 * 1000;

  // 1. 取得現在到 T0 時間範圍內的點 (用於計算中心 P)
  // 條件: 時間在 [Now - T0, Now] 且 速度 <= S
  const pointsForCenter = historyPoints.filter(p => {
    const pTime = new Date(p.properties.Record_Time).getTime();
    const pSpeed = p.properties.SOG || 0;
    return (currentTime - pTime <= t0_ms) && (pSpeed <= speedThreshold);
  });

  // 如果這段時間內沒有符合速度門檻的點，表示沒有形成停留中心
  if (pointsForCenter.length === 0) {
    return { 
      riskScore: 0, 
      startTime: null,
      loiterTimeMinutes: 0, 
      thresholds: { t1 }, 
      loiterArea: null, 
      message: "No slow points in T0 window" 
    };
  }

  // 2. 計算停留中心 P (平均座標)
  let sumLat = 0, sumLon = 0;
  pointsForCenter.forEach(p => {
    sumLat += p.properties.Latitude;
    sumLon += p.properties.Longitude;
  });
  const centerLat = sumLat / pointsForCenter.length;
  const centerLon = sumLon / pointsForCenter.length;
  const center = [centerLat, centerLon];

  // 3. 檢查當前點 (Current Point)
  // 條件: 距離中心 P <= R 且 速度 <= S
  const distToCenter = getDistanceFromLatLonInKm(
    currentPoint.properties.Latitude,
    currentPoint.properties.Longitude,
    centerLat,
    centerLon
  );
  const currentSpeed = currentPoint.properties.SOG || 0;

  if (distToCenter > radiusThreshold || currentSpeed > speedThreshold) {
    return { 
      riskScore: 0, 
      startTime: null,
      loiterTimeMinutes: 0, 
      thresholds: { t1 },
      loiterArea: { center: { lat: centerLat, lon: centerLon }, radius: radiusThreshold },
      message: "Current point outside radius or too fast" 
    };
  }

  // 4. 計算停留時間 T_loiter
  // 往回找，直到條件不符 (距離 > R 或 速度 > S)
  // historyPoints 已經是倒序 (最新 -> 最舊)
  let earliestValidTime = currentTime;

  for (const p of historyPoints) {
    const pTime = new Date(p.properties.Record_Time).getTime();
    const pSpeed = p.properties.SOG || 0;
    const pDist = getDistanceFromLatLonInKm(
      p.properties.Latitude,
      p.properties.Longitude,
      centerLat,
      centerLon
    );

    if (pDist <= radiusThreshold && pSpeed <= speedThreshold) {
      earliestValidTime = pTime;
    } else {
      // 一旦中斷，就停止往回找 (因為要求連續)
      // 但要注意，如果只是偶爾跳一個點可能還好? 
      // 題目說 "連續小於等於 S"，所以一旦斷了就停。
      // 另外題目也說 "在此範圍內"，所以距離也要符合。
      // 如果時間差太大 (例如資料中斷)，是否要視為不連續？
      // 這裡暫時只看數據點是否符合條件。
      
      // 優化：如果這個點比 currentTime 還新 (理論上不會，因為是倒序)，就跳過
      if (pTime > currentTime) continue; 
      
      break; 
    }
  }

  const loiterTimeMs = currentTime - earliestValidTime;
  const loiterTimeMinutes = loiterTimeMs / 1000 / 60;

  // 5. 計算分數
  // clamp((T_loiter - T0) / (T1 - T0), 0, 1)
  let score = 0;
  if (loiterTimeMinutes <= t0) {
    score = 0;
  } else if (loiterTimeMinutes >= t1) {
    score = 1;
  } else {
    score = (loiterTimeMinutes - t0) / (t1 - t0);
  }

  return {
    riskScore: parseFloat(score.toFixed(2)),
    startTime: new Date(earliestValidTime).toISOString(),
    loiterTimeMinutes: parseFloat(loiterTimeMinutes.toFixed(2)),
    thresholds: { t1 },
    loiterArea: {
      center: { lat: centerLat, lon: centerLon },
      radius: radiusThreshold
    },
    message: score > 0 ? "Loitering detected" : "Loitering time insufficient"
  };
}

module.exports = calculateLoiteringScore;
