// UIUX/ui/popups.js
(function () {
    function createRFSignalPopupContent(dotData) {
        // Use canonical-safe helpers if available
        const helpers = (window.safePointHelpers || {});
        const getTrackPointData = helpers.getTrackPointData || (p => p || {});
        const getDisplay = helpers.getDisplay || (p => (p && p.display) || {});
    // prefer canonical helper; fallback prefers display.* then legacy color field
    const getDotColor = helpers.getDotColor || (p => (getDisplay(p) && getDisplay(p).dotColor) || (p && p.color) || null);

        const tp = getTrackPointData(dotData) || {};
        const disp = getDisplay(dotData) || {};

        const lat = (typeof tp.lat === 'number') ? tp.lat : (tp.latitude || tp.lat || null);
        const lon = (typeof tp.lon === 'number') ? tp.lon : (tp.longitude || tp.lon || null);
        const latStr = (typeof lat === 'number') ? lat.toFixed(3) + '°N' : '未知';
        const lonStr = (typeof lon === 'number') ? lon.toFixed(3) + '°E' : '未知';

        const rawStatus = tp.status || disp.status || dotData.status || '';
        const statusText = (function(s){
            switch(String(s)) {
                case 'AIS': return '已開啟';
                case 'No AIS': return '未開啟';
                case 'unknown': return '狀態未知';
                default: return '監測中';
            }
        })(rawStatus);

        // AIS 狀態文字顏色：直接根據 status 判斷，不依賴圖標顏色
        const statusTextColor = (function(s){
            switch(String(s)) {
                case 'AIS': return '#059669';      // 綠色：已開啟
                case 'No AIS': return '#ef4444';   // 紅色：未開啟
                case 'unknown': return '#6b7280';  // 灰色：狀態未知
                default: return '#6b7280';         // 灰色：監測中
            }
        })(rawStatus);

        // prefer helper; if helper missing, fallback to display->legacy color->default
        const resolvedColor = (typeof getDotColor === 'function') ? (getDotColor(dotData) || '#666') : '#666';
        
        // 優先使用 dotData.rfId（這是最可靠的來源），其次是 tp.rfId
        const rfId = dotData.rfId || tp.rfId || '';
        
        // 如果沒有 rfId，記錄警告
        if (!rfId) {
            console.warn('⚠️ Popup 中的 dotData 沒有 rfId:', dotData);
        }

        // 🆕 查找該 RF 信號點的威脅分數和船隻 MMSI
        let threatScore = null;
        let threatScoreSource = null;
        let vesselMmsi = null;
        let vesselType = null;
        
        // 優先從 dotData 本身獲取船隻 MMSI（最直接的來源）
        if (dotData.vesselMmsi) {
            vesselMmsi = dotData.vesselMmsi;
            vesselType = dotData.vesselType || null;
            console.log(`✅ 從 dotData 獲取到船隻 MMSI: ${vesselMmsi} (${vesselType})`);
        }
        
        // 如果 dotData 中沒有，嘗試從 seaDotManager 獲取
        if (!vesselMmsi && rfId && window.seaDotManager) {
            const dot = window.seaDotManager.getDotByRFId(rfId);
            if (dot && dot.vesselMmsi) {
                vesselMmsi = dot.vesselMmsi;
                vesselType = dot.vesselType || null;
                console.log(`✅ 從 seaDotManager 獲取到船隻 MMSI: ${vesselMmsi} (${vesselType})`);
            }
        }
        
        // 嘗試從區域監控事件的可疑船隻候選資料中獲取威脅分數和 MMSI
        if (rfId && window.eventStorage) {
            const allEvents = window.eventStorage.getAllEvents ? window.eventStorage.getAllEvents() : [];
            
            // 查找包含此 rfId 的區域監控事件
            const areaEvents = allEvents.filter(event => 
                event.type === 'area' && 
                event.suspiciousVesselCandidatesData && 
                event.suspiciousVesselCandidatesData.length > 0
            );
            
            // 在所有區域事件中查找包含此 rfId 的候選資料
            for (const areaEvent of areaEvents) {
                const candidateData = areaEvent.suspiciousVesselCandidatesData.find(
                    data => data.rfId === rfId
                );
                
                if (candidateData) {
                    // 獲取威脅分數
                    if (candidateData.threatScore !== undefined) {
                        threatScore = candidateData.threatScore;
                        threatScoreSource = 'area-event';
                        console.log(`✅ 從區域事件 ${areaEvent.id} 獲取到威脅分數: ${threatScore}`);
                    }
                    
                    // 如果之前沒有獲取到 MMSI，嘗試從 suspiciousVessel 中獲取
                    if (!vesselMmsi && candidateData.suspiciousVessel) {
                        vesselMmsi = candidateData.suspiciousVessel.vesselMmsi;
                        vesselType = candidateData.suspiciousVessel.vesselType || null;
                        console.log(`✅ 從區域事件可疑船隻資料獲取到 MMSI: ${vesselMmsi} (${vesselType})`);
                    }
                    
                    break;
                }
            }
        }

        // 檢查此 RF 信號是否出現在船舶追蹤事件中
        let vesselEventInfo = null;
        let hasVesselEvent = false;
        if (rfId && window.eventStorage) {
            // 獲取所有事件
            const allEvents = window.eventStorage.getAllEvents ? window.eventStorage.getAllEvents() : [];
            // 查找包含此 rfId 的船舶事件
            const vesselEvents = allEvents.filter(event => 
                event.type === 'vessel' && event.rfId === rfId
            );
            
            if (vesselEvents.length > 0) {
                // 使用最新的船舶事件
                vesselEventInfo = vesselEvents[vesselEvents.length - 1];
                hasVesselEvent = true;
                
                // 🆕 如果還沒有威脅分數，嘗試從船舶事件中獲取
                if (threatScore === null && vesselEventInfo.threatScore !== undefined) {
                    threatScore = vesselEventInfo.threatScore;
                    threatScoreSource = 'vessel-event';
                    console.log(`✅ 從船舶事件 ${vesselEventInfo.id} 獲取到威脅分數: ${threatScore}`);
                }
            }
        }

        // 構建船舶追蹤資訊區塊
        let vesselTrackingSection = '';
        if (vesselEventInfo) {
            const vesselStatus = vesselEventInfo.status === 'investigating' ? '調查中' : 
                                vesselEventInfo.status === 'completed' ? '已結束' : '監控中';
            const statusColor = vesselEventInfo.status === 'investigating' ? '#f59e0b' : 
                               vesselEventInfo.status === 'completed' ? '#6b7280' : '#3b82f6';
            
            vesselTrackingSection = `
                <div style="background: linear-gradient(135deg, #dbeafe, #bfdbfe); padding: 8px; border-radius: 6px; margin-bottom: 12px; border-left: 4px solid #3b82f6;">
                    <div style="font-size: 10px; color: #1e40af; margin-bottom: 4px; font-weight: bold;">📡 已列入船舶追蹤</div>
                    <div style="font-size: 11px; color: #1e3a8a;">
                        <strong>事件編號:</strong> ${vesselEventInfo.id.toUpperCase()}<br>
                        <strong>MMSI:</strong> ${vesselEventInfo.mmsi || '未知'}<br>
                        <strong>威脅分數:</strong> <span style="color: #dc2626; font-weight: bold;">${vesselEventInfo.threatScore || 'N/A'}</span><br>
                        <strong>狀態:</strong> <span style="color: ${statusColor}; font-weight: bold;">${vesselStatus}</span>
                    </div>
                </div>
            `;
        }

        // 🆕 構建威脅分數顯示區塊（主要資訊，視覺焦點）
        let threatScoreSection = '';
        if (threatScore !== null && !hasVesselEvent) {
            // 根據威脅分數決定顏色和背景
            const scoreColor = threatScore < 60 ? '#10b981' : // 綠色 (低威脅)
                              threatScore >= 60 && threatScore <= 80 ? '#f59e0b' : // 黃色 (中等威脅)
                              '#ef4444'; // 紅色 (高威脅)
            
            const scoreBgGradient = threatScore < 60 ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)' : // 綠色漸層
                                   threatScore >= 60 && threatScore <= 80 ? 'linear-gradient(135deg, #fef3c7, #fed7aa)' : // 黃色漸層
                                   'linear-gradient(135deg, #fee2e2, #fecaca)'; // 紅色漸層
            
            const borderColor = threatScore < 60 ? '#10b981' :
                               threatScore >= 60 && threatScore <= 80 ? '#f59e0b' :
                               '#ef4444';
            
            const threatLevel = threatScore < 60 ? '低威脅' :
                               threatScore >= 60 && threatScore <= 80 ? '中等威脅' :
                               '高威脅';
            
            const threatIcon = threatScore < 60 ? '✅' :
                              threatScore >= 60 && threatScore <= 80 ? '⚠️' :
                              '🚨';
            
            threatScoreSection = `
                <div style="background: ${scoreBgGradient}; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 5px solid ${borderColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 10px; color: ${scoreColor}; opacity: 0.8; margin-bottom: 2px; font-weight: bold;">威脅評估</div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <span style="font-size: 28px; font-weight: bold; color: ${scoreColor};">${threatScore}</span>
                                <div>
                                    <div style="font-size: 11px; color: ${scoreColor}; background: rgba(255,255,255,0.6); padding: 2px 8px; border-radius: 12px; font-weight: bold;">${threatLevel}</div>
                                </div>
                            </div>
                        </div>
                        <div style="font-size: 32px;">${threatIcon}</div>
                    </div>
                </div>
            `;
        }

        // 構建建立船舶追蹤按鈕區塊（只在未建立船舶事件時顯示）
        let createVesselButtonSection = '';
        if (!hasVesselEvent) {
            createVesselButtonSection = `
                <div style="margin-top: 10px;">
                    <button class="create-vessel-btn" onclick="createVesselEventFromRFSignal('${rfId}', '${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E')" style="background: #135edfff; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 10px; font-weight: bold; width: 100%; margin-bottom: 4px; transition: all 0.3s ease;">建立船舶追蹤事件</button>
                </div>
            `;
        }

        return `
            <div style="color: #333; font-size: 12px; min-width: 240px;">
                <!-- 次要資訊：RF信號ID -->
                <div style="background: linear-gradient(135deg, #fef3c7, #fde68a); padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 5px solid #f59e0b; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 10px; color: #d97706; opacity: 0.8; margin-bottom: 2px; font-weight: bold;">RF信號ID</div>
                            <div style="font-size: 15px; font-weight: bold; color: #92400e; font-family: 'Courier New', monospace;">${rfId}</div>
                        </div>
                        <div style="font-size: 28px;">📡</div>
                    </div>
                </div>
            
                <!-- 主要資訊：AIS 狀態-->
                <div style="background: ${rawStatus === 'AIS' ? 'linear-gradient(135deg, #d1fae5, #a7f3d0)' : 'linear-gradient(135deg, #fee2e2, #fecaca)'}; padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 5px solid ${statusTextColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 10px; color: ${statusTextColor}; opacity: 0.8; margin-bottom: 2px; font-weight: bold;">AIS 狀態</div>
                            <div style="font-size: 20px; font-weight: bold; color: ${statusTextColor};">${statusText}</div>
                        </div>
                        <div style="font-size: 32px;">${rawStatus === 'AIS' ? '📡' : '🚫'}</div>
                    </div>
                </div>

                ${threatScoreSection}
                ${vesselTrackingSection}

                <!-- 次要資訊：可疑船隻資訊 -->
                ${vesselMmsi && !hasVesselEvent ? `
                <div style="background: linear-gradient(135deg, #ede9fe, #ddd6fe); padding: 12px; border-radius: 8px; margin-bottom: 10px; border-left: 5px solid #8b5cf6; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div>
                            <div style="font-size: 10px; color: #7c3aed; opacity: 0.8; margin-bottom: 2px; font-weight: bold;">可疑船隻資訊</div>
                            <div style="font-size: 16px; font-weight: bold; color: #6b21a8; font-family: 'Courier New', monospace;">MMSI:${vesselMmsi}</div>
                        </div>
                        <div style="font-size: 32px;">🚢</div>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 4px; padding-top: 8px; border-top: 1px solid rgba(139, 92, 246, 0.2);">
                        ${vesselType ? `
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-size: 10px; color: #7c3aed; font-weight: 600;">類型:</span>
                            <span style="font-size: 11px; color: #6b21a8; background: rgba(255,255,255,0.6); padding: 2px 8px; border-radius: 10px; font-weight: bold;">${vesselType}</span>
                        </div>
                        ` : ''}
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div style="font-size: 10px; color: #7c3aed; font-weight: 600;">座標:</div>
                            <div style="display: flex; gap: 6px; background: rgba(255,255,255,0.5); padding: 4px 10px; border-radius: 6px; flex: 1;">
                                <span style="font-size: 11px; color: #6b21a8; font-family: 'Courier New', monospace; font-weight: 600;">${latStr}</span>
                                <span style="font-size: 11px; color: #9333ea; font-weight: bold;">|</span>
                                <span style="font-size: 11px; color: #6b21a8; font-family: 'Courier New', monospace; font-weight: 600;">${lonStr}</span>
                            </div>
                        </div>
                    </div>
                </div>
                ` : ''}

                ${createVesselButtonSection}
            </div>
        `;
    }

    function updateRFSignalPopupContent(marker, dotData) {
        const content = createRFSignalPopupContent(dotData);
        if (marker.getPopup()) {
            marker.setPopupContent(content);
        } else {
            marker.bindPopup(content);
        }
    }

    function createTrackPointPopupContent(trackPointData, taskStatus, vesselId) {
        // Use canonical-safe helpers if available
        const helpers = (window.safePointHelpers || {});
        const getSafePointId = helpers.getSafePointId || (p => (p && (p.pointId || p.id)) || null);

        const point = trackPointData || {};
        const lat = point.lat || 0;
        const lon = point.lon || 0;
        const latStr = lat.toFixed(6) + '°N';
        const lonStr = lon.toFixed(6) + '°E';
        const formattedTime = point.timestamp ? new Date(point.timestamp).toLocaleString('zh-TW') : '未知時間';
        // Check for linked missions
        const pointId = getSafePointId(point);
        const vesselIdStr = (vesselId || 'UNKNOWN').toString().toUpperCase();

        // 🔴 核心修正：直接查詢 missionTrackManager，不依賴 hasTask
        let linkedMissions = [];
        if (window.missionTrackManager && pointId) {
            linkedMissions = window.missionTrackManager.getLinkedMissions(pointId) || [];
            // 過濾掉無效或已刪除的任務
            linkedMissions = linkedMissions.filter(mission => 
                mission && mission.missionId && mission.status
            );
        }

        console.log('Popup debug - pointId:', pointId, 'linkedMissions:', linkedMissions);

        // Mission info section
        let missionInfo = '';
        if (linkedMissions && linkedMissions.length > 0) {
            // 定義圖示映射（與 script.js 保持一致）
            const actionIconMap = {
                'uav': '🚁',
                'UAV 派遣': '🚁',
                'satellite': '🛰️',
                '衛星重拍': '🛰️',
                'notify': '📞',
                '聯繫船隻': '📞',
                'track': '🎯',
                '持續追蹤': '🎯'
            };
            
            missionInfo = linkedMissions.map(mission => {
                const statusColor = mission.status === '已完成' ? '#10b981' :
                                   mission.status === '執行任務' ? '#f59e0b' : '#6b7280';
                const missionType = mission.actionName || mission.type || '未知任務';
                
                // 取得任務圖示（與任務列表一致）
                const missionIcon = mission.actionIcon || 
                                   actionIconMap[mission.actionName] || 
                                   actionIconMap[mission.type] || 
                                   actionIconMap[mission.action] || 
                                   '❓';
                
                return `
                    <div style="background: linear-gradient(135deg, #f0f9ff, #e0f2fe); padding: 10px; border-radius: 6px; margin-bottom: 8px; border-left: 4px solid #0284c7;">
                        <div style="font-size: 11px; color: #0369a1; margin-bottom: 4px;">${missionIcon} ${missionType}</div>
                        <div style="font-size: 10px; color: #0369a1; margin-bottom: 2px;">
                            <strong>狀態:</strong> <span style="color: ${statusColor}; font-weight: bold;">${mission.status}</span>
                        </div>
                        <div style="font-size: 10px; color: #0369a1; margin-bottom: 2px;">
                            <strong>進度:</strong> ${mission.progress || 0}%
                        </div>
                        <div style="font-size: 10px; color: #0369a1;">
                            <strong>目標:</strong> ${mission.target || 'N/A'}
                        </div>
                    </div>
                `;
            }).join('');
        }

        return `
            <div style="color: #333; font-size: 12px; min-width: 280px; max-width: 320px;">
                <div style="margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #374151;">🚢 ${vesselIdStr} 軌跡點詳情</strong>
                </div>

                ${missionInfo}

                <div style="margin-bottom: 8px;">
                    <strong>📍 座標:</strong> ${latStr}, ${lonStr}<br>
                    <strong>⏰ 時間:</strong> ${formattedTime}<br>
                    <strong>🚢 狀態:</strong> <span style="color: ${linkedMissions.length > 0 ? '#f59e0b' : '#10b981'};">${linkedMissions.length > 0 ? '執行任務中' : '正常航行'}</span>
                </div>

                ${point.speed ? `
                <div style="margin-bottom: 8px; font-size: 11px;">
                    <strong>航行速度:</strong> ${typeof point.speed === 'number' ? point.speed.toFixed(1) : parseFloat(point.speed).toFixed(1)} 節<br>
                    ${point.course ? `<strong>航向:</strong> ${typeof point.course === 'number' ? point.course.toFixed(0) : parseFloat(point.course).toFixed(0)}°<br>` : ''}
                    ${point.signalStrength ? `<strong>信號強度:</strong> ${typeof point.signalStrength === 'number' ? point.signalStrength.toFixed(1) : parseFloat(point.signalStrength).toFixed(1)} dBm<br>` : ''}
                </div>
                ` : ''}

                ${linkedMissions.length > 0 ? `
                <div style="margin-top: 10px;">
                    <button onclick="if(window.showMissionDetails) window.showMissionDetails('${linkedMissions[0].missionId}');"
                            style="background: #0284c7; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer; font-size: 11px; width: 100%;">
                        查看任務詳情
                    </button>
                </div>
                ` : ''}
            </div>
        `;
    }

    window.popups = window.popups || {};
    window.popups.createRFSignalPopupContent = createRFSignalPopupContent;
    window.popups.createTrackPointPopupContent = createTrackPointPopupContent;
    window.popups.updateRFSignalPopupContent = updateRFSignalPopupContent;
})();
