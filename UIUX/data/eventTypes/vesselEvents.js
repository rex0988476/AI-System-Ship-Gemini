// VesselEventManager extracted from script.js
(function(){
  /**
   * 船舶追蹤事件管理器
   * 負責處理船舶追蹤事件的詳情生成、風險評估和歷史軌跡管理
   */
  class VesselEventManager {
    /**
     * 從儲存資料生成船舶追蹤事件詳情
     * @param {Object} eventData - 事件資料物件
     * @returns {string} HTML 字串表示的事件詳情
     */
    static getVesselEventDetailsFromStorage(eventData) {
        // AIS 狀態映射機制：統一所有可能的狀態值格式
        let displayAisStatus = eventData.aisStatus;
        
        // 記錄原始狀態以便除錯
        console.log(`🔍 [事件詳情] 原始 AIS 狀態: "${eventData.aisStatus}" (類型: ${typeof eventData.aisStatus})`);
        
        if (!eventData.aisStatus) {
            // 如果完全沒有AIS狀態，隨機生成
            const aisStates = ['已開啟', '未開啟'];
            displayAisStatus = aisStates[Math.floor(Math.random() * aisStates.length)];
            
            // 將AIS狀態儲存回事件資料中
            if (eventData.id && window.eventStorage) {
                window.eventStorage.updateEvent(eventData.id, { aisStatus: displayAisStatus });
            }
            
            console.log(`🚢 為事件 ${eventData.id || '船舶事件'} 隨機生成AIS狀態: ${displayAisStatus}`);
        } else {
            // 標準化狀態值（不區分大小寫）
            const normalizedStatus = String(eventData.aisStatus).toLowerCase().trim();
            
            if (normalizedStatus === 'ais' || normalizedStatus === '已開啟') {
                displayAisStatus = '已開啟';
            } else if (normalizedStatus === 'no ais' || normalizedStatus === '未開啟') {
                displayAisStatus = '未開啟';
            } else if (normalizedStatus === 'unknown' || normalizedStatus === '未知') {
                displayAisStatus = '未知';
            } else {
                // 對於其他未預期的狀態，記錄警告並保持原值
                console.warn(`⚠️ 未預期的 AIS 狀態值: "${eventData.aisStatus}"，保持原值`);
            }
            
            console.log(`📡 事件 ${eventData.id || '船舶事件'} AIS 狀態: "${eventData.aisStatus}" → "${displayAisStatus}"`);
        }
        
        // 更新 eventData 以使用映射後的狀態
        eventData.aisStatus = displayAisStatus;

        // === 統一顯示模式：整合所有資訊 ===
        console.log(`📊 事件 ${eventData.id} 使用統一顯示模式`);
            
        // 生成船隻資訊（所有事件都需要）
        if (!eventData.shipInfo) {
            eventData.shipInfo = VesselEventManager.generateShipInfo(eventData);

            // 將船隻資訊儲存回事件資料中
            if (eventData.id && window.eventStorage) {
                window.eventStorage.updateEvent(eventData.id, { shipInfo: eventData.shipInfo });
            }
        }

        const shipInfo = eventData.shipInfo;
        const threatScore = eventData.threatScore || eventData.riskScore || 0;
        const riskColor = threatScore >= 80 ? '#ef4444' : threatScore >= 60 ? '#f59e0b' : '#10b981';
        const riskLevel = threatScore >= 80 ? '高風險' : threatScore >= 60 ? '中風險' : '低風險';
        const isCompleted = eventData.status === 'completed';
                    
        let actionSection = '';
        
        if (!isCompleted) {
            // 生成決策建議內容
            const recommendations = VesselEventManager.generateVesselDecisionRecommendation(threatScore, eventData);
            
            actionSection = `
                <div class="action-section">
                    <!-- 1. 行動選項標題 -->
                    <div class="section-title large" style="color: #d89f0eff;">⚡ 行動選項</div>
                    
                    <!-- 2. 決策建議 (移動到行動選項標題之下) -->
                    <div class="section-title collapsible-header" onclick="toggleDecisionRecommendation()">
                        💡 AI 決策建議 
                        <span class="collapse-icon" id="decision-collapse-icon">▼</span>
                    </div>
                    <div class="decision-recommendation collapsed" id="decision-recommendation-content">
                        <div class="recommendation-content">
                            <div class="recommendation-title">建議行動：${recommendations.primaryAction}</div>
                            <div class="recommendation-analysis">
                                <strong>分析：</strong>${recommendations.analysis}
                            </div>
                            <div class="recommendation-evidence">
                                <strong>主要證據：</strong>${recommendations.evidence}
                            </div>
                            <div class="recommendation-priority" style="color: ${recommendations.priorityColor};">
                                優先級：${recommendations.priority}
                            </div>
                        </div>
                    </div>
                    
                    <!-- 3. 五個行動選項按鈕 (可多選) -->
                    <div class="action-grid">
                        <div class="action-btn" onclick="selectAction('track', this)">🎯<br>持續追蹤</div>
                        <div class="action-btn" onclick="selectAction('satellite', this)">🛰️<br>衛星重拍</div>
                        <div class="action-btn" onclick="selectAction('notify', this)">📞<br>通知單位</div>
                        <div class="action-btn" onclick="selectAction('uav', this)">🚁<br>派遣載具</div>
                        <div class="action-btn action-btn-close" onclick="selectAction('close', this)">✅<br>結束事件</div>
                    </div>

                    <!-- 4. 時間排程選擇 -->
                    <div class="action-section">
                            <div class="section-title large" style="color: #d89f0eff;">⏰ 執行時間</div>
                        <div class="time-selection">
                            <div class="time-option-group">
                                <label class="time-option">
                                    <input type="radio" name="executeTime" value="immediate" checked onchange="toggleTimeSelector()">
                                    <span class="time-option-text">立即執行</span>
                                </label>
                                <label class="time-option">
                                    <input type="radio" name="executeTime" value="scheduled" onchange="toggleTimeSelector()">
                                    <span class="time-option-text">排程執行</span>
                                </label>
                            </div>

                            <div class="scheduled-time-picker" id="scheduledTimePicker" style="display: none;">
                                <div class="time-input-group">
                                    <label for="scheduledDateTime">預定執行時間：</label>
                                    <input type="datetime-local" id="scheduledDateTime" class="time-input" min="${new Date(Date.now() + 5 * 60000).toISOString().slice(0, 16)}">
                                </div>
                                <div class="time-note">
                                    <small>📝 注意：排程時間必須在未來至少 5 分鐘</small>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            actionSection = `
                <div class="action-section">
                    <div class="section-title">✅ 事件已結束</div>
                    <div style="color: #10b981; font-size: 13px; text-align: center; padding: 15px;">
                        調查結果: 確認為正常漁船作業<br>
                        結案時間: ${eventData.completedTime || '未記錄'}
                    </div>
                </div>
            `;
        }
        
        return `
            <div class="summary-section">
                <div class="section-title">事件簡介</div>
                <div style="font-size: 13px; line-height: 1.5; color: #b8c5d1;">
                    <strong>MMSI：</strong>${eventData.mmsi || '未知'}<br>
                    <strong>座標：</strong>${eventData.coordinates || '待定位'}<br>
                    <strong>AIS狀態：</strong>
                    <span style="color: ${eventData.aisStatus === '已開啟' ? '#10b981' : '#ef4444'};">
                        ${eventData.aisStatus || '未知'}
                    </span><br>
                    <strong>建立時間：</strong>${eventData.createTime}<br>
                </div>
            </div>

            <div class="history-track-section">
                <div class="section-title">船舶歷史軌跡檢視</div>
                <div class="history-track-buttons horizontal-scroll">
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(0)">現在</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(3)">3小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(6)">6小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(12)">12小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(24)">24小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(48)">48小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(72)">72小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(96)">96小時前</button>
                    <button class="history-track-btn" onclick="jumpToHistoryPoint(120)">120小時前</button>
                </div>
            </div>

            <div class="risk-assessment-section">
                <div class="section-title">威脅分數</div>
                <div class="risk-score-container">
                    <div class="risk-score" style="color: ${riskColor};">${threatScore}</div>
                    <div class="risk-level" style="color: ${riskColor};">${riskLevel}</div>
                </div>
            </div>

            <div class="evidence-section">
                <div class="section-title">🚢 船隻資訊</div>
                <div class="ship-info-card">
                    <div class="ship-header">
                        <span class="ship-type">${shipInfo.type}</span>
                        <span class="ship-status ${eventData.aisStatus === '已開啟' ? 'status-ais' : 'status-no-ais'}">
                            ${eventData.aisStatus === '已開啟' ? 'AIS已開啟' : 'AIS未開啟'}
                        </span>
                    </div>
                    ${(function() {
                        if (eventData.aisStatus === '已開啟') {
                            return `<div class="ship-image-container">
                        <img src="${shipInfo.image}" alt="${shipInfo.type}" class="ship-image" />
                    </div>`;
                        }
                        return '';
                    })()}
                    <div class="ship-details">
                        <div class="detail-row"><span>MMSI:</span><span>${shipInfo.mmsi}</span></div>
                        <div class="detail-row"><span>船名:</span><span>${shipInfo.name || eventData.vesselName || '未知'}</span></div>
                        <div class="detail-row"><span>船長:</span><span>${shipInfo.length}公尺</span></div>
                        <div class="detail-row"><span>船寬:</span><span>${shipInfo.beam}公尺</span></div>
                        <div class="detail-row"><span>航速:</span><span>${shipInfo.speed}節</span></div>
                        <div class="detail-row"><span>航向:</span><span>${shipInfo.course}°</span></div>
                    </div>
                </div>
            </div>

            <div class="evidence-section" style="background-color: rgba(148, 163, 184, 0.1); border-radius: 8px; padding: 15px; margin-bottom: 20px; border: 1px solid rgba(148, 163, 184, 0.2);">
                <div class="section-title">📡 RF 信號資訊</div>
                <div style="font-size: 13px; line-height: 1.8; color: #b8c5d1; margin-top: 10px;">
                    🕐 時間戳記 (UTC): ${eventData.timestamp_utc || '檢測中'}<br>
                    📡 RF 頻率: ${eventData.frequency || '檢測中'} MHz<br>
                    🌐 緯度: ${eventData.latitude_deg || '檢測中'}°<br>
                    📍 經度: ${eventData.longitude_deg || '檢測中'}°<br>
                    🎯 準確度等級: ${eventData.accuracy_level || '檢測中'}<br>
                    ⏱️ 脈衝持續時間: ${eventData.pulses_duration_ns || '檢測中'} ns<br>
                    🔄 脈衝重複頻率: ${eventData.pulses_repetition_frequency_hz || '檢測中'} Hz<br>
                    📊 波形: ${eventData.waveform || '檢測中'}<br>
                </div>
            </div>

            ${actionSection}
            
            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="rejectAction()">取消</button>
                <button class="btn btn-primary" onclick="executeAction()" id="executeActionBtn">執行行動</button>
            </div>
        `;
    }

    /**
     * 生成船舶追蹤決策建議
     * @param {number} threatScore - 威脅分數
     * @param {Object} eventData - 事件資料物件
     * @returns {Object} 決策建議物件
     */
    static generateVesselDecisionRecommendation(threatScore, eventData) {
        let recommendation = {};
        
        // 根據威脅分數決定主要建議行動
        if (threatScore >= 75) {
            recommendation = {
                primaryAction: '立即派遣載具調查',
                analysis: '高風險船舶，存在多項異常行為，需要立即進行近距離調查以確認威脅性質。',
                evidence: 'AIS長時間關閉、航線嚴重偏離、RF訊號加密異常',
                priority: '緊急',
                priorityColor: '#ef4444'
            };
        } else if (threatScore >= 60) {
            recommendation = {
                primaryAction: '衛星重拍 + 持續追蹤',
                analysis: '中高風險船舶，建議先透過衛星獲取更多資訊，同時加強追蹤頻率。',
                evidence: '部分異常指標超標，需要更多資料進行評估',
                priority: '高',
                priorityColor: '#f59e0b'
            };
        } else if (threatScore >= 40) {
            recommendation = {
                primaryAction: '持續追蹤監控',
                analysis: '中等風險船舶，保持例行監控即可，定期檢查其行為模式變化。',
                evidence: '風險指標在可控範圍內，但需要持續觀察',
                priority: '中等',
                priorityColor: '#f59e0b'
            };
        } else {
            recommendation = {
                primaryAction: '通知相關單位記錄',
                analysis: '低風險船舶，建議通知相關單位記錄備案即可，無需特殊處理。',
                evidence: '各項指標正常，符合常規航行模式',
                priority: '低',
                priorityColor: '#10b981'
            };
        }
        
        return recommendation;
    }

    /**
     * 生成船隻資訊（AIS開啟時使用）
     * @param {Object} eventData - 事件資料物件
     * @returns {Object} 生成的船隻資訊物件
     */
    static generateShipInfo(eventData) {
        const shipTypes = ['貨輪', '漁船'];
        const shipNamePrefixes = ['MV', 'SS', 'MT', 'FV'];
        const shipNameSuffixes = ['Navigator', 'Explorer', 'Pioneer', 'Guardian', 'Voyager', 'Mariner', 'Ocean Star', 'Sea Wind'];
        const destinations = ['高雄港', '基隆港', '台中港', '花蓮港', '台南港', '馬公港', '金門港'];
        
        // 根據 eventData 生成一致的船隻資訊
        const rfId = eventData.rfId || eventData.id || 'VESSEL-DEFAULT';
        const seed = rfId.split('-')[1] || '000';
        const numSeed = parseInt(seed.replace(/[^0-9]/g, ''), 16) || parseInt(seed, 10) || 123;
        
        const selectedShipType = shipTypes[numSeed % shipTypes.length];
        
        // 根據船舶類型和 AIS 狀態獲取對應的圖片路徑
        const getShipImage = (shipType, aisStatus) => {
            // 判斷 AIS 狀態是否開啟
            const isAisOn = aisStatus === '已開啟' || aisStatus === 'AIS' || aisStatus === 'ais';
            const folderPath = isAisOn ? 'images/AIS' : 'images/No_AIS';
            return `${folderPath}/${shipType}.jpg`;
        };
        
        return {
            name: eventData.vesselName || `${shipNamePrefixes[numSeed % shipNamePrefixes.length]} ${seed} ${shipNameSuffixes[numSeed % shipNameSuffixes.length]}`,
            mmsi: eventData.mmsi || `416${(numSeed % 1000000).toString().padStart(6, '0')}`,
            type: eventData.vesselType || selectedShipType,
            image: getShipImage(eventData.vesselType || selectedShipType, eventData.aisStatus),
            length: 80 + (numSeed % 270),
            beam: 12 + (numSeed % 35),
            destination: destinations[numSeed % destinations.length],
            speed: 8 + (numSeed % 15),
            course: numSeed % 360
        };
    }

    /**
     * 跳轉到歷史軌跡點
     * @param {number} hoursBack - 回溯小時數
     */
    static jumpToHistoryPoint(hoursBack) {
        console.log(`🟢 [VesselEventManager] jumpToHistoryPoint 被呼叫, hoursBack: ${hoursBack}`);
        console.log(`🟢 [VesselEventManager] historyTrackManager 狀態:`, {
            exists: !!window.historyTrackManager,
            hasMethod: window.historyTrackManager && typeof window.historyTrackManager.jumpToHistoryPoint === 'function'
        });

        if (window.historyTrackManager && typeof window.historyTrackManager.jumpToHistoryPoint === 'function') {
            window.historyTrackManager.jumpToHistoryPoint(hoursBack);
        } else {
            console.error('❌ historyTrackManager 尚未初始化或方法不存在');
        }
    }
}

  // expose a global instance
  window.VesselEventManager = VesselEventManager;
})();