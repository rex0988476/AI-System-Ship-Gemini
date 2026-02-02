/**
 * Threat Assessment Service
 * 威脅評估服務 - 負責從後端 API 獲取並計算船舶威脅分數
 */

(function (window) {
    'use strict';

    const API_BASE = window.API_BASE || "http://140.115.53.51:3000/api/v1";

    const THREAT_WEIGHTS = window.ThreatUtils?.THREAT_WEIGHTS;

    /**
     * 從後端 API 獲取單一船舶的威脅分數 (For card display)
     * @param {string} mmsi - 船舶 MMSI 號碼
     * @returns {Promise<number>} 威脅分數 (0-100)，失敗時返回 -1
     */
    async function fetchThreatScore(mmsi) {
        try {
            // 並行獲取四種威脅評估結果
            const [ais, loiter, meander, speed] = await Promise.all([
                fetch(`${API_BASE}/aisSwitch?mmsi=${mmsi}`)
                    .then(r => r.json())
                    .catch(() => null),
                fetch(`${API_BASE}/loitering?mmsi=${mmsi}`)
                    .then(r => r.json())
                    .catch(() => null),
                fetch(`${API_BASE}/meandering?mmsi=${mmsi}`)
                    .then(r => r.json())
                    .catch(() => null),
                fetch(`${API_BASE}/speedDrop?mmsi=${mmsi}`)
                    .then(r => r.json())
                    .catch(() => null)
            ]);
            
            // 從陣列中提取 riskScore（API 返回的是陣列格式）
            const aisScore = Number(ais?.riskScore) * THREAT_WEIGHTS.aisSwitch;
            const loiterScore = Number(loiter?.riskScore) * THREAT_WEIGHTS.loitering;
            const meanderScore = Number(meander?.riskScore) * THREAT_WEIGHTS.meandering;
            const speedScore = Number(speed?.riskScore) * THREAT_WEIGHTS.speedDrop;

            // 計算加權總分（保留 2 位小數）
            const totalScore = (aisScore + loiterScore + meanderScore + speedScore);

            return Math.round(totalScore * 100) / 100;
        } catch (error) {
            console.error(`❌ Failed to fetch threat score for MMSI ${mmsi}:`, error);
            return -1;
        }
    }

    /**
     * 批量獲取多個船舶的威脅分數 (For card display)
     * @param {string[]} mmsiList - MMSI 號碼陣列
     * @returns {Promise<Map<string, number>>} MMSI -> 威脅分數的 Map
     */
    async function fetchBatchThreatScores(mmsiList) {
        if (!Array.isArray(mmsiList) || mmsiList.length === 0) {
            return new Map();
        }

        const results = await Promise.all(
            mmsiList.map(async (mmsi) => {
                const score = await fetchThreatScore(mmsi);
                return [mmsi, score];
            })
        );

        return new Map(results);
    }

    /**
     * 獲取威脅評估詳細資訊
     * @param {string} mmsi - 船舶 MMSI 號碼
     * @returns {Promise<Object>} 包含各項威脅分數的詳細物件
     */
    async function fetchThreatDetails(mmsi) {
        try {
            const [ais, loiter, meander, speed] = await Promise.all([
                fetch(`${API_BASE}/aisSwitch?mmsi=${mmsi}`).then(r => r.json()).catch(() => []),
                fetch(`${API_BASE}/loitering?mmsi=${mmsi}`).then(r => r.json()).catch(() => []),
                fetch(`${API_BASE}/meandering?mmsi=${mmsi}`).then(r => r.json()).catch(() => []),
                fetch(`${API_BASE}/speedDrop?mmsi=${mmsi}`).then(r => r.json()).catch(() => [])
            ]);
            
            const pickFirst = (value) => (Array.isArray(value) ? value[0] : value);
            const normalized = {
                aisSwitch: pickFirst(ais),
                loitering: pickFirst(loiter),
                meandering: pickFirst(meander),
                speedDrop: pickFirst(speed)
            };

            // 從陣列中提取 riskScore（API 返回陣列格式）
            const scores = {
                aisSwitch: Number(normalized.aisSwitch?.riskScore) * THREAT_WEIGHTS.aisSwitch,
                loitering: Number(normalized.loitering?.riskScore) * THREAT_WEIGHTS.loitering,
                meandering: Number(normalized.meandering?.riskScore) * THREAT_WEIGHTS.meandering,
                speedDrop: Number(normalized.speedDrop?.riskScore) * THREAT_WEIGHTS.speedDrop
            };
            const totalScore = Math.round(
                scores.aisSwitch + 
                scores.loitering + 
                scores.meandering + 
                scores.speedDrop);
            
            console.log("Raw Data: ", {ais, loiter, meander, speed});
            console.log(`✅ Fetched threat details for MMSI ${mmsi}:`, { totalScore, loiter, meander, speed, ais });

            return {
                mmsi,
                totalScore,
                scores,
                threatDetails: {
                    aisSwitch: normalized.aisSwitch,
                    loitering: normalized.loitering,
                    meandering: normalized.meandering,
                    speedDrop: normalized.speedDrop
                }
            };
        } catch (error) {
            console.error(`Failed to fetch threat details for ${mmsi}:`, error);
            return null;
        }
    }

    // 暴露到全域物件
    window.ThreatService = {
        fetchThreatScore,
        fetchBatchThreatScores,
        fetchThreatDetails,
        WEIGHTS: THREAT_WEIGHTS,
        API_BASE
    };

})(window);
