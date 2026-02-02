/**
 * 歷史軌跡管理模組
 * 負責處理船舶歷史軌跡的顯示、清除、跳轉等功能
 */
(function(){
    class HistoryTrackManager {
        constructor() {
            // 歷史軌跡相關的實例變數
            this.historyTrackAnimation = null;
            this.currentTrackingVesselId = null;
            this.currentHistoryLayers = [];
        }

        /**
         * 顯示船舶歷史軌跡（重構後）
         * @param {Object} vesselEvent - 船舶事件資料
         */
        displayHistoryTrack(vesselEvent) {
            this.clearHistoryTrack(); // 清除舊的歷史軌跡

            if (!vesselEvent || !vesselEvent.trackPoints || !Array.isArray(vesselEvent.trackPoints)) {
                console.warn("⚠️ 無效的船舶事件或缺少軌跡點資訊");
                return;
            }

            console.log(`🗺️ 正在為 ${vesselEvent.id} 顯示 ${vesselEvent.trackPoints.length} 個歷史軌跡點`);
            this.currentTrackingVesselId = vesselEvent.id; // 在顯示軌跡時，設定當前追蹤的船舶ID

            const currentTime = new Date();

            // 由於現在只生成重要時間點，所有點都直接顯示
            const allPoints = [...vesselEvent.trackPoints].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // 分別繪製歷史和未來軌跡線
            if (allPoints.length > 1) {
                // 分離歷史點、當前點、未來點
                const historyPoints = allPoints.filter(point => point.type === 'History');
                const currentPoints = allPoints.filter(point => point.type === 'Current');
                const futurePoints = allPoints.filter(point => point.type === 'Future');

                // 組合順序：歷史 -> 當前 -> 未來
                const orderedPoints = [...historyPoints, ...currentPoints, ...futurePoints];

                // 繪製歷史軌跡線（實線）
                if (historyPoints.length > 0) {
                    let historyLinePoints = historyPoints.map(point => [point.lat, point.lon]);
                    // 如果有當前點，連接到當前點
                    if (currentPoints.length > 0) {
                        historyLinePoints.push([currentPoints[0].lat, currentPoints[0].lon]);
                    }

                    if (historyLinePoints.length > 1) {
                        const historyLine = L.polyline(historyLinePoints, {
                            color: '#3b82f6',
                            weight: 2,
                            opacity: 0.7
                            // 實線：不設定 dashArray
                        });
                        historyLine.addTo(mainMap);
                        this.currentHistoryLayers.push(historyLine);
                    }
                }

                // 繪製未來軌跡線（虛線）
                if (futurePoints.length > 0) {
                    let futureLinePoints = futurePoints.map(point => [point.lat, point.lon]);
                    // 如果有當前點，從當前點開始
                    if (currentPoints.length > 0) {
                        futureLinePoints.unshift([currentPoints[0].lat, currentPoints[0].lon]);
                    }

                    if (futureLinePoints.length > 1) {
                        const futureLine = L.polyline(futureLinePoints, {
                            color: '#fbbf24',
                            weight: 2,
                            opacity: 0.7,
                            dashArray: '8, 8'  // 虛線
                        });
                        futureLine.addTo(mainMap);
                        this.currentHistoryLayers.push(futureLine);
                    }
                }
            }

            // 然後顯示所有軌跡點標記
            vesselEvent.trackPoints.forEach(point => {
                const pointTime = new Date(point.timestamp);
                const isPast = pointTime < currentTime;

                let trackPointType, trackPointStatus;

                // ⚠️ 重要: 保留原始的 type,特別是 'Current' 類型
                if (point.type === 'Current') {
                    trackPointType = 'Current';
                    trackPointStatus = 'AIS';
                } else if (point.type === 'Future') {
                    trackPointType = 'Future';
                    trackPointStatus = point.hasTask ? 'Scheduled' : 'AIS';
                } else if (point.type === 'History') {
                    trackPointType = 'History';
                    trackPointStatus = point.hasTask ? 'Completed' : 'AIS';
                } else {
                    // 如果沒有 type,根據時間判斷
                    if (isPast) {
                        trackPointType = 'History';
                        trackPointStatus = point.hasTask ? 'Completed' : 'AIS';
                    } else {
                        trackPointType = 'Future';
                        trackPointStatus = point.hasTask ? 'Scheduled' : 'AIS';
                    }
                }

                let marker;
                if (seaDotManager && typeof seaDotManager.createTrackSeaDotFromPoint === 'function') {
                    // ⚠️ 重要: 明確覆寫 type 為修正後的 trackPointType
                    marker = seaDotManager.createTrackSeaDotFromPoint(
                        Object.assign({}, point, {
                            pointId: point.pointId || getSafePointId(point),
                            type: trackPointType  // 使用修正後的類型
                        })
                    );
                } else {
                    marker = seaDotManager.createTrackSeaDot(
                        point.lat,
                        point.lon,
                        getSafePointId(point),
                        trackPointStatus,
                        trackPointType,
                        point,
                        vesselEvent.id
                    );
                }

                if (marker) {
                    marker.addTo(mainMap);
                    this.currentHistoryLayers.push(marker);
                }
            });

            // === 顯示遺漏的 AIS 發送點（已停用，只在console顯示）===
            if (vesselEvent.missingAISPoints && Array.isArray(vesselEvent.missingAISPoints) && vesselEvent.missingAISPoints.length > 0) {
                console.log(`ℹ️ 檢測到 ${vesselEvent.missingAISPoints.length} 個遺漏的 AIS 點（僅在console顯示，不在地圖上顯示）`);
            } else {
                console.log(`ℹ️ 沒有遺漏的 AIS 點`);
            }

            console.log(`✅ 歷史軌跡顯示完成：${vesselEvent.trackPoints.length} 個重要時間點 + 軌跡連線 ${vesselEvent.missingAISPoints?.length ? `(已檢測到 ${vesselEvent.missingAISPoints.length} 個遺漏 AIS 點)` : ''}`);
        }

        /**
         * 清除船舶歷史軌跡的輔助函數
         */
        clearHistoryTrack() {
            if (this.currentHistoryLayers) {
                this.currentHistoryLayers.forEach(layer => mainMap.removeLayer(layer));
                this.currentHistoryLayers = [];
            }
            // 停止任何可能在運行的舊動畫
            if (this.historyTrackAnimation && this.historyTrackAnimation.timeout) {
                clearTimeout(this.historyTrackAnimation.timeout);
                this.historyTrackAnimation = null;
            }
            // 當清除軌跡時，也清除當前追蹤的船舶ID
            // this.currentTrackingVesselId = null;
        }

        /**
         * 跳轉到歷史軌跡點的函數
         * @param {number} hoursBack - 要跳轉到的小時數（從現在往前推算）
         */
        jumpToHistoryPoint(hoursBack) {
            console.log(`🟡 [HistoryTrackManager] jumpToHistoryPoint 被呼叫, hoursBack: ${hoursBack}`);
            console.log(`🟡 [HistoryTrackManager] 當前狀態:`, {
                currentTrackingVesselId: this.currentTrackingVesselId,
                historyTrackAnimation: this.historyTrackAnimation ? this.historyTrackAnimation.vesselId : null
            });

            // 添加按鈕點擊效果
            try {
                const clickedButton = event.target;
                clickedButton.classList.add('clicked');
                setTimeout(() => {
                    clickedButton.classList.remove('clicked');
                }, 600);
            } catch (e) {
                console.warn('⚠️ 無法添加按鈕點擊效果:', e.message);
            }

            // 首先檢查是否有當前追蹤的船舶
            let targetVesselId = this.currentTrackingVesselId;
            console.log(`🚢 當前追蹤的船舶ID: ${targetVesselId}`);

            // 如果沒有當前追蹤的船舶，嘗試從正在運行的歷史軌跡動畫中獲取
            if (!targetVesselId && this.historyTrackAnimation && this.historyTrackAnimation.vesselId) {
                targetVesselId = this.historyTrackAnimation.vesselId;
                console.log(`🔄 使用正在顯示歷史軌跡的船舶: ${targetVesselId}`);
            }

            if (!targetVesselId) {
                console.warn('⚠️ 目前沒有選中的船舶事件，無法跳轉到歷史軌跡點');
                // 顯示用戶友好的提示
                if (typeof showUserMessage === 'function') {
                    showUserMessage('請先點擊船舶事件卡片來選擇一個船舶，然後再使用歷史軌跡檢視', 'warning');
                }
                return;
            }

            // 獲取當前船舶事件
            console.log(`🔍 嘗試從 eventStorage 獲取事件，ID: ${targetVesselId}`);
            console.log(`🔍 eventStorage 是否存在:`, typeof eventStorage);
            const vesselEvent = eventStorage.getEvent(targetVesselId);
            console.log(`🔍 獲取到的 vesselEvent:`, vesselEvent);
            if (vesselEvent) {
                console.log(`🔍 vesselEvent.trackPoints 存在:`, !!vesselEvent.trackPoints);
                console.log(`🔍 vesselEvent.trackPoints 長度:`, vesselEvent.trackPoints?.length);
            }
            if (!vesselEvent || !vesselEvent.trackPoints || vesselEvent.trackPoints.length === 0) {
                console.warn('⚠️ 船舶事件沒有歷史軌跡點資料');
                if (typeof showUserMessage === 'function') {
                    showUserMessage('該船舶事件沒有可用的歷史軌跡資料', 'warning');
                }
                return;
            }
            
            console.log(`🎯 準備跳轉到船舶 ${targetVesselId} 的前${hoursBack}小時位置...`);
            
            // 獲取當前船舶位置
            const currentPosition = this.getCurrentVesselPosition(vesselEvent);
            if (!currentPosition) {
                console.warn('⚠️ 無法獲取當前船舶位置');
                if (typeof showUserMessage === 'function') {
                    showUserMessage('無法獲取船舶當前位置', 'error');
                }
                return;
            }
            
            // 根據指定的小時數找到對應的歷史軌跡點
            const targetPoint = this.findHistoryPointByHours(vesselEvent.trackPoints, hoursBack);
            if (!targetPoint) {
                console.warn(`⚠️ 找不到前${hoursBack}小時的歷史軌跡點`);
                if (typeof showUserMessage === 'function') {
                    showUserMessage(`找不到前${hoursBack}小時的歷史軌跡點`, 'warning');
                }
                return;
            }
            
            console.log(`📍 找到前${hoursBack}小時的位置: (${targetPoint.lat.toFixed(4)}, ${targetPoint.lon.toFixed(4)})`);
            
            // 自動定位到該點
            this.focusOnHistoryPoint(targetPoint, hoursBack);
            
            // 顯示成功提示
                    
            // showUserMessage(`已定位到前${hoursBack}小時的位置`, 'success');
        }

        /**
         * 獲取當前船舶位置
         * @param {Object} vesselEvent - 船舶事件資料
         * @returns {Object|null} 座標物件或null
         */
        getCurrentVesselPosition(vesselEvent) {
            console.log(`🟢 [getCurrentVesselPosition] 被呼叫`);

            // 方法1: 嘗試從 trackPoints 中找到 Current 點
            if (vesselEvent.trackPoints && Array.isArray(vesselEvent.trackPoints)) {
                const currentPoint = vesselEvent.trackPoints.find(p => p.type === 'Current');
                if (currentPoint && currentPoint.lat && currentPoint.lon) {
                    console.log(`✅ 從 trackPoints 找到 Current 點: (${currentPoint.lat}, ${currentPoint.lon})`);
                    return { lat: currentPoint.lat, lon: currentPoint.lon };
                }
            }

            // 方法2: 嘗試解析 coordinates 欄位
            if (vesselEvent.coordinates && typeof parsePointCoordinates === 'function') {
                try {
                    const coords = parsePointCoordinates(vesselEvent.coordinates);
                    if (coords && coords.lat && coords.lon) {
                        console.log(`✅ 從 coordinates 欄位解析座標: (${coords.lat}, ${coords.lon})`);
                        return coords;
                    }
                } catch (error) {
                    console.warn('⚠️ 解析 coordinates 欄位失敗:', error);
                }
            }

            console.warn('⚠️ 無法從任何來源獲取當前船舶位置');
            return null;
        }

        /**
         * 根據小時數找到對應的歷史軌跡點
         * @param {Array} trackPoints - 軌跡點陣列
         * @param {number} hoursBack - 要查找的小時數
         * @returns {Object|null} 軌跡點物件或null
         */
        findHistoryPointByHours(trackPoints, hoursBack) {
            const totalPoints = trackPoints.length;
            if (totalPoints === 0) return null;
            
            // 重要時間點數組，與生成軌跡點時使用的相同
            const importantHours = [120, 96, 72, 48, 24, 12, 6, 3, 0];
            
            // 找到最接近的時間點索引
            let closestIndex = -1;
            let minDiff = Infinity;
            
            importantHours.forEach((hours, index) => {
                const diff = Math.abs(hours - hoursBack);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestIndex = index;
                }
            });
            
            // 確保索引在有效範圍內
            if (closestIndex >= 0 && closestIndex < totalPoints) {
                const selectedPoint = trackPoints[closestIndex];
                const actualHours = importantHours[closestIndex];
                
                console.log(`📊 軌跡點選擇詳情:
                    - 總點數: ${totalPoints}
                    - 要求時間: ${hoursBack}小時前
                    - 實際選中: ${actualHours}小時前 (索引: ${closestIndex})
                    - 選中點座標: (${selectedPoint.lat.toFixed(4)}, ${selectedPoint.lon.toFixed(4)})`);
                
                return selectedPoint;
            }
            
            // 如果沒有找到合適的索引，返回第一個點
            console.warn(`⚠️ 無法找到 ${hoursBack} 小時前的軌跡點，返回第一個可用點`);
            return trackPoints[0];
        }

        /**
         * 聚焦到歷史軌跡點
         * @param {Object} targetPoint - 目標軌跡點
         * @param {number} hoursBack - 小時數
         */
        focusOnHistoryPoint(targetPoint, hoursBack) {
            if (!mainMap) {
                console.warn('⚠️ 地圖未初始化');
                return;
            }
            
            // 保持當前縮放等級，不進行自動放大
            const currentZoom = mainMap.getZoom();
            
            console.log(`🔍 準備移動地圖到: (${targetPoint.lat.toFixed(6)}, ${targetPoint.lon.toFixed(6)}), 保持縮放: ${currentZoom}`);
            
            // 強制刷新地圖容器尺寸（防止容器尺寸問題）
            setTimeout(() => {
                mainMap.invalidateSize();
            }, 10);
            
            // 延遲後移動地圖（防止其他操作干擾）
            setTimeout(() => {
                mainMap.setView([targetPoint.lat, targetPoint.lon], currentZoom, {
                    animate: true,
                    duration: 1.5,
                    easeLinearity: 0.25
                });
            }, 20);
            
            // 在目標點顯示一個臨時標記
            this.showTemporaryMarker(targetPoint, hoursBack);
            
            // 突出顯示該時間段的軌跡
            this.highlightHistorySegment(hoursBack);
        }

        /**
         * 突出顯示歷史軌跡段
         * @param {number} hoursBack - 小時數
         */
        highlightHistorySegment(hoursBack) {
            if (!this.currentTrackingVesselId || !this.historyTrackAnimation || !this.historyTrackAnimation.layers) {
                return;
            }
            
            // 獲取船舶事件和軌跡點
            const vesselEvent = eventStorage.getEvent(this.currentTrackingVesselId);
            if (!vesselEvent || !vesselEvent.trackPoints) {
                return;
            }
            
            const trackPoints = vesselEvent.trackPoints;
            const totalPoints = trackPoints.length;
            
            // 計算要突出顯示的軌跡段範圍
            const totalHours = 2;
            const hoursPerPoint = totalHours / totalPoints;
            const pointsBack = Math.round(hoursBack / hoursPerPoint);
            const targetIndex = Math.max(0, totalPoints - 1 - pointsBack);
            
            // 突出顯示該段軌跡的標記
            this.historyTrackAnimation.layers.forEach((layer, index) => {
                if (layer.setStyle) { // 是線段
                    if (index <= targetIndex * 2 + 1) { // 線段索引計算
                        layer.setStyle({
                            color: '#ff6b6b',
                            weight: 3,
                            opacity: 0.9
                        });
                    } else {
                        layer.setStyle({
                            color: 'grey',
                            weight: 1,
                            opacity: 0.5
                        });
                    }
                }
            });
            
            // 2秒後恢復原來的樣式
            setTimeout(() => {
                if (this.historyTrackAnimation && this.historyTrackAnimation.layers) {
                    this.historyTrackAnimation.layers.forEach(layer => {
                        if (layer.setStyle) {
                            layer.setStyle({
                                color: 'grey',
                                weight: 1,
                                opacity: 1,
                                dashArray: '5, 5'
                            });
                        }
                    });
                }
            }, 2000);
        }

        /**
         * 顯示臨時標記
         * @param {Object} point - 軌跡點
         * @param {number} hoursBack - 小時數
         */
        showTemporaryMarker(point, hoursBack) {
            // 創建一個臨時標記來標示目標點
            const tempMarker = L.marker([point.lat, point.lon], {
                icon: L.divIcon({
                    className: 'temp-history-marker',
                    html: `<div style="
                        background: #ff6b6b;
                        border: 3px solid white;
                        border-radius: 50%;
                        width: 24px;
                        height: 24px;
                        box-shadow: 0 0 10px rgba(255, 107, 107, 0.7);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 10px;
                        font-weight: bold;
                        color: white;
                    ">${hoursBack}h</div>`,
                    iconSize: [24, 24],
                    iconAnchor: [12, 22]  // 修改為與三角形軌跡點相同的錨點位置
                })
            }).addTo(mainMap);
            
            // 添加彈出提示
            tempMarker.bindPopup(`
                <div style="text-align: center;">
                    <strong>${hoursBack}小時前</strong><br>
                    <span style="font-size: 12px; color: #666;">
                        座標: ${point.lat.toFixed(4)}°N, ${point.lon.toFixed(4)}°E
                    </span>
                </div>
            `, {
                offset: [0, -10]  // 將popup往上移15像素
            }).openPopup();
            
            // 3秒後自動移除標記
            setTimeout(() => {
                mainMap.removeLayer(tempMarker);
                console.log(`🗑️ 已移除前${hoursBack}小時位置的臨時標記`);
            }, 3000);
        }
    }

    window.historyTrackManager = new HistoryTrackManager();
})();