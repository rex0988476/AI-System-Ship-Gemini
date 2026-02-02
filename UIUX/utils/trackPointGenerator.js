/**
 * TrackPointGenerator - 統一的軌跡點生成與管理器
 *
 * 用途：
 * - 生產環境：從資料庫/API 取得真實軌跡資料
 * - 開發環境：提供模擬資料用於測試
 *
 * 設計原則：
 * - 優先使用真實資料（資料庫 → GFW API）
 * - 開發模式才使用模擬資料
 * - 統一的資料格式輸出
 */
(function() {
  class TrackPointGenerator {
    constructor() {
      // 開發模式標記（預設為 true，未來接上資料庫後改為 false）
      this.devMode = true;

      // GFW API 基礎 URL
      this.gfwApiBaseUrl = 'http://localhost:5000/api';

      // 軌跡點緩存 - 確保座標一致性
      this.trackPointsCache = new Map();

      // 模擬資料模板（泰國 → 台灣的真實航線）
      this.mockTemplates = {
        fishing: [
          { lat: 13.065024737368468, lon: 100.88090895915349, status: 'No AIS', type: 'History' },
          { lat: 13.000274575678905, lon: 100.63231885460398, status: 'AIS', type: 'History' },
          { lat: 12.816402143655235, lon: 100.5121559365818, status: 'AIS', type: 'History' },
          { lat: 12.571080679019152, lon: 100.50425939609092, status: 'AIS', type: 'History' },
          { lat: 12.324903411797516, lon: 100.50218669608854, status: 'AIS', type: 'History' },
          { lat: 12.079209540435095, lon: 100.53994443783212, status: 'AIS', type: 'History' },
          { lat: 11.838564979506009, lon: 100.61532618471438, status: 'AIS', type: 'History' },
          { lat: 11.595921651696361, lon: 100.6995829893499, status: 'AIS', type: 'History' },
          { lat: 11.357115194893014, lon: 100.77116570550932, status: 'AIS', type: 'History' },
          { lat: 11.113960749210412, lon: 100.83891824077482, status: 'AIS', type: 'History' },
          { lat: 10.8673633245079, lon: 100.89517763508664, status: 'AIS', type: 'History' },
          { lat: 10.624637775543771, lon: 100.95295236414975, status: 'AIS', type: 'History' },
          { lat: 10.386668619906004, lon: 101.00788406433297, status: 'AIS', type: 'History' },
          { lat: 10.153428941718284, lon: 101.08527123008167, status: 'AIS', type: 'History' },
          { lat: 9.919501284560454, lon: 101.14142595014616, status: 'AIS', type: 'History' },
          { lat: 9.686552954112068, lon: 101.249610777446, status: 'AIS', type: 'History' },
          { lat: 9.453197432694445, lon: 101.35121818466139, status: 'AIS', type: 'History' },
          { lat: 9.241517555306238, lon: 101.47854801642463, status: 'AIS', type: 'History' },
          { lat: 9.044925821306041, lon: 101.63235660176852, status: 'AIS', type: 'History' },
          { lat: 8.871288743941548, lon: 101.79989808724271, status: 'AIS', type: 'History' },
          { lat: 8.708429323113009, lon: 101.98117253242822, status: 'No AIS', type: 'History' },
          { lat: 8.280283102901367, lon: 102.31076272747136, status: 'AIS', type: 'History' },
          { lat: 7.908630578369372, lon: 102.68979130883962, status: 'AIS', type: 'History' },
          { lat: 7.699107852709557, lon: 103.1580781209581, status: 'AIS', type: 'History' },
          { lat: 7.656917520404703, lon: 103.67168887831085, status: 'AIS', type: 'History' },
          { lat: 7.670527763959799, lon: 104.18392641721015, status: 'AIS', type: 'History' },
          { lat: 7.686859486142251, lon: 104.70028382250284, status: 'AIS', type: 'History' },
          { lat: 7.700468772482115, lon: 105.21664126993089, status: 'AIS', type: 'History' },
          { lat: 7.813408916041465, lon: 105.72063906987891, status: 'AIS', type: 'History' },
          { lat: 8.031038285117381, lon: 106.19305120263223, status: 'AIS', type: 'History' },
          { lat: 8.26485976562018, lon: 106.64349063074788, status: 'AIS', type: 'History' },
          { lat: 8.55286733034221, lon: 107.07745058407386, status: 'AIS', type: 'History' },
          { lat: 8.862368303516716, lon: 107.48943789229526, status: 'AIS', type: 'History' },
          { lat: 9.171608819247808, lon: 107.91790468128688, status: 'AIS', type: 'History' },
          { lat: 9.46432529073659, lon: 108.32989200636246, status: 'AIS', type: 'History' },
          { lat: 9.753328313719159, lon: 108.76203689205124, status: 'AIS', type: 'History' },
          { lat: 9.991188185339132, lon: 109.22168277370157, status: 'AIS', type: 'History' },
          { lat: 10.277783068609828, lon: 109.64465641521295, status: 'AIS', type: 'History' },
          { lat: 10.585717713716969, lon: 110.06213688287559, status: 'AIS', type: 'History' },
          { lat: 10.91426743488117, lon: 110.46481325514617, status: 'AIS', type: 'History' },
          { lat: 11.219539201383867, lon: 110.88169816961447, status: 'AIS', type: 'History' },
          { lat: 11.583010239082498, lon: 111.25248684400674, status: 'AIS', type: 'Current' },
          { lat: 11.932573485988403, lon: 111.63151512843621, status: 'AIS', type: 'Future' },
          { lat: 12.303241453667606, lon: 111.994063924348039, status: 'AIS', type: 'Future' },
          { lat: 12.662152122618157, lon: 112.372582797518023, status: 'AIS', type: 'Future' },
          { lat: 13.021062791568709, lon: 112.751101670687994, status: 'AIS', type: 'Future' },
        ],
        cargo: [
          { lat: 13.079972, lon: 100.881889, status: 'AIS', type: 'History' },
          { lat: 12.97356780985889, lon: 100.54796015066181, status: 'AIS', type: 'History' },
          { lat: 12.627365165638585, lon: 100.5183255489848, status: 'AIS', type: 'History' },
          { lat: 12.294899757342149, lon: 100.63181824151971, status: 'AIS', type: 'History' },
          { lat: 11.959388784241828, lon: 100.73584594897854, status: 'AIS', type: 'History' },
          { lat: 11.624033620715302, lon: 100.8408536314547, status: 'AIS', type: 'History' },
          { lat: 11.290293043547429, lon: 100.95037637682013, status: 'AIS', type: 'History' },
          { lat: 10.950410139667289, lon: 101.04147669607556, status: 'AIS', type: 'History' },
          { lat: 10.61370150020552, lon: 101.14027687780214, status: 'AIS', type: 'History' },
          { lat: 10.276384320786649, lon: 101.23959290101489, status: 'AIS', type: 'History' },
          { lat: 9.945337945778036, lon: 101.35912969606814, status: 'AIS', type: 'History' },
          { lat: 9.632287811383744, lon: 101.51504149771144, status: 'AIS', type: 'History' },
          { lat: 9.316768552457347, lon: 101.66819373134327, status: 'AIS', type: 'History' },
          { lat: 9.00675534249025, lon: 101.83129364636173, status: 'AIS', type: 'History' },
          { lat: 8.708980846830958, lon: 102.01497576722561, status: 'No AIS', type: 'History' },
          { lat: 8.236609309971005, lon: 102.5366310292528, status: 'AIS', type: 'History' },
          { lat: 7.835845713410455, lon: 103.11140299233783, status: 'AIS', type: 'History' },
          { lat: 7.457628329258875, lon: 103.70157653136624, status: 'AIS', type: 'History' },
          { lat: 7.100633868023333, lon: 104.30462496420537, status: 'AIS', type: 'History' },
          { lat: 7.032230328649701, lon: 105.00267803367264, status: 'AIS', type: 'History' },
          { lat: 7.235773141144987, lon: 105.67856270607956, status: 'AIS', type: 'History' },
          { lat: 7.605449764946292, lon: 106.28065290350045, status: 'AIS', type: 'History' },
          { lat: 7.979300897444996, lon: 106.87842685916733, status: 'AIS', type: 'History' },
          { lat: 8.36958795786419, lon: 107.46668599882994, status: 'AIS', type: 'History' },
          { lat: 8.779606461892143, lon: 108.0425362884556, status: 'AIS', type: 'History' },
          { lat: 9.196068638831276, lon: 108.61429142368263, status: 'AIS', type: 'History' },
          { lat: 9.609274284007839, lon: 109.1880940674801, status: 'AIS', type: 'History' },
          { lat: 10.004053265017374, lon: 109.77607205868364, status: 'AIS', type: 'History' },
          { lat: 10.48668008138099, lon: 110.2909514532092, status: 'AIS', type: 'History' },
          { lat: 10.945439335635449, lon: 110.83386503799089, status: 'AIS', type: 'History' },
          { lat: 11.424433821583277, lon: 111.3552892345447, status: 'AIS', type: 'History' },
          { lat: 11.906593207781603, lon: 111.86725860015174, status: 'AIS', type: 'History' },
          { lat: 12.378587261222078, lon: 112.38653028623536, status: 'AIS', type: 'History' },
          { lat: 12.880028572978512, lon: 112.89285140752781, status: 'AIS', type: 'History' },
          { lat: 13.346365161153159, lon: 113.42666419107641, status: 'AIS', type: 'History' },
          { lat: 13.843548982024831, lon: 113.90005561847288, status: 'AIS', type: 'History' },
          { lat: 14.393700198895079, lon: 114.35816488660092, status: 'AIS', type: 'History' },
          { lat: 14.98008563349693, lon: 114.75870448890798, status: 'AIS', type: 'History' },
          { lat: 15.566967705180106, lon: 115.16245207707092, status: 'AIS', type: 'History' },
          { lat: 16.166689259314516, lon: 115.54148037473821, status: 'AIS', type: 'History' },
          { lat: 16.797148432659423, lon: 115.85021334874027, status: 'AIS', type: 'Current' },
          { lat: 17.430319477341907, lon: 116.15733958244417, status: 'AIS', type: 'Future' },
          { lat: 18.05449729960005, lon: 116.4930219751414, status: 'AIS', type: 'Future' },
          { lat: 18.69907628485336, lon: 116.78243874920335, status: 'AIS', type: 'Future' },
          { lat: 19.344809349959917, lon: 117.07381239505587, status: 'AIS', type: 'Future' },
        ]
      };
    }

    /**
     * 主要接口：生成或取得軌跡點
     * @param {Object} vessel - 船舶資訊 { mmsi, vesselType, lat, lon }
     * @param {Object} options - 選項 { source: 'auto'|'database'|'api'|'mock', eventId }
     * @returns {Promise<Array>} 軌跡點陣列
     */
    async generateTrackPoints(vessel, options = {}) {
      const source = options.source || 'auto';

      switch(source) {
        case 'database':
          return await this.fetchFromDatabase(vessel.mmsi, options);

        case 'api':
          return await this.fetchFromGFWAPI(vessel.mmsi, options);

        case 'mock':
          return this.generateMockData(vessel, options);

        case 'auto':
        default:
          return await this.fetchWithFallback(vessel, options);
      }
    }

    /**
     * 自動降級策略：資料庫 → GFW API → 模擬資料
     */
    async fetchWithFallback(vessel, options) {
      // 未來：嘗試資料庫
      if (window.DATABASE_ENABLED) {
        try {
          const dbData = await this.fetchFromDatabase(vessel.mmsi, options);
          if (dbData && dbData.length > 0) {
            console.log('✅ 使用資料庫軌跡資料');
            return dbData;
          }
        } catch (error) {
          console.warn('⚠️ 資料庫查詢失敗:', error);
        }
      }

      // 嘗試 GFW API（目前未實作軌跡端點）
      if (window.GFW_API_ENABLED) {
        try {
          const apiData = await this.fetchFromGFWAPI(vessel.mmsi, options);
          if (apiData && apiData.length > 0) {
            console.log('✅ 使用 GFW API 軌跡資料');
            return apiData;
          }
        } catch (error) {
          console.warn('⚠️ GFW API 查詢失敗:', error);
        }
      }

      // 降級到模擬資料
      if (this.devMode) {
        console.log('🎭 使用模擬軌跡資料（開發模式）');
        return this.generateMockData(vessel, options);
      }

      // 生產環境：沒資料就回傳空陣列
      console.warn('⚠️ 無可用軌跡資料');
      return [];
    }

    /**
     * 從資料庫取得軌跡（未來實作）
     */
    async fetchFromDatabase(mmsi, options) {
      // TODO: 實作資料庫查詢
      // const response = await fetch(`/api/vessel/${mmsi}/track`);
      // return await response.json();
      throw new Error('資料庫尚未實作');
    }

    /**
     * 從 GFW API 取得軌跡（未來實作）
     */
    async fetchFromGFWAPI(mmsi, options) {
      // TODO: GFW API 目前只有船舶資訊，沒有軌跡端點
      // const response = await fetch(`${this.gfwApiBaseUrl}/vessel/${mmsi}/track`);
      // return this.normalizeGFWTrackData(await response.json());
      throw new Error('GFW API 軌跡端點尚未實作');
    }

    /**
     * 生成模擬軌跡資料（開發用）
     * 這是整合後的唯一模擬函數，取代原本的三個函數
     */
    generateMockData(vessel, options = {}) {
      const eventId = options.eventId || 'mock';
      const vesselType = vessel.vesselType || vessel.type || '貨輪';

      // 創建緩存鍵值
      const cacheKey = `${vesselType}_${eventId}`;
      
      // 如果已經有緩存，直接返回
      if (this.trackPointsCache.has(cacheKey)) {
        console.log(`🔄 使用緩存的軌跡點: ${cacheKey}`);
        return this.trackPointsCache.get(cacheKey);
      }

      // 判斷使用哪個模板
      let templateType = 'cargo';
      if (vesselType.includes('漁') || vesselType.toLowerCase().includes('fish')) {
        templateType = 'fishing';
      }

      // 選擇重要時間點
      const importantHours = [120, 96, 72, 48, 24, 12, 6, 3, 0];
      const currentTime = new Date();
      const allOriginalPoints = this.mockTemplates[templateType];
      const trackData = [];

      // 從模板選擇對應時間點的軌跡點
      importantHours.forEach((hours, index) => {
        let selectedPoint;

        if (hours === 0) {
          // 當前點
          selectedPoint = allOriginalPoints.find(p => p.type === 'Current');
        } else {
          // 歷史點
          const historyPoints = allOriginalPoints.filter(p => p.type === 'History');
          const pointIndex = Math.floor(((120 - hours) / 120) * (historyPoints.length - 1));
          selectedPoint = historyPoints[pointIndex];
        }

        if (selectedPoint) {
          const timestamp = new Date(currentTime.getTime() - hours * 60 * 60 * 1000);
          const willBeAbnormal = (hours === 48 || hours === 72) || Math.random() < 0.15;
          const speed = willBeAbnormal ?
            (Math.random() > 0.5 ? 28 + Math.random() * 12 : Math.random() * 3) :
            (8 + Math.random() * 15);

          trackData.push({
            ...selectedPoint,
            id: `${eventId}_${templateType}_${hours}h_${index + 1}`,
            timestamp: timestamp.toISOString(),
            speed: speed,
            signalStrength: willBeAbnormal ? (-85 - Math.random() * 15) : (-45 - Math.random() * 35),
            deviationFromRoute: willBeAbnormal ? (6 + Math.random() * 8) : (Math.random() * 4),
            inRestrictedZone: willBeAbnormal && Math.random() > 0.8,
            hasTask: true,
            course: 45 + Math.random() * 90,
            reportTime: timestamp.toLocaleTimeString('zh-TW', {hour12: false}),
            taskType: willBeAbnormal ?
              ['異常調查', '衛星重拍', '威脅評估'][Math.floor(Math.random() * 3)] :
              ['監控任務', '追蹤任務', '偵察任務'][Math.floor(Math.random() * 3)],
            taskDescription: willBeAbnormal ?
              '處理異常行為和信號異常事件' :
              '執行船舶追蹤和行為分析'
          });
        }
      });

      // 添加未來點
      const futurePoints = allOriginalPoints.filter(p => p.type === 'Future');
      futurePoints.slice(0, 3).forEach((point, index) => {
        const hours = (index + 1) * 3;
        const timestamp = new Date(currentTime.getTime() + hours * 60 * 60 * 1000);

        trackData.push({
          ...point,
          id: `${eventId}_${templateType}_future_${index + 1}`,
          timestamp: timestamp.toISOString(),
          speed: 8 + Math.random() * 15,
          signalStrength: -45 - Math.random() * 35,
          deviationFromRoute: Math.random() * 4,
          hasTask: true,
          course: 45 + Math.random() * 90,
          reportTime: timestamp.toLocaleTimeString('zh-TW', {hour12: false}),
          taskType: ['監控任務', '追蹤任務'][Math.floor(Math.random() * 2)],
          taskDescription: '執行船舶追蹤和行為分析'
        });
      });

      // 緩存軌跡點
      this.trackPointsCache.set(cacheKey, trackData);
      console.log(`💾 緩存軌跡點: ${cacheKey}, 點數: ${trackData.length}`);

      return trackData;
    }

    /**
     * 正規化 GFW API 資料格式（未來使用）
     */
    normalizeGFWTrackData(gfwData) {
      // TODO: 將 GFW API 的資料格式轉換成標準格式
      return gfwData;
    }
  }

  // 暴露全局實例
  window.trackPointGenerator = new TrackPointGenerator();
  console.log('✅ TrackPointGenerator 已初始化（開發模式）');
})();
