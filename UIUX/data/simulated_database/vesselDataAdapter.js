/**
 * 船舶數據適配器
 * 統一接口，連接 VesselDatabase 與事件系統
 *
 * 基於 Linus "好品味" 原則：
 * - 單一數據來源（VesselDatabase）
 * - 統一接口，消除特殊情況
 * - 直接切換，不維護舊代碼
 */
class VesselDataAdapter {
    /**
     * 獲取 RF 事件對應的船舶信息
     * @param {Object} rfEventData - RF 事件資料
     * @returns {Object|Array|null} AIS 開啟返回單一船舶，AIS 關閉返回候選列表
     */
    static getVesselForRFEvent(rfEventData) {
        if (!window.vesselDatabase) {
            console.error('❌ VesselDatabase 未初始化');
            return null;
        }

        try {
            const result = window.vesselDatabase.getVesselsForRFEvent(rfEventData);
            console.log('✅ 從 VesselDatabase 獲取船舶數據');
            return result;
        } catch (error) {
            console.error('❌ 獲取船舶數據失敗:', error);
            return null;
        }
    }

    /**
     * 根據 MMSI 獲取船舶完整資料
     * @param {string} mmsi - 船舶 MMSI
     * @returns {Object|null} 船舶資料或 null
     */
    static getVesselByMMSI(mmsi) {
        if (!window.vesselDatabase) {
            console.error('❌ VesselDatabase 未初始化');
            return null;
        }

        const vessel = window.vesselDatabase.getVesselByMMSI(mmsi);
        if (vessel) {
            console.log(`✅ 找到船舶: ${vessel.name} (${mmsi})`);
            return vessel;
        } else {
            console.warn(`⚠️ 找不到 MMSI ${mmsi} 的船舶`);
            return null;
        }
    }

    /**
     * 獲取船舶軌跡點
     * @param {string} mmsi - 船舶 MMSI
     * @returns {Array} 軌跡點陣列
     */
    static getTrackPoints(mmsi) {
        if (!window.vesselDatabase) {
            console.error('❌ VesselDatabase 未初始化');
            return [];
        }

        const vessel = window.vesselDatabase.getVesselByMMSI(mmsi);
        if (vessel && vessel.history.positions.length > 0) {
            console.log(`✅ 獲取船舶 ${mmsi} 的 ${vessel.history.positions.length} 個軌跡點`);
            return vessel.history.positions;
        } else {
            console.warn(`⚠️ 船舶 ${mmsi} 沒有歷史軌跡點`);
            return [];
        }
    }

    /**
     * 將 VesselDatabase 的船舶格式轉換為事件系統格式
     * @param {Object} vessel - VesselDatabase 的船舶對象
     * @returns {Object} 事件系統格式的船舶資料
     */
    static convertToEventFormat(vessel) {
        return {
            mmsi: vessel.mmsi,
            vesselName: vessel.name,
            vesselType: vessel.type,
            coordinates: `${vessel.position.lat.toFixed(3)}°N, ${vessel.position.lon.toFixed(3)}°E`,
            riskScore: vessel.threat.level,
            aisStatus: vessel.ais.status === 'active' ? '已開啟' : '未開啟',
            investigationReason: vessel.threat.factors.join(', ') || '例行監控',

            // 船舶詳細資訊
            shipInfo: {
                name: vessel.name,
                mmsi: vessel.mmsi,
                type: vessel.type,
                country: vessel.country,
                flagState: vessel.flagState,
                length: vessel.specifications.length,
                beam: vessel.specifications.width,
                speed: vessel.position.speed,
                course: vessel.position.course,
                destination: vessel.ais.destination,
                eta: vessel.ais.eta
            },

            // 位置資訊
            position: {
                lat: vessel.position.lat,
                lon: vessel.position.lon,
                speed: vessel.position.speed,
                course: vessel.position.course,
                heading: vessel.position.heading
            },

            // 軌跡點
            trackPoints: vessel.history.positions
        };
    }

