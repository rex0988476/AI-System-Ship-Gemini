/**
 * 計算航速驟降威脅分數
 * @param {Array} historyPoints - 歷史軌跡點 (需按時間倒序排列: 最新 -> 最舊)
 * @param {Object} params - 參數 { t, a_free, a_full }
 * @returns {Object} - 計算結果
 */
function calculateSpeedDropScore(historyPoints, params) {
  const { t, a_free, a_full } = params;

  if (!historyPoints || historyPoints.length < 2) {
    return { 
      riskScore: 0, 
      timeWindow: { startTime: null, endTime: null },
      dropCount: 0,
      totalDropAcceleration: 0,
      thresholds: { a_free, a_full },
      dropEvents: [],
      message: "Insufficient data" 
    };
  }

  // 1. 篩選時間範圍內的點
  // historyPoints[0] 是最新的點，以此為基準往前推 t 分鐘
  const latestPoint = historyPoints[0];
  const latestTime = new Date(latestPoint.properties.Record_Time).getTime();
  const startTime = latestTime - (t * 60 * 1000);

  const validPoints = historyPoints.filter(p => {
    const pTime = new Date(p.properties.Record_Time).getTime();
    return pTime >= startTime;
  });

  if (validPoints.length < 2) {
    let sTimeObj = new Date(startTime);
    let eTimeObj = new Date(latestTime);
    
    // Ensure startTime is valid before calling toISOString
    if (isNaN(sTimeObj.getTime())) sTimeObj = new Date();
    if (isNaN(eTimeObj.getTime())) eTimeObj = new Date();

    return { 
      riskScore: 0, 
      timeWindow: { startTime: sTimeObj.toISOString(), endTime: eTimeObj.toISOString() },
      dropCount: 0,
      totalDropAcceleration: 0,
      thresholds: { a_free, a_full },
      dropEvents: [],
      message: "Insufficient data in time window" 
    };
  }

  // 2. 計算相鄰兩點間的加速度 (Deceleration)
  // validPoints 是倒序 (最新 -> 最舊)
  // 我們要計算 (舊點 - 新點) 的速度差，因為是 "驟降"
  // 其實就是 (v_old - v_new) / dt
  
  let maxRiskScore = 0;
  let dropCount = 0;
  let totalDropAcceleration = 0;
  const dropEvents = [];

  // 遍歷點，計算 i 和 i+1 之間的加速度
  // i 是較新的點，i+1 是較舊的點
  for (let i = 0; i < validPoints.length - 1; i++) {
    const pNew = validPoints[i];
    const pOld = validPoints[i+1];

    const tNew = new Date(pNew.properties.Record_Time).getTime();
    const tOld = new Date(pOld.properties.Record_Time).getTime();
    
    const dt_sec = (tNew - tOld) / 1000; // 秒

    if (dt_sec <= 0) continue; // 避免除以零或時間錯誤

    const vNew = pNew.properties.SOG || 0; // 節 (knots)
    const vOld = pOld.properties.SOG || 0; // 節 (knots)

    // 我們只關心 "驟降" (Speed Drop)，所以只看 vOld > vNew 的情況
    if (vOld > vNew) {
      // 加速度 a (單位: 節/秒)
      const a = (vOld - vNew) / dt_sec;

      // 計算分數
      // clamp((a - a_free) / (a_full - a_free), 0, 1)
      let score = 0;
      if (a <= a_free) {
        score = 0;
      } else if (a >= a_full) {
        score = 1;
      } else {
        score = (a - a_free) / (a_full - a_free);
      }

      // 只要有減速就算一次事件，還是要有分數才算？
      // 題目: "發生驟降的次數"。通常指符合某種定義的驟降。
      // 這裡假設只要 a > 0 就算減速，但如果要算 "驟降"，可能要 a > a_free 才算顯著？
      // 為了資訊完整，我們記錄所有 a > 0 的減速，但在計算分數時只看最大的。
      // 或者依照題目 "發生驟降" 的定義，可能隱含 score > 0。
      // 讓我們寬鬆一點：只要有減速 (vOld > vNew) 且 a > 0 就記錄，但在前端可以自己過濾。
      // 不過為了避免雜訊，我們這裡設定一個極小的門檻，或者乾脆只記錄 score > 0 的事件？
      // 依照題目 "所有發生驟降..."，建議記錄所有 score > 0 的事件比較有意義。
      // 如果 score = 0 (即 a <= a_free)，那只是正常的航行速度波動，不算 "驟降"。
      
      if (score > 0) {
        dropCount++;
        totalDropAcceleration += a;
        
        dropEvents.push({
          location: { lat: pNew.properties.Latitude, lon: pNew.properties.Longitude },
          time: pNew.properties.Record_Time,
          acceleration: parseFloat(a.toFixed(4)),
          score: parseFloat(score.toFixed(2))
        });

        if (score > maxRiskScore) {
          maxRiskScore = score;
        }
      }
    }
  }

  return {
    riskScore: parseFloat(maxRiskScore.toFixed(2)),
    timeWindow: {
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(latestTime).toISOString()
    },
    dropCount,
    totalDropAcceleration: parseFloat(totalDropAcceleration.toFixed(4)),
    thresholds: { a_free, a_full },
    dropEvents, // 包含位置、時間、負加速度
    message: maxRiskScore > 0 ? "Speed drop detected" : "No significant speed drop"
  };
}

module.exports = calculateSpeedDropScore;
