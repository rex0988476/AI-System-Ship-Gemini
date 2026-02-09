const { getDistanceFromLatLonInKm } = require('./geoUtils');

/**
 * 計算走私區域異常開關 AIS 威脅分數
 * @param {Array} historyPoints - 歷史軌跡點 (需按時間倒序排列: 最新 -> 最舊)
 * @param {Object} params - 參數 { smugglingAreas, t, p_free, p_full }
 * @returns {Object} - 計算結果
 */
function calculateAisSwitchScore(historyPoints, params) {
  const { smugglingAreas, t, p_free, p_full } = params;
  const AIS_UPDATE_PERIOD_MIN = 6; // AIS 更新週期 (分鐘)

  if (!historyPoints || historyPoints.length < 2) {
    return { 
      riskScore: 0, 
      missingRatio: 0, 
      missingCountInArea: 0, 
      // missing totalExpectedPoints (not in standard schema)
      // add standard keys
      timeWindow: { startTime: null, endTime: null },
      totalNormalPoints: 0,
      thresholds: { p_free, p_full },
      affectedAreas: [],
      message: "Insufficient data" 
    };
  }

  // 1. 篩選時間範圍內的點
  const latestPoint = historyPoints[0];
  const latestTime = new Date(latestPoint.properties.Record_Time).getTime();
  const startTime = latestTime - (t * 60 * 1000);

  const validPoints = historyPoints.filter(p => {
    const pTime = new Date(p.properties.Record_Time).getTime();
    return pTime >= startTime;
  });

  if (validPoints.length < 2) {
    return { 
      riskScore: 0, 
      timeWindow: { startTime: new Date(startTime).toISOString(), endTime: new Date(latestTime).toISOString() },
      totalNormalPoints: validPoints.length,
      missingCountInArea: 0, 
      missingRatio: 0,
      thresholds: { p_free, p_full },
      affectedAreas: [],
      message: "Insufficient data in time window" 
    };
  }

  const totalNormalPoints = validPoints.length;
  let missingCountInArea = 0;
  
  // 初始化各區域統計
  const areaStats = smugglingAreas.map(area => ({
    area,
    missingCount: 0,
    earliestTime: null,
    totalMissingTime: 0
  }));

  // 2. 遍歷相鄰兩點，計算虛擬點
  for (let i = 0; i < validPoints.length - 1; i++) {
    const pNew = validPoints[i];
    const pOld = validPoints[i+1];

    const tNew = new Date(pNew.properties.Record_Time).getTime();
    const tOld = new Date(pOld.properties.Record_Time).getTime();
    
    // 時間間隔 (分鐘)
    const diffMinutes = (tNew - tOld) / 1000 / 60;

    let virtualPointsCount = Math.floor(diffMinutes / AIS_UPDATE_PERIOD_MIN);
    
    if (virtualPointsCount < 1) virtualPointsCount = 0;
    else virtualPointsCount -= 1; // 扣掉已經存在的 pOld (或 pNew) 的那一個區間份額

    if (virtualPointsCount > 0) {
      // 3. 判斷這些虛擬點是否在走私區域內
      const latNew = pNew.properties.Latitude;
      const lonNew = pNew.properties.Longitude;
      const latOld = pOld.properties.Latitude;
      const lonOld = pOld.properties.Longitude;

      // 檢查每個虛擬點
      for (let k = 1; k <= virtualPointsCount; k++) {
        const ratio = k / (virtualPointsCount + 1);
        const vLat = latOld + (latNew - latOld) * ratio;
        const vLon = lonOld + (lonNew - lonOld) * ratio;
        const vTime = tOld + (tNew - tOld) * ratio;

        // 檢查是否在任何一個走私區域內
        let inAnyArea = false;
        
        areaStats.forEach(stat => {
          const dist = getDistanceFromLatLonInKm(vLat, vLon, stat.area.lat, stat.area.lon);
          if (dist <= stat.area.radius) {
            inAnyArea = true;
            stat.missingCount++;
            stat.totalMissingTime += AIS_UPDATE_PERIOD_MIN;
            
            if (stat.earliestTime === null || vTime < stat.earliestTime) {
              stat.earliestTime = vTime;
            }
          }
        });

        if (inAnyArea) {
          missingCountInArea++;
        }
      }
    }
  }

  // 4. 計算分數與整理結果
  // 公式: 異常 / (正常 + 異常)
  const denominator = totalNormalPoints + missingCountInArea;
  const missingRatio = denominator === 0 ? 0 : missingCountInArea / denominator;

  let riskScore = 0;
  if (missingRatio <= p_free) {
    riskScore = 0;
  } else if (missingRatio >= p_full) {
    riskScore = 1;
  } else {
    riskScore = (missingRatio - p_free) / (p_full - p_free);
  }

  // 整理 affectedAreas
  const affectedAreas = areaStats
    .filter(stat => stat.missingCount > 0)
    .map(stat => {
      const areaDenominator = totalNormalPoints + stat.missingCount;
      const areaRatio = areaDenominator === 0 ? 0 : stat.missingCount / areaDenominator;
      
      return {
        center: { lat: stat.area.lat, lon: stat.area.lon },
        radius: stat.area.radius,
        earliestAnomalyTime: new Date(stat.earliestTime).toISOString(),
        missingCount: stat.missingCount,
        missingRatio: areaRatio,
        totalMissingTimeMinutes: stat.totalMissingTime
      };
    });

  return {
    riskScore: parseFloat(riskScore.toFixed(2)),
    timeWindow: {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(latestTime).toISOString()
    },
    totalNormalPoints,
    missingCountInArea,
    missingRatio: parseFloat(missingRatio.toFixed(4)),
    thresholds: { p_free, p_full },
    affectedAreas,
    message: riskScore > 0 ? "AIS gap detected in smuggling area" : "Normal"
  };
}

module.exports = calculateAisSwitchScore;
