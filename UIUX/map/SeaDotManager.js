// UIUX/map/SeaDotManager.js
// Lightweight wrapper to ensure a global `window.seaDotManager` is available.
// This file is a safe bridge for incremental refactoring: it does not
// move or duplicate logic from the monolithic `UIUX/script.js` but exposes
// the SeaDotManager class instance when it's defined there.
// This file intentionally does NOT auto-instantiate a SeaDotManager.
// It only exposes a helper that other modules can call to attach a single
// instance when appropriate. This avoids double-instantiation due to
// script load order during the incremental refactor.
// UIUX/map/SeaDotManager.js
// Standalone implementation of the SeaDotManager class extracted from the monolithic
// `UIUX/script.js`. This file registers `window.SeaDotManager` (the class) and
// exposes `window.__attachSeaDotManager()` helper which will instantiate a single
// `window.seaDotManager` when called by application bootstrap code.

(function(){
    class SeaDotManager {
        constructor() {
            this.seaDots = new Map(); // 儲存所有海域監測點
            this.dotIdCounter = 1;
        }

        createSeaDotIcon(dotData, sizes, shadowColor, borderStyle) {
            let shapeStyle = '';
                // prefer canonical helpers when available to resolve display colors
                const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
                // prefer helpers which already resolve display.*; fall back to display.* then legacy fields
                const _getDotColor = helpers && typeof helpers.getDotColor === 'function' ? helpers.getDotColor : (p => ((p && p.display && p.display.dotColor) ? p.display.dotColor : (p && p.dotColor) || null));
                const _getBackgroundColor = helpers && typeof helpers.getBackgroundColor === 'function' ? helpers.getBackgroundColor : (p => ((p && p.display && p.display.backgroundColor) ? p.display.backgroundColor : (p && p.backgroundColor) || (p && p.bgColor) || null));
                // ⚠️ 重要: type 檢查必須優先，避免被其他顏色覆蓋
                let resolvedBackground;

                // 強制設定 Current 和 Future 的顏色
                if (dotData && dotData.type === 'Current') {
                    resolvedBackground = '#ef4444'; // 紅色
                } else if (dotData && dotData.type === 'Future') {
                    resolvedBackground = '#FFD54A'; // 黃色
                } else {
                    // 其他類型才使用 helper functions
                    if (typeof _getDotColor === 'function') resolvedBackground = _getDotColor(dotData) || null;
                    if (!resolvedBackground && typeof _getBackgroundColor === 'function') resolvedBackground = _getBackgroundColor(dotData) || null;
                    if (!resolvedBackground) {
                        resolvedBackground = '#2196F3'; // 藍色預設
                    }
                }
                const resolvedDotColor = resolvedBackground;
            let iconAnchor = sizes.iconAnchor;
            // ⚠️ 重要修正: Current 類型使用圓形樣式，History/Future 使用三角形
            const isTriangleTrackPoint = dotData.type === 'History' || dotData.type === 'Future';
            const isCurrentPoint = dotData.type === 'Current';

            if (isTriangleTrackPoint) {
                // History 和 Future 使用三角形
                shapeStyle = `
                    width: 0;
                    height: 0;
                    border-left: ${sizes.width/2}px solid transparent;
                    border-right: ${sizes.width/2}px solid transparent;
                    border-bottom: ${sizes.height}px solid ${resolvedBackground};
                    border-radius: 0;
                    box-shadow: 0 2px 8px ${shadowColor};
                `;
                borderStyle = '';
                iconAnchor = [sizes.iconSize[0]/2, sizes.iconSize[1] - 2];
            } else {
                // Current 和其他類型使用圓形
                // ⚠️ 暫時停用 Current 類型的脈衝動畫
                // const pulseAnimation = isCurrentPoint
                //     ? 'animation: pulse 2s ease-in-out infinite;'
                //     : '';
                const pulseAnimation = ''; // 暫時停用所有脈衝動畫

                shapeStyle = `
                    background: ${resolvedBackground};
                    ${borderStyle}
                    border-radius: ${dotData.borderRadius};
                    width: ${sizes.width}px;
                    height: ${sizes.height}px;
                    box-shadow: 0 0 15px ${shadowColor};
                    ${pulseAnimation}
                `;
            }

            return L.divIcon({
                html: `<div class="sea-dot-inner" style="
                    ${shapeStyle}
                    opacity: 0.9;
                    cursor: pointer;
                    position: relative;
                    z-index: 1000;
                    pointer-events: auto;
                    transform-origin: center center;
                "></div>`,
                className: 'custom-event-marker-static',
                iconSize: sizes.iconSize,
                iconAnchor: iconAnchor
            });
        }

        // New wrapper: accept a canonical point object and adapt to legacy dotData shape
        createSeaDotFromPoint(point) {
            if (!point) return null;
            const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
            const getSafePointId = helpers ? helpers.getSafePointId : (p => (p && (p.pointId || p.id)) || null);
            const display = point.display || {};
            const lat = point.lat;
            const lon = point.lon;
            const id = getSafePointId(point);
            const status = display.status || point.status || 'unknown';
            // preserve legacy API: call createSeaDot with values
            return this.createSeaDot(lat, lon, id, status);
        }

        createTrackSeaDot(lat, lon, id, status, type, trackPointData, vesselId) {
            // trackPointData may already be canonical; prefer display.* over top-level properties
            const display = (trackPointData && trackPointData.display) ? trackPointData.display : null;
            let backgroundColor, dotColor, borderRadius;
            const isAbnormalSignal = this.checkSignalAbnormality(trackPointData || {});

            // ⚠️ 重要: type 檢查必須在最前面,避免被 display 或 trackPointData 的顏色覆蓋
            // 當前位置 - 強制紅色
            if (type === 'Current') {
                backgroundColor = '#ef4444';
                dotColor = '#ef4444';
            }
            // 未來位置 - 強制黃色
            else if (type === 'Future') {
                backgroundColor = '#FFD54A';
                dotColor = '#FFD54A';
            }
            // 遺漏 AIS 點 - 強制紅色邊框白色背景
            else if (type === 'Missing_AIS') {
                backgroundColor = '#FF6B6B';
                dotColor = '#FFFFFF';
            }
            // 其他類型才檢查 display 和 trackPointData 的顏色設定
            else if (display && (display.backgroundColor || display.dotColor)) {
                // prefer display subobject when present
                backgroundColor = display.backgroundColor || display.dotColor || '#2196F3';
                dotColor = display.dotColor || display.backgroundColor || '#2196F3';
            } else if (trackPointData && (trackPointData.backgroundColor || trackPointData.dotColor)) {
                // fallback to legacy top-level props on trackPointData
                backgroundColor = trackPointData.backgroundColor || trackPointData.dotColor || '#2196F3';
                dotColor = trackPointData.dotColor || trackPointData.backgroundColor || '#2196F3';
            } else {
                if (isAbnormalSignal) {
                    backgroundColor = '#ef4444';
                    dotColor = '#ef4444';
                } else {
                    // default to blue for track points (not the green used for some non-track markers)
                    backgroundColor = '#2196F3';
                    dotColor = '#2196F3';
                }
            }

            if (display && display.borderRadius) {
                borderRadius = display.borderRadius;
            } else if (trackPointData && trackPointData.borderRadius) {
                borderRadius = trackPointData.borderRadius;
            } else if (type === 'History') {
                borderRadius = '2px';
            } else if (type === 'Current') {
                borderRadius = '50%'; // 當前位置用圓形
            } else {
                borderRadius = '50%';
            }

            const dotData = {
                id: id,
                lat: lat,
                lon: lon,
                status: status,
                type: type,
                backgroundColor: backgroundColor,
                dotColor: dotColor,
                borderRadius: borderRadius,
                trackPointData: trackPointData,
                vesselId: vesselId,
                // expose display consistently for downstream code
                display: display || (trackPointData && trackPointData.display) || { backgroundColor, dotColor, borderRadius, status }
            };

            const marker = this.createTrackMarker(dotData);
            return marker;
        }

        // New wrapper: accept canonical point object and adapt
        createTrackSeaDotFromPoint(point) {
            if (!point) return null;
            const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
            const getSafePointId = helpers ? helpers.getSafePointId : (p => (p && (p.pointId || p.id)) || null);
            // prefer display sub-object for UI/display values
            const disp = point.display || {};
            const lat = point.lat;
            const lon = point.lon;
            const id = getSafePointId(point);
            const status = disp.status || point.status || 'unknown';
            const type = point.type || 'Normal';
            // Provide trackPointData for legacy consumers
            const trackPointData = point.trackPointData || Object.assign({}, point);
            const vesselId = point.vesselId || null;
            return this.createTrackSeaDot(lat, lon, id, status, type, trackPointData, vesselId);
        }

        // 生成單一 RF 信號 ID
        generateSingleRFId() {
            const prefixes = ['SIG'];
            const usedRFIds = new Set();
            
            // 從所有事件中收集已使用的 RF 編號，避免重複
            eventStorage.getAllEvents().forEach(event => {
                if (event.suspiciousVesselCandidates) {
                    event.suspiciousVesselCandidates.forEach(rfId => usedRFIds.add(rfId));
                }
                if (event.rfId) {
                    usedRFIds.add(event.rfId);
                }
            });
            
            // 從所有海域監測點中收集已使用的 RF 編號
            if (typeof seaDotManager !== 'undefined') {
                seaDotManager.getAllDots().forEach(dot => {
                    if (dot.rfId) {
                        usedRFIds.add(dot.rfId);
                    }
                });
            }
            
            let attempts = 0;
            while (attempts < 100) { // 最大嘗試次數
                const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
                const randomHex = Math.random().toString(16).toUpperCase().substr(2, 6);
                const rfId = `${prefix}-${randomHex}`;
                
                // 確保不重複
                if (!usedRFIds.has(rfId)) {
                    return rfId;
                }
                attempts++;
            }
            
            // 如果無法生成唯一ID，使用時間戳確保唯一性
            const timestamp = Date.now().toString(16).toUpperCase().substr(-6);
            return `SIG-${timestamp}`;
        }

        createSeaDot(lat, lon, id, status) {
            let backgroundColor, dotColor, borderRadius;

            // 統一使用淺藍色，不依照 AIS 狀態區分顏色
            // AIS 狀態參數仍會保留在 dotData.status 中
            backgroundColor = '#1eb0f9ff';  // 淺藍色
            dotColor = '#1eb0f9ff';         // 淺藍色

            // Always use Normal style
            borderRadius = '50%';

            const dotData = {
                id: id,
                lat: lat,
                lon: lon,
                status: status,
                type: 'Normal',
                backgroundColor: backgroundColor,
                dotColor: dotColor,
                borderRadius: borderRadius,
                area: this.getAreaName(lat, lon),
                createTime: new Date().toISOString(),
                rfId: this.generateSingleRFId(),
                marker: null
            };

            const marker = this.createMarker(dotData);
            dotData.marker = marker;
            this.seaDots.set(id, dotData);
            console.log(`🔵 海域監測點 ${id} 已生成 RF 信號 ID: ${dotData.rfId}, 狀態: ${dotData.status}, 類型: ${dotData.type}`);
            return marker;
        }

        checkSignalAbnormality(trackPointData) {
            if (trackPointData.speed && (trackPointData.speed > 25 || trackPointData.speed < 0.5)) {
                return true;
            }
            if (trackPointData.deviationFromRoute && trackPointData.deviationFromRoute > 5) {
                return true;
            }
            if (trackPointData.signalStrength && trackPointData.signalStrength < -80) {
                return true;
            }
            if (trackPointData.inRestrictedZone) {
                return true;
            }
            if (trackPointData.type === 'Future') {
                return Math.random() < 0.3;
            }
            if (trackPointData.hasTask && Math.random() > 0.85) {
                return true;
            }
            return false;
        }

        createTrackMarker(dotData) {
            let borderStyle = '';
                // resolve dotColor via helpers when available (preserve legacy fallback)
                const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
                const resolvedDotColor = (helpers && typeof helpers.getDotColor === 'function') ? (helpers.getDotColor(dotData) || dotData.dotColor) : dotData.dotColor;
                let shadowColor = this.hexToRgba(resolvedDotColor, 0.6);
                borderStyle = `border: 2px solid ${resolvedDotColor};`;

            let trackIcon;

            // Current 類型使用船舶 icon
            if (dotData.type === 'Current') {
                trackIcon = this.createShipIcon(dotData);
            } else {
                // 其他類型使用原本的圓點/三角形
                const sizes = { width: 14, height: 14, iconSize: [24, 24], iconAnchor: [12, 12] };
                trackIcon = this.createSeaDotIcon(dotData, sizes, shadowColor, borderStyle);
            }

            const marker = L.marker([dotData.lat, dotData.lon], { icon: trackIcon });
            // Create popup content for track point
            const pointTime = new Date(dotData.trackPointData.timestamp);
            const isPast = pointTime < new Date();
            const taskStatus = isPast ? '已完成' : '已排程';

            // Use popup instead of modal
            if (window.popups && window.popups.createTrackPointPopupContent) {
                const popupContent = window.popups.createTrackPointPopupContent(
                    dotData.trackPointData,
                    taskStatus,
                    dotData.vesselId
                );
                marker.bindPopup(popupContent, {
                    maxWidth: 350,
                    className: 'track-point-popup'
                });
            } else {
                // Fallback to original modal if popup function not available
                marker.on('click', () => {
                    if (typeof showTrackPointDetails === 'function') {
                        showTrackPointDetails(dotData.trackPointData, taskStatus, dotData.vesselId);
                    }
                });
            }
            return marker;
        }

        /**
         * 創建船舶 icon（用於 Current 類型軌跡點）
         */
        createShipIcon(dotData) {
            const shipSvg = `
                <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <filter id="ship-glow">
                            <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                            <feMerge>
                                <feMergeNode in="coloredBlur"/>
                                <feMergeNode in="SourceGraphic"/>
                            </feMerge>
                        </filter>
                    </defs>

                    <!-- 船體外框（白色背景） -->
                    <ellipse cx="24" cy="28" rx="14" ry="8" fill="#ffffff" stroke="#2196F3" stroke-width="2"/>

                    <!-- 船體主體 -->
                    <ellipse cx="24" cy="28" rx="12" ry="6" fill="#2196F3"/>

                    <!-- 上層建築（白色） -->
                    <rect x="18" y="20" width="12" height="8" rx="1" fill="#ffffff" stroke="#2196F3" stroke-width="1.5"/>

                    <!-- 駕駛台 -->
                    <rect x="20" y="15" width="8" height="5" rx="1" fill="#ffffff" stroke="#2196F3" stroke-width="1.5"/>

                    <!-- 煙囪 -->
                    <rect x="22" y="11" width="4" height="4" fill="#2196F3" stroke="#ffffff" stroke-width="1"/>

                    <!-- 窗戶 -->
                    <circle cx="21" cy="17" r="1" fill="#2196F3"/>
                    <circle cx="24" cy="17" r="1" fill="#2196F3"/>
                    <circle cx="27" cy="17" r="1" fill="#2196F3"/>

                    <!-- 船舷窗 -->
                    <circle cx="20" cy="23" r="1" fill="#2196F3"/>
                    <circle cx="24" cy="23" r="1" fill="#2196F3"/>
                    <circle cx="28" cy="23" r="1" fill="#2196F3"/>

                    <!-- 船頭波浪效果 -->
                    <path d="M 10 28 Q 12 26, 14 28" stroke="#64B5F6" stroke-width="1.5" fill="none" opacity="0.6"/>
                    <path d="M 34 28 Q 36 26, 38 28" stroke="#64B5F6" stroke-width="1.5" fill="none" opacity="0.6"/>
                </svg>
            `;

            return L.divIcon({
                html: `<div class="ship-icon-wrapper" style="
                    transform-origin: center center;
                ">${shipSvg}</div>`,
                className: 'custom-ship-marker',
                iconSize: [48, 48],
                iconAnchor: [24, 24],
                popupAnchor: [0, -24]
            });
            // ⚠️ 暫時停用船舶 icon 的脈衝動畫
            // 原本包含: animation: pulse 2s ease-in-out infinite;
        }

        createMarker(dotData, map = mainMap) {
            console.log("createMarker is executed, dotData:", dotData);
            let borderStyle = '';
            let shadowColor = 'rgba(102, 231, 255, 0.6)';
            const sizes = this.calculateSeaDotSize(map, { baseSize: 18, baseZoom: 7, scaleFactor: 1.15, minSize: 12, maxSize: 24 });
            // prefer helper resolution for 'none' checks and color derivation
            const resolveDotColor = (typeof window !== 'undefined' && window.safePointHelpers && typeof window.safePointHelpers.getDotColor === 'function') ? window.safePointHelpers.getDotColor : (p => (p && p.dotColor) || null);
            const effectiveColor = (dotData.display && dotData.display.dotColor) ? dotData.display.dotColor : (resolveDotColor(dotData) || dotData.dotColor);
            if (effectiveColor === 'none') {
                borderStyle = 'border: none;';
                shadowColor = 'rgba(102, 231, 255, 0.6)';
            } else {
                shadowColor = this.hexToRgba(effectiveColor, 0.6);
                borderStyle = `border: 2px solid ${effectiveColor};`;
            }
            // ensure dotData has backgroundColor/dotColor consistent with display (use helpers if available)
            const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
            const getDotColor = helpers ? helpers.getDotColor : (p => (p && p.dotColor) || null);
            const getBackgroundColor = helpers ? helpers.getBackgroundColor : (p => (p && p.backgroundColor) || null);
            dotData.backgroundColor = (dotData.display && dotData.display.backgroundColor) || getBackgroundColor(dotData) || dotData.backgroundColor;
            dotData.dotColor = (dotData.display && dotData.display.dotColor) || getDotColor(dotData) || dotData.dotColor;
            const dotIcon = this.createSeaDotIcon(dotData, sizes, shadowColor, borderStyle);
            const marker = L.marker([dotData.lat, dotData.lon], { icon: dotIcon, interactive: true, riseOnHover: true, riseOffset: 250 });

            if (window.popups && window.popups.createRFSignalPopupContent) {
                try {
                    const content = window.popups.createRFSignalPopupContent(dotData);
                    marker.bindPopup(content, { offset: [0, -10], closeButton: true, autoClose: false, closeOnEscapeKey: true, maxWidth: 280 });
                } catch (err) {
                    console.error('Failed to generate popup content from window.popups:', err);
                }
            } else {
                console.warn('window.popups is not available - popups will not be bound for this marker.');
            }

            marker.on('click', function(e) {
                console.log('SeaDot clicked:', dotData.rfId);
                L.DomEvent.stopPropagation(e);
                L.DomEvent.stop(e);
                if (window.popups && window.popups.updateRFSignalPopupContent) {
                    try { window.popups.updateRFSignalPopupContent(marker, dotData); } catch (err) { console.error('popups.updateRFSignalPopupContent failed:', err); }
                } else {
                    console.warn('window.popups.updateRFSignalPopupContent not available - cannot update/open popup.');
                }
                console.log('Popup should be open now');
            });

            marker.on('mouseover', function(e) { console.log('SeaDot mouseover:', dotData.rfId); });
            return marker;
        }

        updateAllSeaDotSizes(map = mainMap) {
            if (!map) { console.warn('地圖實例不可用，無法更新 SeaDot 大小'); return; }
            const sizes = this.calculateSeaDotSize(map);
            let updateCount = 0;
            this.seaDots.forEach((dotData, dotId) => { if (dotData.marker) { this.updateSeaDotMarkerSize(dotData.marker, sizes, dotData); updateCount++; } });
            console.log(`✅ 已更新 ${updateCount} 個 SeaDot 的大小 (縮放等級: ${map.getZoom()})`);
            return updateCount;
        }

        hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }

        getAreaName(lat, lon) {
            if (lat >= 22.0 && lat <= 25.5 && lon >= 119.0 && lon <= 119.8) return '台灣海峽西側';
            if (lat >= 22.0 && lat <= 25.5 && lon >= 121.5 && lon <= 122.5) return '台灣東部海域';
            if (lat >= 25.0 && lat <= 26.0 && lon >= 120.0 && lon <= 122.0) return '台灣北部海域';
            if (lat >= 21.5 && lat <= 22.5 && lon >= 120.0 && lon <= 121.5) return '台灣南部海域';
            if (lat >= 20.5 && lat <= 22.0 && lon >= 120.5 && lon <= 121.8) return '巴士海峽';
            if (lat >= 23.5 && lat <= 24.5 && lon >= 119.2 && lon <= 119.9) return '台灣海峽中央';
            return '台灣周邊海域';
        }

        getAllDots() { return Array.from(this.seaDots.values()); }
        getDotByRFId(rfId) { return this.getAllDots().find(dot => dot.rfId === rfId); }
        clearAllDots() { this.seaDots.forEach(dotData => { if (dotData.marker && mainMap.hasLayer(dotData.marker)) { mainMap.removeLayer(dotData.marker); } }); this.seaDots.clear(); this.dotIdCounter = 1; console.log('🗑️ 已清除所有海域監測點'); }

        /**
         * 隱藏地圖上的所有信號點
         */
        hideAllSignalPoints() {
            let hiddenCount = 0;

            this.seaDots.forEach((dotData, dotId) => {
                if (dotData.marker && mainMap && mainMap.hasLayer(dotData.marker)) {
                    mainMap.removeLayer(dotData.marker);
                    dotData.isHidden = true;
                    hiddenCount++;
                }
            });

            console.log(`🙈 已隱藏 ${hiddenCount} 個信號點`);
            return hiddenCount;
        }

        /**
         * 顯示指定區域內的異常RF信號點
         * @param {Object} areaEvent - 區域事件資料，包含中心座標和半徑
         */
        showAbnormalSignalsInArea(areaEvent) {
            if (!areaEvent || areaEvent.type !== 'area') {
                console.warn('⚠️ 無效的區域事件資料');
                return 0;
            }

            if (!areaEvent.centerLat || !areaEvent.centerLon || !areaEvent.radius) {
                console.warn('⚠️ 缺少中心座標或半徑資訊');
                return 0;
            }

            const centerLat = areaEvent.centerLatDirection === 'S' ? -areaEvent.centerLat : areaEvent.centerLat;
            const centerLon = areaEvent.centerLonDirection === 'W' ? -areaEvent.centerLon : areaEvent.centerLon;
            const radiusInKm = areaEvent.radiusInKm || areaEvent.radius;

            let shownCount = 0;

            // 只顯示區域內未開啟AIS的信號點
            this.seaDots.forEach((dotData, dotId) => {
                if (dotData.status !== "No AIS") return;

                // 使用 Haversine 公式計算距離
                const R = 6371; // 地球半徑（公里）
                const dLat = (dotData.lat - centerLat) * Math.PI / 180;
                const dLon = (dotData.lon - centerLon) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(centerLat * Math.PI / 180) * Math.cos(dotData.lat * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = R * c;

                if (distance <= radiusInKm) {
                    // 如果信號點被隱藏，則重新顯示
                    if (dotData.isHidden && dotData.marker && mainMap) {
                        mainMap.addLayer(dotData.marker);
                        dotData.isHidden = false;
                        shownCount++;
                    }
                }
            });

            console.log(`👁️ 已顯示 ${shownCount} 個區域內的異常RF信號點`);
            return shownCount;
        }

        /**
         * 高亮顯示區域內的異常RF信號（未開啟AIS）
         * 新增功能：先隱藏所有信號點，再顯示並高亮區域內的異常信號
         * @param {Object} areaEvent - 區域事件資料，包含中心座標和半徑
         * @param {boolean} showNormalSignalsOutsideArea - 是否顯示區域外的正常信號點，預設為false
         */
        highlightAbnormalRFSignalsInArea(areaEvent, showNormalSignalsOutsideArea = false) {
            if (!areaEvent || areaEvent.type !== 'area') {
                console.warn('⚠️ 無效的區域事件資料');
                return 0;
            }

            if (!areaEvent.centerLat || !areaEvent.centerLon || !areaEvent.radius) {
                console.warn('⚠️ 缺少中心座標或半徑資訊');
                return 0;
            }

            // 步驟1：使用類似 clearNonTrackPoints 的機制清除非軌跡點
            this.clearNonTrackPointsForArea();

            const centerLat = areaEvent.centerLatDirection === 'S' ? -areaEvent.centerLat : areaEvent.centerLat;
            const centerLon = areaEvent.centerLonDirection === 'W' ? -areaEvent.centerLon : areaEvent.centerLon;
            const radiusInKm = areaEvent.radiusInKm || areaEvent.radius;

            let highlightedCount = 0;
            let normalSignalsShown = 0;

            // 步驟2：處理所有信號點（注意：此時所有點都已被隱藏）
            this.seaDots.forEach((dotData, dotId) => {
                // 計算距離
                const R = 6371; // 地球半徑（公里）
                const dLat = (dotData.lat - centerLat) * Math.PI / 180;
                const dLon = (dotData.lon - centerLon) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(centerLat * Math.PI / 180) * Math.cos(dotData.lat * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = R * c;

                const isInArea = distance <= radiusInKm;
                const isAbnormal = dotData.status === "No AIS";

                // 處理區域內的異常信號：重新顯示並高亮為紅色或黃色
                if (isInArea && isAbnormal) {
                    // 備份原始顏色（如果還沒有備份）
                    if (!dotData.originalColor) {
                        dotData.originalColor = dotData.dotColor || '#2196F3';
                    }

                    // 🆕 為沒有威脅分數的RF信號點初始化威脅分數
                    if (dotData.threatScore === undefined || dotData.threatScore === null) {
                        // 構建trackPoint數據結構用於威脅評估
                        const trackPointData = {
                            lat: dotData.lat,
                            lon: dotData.lon,
                            status: dotData.status, // 'No AIS'
                            timestamp: dotData.timestamp || new Date().toISOString(),
                            type: 'Normal'
                        };

                        // 使用威脅評估系統計算威脅分數
                        if (typeof assessThreatLevel === 'function') {
                            const threatAssessment = assessThreatLevel(trackPointData, []);
                            dotData.threatScore = threatAssessment.score;
                            dotData.threatLevel = threatAssessment.level;
                            dotData.threatFactors = threatAssessment.factors;
                            console.log(`🎯 為RF信號 ${dotData.rfId} 初始化威脅分數: ${dotData.threatScore} (${threatAssessment.level.name})`);
                        } else {
                            // 如果威脅評估函數不可用，使用簡單的範圍生成 (60-90)
                            dotData.threatScore = Math.floor(Math.random() * 31) + 60;
                            console.log(`🎲 為RF信號 ${dotData.rfId} 生成隨機威脅分數: ${dotData.threatScore}`);
                        }
                    }

                    // 檢查此 RF 信號是否已建立船舶追蹤事件
                    let hasVesselEvent = false;
                    if (window.eventStorage && dotData.rfId) {
                        const allEvents = window.eventStorage.getAllEvents ? window.eventStorage.getAllEvents() : [];
                        hasVesselEvent = allEvents.some(event => 
                            event.type === 'vessel' && event.rfId === dotData.rfId
                        );
                    }

                    // 如果已建立船舶追蹤事件，使用黃色；否則使用紅色
                    if (hasVesselEvent) {
                        dotData.dotColor = '#fbbf24'; // 黃色 - 表示正在追蹤
                        dotData.isTracked = true; // 標記為正在追蹤
                        dotData.isHighThreat = false; // 追蹤中的信號不標記為高威脅
                        console.log(`🟡 RF 信號 ${dotData.rfId} 已列入船舶追蹤，標記為黃色`);
                    } else {
                        dotData.dotColor = '#ef4444'; // 紅色 - 異常但未追蹤
                        dotData.isTracked = false;
                        
                        // 🆕 標記高威脅信號點 (threatScore > 80)
                        if (dotData.threatScore > 80) {
                            dotData.isHighThreat = true;
                            console.log(`🚨 檢測到高威脅RF信號 ${dotData.rfId}，威脅分數: ${dotData.threatScore}`);
                        } else {
                            dotData.isHighThreat = false;
                        }
                    }
                    
                    dotData.isHighlighted = true;

                    // 重新顯示這個信號點（因為之前被 clearNonTrackPointsForArea 隱藏了）
                    if (dotData.marker && mainMap) {
                        mainMap.addLayer(dotData.marker);
                        dotData.isHidden = false;
                        
                        // 更新地圖上的標記顏色
                        this.updateDotMarkerColor(dotData);
                    }

                    highlightedCount++;
                }
                // 處理區域外的正常信號點（如果需要顯示）
                else if (!isInArea && showNormalSignalsOutsideArea) {
                    // 恢復原始顏色（如果之前被高亮過）
                    if (dotData.isHighlighted && dotData.originalColor) {
                        dotData.dotColor = dotData.originalColor;
                        dotData.isHighlighted = false;
                        delete dotData.originalColor;
                    }

                    // 重新顯示區域外的正常信號點
                    if (dotData.marker && mainMap) {
                        mainMap.addLayer(dotData.marker);
                        dotData.isHidden = false;
                        
                        // 更新標記顏色
                        this.updateDotMarkerColor(dotData);
                        normalSignalsShown++;
                    }
                }
                // 其他情況：保持隱藏狀態
                else {
                    // 如果之前被高亮過，恢復原始顏色（雖然不顯示，但保持數據一致性）
                    if (dotData.isHighlighted && dotData.originalColor) {
                        dotData.dotColor = dotData.originalColor;
                        dotData.isHighlighted = false;
                        delete dotData.originalColor;
                    }
                    
                    // 確保保持隱藏狀態
                    dotData.isHidden = true;
                }
            });

            if (showNormalSignalsOutsideArea && normalSignalsShown > 0) {
                console.log(`👁️ 已顯示 ${normalSignalsShown} 個區域外的正常信號點`);
            }

            console.log(`🔴 已清除非軌跡點並高亮顯示 ${highlightedCount} 個區域內的異常RF信號點`);
            
            // 🆕 延遲應用高威脅信號點的呼吸特效（確保標記渲染完成）
            // ⚠️ 暫時停用呼吸特效
            // setTimeout(() => {
            //     this.applyHighThreatBreathingEffect(areaEvent);
            // }, 500); // 延遲 500ms 確保地圖標記已渲染
            
            return highlightedCount;
        }
        
        /**
         * 🆕 為區域內的高威脅RF信號點應用呼吸特效
         * @param {Object} areaEvent - 區域事件資料
         */
        applyHighThreatBreathingEffect(areaEvent) {
            if (!areaEvent || areaEvent.type !== 'area') {
                return;
            }

            const centerLat = areaEvent.centerLatDirection === 'S' ? -areaEvent.centerLat : areaEvent.centerLat;
            const centerLon = areaEvent.centerLonDirection === 'W' ? -areaEvent.centerLon : areaEvent.centerLon;
            const radiusInKm = areaEvent.radiusInKm || areaEvent.radius;

            let effectAppliedCount = 0;

            this.seaDots.forEach((dotData, dotId) => {
                // 計算距離
                const R = 6371; // 地球半徑（公里）
                const dLat = (dotData.lat - centerLat) * Math.PI / 180;
                const dLon = (dotData.lon - centerLon) * Math.PI / 180;
                const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                        Math.cos(centerLat * Math.PI / 180) * Math.cos(dotData.lat * Math.PI / 180) *
                        Math.sin(dLon/2) * Math.sin(dLon/2);
                const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                const distance = R * c;

                const isInArea = distance <= radiusInKm;
                const isAbnormal = dotData.status === "No AIS";
                const isHighThreat = dotData.threatScore > 80;

                // 為區域內的高威脅異常信號點應用呼吸特效
                if (isInArea && isAbnormal && isHighThreat && !dotData.isTracked) {
                    dotData.isHighThreat = true;
                    
                    // 更新標記顏色和特效
                    if (dotData.marker && mainMap) {
                        this.updateDotMarkerColor(dotData);
                        effectAppliedCount++;
                    }
                }
            });

            if (effectAppliedCount > 0) {
                console.log(`✨ 已為 ${effectAppliedCount} 個高威脅RF信號點應用呼吸特效`);
            }
        }

        /**
         * 🆕 移除所有高威脅RF信號點的呼吸特效（但保留威脅狀態屬性）
         * 用於地圖重置時清除視覺特效，同時保持信號點的威脅評級資料
         */
        removeAllHighThreatBreathingEffects() {
            let effectRemovedCount = 0;
            const dotsToUpdate = [];

            // 第一階段：收集需要更新的信號點並設置標記
            this.seaDots.forEach((dotData, dotId) => {
                // 檢查是否為高威脅信號點（有呼吸特效）
                if (dotData.isHighThreat && dotData.marker && mainMap) {
                    // ⚠️ 重要：僅移除視覺特效標記，不修改 threatScore 或其他威脅屬性
                    // 保留 dotData.threatScore - 威脅分數
                    // 保留 dotData.dotColor - 顏色狀態
                    // 保留其他所有狀態屬性
                    
                    // 移除呼吸特效標記
                    dotData.isHighThreat = false;
                    
                    // 收集待更新的信號點
                    dotsToUpdate.push(dotData);
                    effectRemovedCount++;
                    
                    console.log(`🔄 已移除 RF 信號 ${dotData.rfId} 的呼吸特效 (威脅分數: ${dotData.threatScore} 保持不變)`);
                }
            });

            // 🆕 同時更新 hiddenSignalPoints 中的數據（如果存在）
            // 這確保當信號點被恢復時，不會重新添加呼吸特效
            if (typeof window !== 'undefined' && window.hiddenSignalPoints && window.hiddenSignalPoints.seaDots) {
                window.hiddenSignalPoints.seaDots.forEach((hiddenDotData, dotId) => {
                    if (hiddenDotData.isHighThreat) {
                        hiddenDotData.isHighThreat = false;
                        console.log(`🔄 同步移除隱藏點 ${hiddenDotData.rfId} 的呼吸特效標記`);
                    }
                });
            }

            // 第二階段：批次更新所有標記（確保狀態已設置）
            if (dotsToUpdate.length > 0) {
                // 使用 requestAnimationFrame 確保在下一個渲染週期更新
                requestAnimationFrame(() => {
                    dotsToUpdate.forEach(dotData => {
                        try {
                            // 強制更新標記樣式（移除呼吸動畫但保持原色）
                            this.updateDotMarkerColor(dotData);
                            
                            // 額外確保：直接操作 DOM 元素移除動畫
                            if (dotData.marker && dotData.marker._icon) {
                                const iconElement = dotData.marker._icon.querySelector('.sea-dot-inner');
                                if (iconElement) {
                                    // 移除動畫樣式
                                    iconElement.style.animation = 'none';
                                    console.log(`🎨 已直接移除 ${dotData.rfId} 的 DOM 動畫屬性`);
                                }
                            }
                        } catch (error) {
                            console.warn(`⚠️ 更新 ${dotData.rfId} 時發生錯誤:`, error);
                        }
                    });
                    
                    console.log(`✅ 已完成 ${dotsToUpdate.length} 個高威脅RF信號點的呼吸特效移除（威脅狀態屬性已保留）`);
                });
            } else {
                console.log(`ℹ️ 目前沒有需要移除呼吸特效的高威脅信號點`);
            }

            return effectRemovedCount;
        }

        /**
         * 恢復所有信號點的原始顏色和顯示狀態
         */
        restoreOriginalColors() {
            let restoredCount = 0;
            let shownCount = 0;

            this.seaDots.forEach((dotData, dotId) => {
                // 恢復顏色
                if (dotData.isHighlighted && dotData.originalColor) {
                    // 恢復原始顏色
                    dotData.dotColor = dotData.originalColor;
                    dotData.isHighlighted = false;
                    delete dotData.originalColor;

                    // 更新地圖上的標記
                    if (dotData.marker && mainMap) {
                        this.updateDotMarkerColor(dotData);
                    }

                    restoredCount++;
                }

                // 恢復顯示狀態
                if (dotData.isHidden && dotData.marker && mainMap) {
                    mainMap.addLayer(dotData.marker);
                    dotData.isHidden = false;
                    shownCount++;
                }
            });

            console.log(`🔵 已恢復 ${restoredCount} 個信號點的原始顏色，顯示 ${shownCount} 個隱藏的信號點`);
            return { restoredCount, shownCount };
        }

        /**
         * 更新信號點標記的顏色
         * @param {Object} dotData - 信號點資料
         */
        updateDotMarkerColor(dotData) {
            if (!dotData.marker || !mainMap) return;

            try {
                // 計算當前大小
                const sizes = this.calculateSeaDotSize(mainMap);
                
                // 計算新的樣式
                let borderStyle = '';
                let shadowColor = 'rgba(102, 231, 255, 0.6)';
                
                const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
                const getDotColor = helpers ? helpers.getDotColor : (p => (p && p.dotColor) || null);
                const udColor = getDotColor(dotData);
                
                if (udColor === 'none') {
                    borderStyle = 'border: none;';
                    shadowColor = 'rgba(102, 231, 255, 0.6)';
                } else {
                    shadowColor = this.hexToRgba(udColor, 0.6);
                    borderStyle = `border: 2px solid ${udColor};`;
                }
                
                // 🆕 檢查是否為高威脅信號點 (只依賴 isHighThreat 標記)
                // ⚠️ 重要：只使用 isHighThreat 標記，不再自動判斷 threatScore 和 dotColor
                // 這樣可以確保當我們手動設置 isHighThreat = false 時，呼吸特效會被移除
                const isHighThreat = dotData.isHighThreat === true;
                
                // 🆕 為高威脅信號點添加呼吸特效動畫
                // ⚠️ 暫時停用呼吸特效
                // const breathingAnimation = isHighThreat 
                //     ? 'animation: high-threat-breathing 2s ease-in-out infinite;' 
                //     : '';
                const breathingAnimation = ''; // 暫時停用所有呼吸特效
                
                // 創建新的圖示
                const newIcon = this.createSeaDotIconWithAnimation(
                    dotData, 
                    sizes, 
                    shadowColor, 
                    borderStyle,
                    breathingAnimation
                );
                
                // 設置新圖示
                dotData.marker.setIcon(newIcon);
                
                // 🆕 記錄高威脅信號點的特效應用/移除
                if (isHighThreat) {
                    console.log(`🚨 已為高威脅RF信號 ${dotData.rfId} 添加呼吸特效 (威脅分數: ${dotData.threatScore})`);
                } else if (dotData.threatScore > 80) {
                    console.log(`✅ 高威脅RF信號 ${dotData.rfId} 的呼吸特效已移除 (威脅分數: ${dotData.threatScore} 保持不變)`);
                }
                
            } catch (error) {
                console.warn('更新信號點顏色時發生錯誤:', error);
            }
        }
        
        /**
         * 🆕 創建帶有動畫的 SeaDot 圖示
         * @param {Object} dotData - 信號點資料
         * @param {Object} sizes - 大小配置
         * @param {string} shadowColor - 陰影顏色
         * @param {string} borderStyle - 邊框樣式
         * @param {string} animation - 動畫樣式
         * @returns {L.DivIcon} Leaflet 圖示
         */
        createSeaDotIconWithAnimation(dotData, sizes, shadowColor, borderStyle, animation = '') {
            const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
            const _getDotColor = helpers && typeof helpers.getDotColor === 'function' ? helpers.getDotColor : (p => ((p && p.display && p.display.dotColor) ? p.display.dotColor : (p && p.dotColor) || null));
            const _getBackgroundColor = helpers && typeof helpers.getBackgroundColor === 'function' ? helpers.getBackgroundColor : (p => ((p && p.display && p.display.backgroundColor) ? p.display.backgroundColor : (p && p.backgroundColor) || (p && p.bgColor) || null));
            
            let resolvedBackground;
            if (dotData && dotData.type === 'Current') {
                resolvedBackground = '#ef4444'; // 紅色
            } else if (dotData && dotData.type === 'Future') {
                resolvedBackground = '#FFD54A'; // 黃色
            } else {
                if (typeof _getDotColor === 'function') resolvedBackground = _getDotColor(dotData) || null;
                if (!resolvedBackground && typeof _getBackgroundColor === 'function') resolvedBackground = _getBackgroundColor(dotData) || null;
                if (!resolvedBackground) {
                    resolvedBackground = '#2196F3'; // 藍色預設
                }
            }

            return L.divIcon({
                html: `<div class="sea-dot-inner" style="
                    background: ${resolvedBackground};
                    ${borderStyle}
                    border-radius: ${dotData.borderRadius || '50%'};
                    width: ${sizes.width}px;
                    height: ${sizes.height}px;
                    box-shadow: 0 0 15px ${shadowColor};
                    ${animation}
                    opacity: 0.9;
                    cursor: pointer;
                    position: relative;
                    z-index: 1000;
                    pointer-events: auto;
                    transform-origin: center center;
                "></div>`,
                className: 'custom-event-marker-static',
                iconSize: sizes.iconSize,
                iconAnchor: sizes.iconAnchor
            });
        }

        // === SeaDot 動態縮放系統 ===
        /**
         * 根據地圖縮放等級計算 SeaDot 的動態大小
         * @param {L.Map} map - Leaflet 地圖實例
         * @param {Object} options - 大小配置選項
         * @returns {Object} 包含 width, height, iconSize, iconAnchor 的物件
         */
        calculateSeaDotSize(map, options = {}) {
            if (!map) {
                // 如果沒有地圖實例，返回預設大小
                return {
                    width: 16,
                    height: 16,
                    iconSize: [20, 20],
                    iconAnchor: [10, 10]
                };
            }

            // 配置參數
            const config = {
                baseSize: options.baseSize || 16,           // 基礎大小 (zoom = 7 時的大小)
                baseZoom: options.baseZoom || 7,            // 基準縮放等級
                scaleFactor: options.scaleFactor || 1.1,   // 每級縮放的倍數
                minSize: options.minSize || 12,              // 最小大小
                maxSize: options.maxSize || 20              // 最大大小
            };

            const currentZoom = map.getZoom();
            const zoomDifference = currentZoom - config.baseZoom;
            
            // 計算動態大小：基礎大小 * (縮放係數 ^ 縮放差異)
            let dynamicSize = config.baseSize * Math.pow(config.scaleFactor, zoomDifference);
            
            // 限制在最小和最大範圍內
            dynamicSize = Math.max(config.minSize, Math.min(config.maxSize, dynamicSize));
            dynamicSize = Math.round(dynamicSize);

            // 計算圖示大小（通常比實際圓點大一些）
            const iconSize = dynamicSize + 4;
            const iconAnchor = Math.round(iconSize / 2);

            return {
                width: dynamicSize,
                height: dynamicSize,
                iconSize: [iconSize, iconSize],
                iconAnchor: [iconAnchor, iconAnchor]
            };
        }

        /**
         * 更新現有 SeaDot 標記的大小
         * @param {L.Marker} marker - Leaflet 標記實例  
         * @param {Object} sizes - 新的大小參數
         * @param {Object} dotData - SeaDot 資料
         */
        updateSeaDotMarkerSize(marker, sizes, dotData) {
            if (!marker || !marker.getElement()) return;

            try {
                // 獲取當前圖示選項
                const currentIcon = marker.getIcon();
                let borderStyle = '';
                let shadowColor = 'rgba(102, 231, 255, 0.6)';
                
                // 重新計算樣式
                const helpers = (typeof window !== 'undefined' && window.safePointHelpers) ? window.safePointHelpers : null;
                const getDotColor = helpers ? helpers.getDotColor : (p => (p && p.dotColor) || null);
                const udColor = getDotColor(dotData);
                if (udColor === 'none') {
                    borderStyle = 'border: none;';
                    shadowColor = 'rgba(102, 231, 255, 0.6)';
                } else {
                    shadowColor = this.hexToRgba(udColor, 0.6);
                    borderStyle = `border: 2px solid ${udColor};`;
                }
                
                // 🆕 檢查是否為高威脅信號點並設置動畫
                // ⚠️ 暫時停用呼吸特效
                // const isHighThreat = dotData.isHighThreat || 
                //                     (dotData.threatScore > 80 && dotData.dotColor === '#ef4444' && !dotData.isTracked);
                
                // const breathingAnimation = isHighThreat 
                //     ? 'animation: high-threat-breathing 2s ease-in-out infinite;' 
                //     : '';
                const breathingAnimation = ''; // 暫時停用所有呼吸特效
                
                // 🔄 使用帶動畫的圖示生成函數（保留呼吸特效）
                const newIcon = this.createSeaDotIconWithAnimation(
                    dotData, 
                    sizes, 
                    shadowColor, 
                    borderStyle,
                    breathingAnimation
                );
                
                // 設置新圖示
                marker.setIcon(newIcon);
                
            } catch (error) {
                console.warn('更新 SeaDot 大小時發生錯誤:', error);
            }
        }

        /**
         * 清除地圖上除歷史軌跡點外的所有信號點（區域監控專用版本）
         * 類似於 script.js 中的 clearNonTrackPoints 機制，但針對 SeaDotManager 優化
         */
        clearNonTrackPointsForArea() {
            console.log('🧹 開始清除地圖上除歷史軌跡點外的所有信號點（區域監控專用）...');

            let removedCount = 0;
            let preservedHistoryCount = 0;

            try {
                // 獲取有效的地圖實例
                const mapInstance = (typeof mainMap !== 'undefined') ? mainMap : null;
                if (!mapInstance) {
                    console.warn('⚠️ 未找到有效的地圖實例，無法執行清除操作');
                    return { removed: 0, preserved: 0, success: false, error: '地圖未初始化' };
                }

                // 獲取需要保留的歷史軌跡圖層
                const historyLayersToPreserve = new Set();
                if (typeof historyTrackManager !== 'undefined' && 
                    historyTrackManager && 
                    historyTrackManager.currentHistoryLayers && 
                    Array.isArray(historyTrackManager.currentHistoryLayers)) {
                    historyTrackManager.currentHistoryLayers.forEach(layer => {
                        historyLayersToPreserve.add(layer);
                    });
                    console.log(`🗺️ 標記 ${historyTrackManager.currentHistoryLayers.length} 個歷史軌跡圖層為保留項目`);
                    preservedHistoryCount += historyTrackManager.currentHistoryLayers.length;
                }

                // 處理 SeaDotManager 管理的所有RF信號點和監測點
                console.log('📍 清除 SeaDotManager 中的信號點...');

                // 儲存被清除的點資料（如果有全局隱藏系統的話）
                if (typeof hiddenSignalPoints !== 'undefined' && hiddenSignalPoints && hiddenSignalPoints.seaDots) {
                    this.seaDots.forEach((dotData, dotId) => {
                        hiddenSignalPoints.seaDots.set(dotId, {
                            ...dotData,
                            wasOnMap: dotData.marker && mapInstance.hasLayer(dotData.marker)
                        });
                    });
                }

                // 遍歷所有 SeaDotManager 管理的點進行清除
                this.seaDots.forEach((dotData, dotId) => {
                    // SeaDotManager 管理的都不是歷史軌跡點，全部清除
                    if (dotData.marker && mapInstance.hasLayer(dotData.marker)) {
                        mapInstance.removeLayer(dotData.marker);
                        dotData.isHidden = true; // 標記為已隱藏
                        removedCount++;
                    }
                });

                // 清除所有非保留的地圖圖層
                console.log('🔍 檢查地圖上的其他圖層...');
                const layersToRemove = [];
                const seaDotsRef = this.seaDots; // 保存 this 的引用
                
                mapInstance.eachLayer(function(layer) {
                    // 跳過基礎地圖瓦片層
                    if (layer instanceof L.TileLayer) {
                        return;
                    }
                    
                    // 跳過調查範圍層（investigationRangeLayer）- 這是最可靠的檢查
                    // 嘗試多種方式獲取 investigationRangeLayer
                    const globalInvestigationLayer = (typeof investigationRangeLayer !== 'undefined') ? investigationRangeLayer : 
                                                   (typeof window !== 'undefined' && window.investigationRangeLayer) ? window.investigationRangeLayer : null;
                    
                    if (globalInvestigationLayer && layer === globalInvestigationLayer) {
                        console.log('🛡️ 保留 investigationRangeLayer (全局變數)');
                        return;
                    }
                    
                    // 跳過 LayerGroup 類型的監控範圍圖層（更精確的檢查）
                    if (layer instanceof L.LayerGroup) {
                        let isMonitoringRange = false;
                        let hasMonitoringCircle = false;
                        let hasMonitoringCenter = false;
                        
                        try {
                            layer.eachLayer(function(subLayer) {
                                // 檢查是否有監控範圍圓圈（必須有特定的半徑和虛線樣式）
                                if (subLayer instanceof L.Circle && 
                                    subLayer.options && 
                                    subLayer.options.color === '#4caf50' &&
                                    subLayer.options.fillColor === '#81c784' &&
                                    subLayer.options.fillOpacity === 0.15 &&
                                    subLayer.options.dashArray === '12, 8' &&
                                    subLayer.options.weight === 3 &&
                                    subLayer.options.opacity === 0.9) {
                                    hasMonitoringCircle = true;
                                    console.log('🔍 發現監控範圍圓圈');
                                }
                                // 檢查是否有監控範圍中心標記（精確匹配所有屬性）
                                if (subLayer instanceof L.CircleMarker && 
                                    subLayer.options && 
                                    subLayer.options.color === '#d32f2f' &&
                                    subLayer.options.fillColor === '#ff5722' &&
                                    subLayer.options.fillOpacity === 0.9 &&
                                    subLayer.options.weight === 2 &&
                                    subLayer.options.opacity === 1.0 &&
                                    subLayer.options.radius === 5 &&
                                    subLayer.options.interactive === false) {
                                    hasMonitoringCenter = true;
                                    console.log('🔍 發現監控範圍中心標記');
                                }
                            });
                        } catch (e) {
                            console.warn('遍歷 LayerGroup 時發生錯誤:', e);
                        }
                        
                        // 只有同時包含精確配置的監控圓圈和中心標記的 LayerGroup 才是監控範圍
                        if (hasMonitoringCircle && hasMonitoringCenter) {
                            console.log('🛡️ 保留 LayerGroup 形式的監控範圍（精確匹配）');
                            isMonitoringRange = true;
                        }
                        
                        if (isMonitoringRange) {
                            return;
                        }
                    }
                    
                    // 跳過歷史軌跡圖層
                    if (historyLayersToPreserve.has(layer)) {
                        return;
                    }
                    
                    // 跳過 SeaDotManager 管理的標記（已在上面處理）
                    let isSeaDotManagerMarker = false;
                    seaDotsRef.forEach((dotData) => {
                        if (dotData.marker === layer) {
                            isSeaDotManagerMarker = true;
                        }
                    });
                    
                    if (!isSeaDotManagerMarker) {
                        // 其他非歷史軌跡圖層都標記為待移除
                        layersToRemove.push(layer);
                    }
                });

                // 批量移除非保留圖層
                console.log(`📋 準備移除 ${layersToRemove.length} 個圖層`);
                layersToRemove.forEach(layer => {
                    try {
                        mapInstance.removeLayer(layer);
                        removedCount++;
                        // 更詳細的日誌記錄
                        const layerType = layer.constructor.name;
                        const layerInfo = layer.options ? JSON.stringify(layer.options) : 'no options';
                        console.log(`✂️ 移除圖層: ${layerType} - ${layerInfo}`);
                    } catch (error) {
                        console.warn('移除圖層時發生錯誤:', error);
                    }
                });

                console.log(`🎉 清除完成！總共移除 ${removedCount} 個非歷史軌跡點，保留 ${preservedHistoryCount} 個歷史軌跡點，標記為移除的圖層數: ${layersToRemove.length}`);

                // 更新隱藏狀態（如果有全局隱藏系統的話）
                if (typeof hiddenSignalPoints !== 'undefined' && hiddenSignalPoints && removedCount > 0) {
                    hiddenSignalPoints.clearTime = new Date().toISOString();
                    hiddenSignalPoints.isCleared = true;
                    console.log('📦 已儲存被清除的信號點資料，可使用 restoreHiddenSignalPoints() 恢復');
                }

                return {
                    removed: removedCount,
                    preserved: preservedHistoryCount,
                    success: true
                };

            } catch (error) {
                console.error('❌ 清除地圖點時發生錯誤:', error);
                return {
                    removed: removedCount,
                    preserved: preservedHistoryCount,
                    success: false,
                    error: error.message
                };
            }
        }

        /**
         * 將指定 RF 信號點標記為正在追蹤（黃色）
         * @param {string} rfId - RF 信號 ID
         * @returns {boolean} 是否成功更新
         */
        markRFSignalAsTracked(rfId) {
            if (!rfId) {
                console.warn('⚠️ 未提供 RF ID');
                return false;
            }

            console.log(`🔍 [markRFSignalAsTracked] 嘗試標記 RF ID: "${rfId}"`);
            console.log(`📊 [markRFSignalAsTracked] 當前所有 sea dots 數量: ${this.getAllDots().length}`);
            
            const dotData = this.getDotByRFId(rfId);
            if (!dotData) {
                console.warn(`⚠️ 找不到 RF ID "${rfId}" 對應的信號點`);
                console.log(`🔍 [除錯] 所有可用的 RF IDs:`, this.getAllDots().map(d => d.rfId));
                return false;
            }

            console.log(`✅ [markRFSignalAsTracked] 找到 dotData:`, {
                id: dotData.id,
                rfId: dotData.rfId,
                isHighlighted: dotData.isHighlighted,
                dotColor: dotData.dotColor
            });

            // 如果信號點已經被高亮（紅色），則更新為黃色
            if (dotData.isHighlighted) {
                // 備份原始顏色（如果還沒有備份）
                if (!dotData.originalColor) {
                    dotData.originalColor = dotData.dotColor || '#2196F3';
                }

                // 更改為黃色表示正在追蹤
                dotData.dotColor = '#fbbf24';
                dotData.isTracked = true;

                // 更新地圖上的標記顏色
                if (dotData.marker && mainMap) {
                    this.updateDotMarkerColor(dotData);
                    console.log(`🟡 RF 信號 ${rfId} 已標記為正在追蹤（黃色）`);
                    return true;
                }
            } else {
                console.log(`ℹ️ RF 信號 ${rfId} 未被高亮，不需要標記為追蹤`);
            }

            return false;
        }

        /**
         * 將指定 RF 信號點從追蹤狀態恢復為異常狀態（紅色）
         * @param {string} rfId - RF 信號 ID
         * @returns {boolean} 是否成功更新
         */
        unmarkRFSignalAsTracked(rfId) {
            if (!rfId) {
                console.warn('⚠️ 未提供 RF ID');
                return false;
            }

            const dotData = this.getDotByRFId(rfId);
            if (!dotData) {
                console.warn(`⚠️ 找不到 RF ID "${rfId}" 對應的信號點`);
                return false;
            }

            // 如果信號點正在被追蹤，則恢復為紅色異常狀態
            if (dotData.isTracked && dotData.isHighlighted) {
                // 更改為紅色表示異常但未追蹤
                dotData.dotColor = '#ef4444';
                dotData.isTracked = false;

                // 更新地圖上的標記顏色
                if (dotData.marker && mainMap) {
                    this.updateDotMarkerColor(dotData);
                    console.log(`🔴 RF 信號 ${rfId} 已恢復為異常狀態（紅色）`);
                    return true;
                }
            }

            return false;
        }

        /**
         * 更新 RF 信號點的彈窗內容
         * @param {string} rfId - RF 信號 ID
         * @returns {boolean} 是否成功更新
         */
        updateRFSignalPopup(rfId) {
            if (!rfId) {
                console.warn('⚠️ 未提供 RF ID');
                return false;
            }

            const dotData = this.getDotByRFId(rfId);
            if (!dotData) {
                console.warn(`⚠️ 找不到 RF ID "${rfId}" 對應的信號點`);
                return false;
            }

            // 更新彈窗內容（使用 popups.js 中的函數）
            if (dotData.marker && window.popups && typeof window.popups.updateRFSignalPopupContent === 'function') {
                window.popups.updateRFSignalPopupContent(dotData.marker, dotData);
                console.log(`✅ 已更新 RF 信號 ${rfId} 的彈窗內容`);
                return true;
            } else {
                console.warn(`⚠️ 無法更新彈窗內容：marker 或 popups.updateRFSignalPopupContent 不可用`);
                return false;
            }
        }
    }

    // Export the class
    window.SeaDotManager = SeaDotManager;

    // Helper that will instantiate a single global instance when called.
    function attachIfAvailable() {
        if (window.seaDotManager) return true; // already attached
        if (typeof window.SeaDotManager === 'function') {
            try {
                window.seaDotManager = new window.SeaDotManager();
                console.log('SeaDotManager helper: instantiated and attached window.seaDotManager');
                return true;
            } catch (err) {
                console.warn('SeaDotManager helper: failed to instantiate SeaDotManager', err);
                return false;
            }
        }
        return false; // class not available yet
    }

    window.__attachSeaDotManager = attachIfAvailable;
})();
