const { getDistanceFromLatLonInKm } = require('./geoUtils');
const makeSmallestEnclosingCircle = require('./smallestEnclosingCircle');

/**
 * 計算航向改變差值 (處理 0/360 邊界問題)
 * 例如: 350度 -> 10度，差值應為 20度，而非 340度
 */
function getAngleDifference(angle1, angle2) {
  let diff = Math.abs(angle1 - angle2);
  if (diff > 180) {
    diff = 360 - diff;
  }
  return diff;
}

/**
 * 計算頻繁改變航向/游蕩行為威脅分數
 * @param {Array} historyPoints - 歷史軌跡點 (需按時間倒序排列: 最新 -> 最舊)
 * @param {Object} params - 參數 { t, s_crit, f_crit }
 * @returns {Object} - 計算結果
 */
function calculateMeanderingScore(historyPoints, params) {
  const { t, s_crit, f_crit, f_trigger = 50 } = params;

  if (!historyPoints || historyPoints.length < 2) {
    return { 
        riskScore: 0,
        analysisPeriod: { start: null, end: null },
        meanderingCount: 0,
        totalMeanderingDuration: 0,
        totalMeanderingScore: 0,
        f_crit: f_crit,
        segmentsDetails: [],
        message: "Insufficient data"
    };
  }

  // 1. 篩選時間範圍內的點
  const latestPoint = historyPoints[0];
  const latestTime = new Date(latestPoint.properties.Record_Time).getTime();
  const startTime = latestTime - (t * 60 * 1000);
  
  const analysisPeriod = {
      start: new Date(startTime).toISOString(),
      end: new Date(latestTime).toISOString()
  };

  // 2. 找出時間窗口內「所有」符合條件的連續區間
  // historyPoints 是倒序 (最新 -> 最舊)
  // 我們要分段收集
  const segments = [];
  let currentSegment = [];

  for (const p of historyPoints) {
    const pTime = new Date(p.properties.Record_Time).getTime();
    if (pTime < startTime) break; // 超出時間範圍

    const speed = p.properties.SOG || 0;
    if (speed > s_crit) {
      currentSegment.push(p);
    } else {
      // 遇到速度不足的點，結束當前區段
      if (currentSegment.length >= 2) {
        segments.push(currentSegment);
      }
      currentSegment = []; // 重置
    }
  }
  // 迴圈結束後，檢查最後一個區段
  if (currentSegment.length >= 2) {
    segments.push(currentSegment);
  }

  if (segments.length === 0) {
    return { 
      riskScore: 0, 
      analysisPeriod,
      meanderingCount: 0,
      totalMeanderingDuration: 0,
      totalMeanderingScore: 0,
      f_crit: f_crit,
      segmentsDetails: [],
      message: "No continuous high-speed track segments found" 
    };
  }

  // 3. 計算每個區段的分數並加總
  let totalRiskScore = 0;
  let totalCoreScore = 0;
  let totalDuration = 0;
  const segmentsDetails = [];
  let validSegmentCount = 0;

  for (const segment of segments) {
    // segment 是倒序的點集合
    let sumDeltaC = 0;
    let sumS = 0;
    
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;
    
    const startPoint = segment[segment.length - 1];
    const endPoint = segment[0];

    let startTimeSeg = startPoint.properties.Record_Time;
    let endTimeSeg = endPoint.properties.Record_Time;

    // 計算 Bounding Box 和 SumS
    for (const p of segment) {
      const lat = p.properties.Latitude;
      const lon = p.properties.Longitude;
      const speed = p.properties.SOG || 0;

      sumS += speed;

      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
    }

    // 計算 SumDeltaC
    for (let i = 0; i < segment.length - 1; i++) {
      const p1 = segment[i];
      const p2 = segment[i+1];
      
      const cog1 = p1.properties.COG || 0;
      const cog2 = p2.properties.COG || 0;

      sumDeltaC += getAngleDifference(cog1, cog2);
    }

    // 計算 B (最小矩形面積)
    const avgLat = (minLat + maxLat) / 2;
    const widthKm = getDistanceFromLatLonInKm(avgLat, minLon, avgLat, maxLon);
    const heightKm = getDistanceFromLatLonInKm(minLat, minLon, maxLat, minLon);
    const widthNm = widthKm / 1.852;
    const heightNm = heightKm / 1.852;
    let areaNm2 = widthNm * heightNm;

    if (areaNm2 === 0) areaNm2 = 0.0001; // 避免除以零

    // 計算 F(c)
    const f_c = (sumDeltaC * sumS) / (areaNm2 * 180);
    
    // 檢查是否超過觸發門檻
    if (f_c <= f_trigger) {
      continue;
    }

    validSegmentCount++;
    const durationMin = (new Date(endTimeSeg) - new Date(startTimeSeg)) / 1000 / 60;
    totalDuration += durationMin;

    // 計算該區段的 Risk Score
    let segScore = f_c / f_crit;
    if (segScore > 1) segScore = 1;

    totalCoreScore += f_c;
    totalRiskScore += segScore; // 這裡直接加總 Risk Score，可能會超過 1

    // 準備計算最小覆蓋圓的點集
    const segmentCoords = segment.map(p => ({
      lat: p.properties.Latitude,
      lon: p.properties.Longitude
    }));
    
    // 計算最小覆蓋圓
    const minCircle = makeSmallestEnclosingCircle(segmentCoords);

    segmentsDetails.push({
      startTime: startTimeSeg,
      endTime: endTimeSeg,
      // 使用最小覆蓋圓取代原本的起終點座標
      location: minCircle ? minCircle : {
          center: { lat: avgLat, lon: (minLon + maxLon) / 2 }, // Fallback
          radius: Math.max(widthKm, heightKm) / 2
      }, 
      durationMinutes: parseFloat(durationMin.toFixed(2)),
      pointCount: segment.length,
      sumDeltaC: parseFloat(sumDeltaC.toFixed(2)),
      sumS: parseFloat(sumS.toFixed(2)),
      boundingBoxArea: parseFloat(areaNm2.toFixed(4)),
      coreScore: parseFloat(f_c.toFixed(2)),
      riskScore: parseFloat(segScore.toFixed(2))
    });
  }

  // 最終分數限制在 0~1 嗎？題目沒說總和要限制，但通常 Risk Score 是 0~1。
  // 如果是 "總和"，那可能會超過 1。
  // 假設我們希望反映 "多次蛇行 = 更危險"，那超過 1 是合理的，或者在最後 clamp 到 1。
  // 這裡先回傳原始總和，並提供一個 normalized 的版本 (max 1)。
  
  const finalRiskScore = totalRiskScore > 1 ? 1 : totalRiskScore;

  return {
    riskScore: parseFloat(finalRiskScore.toFixed(2)),
    analysisPeriod,
    meanderingCount: validSegmentCount,
    totalMeanderingDuration: parseFloat(totalDuration.toFixed(2)),
    totalMeanderingScore: parseFloat(totalCoreScore.toFixed(2)),
    f_crit: f_crit,
    segmentsDetails,
    message: finalRiskScore > 0 ? "Meandering detected" : "No significant meandering"
  };
}

module.exports = calculateMeanderingScore;