    /**
     * 格式化船舶資訊為 HTML（用於 RF 事件顯示）
     * @param {Object} vessel - VesselDatabase 的船舶對象
     * @returns {string} HTML 字串
     */
    static formatVesselHTML(vessel) {
        return `
            <div class="ship-info-card ais-enabled">
                <div class="ship-header">
                    <span class="ship-name">${vessel.name}</span>
                    <span class="ship-status status-ais">AIS已開啟</span>
                </div>
                <div class="ship-details">
                    <div class="detail-row"><span>MMSI:</span><span>${vessel.mmsi}</span></div>
                    <div class="detail-row"><span>船型:</span><span>${vessel.type}</span></div>
                    <div class="detail-row"><span>國籍:</span><span>${vessel.country}</span></div>
                    <div class="detail-row"><span>船長:</span><span>${vessel.specifications.length}公尺</span></div>
                    <div class="detail-row"><span>船寬:</span><span>${vessel.specifications.width}公尺</span></div>
                    <div class="detail-row"><span>航速:</span><span>${vessel.position.speed}節</span></div>
                    <div class="detail-row"><span>航向:</span><span>${vessel.position.course}°</span></div>
                    <div class="detail-row"><span>目的地:</span><span>${vessel.ais.destination}</span></div>
                    <div class="detail-row"><span>威脅級別:</span><span style="color: ${vessel.threat.level >= 70 ? '#ef4444' : vessel.threat.level >= 40 ? '#f59e0b' : '#10b981'};">${vessel.threat.level}</span></div>
                </div>
            </div>
        `;
    }

    /**
     * 格式化候選船舶列表為 HTML
     * @param {Array} candidates - 候選船舶陣列
     * @returns {string} HTML 字串
     */
    static formatCandidatesHTML(candidates) {
        if (!candidates || candidates.length === 0) {
            return '<div class="no-candidates">無可疑船舶候選</div>';
        }

        const candidateHtml = candidates.map(candidate => `
            <div class="candidate-item">
                <div class="candidate-header">
                    <span class="candidate-name">${candidate.name}</span>
                    <span class="probability">${(candidate.probability * 100).toFixed(0)}%</span>
                </div>
                <div class="candidate-details">
                    <div>MMSI: ${candidate.id} | 類型: ${candidate.type} | 長度: ${candidate.length}m</div>
                    <div>最後出現: ${candidate.lastSeen}</div>
                </div>
                <button class="investigate-btn-small" onclick="createVesselEventFromRF('${candidate.id}')">
                    建立船舶調查
                </button>
            </div>
        `).join('');

        return `
            <div class="ship-info-card no-ais">
                <div class="ship-header">
                    <span class="ship-name">未知RF信號</span>
                    <span class="ship-status status-no-ais">無AIS</span>
                </div>
                <div class="candidate-list">
                    <h4 style="margin: 10px 0; color: #333;">可疑船隻候選列表</h4>
                    ${candidateHtml}
                </div>
            </div>
        `;
    }

    /**
     * 檢查 VesselDatabase 是否可用
     * @returns {boolean} 是否可用
     */
    static isDatabaseAvailable() {
        if (typeof window === 'undefined') return false;
        if (!window.vesselDatabase) {
            console.warn('⚠️ VesselDatabase 未載入');
            return false;
        }
        if (window.vesselDatabase.vessels.size === 0) {
            console.warn('⚠️ VesselDatabase 沒有船舶數據');
            return false;
        }
        return true;
    }

    /**
     * 獲取資料庫統計資訊
     * @returns {Object|null} 統計資訊
     */
    static getDatabaseStats() {
        if (!this.isDatabaseAvailable()) return null;
        return window.vesselDatabase.getStatistics();
    }
}

// 全域暴露
if (typeof window !== 'undefined') {
    window.VesselDataAdapter = VesselDataAdapter;
    console.log('✅ VesselDataAdapter 已載入');
}