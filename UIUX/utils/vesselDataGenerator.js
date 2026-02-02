// VesselDataGenerator - 船隻資料生成器（整合 GFW API）
(function(){
  
  // 座標格式轉換工具函數
  function formatCoordinates(lat, lon) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lonDir = lon >= 0 ? 'E' : 'W';
    const absLat = Math.abs(lat);
    const absLon = Math.abs(lon);
    
    return `${absLat.toFixed(6)}°${latDir}, ${absLon.toFixed(6)}°${lonDir}`;
  }
  
  class VesselDataGenerator {
    constructor() {
      this.vesselNames = [
        '海龍號', '遠洋之星', '藍鯨', '金剛', '勝利號',
        '太平洋', '海鷗號', '順風號', '長城', '和平號',
        '福星號', '龍騰', '雄鷹', '晨曦', '希望'
      ];
      this.apiBaseUrl = 'http://localhost:5000/api';
      this.useRealAPI = true;  // 設定為 false 則使用模擬資料
    }

    /**
     * 取得隨機船隻資料（優先使用 API，失敗則降級到模擬）
     */
    async fetchRandomVessel() {
      if (!this.useRealAPI) {
        console.log('⚙️ 使用模擬資料模式');
        return this.generateRandomVessel();
      }

      try {
        console.log('🌐 呼叫 GFW API...');
        const response = await fetch(`${this.apiBaseUrl}/vessels/random`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 5000  // 5 秒超時
        });

        if (!response.ok) {
          throw new Error(`API 回應錯誤: ${response.status}`);
        }

        const data = await response.json();
        console.log('✅ 成功取得 GFW 船隻資料:', data.mmsi);
        return data;

      } catch (error) {
        console.warn('⚠️ GFW API 呼叫失敗，降級使用模擬資料:', error.message);
        return this.generateRandomVessel();
      }
    }

    /**
     * 生成隨機船隻資料（模擬資料，作為降級方案）
     */
    generateRandomVessel() {
      const riskScore = this.generateRiskScore();
      const coordinates = this.generateSeaCoordinate();

      return {
        mmsi: this.generateMMSI(),
        vesselName: this.getRandomVesselName(),
        coordinates: coordinates.string,
        lat: coordinates.lat,
        lon: coordinates.lon,
        riskScore: riskScore,
        aisStatus: Math.random() > 0.5 ? '已開啟' : '未開啟',
        speed: Math.random() * 30,
        course: Math.floor(Math.random() * 360),
        timestamp: new Date().toISOString(),
        investigationReason: riskScore >= 70 ? this.getHighRiskReason() : '例行監控'
      };
    }

    /**
     * 計算兩點之間的距離（海里）
     * @param {number} lat1 - 第一個點的緯度
     * @param {number} lon1 - 第一個點的經度
     * @param {number} lat2 - 第二個點的緯度
     * @param {number} lon2 - 第二個點的經度
     * @returns {number} 距離（海里）
     */
    calculateDistanceInNauticalMiles(lat1, lon1, lat2, lon2) {
      const R = 6371; // 地球半徑（公里）
      const dLat = this.toRadians(lat2 - lat1);
      const dLon = this.toRadians(lon2 - lon1);
      
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      
      const distanceKm = R * c;
      const distanceNauticalMiles = distanceKm / 1.852; // 1海里 = 1.852公里
      
      return distanceNauticalMiles;
    }

    /**
     * 將角度轉換為弧度
     * @param {number} degrees - 角度
     * @returns {number} 弧度
     */
    toRadians(degrees) {
      return degrees * (Math.PI / 180);
    }

    /**
     * 計算RF信號密度威脅指標（基於最近鄰距離）
     * @param {number} currentLat - 當前RF點緯度
     * @param {number} currentLon - 當前RF點經度
     * @param {Array} allRFPoints - 所有RF點陣列 [{lat, lon}, ...]
     * @returns {number} 威脅指標值 (0-1)
     */
    calculateRFDensityThreat(currentLat, currentLon, allRFPoints = []) {
      const Dstart = 8; // 起始距離閾值（海里）
      let minDistance = Infinity;
      let nearestPointId = null;
      
      console.log(`🔊 RF信號密度威脅計算:`);
      console.log(`  ├─ 當前RF點位置: (${currentLat.toFixed(6)}, ${currentLon.toFixed(6)})`);
      console.log(`  ├─ 距離閾值 Dstart: ${Dstart} 海里`);
      console.log(`  ├─ 總RF點數量: ${allRFPoints ? allRFPoints.length : 0} 個`);
      
      // 如果沒有其他RF點，返回最低威脅
      if (!allRFPoints || allRFPoints.length === 0) {
        console.log(`  ├─ ⚠️ 沒有其他RF點可比較`);
        console.log(`  └─ 威脅指標: 0.0000 (無其他RF點)`);
        return 0;
      }
      
      // 計算與所有其他RF點的距離，找出最近的
      console.log(`  ├─ 計算與所有RF點的距離:`);
      let validPointCount = 0;
      for (let point of allRFPoints) {
        // 跳過自己
        if (point.lat === currentLat && point.lon === currentLon) {
          console.log(`    │  └─ 跳過自己: (${point.lat}, ${point.lon})`);
          continue;
        }
        
        const distance = this.calculateDistanceInNauticalMiles(
          currentLat, currentLon, point.lat, point.lon
        );
        
        console.log(`    │  ├─ RF點 ${point.id || 'unknown'}: (${point.lat.toFixed(3)}, ${point.lon.toFixed(3)}) 距離=${distance.toFixed(3)}海里`);
        
        if (distance < minDistance) {
          minDistance = distance;
          nearestPointId = point.id || 'unknown';
        }
        validPointCount++;
      }
      
      // 如果沒有找到其他點，返回最低威脅
      if (minDistance === Infinity || validPointCount === 0) {
        console.log(`  ├─ ⚠️ 沒有找到有效的其他RF點`);
        console.log(`  └─ 威脅指標: 0.0000 (無有效RF點)`);
        return 0;
      }
      
      console.log(`  ├─ 最近RF點: ${nearestPointId}, 距離: ${minDistance.toFixed(3)} 海里`);
      
      // 應用 clamp((Dstart - d)/(Dstart - 2), 0, 1) 公式
      const threatScore = (Dstart - minDistance) / (Dstart - 2);
      
      // 確保結果在 0-1 範圍內並且是有效數字
      const result = Math.max(0, Math.min(1, threatScore));
      
      console.log(`  ├─ 公式: clamp((${Dstart} - ${minDistance.toFixed(3)})/(${Dstart} - 2), 0, 1)`);
      console.log(`  ├─ 計算: clamp(${threatScore.toFixed(4)}, 0, 1) = ${result.toFixed(4)}`);
      console.log(`  └─ 威脅指標: ${result.toFixed(4)}`);
      
      // 如果計算結果不是有效數字，返回0
      return isNaN(result) ? 0 : result;
    }

    /**
     * 計算走私中心內遺漏AIS占比威脅指標（第二個子公式）
     * @param {Array} trackPoints - 軌跡點陣列
     * @param {Array} missingAISPoints - 遺漏AIS點陣列
     * @returns {number} 威脅指標值 (0-1)
     */
    calculateSmugglingCenterAISRatioThreat(trackPoints, missingAISPoints) {
      // 泰國灣走私活動中心配置
      const smugglingCenter = {
        lat: 12.697111,  // 緯度 (泰國灣中部)
        lon: 100.503556, // 經度 (泰國灣中部)
        radius: 50       // 半徑 50 海里
      };
      
      // 公式參數
      const pfree = 0.05; // 容忍比例
      const pfull = 0.8;  // 滿分比例
      
      // 1. 統計走私中心範圍內的遺漏AIS點數量
      let missingPointsInCenter = 0;
      if (missingAISPoints && missingAISPoints.length > 0) {
        for (let point of missingAISPoints) {
          const distance = this.calculateDistanceInNauticalMiles(
            point.lat, point.lon, smugglingCenter.lat, smugglingCenter.lon
          );
          if (distance <= smugglingCenter.radius) {
            missingPointsInCenter++;
          }
        }
      }
      
      // 2. 統計總綠色歷史點數量（type: 'History'）
      let totalHistoryPoints = 0;
      if (trackPoints && trackPoints.length > 0) {
        for (let point of trackPoints) {
          if (point.type === 'History') {
            totalHistoryPoints++;
          }
        }
      }
      
      // 3. 計算占比 p = 走私中心內遺漏點 / (走私中心內遺漏點 + 總歷史點)
      const denominator = missingPointsInCenter + totalHistoryPoints;
      const p = denominator > 0 ? missingPointsInCenter / denominator : 0;
      
      // 4. 套用公式：clamp((p - pfree)/(pfull - pfree), 0, 1)
      const threatScore = (p - pfree) / (pfull - pfree);
      const clampedScore = Math.max(0, Math.min(1, threatScore));
      
      // 確保結果是有效數字
      const result = isNaN(clampedScore) ? 0 : clampedScore;
      
      // 詳細日誌
      console.log(`📊 走私中心AIS占比威脅計算:`);
      console.log(`  ├─ 走私中心內遺漏AIS點: ${missingPointsInCenter} 個`);
      console.log(`  ├─ 總歷史軌跡點: ${totalHistoryPoints} 個`);
      console.log(`  ├─ 占比 p = ${missingPointsInCenter}/(${missingPointsInCenter}+${totalHistoryPoints}) = ${p.toFixed(4)}`);
      console.log(`  ├─ 公式: clamp((${p.toFixed(4)} - ${pfree})/(${pfull} - ${pfree}), 0, 1) = ${result.toFixed(4)}`);
      console.log(`  └─ 威脅指標: ${result.toFixed(4)}`);
      
      return result;
    }

    /**
     * 取得所有RF信號點的座標
     * @returns {Array} 所有RF點的座標陣列
     */
    getAllRFPoints() {
      const rfPoints = [];
      
      // 從 SeaDotManager 取得所有海域監測點
      if (typeof window !== 'undefined' && window.seaDotManager && window.seaDotManager.seaDots) {
        for (let [id, dotData] of window.seaDotManager.seaDots) {
          if (dotData.lat && dotData.lon) {
            rfPoints.push({
              id: id,
              lat: dotData.lat,
              lon: dotData.lon
            });
          }
        }
      }
      
      return rfPoints;
    }

    /**
     * 計算定點停留時間威脅指標（第三個子公式）
     * @param {Array} trackPoints - 軌跡點陣列
     * @returns {number} 威脅指標值 (0-1)
     */
    calculateLoiteringTimeThreat(trackPoints) {
      // 參數設定（重新調整邏輯）
      // 由於歷史點間距約60-117海里，需要調整停留判定邏輯
      const radiusThreshold = 150.0; // 半徑門檻 r = 150海里（涵蓋整個監控區域，檢測區域性停留）
      const T0 = 720;                // 開始門檻 T₀ = 12小時 = 720分鐘（適應大時間間隔）
      const T1 = 2880;               // 滿分門檻 T₁ = 48小時 = 2880分鐘（長期停留）

      // 如果軌跡點不足，無法計算停留時間
      if (!trackPoints || trackPoints.length < 2) {
        console.log(`⚠️ 軌跡點不足，無法計算定點停留時間`);
        return 0;
      }
      
      // 只使用歷史軌跡點進行停留分析
      const historyPoints = trackPoints.filter(point => point.type === 'History');
      
      if (historyPoints.length < 2) {
        console.log(`⚠️ 歷史軌跡點不足，無法計算定點停留時間`);
        return 0;
      }
      
      console.log(`🎯 開始分析定點停留時間 - 總軌跡點: ${trackPoints.length}, 歷史點: ${historyPoints.length}`);
      
      let maxLoiteringTime = 0; // 最大停留時間（分鐘）
      let currentLoiteringStart = null;
      let currentLoiteringTime = 0;
      
      // 遍歷歷史軌跡點，尋找停留區域
      for (let i = 0; i < historyPoints.length - 1; i++) {
        const currentPoint = historyPoints[i];
        const nextPoint = historyPoints[i + 1];
        
        // 計算兩點間距離
        const distance = this.calculateDistanceInNauticalMiles(
          currentPoint.lat, currentPoint.lon,
          nextPoint.lat, nextPoint.lon
        );
        
        // 計算時間差（分鐘）
        const time1 = new Date(currentPoint.timestamp);
        const time2 = new Date(nextPoint.timestamp);
        const timeDiffMinutes = Math.abs((time2 - time1) / (1000 * 60));
        
        console.log(`📏 點${i} -> 點${i+1}: 距離=${distance.toFixed(3)}海里, 時間差=${timeDiffMinutes.toFixed(1)}分鐘`);
        
        // 檢查是否在停留範圍內（距離小於門檻）
        if (distance <= radiusThreshold) {
          // 開始新的停留區間或延續當前區間
          if (currentLoiteringStart === null) {
            currentLoiteringStart = time1;
            currentLoiteringTime = timeDiffMinutes;
          } else {
            currentLoiteringTime += timeDiffMinutes;
          }
          
          console.log(`🔄 停留中 - 當前停留時間: ${currentLoiteringTime.toFixed(1)}分鐘`);
        } else {
          // 離開停留區域，檢查停留時間
          if (currentLoiteringStart !== null) {
            console.log(`📍 結束停留 - 總停留時間: ${currentLoiteringTime.toFixed(1)}分鐘`);
            maxLoiteringTime = Math.max(maxLoiteringTime, currentLoiteringTime);
            currentLoiteringStart = null;
            currentLoiteringTime = 0;
          }
        }
      }
      
      // 檢查最後一個停留區間
      if (currentLoiteringStart !== null) {
        console.log(`📍 軌跡結束時仍在停留 - 總停留時間: ${currentLoiteringTime.toFixed(1)}分鐘`);
        maxLoiteringTime = Math.max(maxLoiteringTime, currentLoiteringTime);
      }
      
      // 應用公式：clamp((T_loiter - T₀)/(T₁ - T₀), 0, 1)
      const threatScore = (maxLoiteringTime - T0) / (T1 - T0);
      const clampedScore = Math.max(0, Math.min(1, threatScore));
      
      // 確保結果是有效數字
      const result = isNaN(clampedScore) ? 0 : clampedScore;
      
      console.log(`⏱️ 定點停留威脅計算:`);
      console.log(`  ├─ 半徑門檻: ${radiusThreshold} 海里`);
      console.log(`  ├─ 時間門檻: T₀=${T0}分鐘(${(T0/60).toFixed(1)}小時), T₁=${T1}分鐘(${(T1/60).toFixed(1)}小時)`);
      console.log(`  ├─ 最大停留時間: ${maxLoiteringTime.toFixed(1)} 分鐘 (${(maxLoiteringTime/60).toFixed(1)} 小時)`);
      console.log(`  ├─ 公式: clamp((${maxLoiteringTime.toFixed(1)} - ${T0})/(${T1} - ${T0}), 0, 1) = ${result.toFixed(4)}`);
      console.log(`  └─ 威脅指標: ${result.toFixed(4)}`);
      
      return result;
    }

    /**
     * 基於公式計算威脅分數（新版本 - 完整三個子公式）
     * @param {number} lat - RF點緯度
     * @param {number} lon - RF點經度
     * @param {Array} trackPoints - 軌跡點資料（可選）
     * @param {string} vesselType - 船舶類型（可選）
     * @returns {number} 威脅分數 (0-100)
     */
    calculateThreatScoreByFormula(lat, lon, trackPoints = null, vesselType = '貨輪') {
      // 取得所有RF點
      const allRFPoints = this.getAllRFPoints();
      
      // 指標1：RF信號密度威脅（基於最近鄰距離）
      let densityThreat = 0;
      try {
        densityThreat = this.calculateRFDensityThreat(lat, lon, allRFPoints);
        console.log(`🔬 調試：densityThreat = ${densityThreat}, 類型: ${typeof densityThreat}`);
      } catch (error) {
        console.error(`❌ RF密度威脅計算錯誤:`, error);
        densityThreat = 0;
      }
      
      // 指標2：走私中心內遺漏AIS占比威脅
      let aisThreat = 0;
      if (trackPoints && trackPoints.length > 0) {
        try {
          // 計算遺漏AIS點
          const missingAISPoints = this.calculateMissingAISPoints(trackPoints, vesselType);
          aisThreat = this.calculateSmugglingCenterAISRatioThreat(trackPoints, missingAISPoints);
          console.log(`🔬 調試：aisThreat = ${aisThreat}, 類型: ${typeof aisThreat}`);
        } catch (error) {
          console.error(`❌ AIS占比威脅計算錯誤:`, error);
          aisThreat = 0;
        }
      }
      
      // 指標3：定點停留時間威脅
      let loiteringThreat = 0;
      if (trackPoints && trackPoints.length > 0) {
        try {
          loiteringThreat = this.calculateLoiteringTimeThreat(trackPoints);
          console.log(`🔬 調試：loiteringThreat = ${loiteringThreat}, 類型: ${typeof loiteringThreat}`);
        } catch (error) {
          console.error(`❌ 定點停留威脅計算錯誤:`, error);
          loiteringThreat = 0;
        }
      }
      
      // 權重配置：RF密度40% + AIS占比威脅20% + 定點停留40% = 100%
      const weight1 = 40; // RF密度威脅權重
      const weight2 = 20; // 走私中心AIS占比威脅權重
      const weight3 = 40; // 定點停留威脅權重
      
      // 確保計算前的數值有效性
      const validDensityThreat = (typeof densityThreat === 'number' && !isNaN(densityThreat)) ? densityThreat : 0;
      const validAisThreat = (typeof aisThreat === 'number' && !isNaN(aisThreat)) ? aisThreat : 0;
      const validLoiteringThreat = (typeof loiteringThreat === 'number' && !isNaN(loiteringThreat)) ? loiteringThreat : 0;
      
      const finalScore = (validDensityThreat * weight1) + (validAisThreat * weight2) + (validLoiteringThreat * weight3);
      
      // 添加更嚴格的防護措施
      const safeDensityThreat = (typeof densityThreat === 'number' && !isNaN(densityThreat)) ? densityThreat : 0;
      const safeAisThreat = (typeof aisThreat === 'number' && !isNaN(aisThreat)) ? aisThreat : 0;
      const safeLoiteringThreat = (typeof loiteringThreat === 'number' && !isNaN(loiteringThreat)) ? loiteringThreat : 0;
      const safeFinalScore = (typeof finalScore === 'number' && !isNaN(finalScore)) ? finalScore : 0;
      
      console.log(`🔍 威脅分數計算 - 位置: (${lat.toFixed(3)}, ${lon.toFixed(3)})`);
      console.log(`  ├─ RF密度威脅: ${safeDensityThreat.toFixed(3)} × ${weight1}% = ${(safeDensityThreat * weight1).toFixed(1)}`);
      console.log(`  ├─ AIS占比威脅: ${safeAisThreat.toFixed(3)} × ${weight2}% = ${(safeAisThreat * weight2).toFixed(1)}`);
      console.log(`  ├─ 定點停留威脅: ${safeLoiteringThreat.toFixed(3)} × ${weight3}% = ${(safeLoiteringThreat * weight3).toFixed(1)}`);
      console.log(`  └─ 綜合威脅分數: ${safeFinalScore.toFixed(1)} (完整版)`);
      
      return Math.round(safeFinalScore);
    }

    /**
     * 計算遺漏的 AIS 發送點
     * @param {Array} trackPoints - 軌跡點陣列
     * @param {string} vesselType - 船舶類型
     * @returns {Array} 遺漏的 AIS 點陣列
     */
    calculateMissingAISPoints(trackPoints, vesselType) {
      if (!trackPoints || trackPoints.length < 2) {
        return [];
      }

      // AIS 發送間隔配置（秒）- 暫時統一設為 1 小時以減少遺漏點數量
      const aisIntervals = {
        '貨輪': 3600,   // 1小時 = 3600秒 (測試用)
        '漁船': 3600,   // 1小時 = 3600秒 (測試用)
        '客輪': 3600,   // 1小時 = 3600秒 (測試用)
        '油輪': 3600,   // 1小時 = 3600秒 (測試用)
        '軍艦': 3600,   // 1小時 = 3600秒 (測試用)
        '引水船': 3600, // 1小時 = 3600秒 (測試用)
        '搜救船': 3600, // 1小時 = 3600秒 (測試用)
        '執法船': 3600, // 1小時 = 3600秒 (測試用)
        '拖船': 3600,   // 1小時 = 3600秒 (測試用)
        '遊艇': 3600,   // 1小時 = 3600秒 (測試用)
        '未知': 3600    // 1小時 = 3600秒 (測試用)
      };

      // 正常航行速度（節）
      const normalSpeeds = {
        '貨輪': 15,     // 15節 (一般貨輪)
        '漁船': 8,      // 8節 (作業漁船)
        '客輪': 22,     // 22節 (高速客輪)
        '油輪': 14,     // 14節 (大型油輪)
        '軍艦': 25,     // 25節 (軍用艦艇)
        '引水船': 12,   // 12節 (港區作業)
        '搜救船': 30,   // 30節 (高速救援)
        '執法船': 28,   // 28節 (巡邏艇)
        '拖船': 10,     // 10節 (拖曳作業)
        '遊艇': 18,     // 18節 (休閒遊艇)
        '未知': 12      // 預設12節
      };

      const aisInterval = aisIntervals[vesselType] || aisIntervals['未知'];
      const normalSpeed = normalSpeeds[vesselType] || normalSpeeds['未知'];
      
      const missingAISPoints = [];
      
      // 過濾掉未來點，只保留歷史點和當前點用於遺漏 AIS 計算
      const relevantPoints = trackPoints.filter(point => 
        point.type !== 'Future'
      );
      
      console.log(`🔍 開始分析軌跡點的 AIS 間隔...`);
      console.log(`📊 船舶類型: ${vesselType}, AIS間隔: ${aisInterval}秒, 正常速度: ${normalSpeed}節`);
      console.log(`🎯 過濾結果: 總軌跡點 ${trackPoints.length} 個，用於 AIS 分析 ${relevantPoints.length} 個 (排除未來點)`);
      
      // 輸出相關軌跡點的完整信息
      console.log(`📋 用於 AIS 分析的軌跡點列表:`);
      relevantPoints.forEach((point, index) => {
        const coordinates = formatCoordinates(point.lat, point.lon);
        console.log(`  軌跡點 ${index}: ${coordinates} ID=${point.id || 'undefined'} 類型=${point.type || 'undefined'} 時間=${point.timestamp}`);
      });
      
      // 如果相關軌跡點少於2個，無法計算遺漏點
      if (relevantPoints.length < 2) {
        console.log(`⚠️ 相關軌跡點不足2個，無法計算遺漏 AIS 點`);
        return missingAISPoints;
      }
      
      // 遍歷相鄰的相關軌跡點
      for (let i = 0; i < relevantPoints.length - 1; i++) {
        const point1 = relevantPoints[i];
        const point2 = relevantPoints[i + 1];
        
        // 計算時間差（秒）
        const time1 = new Date(point1.timestamp);
        const time2 = new Date(point2.timestamp);
        const timeDiffSeconds = Math.abs((time2 - time1) / 1000);
        
        // 計算應該發送的 AIS 次數
        const expectedAISCount = Math.floor(timeDiffSeconds / aisInterval);
        
        console.log(`📏 軌跡點 ${i} -> ${i + 1}: 時間差 ${timeDiffSeconds}秒, 預期 AIS 次數: ${expectedAISCount}`);
        const coord1 = formatCoordinates(point1.lat, point1.lon);
        const coord2 = formatCoordinates(point2.lat, point2.lon);
        console.log(`📍 座標對比: 點${i}[${coord1}] -> 點${i + 1}[${coord2}]`);
        console.log(`🔍 軌跡點詳情: 點${i} ID=${point1.id || 'undefined'}, 類型=${point1.type || 'undefined'}, 狀態=${point1.status || 'undefined'}`);
        console.log(`🔍 軌跡點詳情: 點${i + 1} ID=${point2.id || 'undefined'}, 類型=${point2.type || 'undefined'}, 狀態=${point2.status || 'undefined'}`);
        
        // 如果應該發送多次 AIS，計算中間點
        if (expectedAISCount > 1) {
          console.log(`🔍 在軌跡點 ${i} -> ${i + 1} 之間應發送 ${expectedAISCount} 次 AIS，需要生成 ${expectedAISCount - 1} 個遺漏點`);
          
          // 計算兩點間的距離和方向
          const distance = this.calculateDistanceInNauticalMiles(
            point1.lat, point1.lon, point2.lat, point2.lon
          );
          
          // 使用正常航行速度估算合理的航行時間
          const expectedTravelTime = (distance / normalSpeed) * 3600; // 轉換為秒
          
          // 生成中間的 AIS 點
          for (let j = 1; j < expectedAISCount; j++) {
            const progress = j / expectedAISCount;
            
            // 線性插值計算位置
            const lat = point1.lat + (point2.lat - point1.lat) * progress;
            const lon = point1.lon + (point2.lon - point1.lon) * progress;
            
            // 計算時間戳（基於正常航行速度）
            const timeOffset = expectedTravelTime * progress;
            const timestamp = new Date(time1.getTime() + timeOffset * 1000);
            
            missingAISPoints.push({
              id: `missing_ais_${point1.id}_${j}`,
              lat: parseFloat(lat.toFixed(6)),
              lon: parseFloat(lon.toFixed(6)),
              timestamp: timestamp.toISOString(),
              type: 'Missing_AIS',
              status: 'No AIS',
              estimatedSpeed: normalSpeed,
              sourcePoints: [point1.id, point2.id],
              intervalIndex: j,
              totalIntervals: expectedAISCount,
              reason: `AIS應每${aisInterval}秒發送一次，但在此期間未收到信號`
            });
          }
        }
      }
      
      console.log(`📡 計算完成：發現 ${missingAISPoints.length} 個遺漏的 AIS 發送點`);
      return missingAISPoints;
    }

    /**
     * 生成威脅分數 (舊版本 - 保留向後兼容)
     */
    generateRiskScore() {
      // 30% 機率生成高風險（≥70）
      if (Math.random() < 0.3) {
        return Math.floor(Math.random() * 30) + 70; // 70-100
      }
      return Math.floor(Math.random() * 70); // 0-69
    }

    /**
     * 生成隨機 MMSI
     */
    generateMMSI() {
      return '416' + Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
    }

    /**
     * 隨機選擇船舶名稱
     */
    getRandomVesselName() {
      return this.vesselNames[Math.floor(Math.random() * this.vesselNames.length)];
    }

    /**
     * 生成海域座標
     */
    generateSeaCoordinate() {
      const lat = 10 + Math.random() * 15; // 10°N - 25°N
      const lon = 109 + Math.random() * 12; // 109°E - 121°E

      return {
        lat: lat,
        lon: lon,
        string: `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`
      };
    }

    /**
     * 取得高風險原因
     */
    getHighRiskReason() {
      const reasons = [
        'AIS 信號異常關閉',
        '航線嚴重偏離',
        '進入禁航區域',
        '異常高速航行',
        '頻繁變更航向',
        'RF 信號異常',
        '未經授權進入管制區'
      ];
      return reasons[Math.floor(Math.random() * reasons.length)];
    }

    /**
     * 取得一般風險原因
     */
    getNormalRiskReason() {
      const reasons = [
        '例行監控',
        '定期巡查',
        '航線檢查',
        '區域巡邏',
        '常規追蹤'
      ];
      return reasons[Math.floor(Math.random() * reasons.length)];
    }

    /**
     * 根據 MMSI 生成完整船舶資料
     * @param {string} mmsi - 船舶的 MMSI 識別碼
     * @param {Object} options - 可選參數 {lat, lon, useFormula}
     * @returns {Object} 包含完整船舶資訊的物件
     */
    generateVesselDataByMMSI(mmsi, options = {}) {
      // 如果提供了座標且要求使用公式，則使用新的計算方式
      let riskScore;
      let coordinates;
      
      if (options.lat && options.lon && options.useFormula) {
        coordinates = {
          lat: options.lat,
          lon: options.lon,
          string: `${options.lat.toFixed(3)}°N, ${options.lon.toFixed(3)}°E`
        };
        riskScore = this.calculateThreatScoreByFormula(options.lat, options.lon);
      } else {
        coordinates = this.generateSeaCoordinate();
        riskScore = this.generateRiskScore(); // 使用舊的隨機方式
      }
      const aisStatus = Math.random() > 0.5 ? '已開啟' : '未開啟';
      const speed = (Math.random() * 30).toFixed(1); // 航速 0-30 節
      const course = Math.floor(Math.random() * 360); // 航向 0-359 度

      // 生成船隻類型
      const vesselTypes = ['貨輪', '漁船',];
      const vesselType = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];

      // 生成軌跡點數據（模擬歷史航跡）
      const trackPoints = this.generateTrackPoints(coordinates.lat, coordinates.lon, 5);

      return {
        mmsi: mmsi,
        vesselName: this.getRandomVesselName(),
        vesselType: vesselType,
        coordinates: coordinates.string,
        lat: coordinates.lat,
        lon: coordinates.lon,
        threatScore: riskScore,
        aisStatus: aisStatus,
        speed: parseFloat(speed),
        course: course,
        timestamp: new Date().toISOString(),
        trackPoints: trackPoints,
        // 如果威脅分數高，自動生成警示時間
        alertTime: riskScore >= 70 ? this.generateAlertTime() : null
      };
    }

    /**
     * 生成軌跡點（模擬船隻移動歷史）
     * @param {number} currentLat - 當前緯度
     * @param {number} currentLon - 當前經度
     * @param {number} count - 要生成的軌跡點數量
     */
    generateTrackPoints(currentLat, currentLon, count = 5) {
      const trackPoints = [];
      let lat = currentLat;
      let lon = currentLon;

      // 從當前位置往回推算歷史位置
      for (let i = count - 1; i >= 0; i--) {
        // 每個點相對於前一個點有輕微的隨機偏移
        lat += (Math.random() - 0.5) * 0.1; // 緯度偏移
        lon += (Math.random() - 0.5) * 0.1; // 經度偏移

        const timestamp = new Date(Date.now() - i * 3600000); // 每小時一個點
        trackPoints.push({
          lat: parseFloat(lat.toFixed(3)),
          lon: parseFloat(lon.toFixed(3)),
          timestamp: timestamp.toISOString(),
          speed: parseFloat((Math.random() * 30).toFixed(1)), // 轉換為數字
          course: Math.floor(Math.random() * 360)
        });
      }

      return trackPoints;
    }

    /**
     * 生成警示時間（當前時間 + 5分鐘）
     */
    generateAlertTime() {
      const now = new Date();
      const alertTime = new Date(now.getTime() + 5 * 60000); // 5分鐘後
      return alertTime.toLocaleTimeString('zh-TW', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit'
      });
    }
  }

  // 暴露全局實例
  window.vesselDataGenerator = new VesselDataGenerator();
  console.log('✅ VesselDataGenerator 已初始化');
})();
