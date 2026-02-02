/**
 * 模擬動態即時船舶資料庫
 * 包含 MMSI 和完整船舶資訊，支援即時數據更新
 *
 * 基於 Linus "好品味" 原則：
 * - 簡潔的數據結構
 * - 無特殊情況的統一處理
 * - 實用的即時更新機制
 */

class VesselDatabase {
    constructor() {
        this.vessels = new Map();
        this.updateInterval = null;
        this.isRunning = false;
        this.updateFrequency = 5000; // 5秒更新一次

        // 初始化船舶資料庫
        this.initializeVesselData();

        // 綁定方法
        this.updateVesselData = this.updateVesselData.bind(this);

        console.log('🚢 船舶資料庫已初始化，包含', this.vessels.size, '艘船舶');
    }

    /**
     * 初始化船舶資料
     */
    initializeVesselData() {
        const vesselTypes = ['cargo', 'fishing', 'tanker', 'passenger', 'military', 'research'];
        const countries = ['TW', 'CN', 'JP', 'KR', 'VN', 'PH', 'US', 'SG'];
        const vesselNames = {
            cargo: ['海運王號', 'Pacific Star', '東方貨輪', 'Ocean Pioneer', '亞洲明珠'],
            fishing: ['海豐號', 'Lucky Fish', '豐收漁船', 'Sea Hunter', '黃金漁夫'],
            tanker: ['石油巨星', 'Fuel Master', '能源運輸', 'Oil Giant', '液化王'],
            passenger: ['海上明珠', 'Dream Cruise', '星際郵輪', 'Ocean Palace', '藍海之星'],
            military: ['海軍艦艇', 'Naval Vessel', '巡邏艦', 'Defense Ship', '警戒號'],
            research: ['科學探索', 'Research One', '海洋調查', 'Discovery', '科研船']
        };

        // 生成50艘初始船舶
        for (let i = 0; i < 50; i++) {
            const vesselType = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];
            const country = countries[Math.floor(Math.random() * countries.length)];
            const names = vesselNames[vesselType];
            const vesselName = names[Math.floor(Math.random() * names.length)];

            // 生成真實的 MMSI (Maritime Mobile Service Identity)
            // MMSI 格式：9位數字，前3位是國家代碼
            const countryMID = this.getMaritimeCountryCode(country);
            const mmsi = countryMID + String(Math.floor(Math.random() * 1000000)).padStart(6, '0');

            // 生成初始位置（主要在台海、南海區域）
            const initialPosition = this.generateRealisticPosition();

            const vessel = {
                mmsi: mmsi,
                name: vesselName,
                type: vesselType,
                country: country,
                flagState: this.getCountryName(country),

                // 位置資訊
                position: {
                    lat: initialPosition.lat,
                    lon: initialPosition.lon,
                    course: Math.floor(Math.random() * 360), // 0-359度
                    speed: this.generateRealisticSpeed(vesselType), // 節
                    heading: Math.floor(Math.random() * 360)
                },

                // 船舶規格
                specifications: {
                    length: this.generateLength(vesselType),
                    width: this.generateWidth(vesselType),
                    tonnage: this.generateTonnage(vesselType),
                    maxSpeed: this.generateMaxSpeed(vesselType),
                    buildYear: 2000 + Math.floor(Math.random() * 24)
                },

                // AIS 資訊
                ais: {
                    status: Math.random() > 0.2 ? 'active' : 'inactive', // 80% 機率 AIS 開啟
                    lastUpdate: new Date(),
                    signalStrength: -45 - Math.random() * 40, // -45 to -85 dBm
                    navigationStatus: this.getNavigationStatus(vesselType),
                    destination: this.generateDestination(),
                    eta: this.generateETA()
                },

                // 威脅評估
                threat: {
                    level: Math.floor(Math.random() * 100), // 0-99
                    factors: [],
                    lastAssessment: new Date(),
                    riskCategory: 'normal'
                },

                // 動態資訊
                lastSeen: new Date(),
                isTracked: Math.random() > 0.7, // 30% 機率被追蹤

                // 歷史資料
                history: {
                    positions: [],
                    events: [],
                    alerts: []
                }
            };

            // 計算初始威脅級別
            this.calculateThreatLevel(vessel);

            // 儲存船舶
            this.vessels.set(mmsi, vessel);
        }
    }

    /**
     * 取得國家的海事識別碼 (MID)
     */
    getMaritimeCountryCode(country) {
        const midCodes = {
            'TW': '416', // 台灣
            'CN': '412', // 中國
            'JP': '431', // 日本
            'KR': '440', // 韓國
            'VN': '574', // 越南
            'PH': '548', // 菲律賓
            'US': '338', // 美國
            'SG': '563'  // 新加坡
        };
        return midCodes[country] || '416';
    }

    /**
     * 取得國家全名
     */
    getCountryName(code) {
        const countryNames = {
            'TW': '中華民國（台灣）',
            'CN': '中華人民共和國',
            'JP': '日本',
            'KR': '韓國',
            'VN': '越南',
            'PH': '菲律賓',
            'US': '美國',
            'SG': '新加坡'
        };
        return countryNames[code] || '未知';
    }

    /**
     * 生成真實的位置座標（台海、南海區域）
     */
    generateRealisticPosition() {
        // 定義幾個主要海域
        const areas = [
            { name: '台灣海峽', latRange: [23.5, 25.5], lonRange: [119.0, 121.0] },
            { name: '南海北部', latRange: [18.0, 23.0], lonRange: [110.0, 118.0] },
            { name: '東海南部', latRange: [25.0, 28.0], lonRange: [120.0, 125.0] },
            { name: '巴士海峽', latRange: [20.0, 22.0], lonRange: [120.0, 122.0] },
            { name: '南海中部', latRange: [12.0, 18.0], lonRange: [109.0, 116.0] }
        ];

        const area = areas[Math.floor(Math.random() * areas.length)];
        const lat = area.latRange[0] + Math.random() * (area.latRange[1] - area.latRange[0]);
        const lon = area.lonRange[0] + Math.random() * (area.lonRange[1] - area.lonRange[0]);

        return { lat: lat, lon: lon };
    }

    /**
     * 根據船舶類型生成真實的速度
     */
    generateRealisticSpeed(vesselType) {
        const speedRanges = {
            cargo: [12, 25],      // 貨船：12-25節
            fishing: [3, 15],     // 漁船：3-15節
            tanker: [10, 18],     // 油輪：10-18節
            passenger: [18, 30],  // 客船：18-30節
            military: [15, 35],   // 軍艦：15-35節
            research: [8, 20]     // 研究船：8-20節
        };

        const range = speedRanges[vesselType] || [8, 20];
        return Math.floor(range[0] + Math.random() * (range[1] - range[0]));
    }

    /**
     * 生成船舶長度
     */
    generateLength(vesselType) {
        const lengthRanges = {
            cargo: [150, 400],
            fishing: [20, 80],
            tanker: [200, 380],
            passenger: [200, 350],
            military: [100, 300],
            research: [50, 150]
        };

        const range = lengthRanges[vesselType] || [50, 200];
        return Math.floor(range[0] + Math.random() * (range[1] - range[0]));
    }

    /**
     * 生成船舶寬度
     */
    generateWidth(vesselType) {
        const widthRanges = {
            cargo: [20, 60],
            fishing: [6, 15],
            tanker: [30, 70],
            passenger: [25, 50],
            military: [15, 40],
            research: [10, 25]
        };

        const range = widthRanges[vesselType] || [10, 30];
        return Math.floor(range[0] + Math.random() * (range[1] - range[0]));
    }

    /**
     * 生成船舶噸位
     */
    generateTonnage(vesselType) {
        const tonnageRanges = {
            cargo: [10000, 200000],
            fishing: [100, 2000],
            tanker: [50000, 300000],
            passenger: [20000, 150000],
            military: [2000, 50000],
            research: [1000, 10000]
        };

        const range = tonnageRanges[vesselType] || [1000, 20000];
        return Math.floor(range[0] + Math.random() * (range[1] - range[0]));
    }

    /**
     * 生成最大速度
     */
    generateMaxSpeed(vesselType) {
        const maxSpeedRanges = {
            cargo: [20, 28],
            fishing: [12, 18],
            tanker: [16, 22],
            passenger: [25, 35],
            military: [25, 45],
            research: [15, 25]
        };

        const range = maxSpeedRanges[vesselType] || [15, 25];
        return Math.floor(range[0] + Math.random() * (range[1] - range[0]));
    }

    /**
     * 取得航行狀態
     */
    getNavigationStatus(vesselType) {
        const statuses = [
            'Under way using engine',
            'At anchor',
            'Not under command',
            'Restricted manoeuvrability',
            'Constrained by her draught',
            'Moored',
            'Aground',
            'Engaged in fishing',
            'Under way sailing'
        ];

        // 根據船舶類型調整狀態機率
        if (vesselType === 'fishing') {
            return Math.random() > 0.3 ? 'Engaged in fishing' : 'Under way using engine';
        }

        return statuses[Math.floor(Math.random() * statuses.length)];
    }

    /**
     * 生成目的地
     */
    generateDestination() {
        const ports = [
            'TAIPEI', 'KAOHSIUNG', 'TAICHUNG', 'KEELUNG',
            'SHANGHAI', 'HONG KONG', 'SINGAPORE', 'MANILA',
            'TOKYO', 'BUSAN', 'HO CHI MINH', 'BANGKOK'
        ];

        return ports[Math.floor(Math.random() * ports.length)];
    }

    /**
     * 生成預計到達時間
     */
    generateETA() {
        const hoursFromNow = 6 + Math.random() * 72; // 6-78小時
        const eta = new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
        return eta;
    }

    /**
     * 計算威脅級別
     */
    calculateThreatLevel(vessel) {
        let threatScore = 0;
        const factors = [];

        // AIS 狀態
        if (vessel.ais.status === 'inactive') {
            threatScore += 30;
            factors.push('AIS信號關閉');
        }

        // 速度異常
        if (vessel.position.speed > 30) {
            threatScore += 25;
            factors.push('異常高速');
        } else if (vessel.position.speed < 2) {
            threatScore += 20;
            factors.push('異常低速或停留');
        }

        // 距離台灣
        const distanceToTaiwan = this.calculateDistanceToTaiwan(vessel.position.lat, vessel.position.lon);
        if (distanceToTaiwan < 50) {
            threatScore += 40;
            factors.push('極度接近台灣本島');
        } else if (distanceToTaiwan < 100) {
            threatScore += 25;
            factors.push('接近台灣海域');
        } else if (distanceToTaiwan < 200) {
            threatScore += 15;
            factors.push('進入台海周邊');
        }

        // 船舶類型
        if (vessel.type === 'military') {
            threatScore += 20;
            factors.push('軍用船舶');
        }

        // 國籍
        if (vessel.country === 'CN') {
            threatScore += 10;
            factors.push('中國船籍');
        }

        // 夜間活動
        const hour = new Date().getHours();
        if (hour >= 22 || hour <= 5) {
            threatScore += 10;
            factors.push('夜間活動');
        }

        vessel.threat.level = threatScore;
        vessel.threat.factors = factors;
        vessel.threat.lastAssessment = new Date();

        // 威脅分類
        if (threatScore >= 70) {
            vessel.threat.riskCategory = 'high';
        } else if (threatScore >= 40) {
            vessel.threat.riskCategory = 'medium';
        } else {
            vessel.threat.riskCategory = 'low';
        }
    }

    /**
     * 計算距離台灣的距離
     */
    calculateDistanceToTaiwan(lat, lon) {
        const TAIWAN_CENTER = { lat: 24.0, lon: 120.9 };
        const R = 6371; // 地球半徑（公里）

        const dLat = (lat - TAIWAN_CENTER.lat) * Math.PI / 180;
        const dLon = (lon - TAIWAN_CENTER.lon) * Math.PI / 180;

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(TAIWAN_CENTER.lat * Math.PI / 180) * Math.cos(lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    /**
     * 開始即時更新
     */
    startDynamicUpdates() {
        if (this.isRunning) {
            console.log('⚠️ 動態更新已在運行');
            return;
        }

        this.isRunning = true;
        this.updateInterval = setInterval(this.updateVesselData, this.updateFrequency);
        console.log('✅ 船舶資料庫動態更新已啟動');
    }

    /**
     * 停止即時更新
     */
    stopDynamicUpdates() {
        if (!this.isRunning) {
            console.log('⚠️ 動態更新未在運行');
            return;
        }

        this.isRunning = false;
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        console.log('🛑 船舶資料庫動態更新已停止');
    }

    /**
     * 更新船舶數據
     */
    updateVesselData() {
        const vesselArray = Array.from(this.vessels.values());

        // 更新所有船舶，確保威脅監控的完整性
        vesselArray.forEach(vessel => {
            this.updateSingleVessel(vessel);
        });

        console.log(`🔄 已更新 ${vesselArray.length} 艘船舶的即時資料`);
    }

    /**
     * 更新單一船舶資料
     */
    updateSingleVessel(vessel) {
        // 保存當前位置到歷史（完整軌跡點格式）
        const trackPoint = {
            id: `${vessel.mmsi}_${Date.now()}`,
            lat: vessel.position.lat,
            lon: vessel.position.lon,
            timestamp: new Date().toISOString(),
            speed: vessel.position.speed,
            course: vessel.position.course,

            // 擴展字段：與 eventStorage track points 兼容
            status: vessel.ais.status === 'active' ? 'AIS' : 'No AIS',
            type: 'History',
            signalStrength: vessel.ais.signalStrength,
            deviationFromRoute: 0,  // 可以後續計算航線偏離
            inRestrictedZone: false,  // 可以後續檢查禁航區
            hasTask: false,
            taskType: null,
            taskDescription: null,
            vesselId: vessel.mmsi
        };

        vessel.history.positions.push(trackPoint);

        // 限制歷史紀錄數量
        if (vessel.history.positions.length > 100) {
            vessel.history.positions = vessel.history.positions.slice(-50);
        }

        // 註冊到 missionTrackManager（如果可用）
        if (typeof window !== 'undefined' && window.missionTrackManager) {
            window.missionTrackManager.createTrackPoint(trackPoint);
        }

        // 更新位置（模擬船舶移動）
        const speedKmh = vessel.position.speed * 1.852; // 節轉公里/小時
        const distanceKm = (speedKmh / 3600) * (this.updateFrequency / 1000); // 移動距離

        // 略微改變航向（±10度）
        vessel.position.course += (Math.random() - 0.5) * 20;
        vessel.position.course = (vessel.position.course + 360) % 360;

        // 計算新位置
        const earthRadius = 6371;
        const courseRad = vessel.position.course * Math.PI / 180;

        const newLat = vessel.position.lat + (distanceKm / earthRadius) * (180 / Math.PI) * Math.cos(courseRad);
        const newLon = vessel.position.lon + (distanceKm / earthRadius) * (180 / Math.PI) * Math.sin(courseRad) / Math.cos(vessel.position.lat * Math.PI / 180);

        vessel.position.lat = newLat;
        vessel.position.lon = newLon;

        // 隨機調整速度（±2節）
        const speedChange = (Math.random() - 0.5) * 4;
        vessel.position.speed = Math.max(0, Math.min(vessel.specifications.maxSpeed, vessel.position.speed + speedChange));

        // 更新 AIS 狀態（5%機率改變）
        if (Math.random() < 0.05) {
            vessel.ais.status = vessel.ais.status === 'active' ? 'inactive' : 'active';

            if (vessel.ais.status === 'inactive') {
                vessel.history.events.push({
                    type: 'ais_lost',
                    timestamp: new Date(),
                    description: 'AIS信號中斷'
                });
            }
        }

        // 更新信號強度
        vessel.ais.signalStrength = -45 - Math.random() * 40 + (Math.random() - 0.5) * 10;
        vessel.ais.lastUpdate = new Date();

        // 重新計算威脅級別
        this.calculateThreatLevel(vessel);

        // 更新最後見到時間
        vessel.lastSeen = new Date();

        // 檢查是否需要觸發威脅警告
        if (vessel.threat.level > 60 && Math.random() < 0.1) { // 10%機率觸發
            this.triggerThreatAlert(vessel);
        }
    }

    /**
     * 觸發威脅警告
     */
    triggerThreatAlert(vessel) {
        const alert = {
            timestamp: new Date(),
            type: 'high_threat',
            level: vessel.threat.level,
            factors: [...vessel.threat.factors],
            position: { ...vessel.position },
            description: `高威脅船舶警告: ${vessel.name} (${vessel.mmsi})`
        };

        vessel.history.alerts.push(alert);

        // 發送事件通知
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('vesselThreatAlert', {
                detail: {
                    vessel: vessel,
                    alert: alert
                }
            }));
        }

        console.log(`🚨 威脅警告: ${vessel.name} (${vessel.mmsi}) - 威脅級別: ${vessel.threat.level}`);
    }

    /**
     * 根據 MMSI 取得船舶資料
     */
    getVesselByMMSI(mmsi) {
        return this.vessels.get(mmsi) || null;
    }

    /**
     * 根據 RF 事件獲取對應船舶或候選列表
     * @param {Object} rfEventData - RF 事件資料
     * @returns {Object|Array} 如果 AIS 開啟返回單一船舶，否則返回候選列表
     */
    getVesselsForRFEvent(rfEventData) {
        const isAISActive = rfEventData.aisStatus === '已開啟';

        if (isAISActive) {
            // 從資料庫中選擇一艘 AIS 開啟的船舶
            const aisVessels = this.getAllVessels().filter(v => v.ais.status === 'active');

            if (aisVessels.length === 0) {
                console.warn('⚠️ 資料庫中沒有 AIS 開啟的船舶');
                return null;
            }

            // 如果 RF 事件有座標，選擇最接近的船舶
            if (rfEventData.coordinates) {
                const coords = this.parseCoordinates(rfEventData.coordinates);
                if (coords) {
                    return this.findNearestVessel(coords.lat, coords.lon, aisVessels);
                }
            }

            // 否則隨機選擇一艘
            return aisVessels[Math.floor(Math.random() * aisVessels.length)];
        } else {
            // 返回高威脅、AIS 關閉的候選船舶（最多 5 艘）
            const candidates = this.getAllVessels()
                .filter(v => v.ais.status === 'inactive')
                .sort((a, b) => b.threat.level - a.threat.level)  // 按威脅級別排序
                .slice(0, 5)
                .map(v => ({
                    id: v.mmsi,
                    name: v.name,
                    type: v.type,
                    probability: Math.min(v.threat.level / 100, 0.95),  // 轉換為機率
                    lastSeen: v.lastSeen.toLocaleString('zh-TW', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                    }),
                    length: v.specifications.length,
                    vesselData: v  // 保留完整船舶資料的引用
                }));

            return candidates;
        }
    }

    /**
     * 解析座標字串
     * @param {string} coordinatesStr - 座標字串 (例如: "24.123°N, 120.456°E")
     * @returns {Object|null} {lat, lon} 或 null
     */
    parseCoordinates(coordinatesStr) {
        try {
            const match = coordinatesStr.match(/([\d.]+)°[NS],?\s*([\d.]+)°[EW]/);
            if (match) {
                return {
                    lat: parseFloat(match[1]),
                    lon: parseFloat(match[2])
                };
            }
        } catch (error) {
            console.error('座標解析失敗:', error);
        }
        return null;
    }

    /**
     * 找到最接近指定座標的船舶
     * @param {number} targetLat - 目標緯度
     * @param {number} targetLon - 目標經度
     * @param {Array} vesselList - 船舶列表
     * @returns {Object} 最接近的船舶
     */
    findNearestVessel(targetLat, targetLon, vesselList) {
        if (vesselList.length === 0) return null;

        let nearest = vesselList[0];
        let minDistance = this.calculateDistance(targetLat, targetLon, nearest.position.lat, nearest.position.lon);

        for (let i = 1; i < vesselList.length; i++) {
            const vessel = vesselList[i];
            const distance = this.calculateDistance(targetLat, targetLon, vessel.position.lat, vessel.position.lon);

            if (distance < minDistance) {
                minDistance = distance;
                nearest = vessel;
            }
        }

        return nearest;
    }

    /**
     * 計算兩點之間的距離（公里）
     * @param {number} lat1 - 點1緯度
     * @param {number} lon1 - 點1經度
     * @param {number} lat2 - 點2緯度
     * @param {number} lon2 - 點2經度
     * @returns {number} 距離（公里）
     */
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // 地球半徑（公里）
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;

        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

        return R * c;
    }

    /**
     * 取得所有船舶
     */
    getAllVessels() {
        return Array.from(this.vessels.values());
    }

    /**
     * 根據威脅級別篩選船舶
     */
    getVesselsByThreatLevel(minLevel = 0) {
        return this.getAllVessels().filter(vessel => vessel.threat.level >= minLevel);
    }

    /**
     * 根據船舶類型篩選
     */
    getVesselsByType(type) {
        return this.getAllVessels().filter(vessel => vessel.type === type);
    }

    /**
     * 根據國籍篩選
     */
    getVesselsByCountry(country) {
        return this.getAllVessels().filter(vessel => vessel.country === country);
    }

    /**
     * 在指定區域內的船舶
     */
    getVesselsInArea(bounds) {
        return this.getAllVessels().filter(vessel => {
            const pos = vessel.position;
            return pos.lat >= bounds.south && pos.lat <= bounds.north &&
                   pos.lon >= bounds.west && pos.lon <= bounds.east;
        });
    }

    /**
     * 取得資料庫統計資訊
     */
    getStatistics() {
        const vessels = this.getAllVessels();
        const stats = {
            total: vessels.length,
            byType: {},
            byCountry: {},
            byThreatLevel: {
                low: 0,
                medium: 0,
                high: 0
            },
            aisActive: 0,
            aisInactive: 0
        };

        vessels.forEach(vessel => {
            // 類型統計
            stats.byType[vessel.type] = (stats.byType[vessel.type] || 0) + 1;

            // 國籍統計
            stats.byCountry[vessel.country] = (stats.byCountry[vessel.country] || 0) + 1;

            // 威脅級別統計
            stats.byThreatLevel[vessel.threat.riskCategory]++;

            // AIS 狀態統計
            if (vessel.ais.status === 'active') {
                stats.aisActive++;
            } else {
                stats.aisInactive++;
            }
        });

        return stats;
    }

    /**
     * 新增船舶到資料庫
     */
    addVessel(vesselData) {
        const mmsi = vesselData.mmsi;
        if (this.vessels.has(mmsi)) {
            console.warn(`⚠️ MMSI ${mmsi} 已存在於資料庫中`);
            return false;
        }

        this.vessels.set(mmsi, vesselData);
        console.log(`✅ 新增船舶: ${vesselData.name} (${mmsi})`);
        return true;
    }

    /**
     * 移除船舶
     */
    removeVessel(mmsi) {
        if (this.vessels.delete(mmsi)) {
            console.log(`✅ 已移除船舶: ${mmsi}`);
            return true;
        } else {
            console.warn(`⚠️ 找不到 MMSI ${mmsi} 的船舶`);
            return false;
        }
    }
}

// 創建全域實例
if (typeof window !== 'undefined') {
    window.vesselDatabase = new VesselDatabase();

    // 自動啟動動態更新
    setTimeout(() => {
        window.vesselDatabase.startDynamicUpdates();
        console.log('🚢 船舶資料庫即時更新已啟動');
    }, 1000);
}

console.log('✅ 船舶資料庫模組已載入');