/**
 * Leaflet map manager
 */
(function(window) {
    'use strict';

    const createMapManager = (options = {}) => {
        const {
            getShipData,
            getTrajectoryEntries,
            getRoutePredictionPoints,
            getDispatchedShipPosition,
            getCoordinateLabel,
            getSelectedCard,
            getActiveTab,
            onCardClick,
            onMapClick,
        } = options;

        const TRAJECTORY_TIME_INTERVALS = [3, 6, 12, 24, 48, 72, 96];
        const SHIP_MARKER_STYLES = {
            high: { border: "#ffffff", fill: "#ff3b30" },
            medium: { border: "#ffffff", fill: "#ff9500" },
            low: { border: "#ffffff", fill: "#ffd60a" },
            default: { border: "#ffffff", fill: "#ffd60a" },
        };

        const shipMarkers = new Map();
        const scheduledPositionMarkers = new Map();
        const trajectoryTimeMarkers = [];
        const historyButtons = document.querySelectorAll(".history-tags button");
        let activeHistoryHours = 0;
        let historyLookup = {};

        let mapInstance = null;
        let trajectoryLayer = null;
        let predictionLayer = null;
        let predictionStartMarker = null;
        const predictionPointMarkers = [];
        let focusMarker = null;
        let searchRadiusLayer = null;
        let pendingMapPayload = null;
        let pendingMarkers = null;
        let pendingSearchRadius = null;

        const clearTrajectory = () => {
            if (trajectoryLayer && mapInstance) {
                mapInstance.removeLayer(trajectoryLayer);
                trajectoryLayer = null;
            }
            trajectoryTimeMarkers.forEach(marker => {
                if (mapInstance) mapInstance.removeLayer(marker);
            });
            trajectoryTimeMarkers.length = 0;
        };

        const clearPrediction = () => {
            if (predictionLayer && mapInstance) {
                mapInstance.removeLayer(predictionLayer);
                predictionLayer = null;
            }
            if (predictionStartMarker && mapInstance) {
                mapInstance.removeLayer(predictionStartMarker);
                predictionStartMarker = null;
            }
            predictionPointMarkers.forEach(marker => {
                if (mapInstance) mapInstance.removeLayer(marker);
            });
            predictionPointMarkers.length = 0;
        };

        const clearFocusMarker = () => {
            if (focusMarker && mapInstance) {
                mapInstance.removeLayer(focusMarker);
                focusMarker = null;
            }
        };

        const clearShipMarkers = () => {
            if (!mapInstance) {
                shipMarkers.clear();
                scheduledPositionMarkers.clear();
                return;
            }
            
            // Remove all circle markers from map (brute force)
            mapInstance.eachLayer((layer) => {
                if (layer instanceof L.CircleMarker && layer !== searchRadiusLayer) {
                    mapInstance.removeLayer(layer);
                }
            });
            
            shipMarkers.forEach((marker) => mapInstance.removeLayer(marker));
            shipMarkers.clear();
            scheduledPositionMarkers.forEach((marker) => mapInstance.removeLayer(marker));
            scheduledPositionMarkers.clear();
        };

        const findLatestTrajectoryEntry = (trajectoryEntries) => {
            let latestEntry = null;
            trajectoryEntries.forEach(entry => {
                if (!Number.isFinite(entry.hoursAgo)) return;
                if (!latestEntry || entry.hoursAgo < latestEntry.hoursAgo) {
                    latestEntry = entry;
                }
            });
            if (!latestEntry) {
                latestEntry = trajectoryEntries.find(e => Number.isFinite(e.hoursAgo)) || trajectoryEntries[0];
            }
            return latestEntry;
        };

        const createNowMarker = (coords) => {
            const marker = L.circleMarker([coords.lat, coords.lng], {
                radius: 3,
                weight: 0,
                fillColor: "#fff200",
                fillOpacity: 1,
                className: "ship-dot ship-dot-now",
            }).addTo(mapInstance);

            marker.bindTooltip("Now", {
                permanent: true,
                direction: "top",
                className: "trajectory-now-tooltip",
                offset: [0, -12],
            });

            return marker;
        };

        const createTimeIntervalMarker = (coords, interval) => {
            const marker = L.circleMarker([coords.lat, coords.lng], {
                radius: 3,
                weight: 0,
                fillColor: "#ffe46b",
                fillOpacity: 1,
                className: "ship-dot ship-dot-history",
            }).addTo(mapInstance);

            marker.bindTooltip(`${interval}h ago`, {
                permanent: true,
                direction: "top",
                className: "trajectory-time-tooltip",
                offset: [0, -10],
            });

            return marker;
        };

        const createDispatchMarker = (coords, scheduleText) => {
            const marker = L.circleMarker([coords.lat, coords.lng], {
                radius: 3,
                weight: 0,
                fillColor: "#ffb703",
                fillOpacity: 1,
                className: "ship-dot ship-dot-dispatch",
            }).addTo(mapInstance);

            marker.bindTooltip(`🎯 ${scheduleText}`, {
                permanent: true,
                direction: "top",
                className: "dispatch-time-tooltip",
                offset: [0, -12],
            });

            return marker;
        };

        const findClosestTrajectoryEntry = (trajectoryEntries, targetTime) => {
            let closest = null;
            let minDiff = 1;
            trajectoryEntries.forEach(entry => {
                if (!Number.isFinite(entry.hoursAgo)) return;
                const diff = Math.abs(entry.hoursAgo - targetTime);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = entry;
                }
            });
            return { entry: closest, diff: minDiff };
        };

        const areCoordsDistinct = (coords1, coords2, threshold = 0.01) => {
            return Math.abs(coords1.lat - coords2.lat) > threshold ||
                Math.abs(coords1.lng - coords2.lng) > threshold;
        };

        const addTrajectoryTimeMarkers = (ship, trajectoryEntries) => {
            if (!trajectoryEntries.length) {
                return;
            }

            const latestEntry = findLatestTrajectoryEntry(trajectoryEntries);
            const baseTime = latestEntry.hoursAgo;

            const nowMarker = createNowMarker(latestEntry);
            trajectoryTimeMarkers.push(nowMarker);

            TRAJECTORY_TIME_INTERVALS.forEach(interval => {
                const targetTime = baseTime + interval;
                const { entry: closest } = findClosestTrajectoryEntry(trajectoryEntries, targetTime);
                if (closest && areCoordsDistinct(closest, latestEntry)) {
                    const marker = createTimeIntervalMarker(closest, interval);
                    trajectoryTimeMarkers.push(marker);
                }
            });

            const selected = typeof getSelectedCard === "function" ? getSelectedCard() : null;
            const activeTab = typeof getActiveTab === "function" ? getActiveTab() : null;
            const listType = selected?.dataset?.listType || activeTab;
            if (listType === "dispatch" || ship.action?.schedule) {
                const scheduledCoords = typeof getDispatchedShipPosition === "function"
                    ? getDispatchedShipPosition(ship)
                    : null;

                if (scheduledCoords && Number.isFinite(scheduledCoords.lat) && Number.isFinite(scheduledCoords.lng)) {
                    const scheduleText = ship.action?.schedule || ship.action?.scheduleDate || "Dispatch";
                    const dispatchMarker = createDispatchMarker(scheduledCoords, scheduleText);
                    trajectoryTimeMarkers.push(dispatchMarker);
                }
            }
        };

        const drawTrajectory = (points, ship = null) => {
            clearTrajectory();
            if (!mapInstance || !points.length) return;

            trajectoryLayer = L.polyline(points, {
                color: "#38bdf8",
                weight: 3,
                opacity: 0.9,
                dashArray: "6 4",
            }).addTo(mapInstance);

            if (ship && typeof getTrajectoryEntries === "function") {
                const trajectoryEntries = getTrajectoryEntries(ship);
                addTrajectoryTimeMarkers(ship, trajectoryEntries);
            }

            // mapInstance.fitBounds(trajectoryLayer.getBounds().pad(0.2));
        };

        const drawPrediction = (points, { fit = true, speedKnots = null } = {}) => {
            clearPrediction();
            if (!mapInstance || !points.length) return;

            predictionLayer = L.layerGroup().addTo(mapInstance);
            const predictionLine = L.polyline(points, {
                color: "#16a34a",
                weight: 3,
                opacity: 0.9,
                dashArray: "6 4",
                className: "route-prediction-line",
            }).addTo(predictionLayer);
            if (predictionLine.bringToFront) {
                predictionLine.bringToFront();
            }
            predictionStartMarker = L.circleMarker(points[0], {
                radius: 4,
                weight: 0,
                fillColor: "#f97316",
                fillOpacity: 0.95,
                className: "route-prediction-start",
            }).addTo(mapInstance);
            if (predictionStartMarker.bringToFront) {
                predictionStartMarker.bringToFront();
            }

            const speed = Number(speedKnots);
            const speedFactor = Number.isFinite(speed) ? Math.min(speed, 30) : 0;
            const minRadius = speedFactor * 1000;
            const maxRadius = speedFactor * 3000;
            const totalSteps = Math.max(points.length - 1, 1);
            points.forEach((point, index) => {
                if (index === 0) {
                    const marker = L.circleMarker(point, {
                        radius: 4,
                        weight: 1,
                        color: "#ec4899",
                        fillColor: "#f472b6",
                        fillOpacity: 0.95,
                        className: "route-prediction-point",
                    }).addTo(predictionLayer);
                    if (marker.bringToFront) marker.bringToFront();
                    predictionPointMarkers.push(marker);
                    return;
                }
                const t = (index - 1) / totalSteps;
                const radius = Math.round(minRadius + (maxRadius - minRadius) * t);
                const area = L.circle(point, {
                    radius: radius,
                    color: "#16a34a",
                    weight: 2,
                    opacity: 0.9,
                    fillColor: "#16a34a",
                    fillOpacity: 0.12,
                    className: "route-prediction-area",
                }).addTo(predictionLayer);
                const minutesFromNow = index * 60;
                const ts = new Date(Date.now() + minutesFromNow * 60 * 1000);
                const hh = String(ts.getHours()).padStart(2, "0");
                const mm = String(ts.getMinutes()).padStart(2, "0");
                area.bindTooltip(`${hh}:${mm}`, {
                    direction: "top",
                    opacity: 0.9,
                    permanent: true,
                    className: "prediction-time-tooltip",
                });
                if (area.bringToFront) area.bringToFront();
                predictionPointMarkers.push(area);

                const marker = L.circleMarker(point, {
                    radius: 4,
                    weight: 1,
                    color: "#ec4899",
                    fillColor: "#f472b6",
                    fillOpacity: 0.95,
                    className: "route-prediction-point",
                }).addTo(predictionLayer);
                if (marker.bringToFront) marker.bringToFront();
                predictionPointMarkers.push(marker);
            });

            if (fit) {
                const groupBounds = L.featureGroup(predictionPointMarkers).getBounds();
                if (groupBounds.isValid()) {
                    mapInstance.fitBounds(groupBounds.pad(0.2));
                }
            }
        };

        const highlightShip = (lat, lng, hours = null, options = {}) => {
            if (!mapInstance || !(Number.isFinite(lat) && Number.isFinite(lng))) return;
            const { skipViewUpdate = false } = options;

            if (focusMarker) {
                mapInstance.removeLayer(focusMarker);
                focusMarker = null;
            }

            focusMarker = L.circleMarker([lat, lng], {
                radius: 3,
                weight: 0,
                fillColor: "#fff200",
                fillOpacity: 1,
                className: "ship-dot ship-dot-focus",
            }).addTo(mapInstance);

            if (hours !== null && hours !== undefined) {
                const label = hours === 0 ? "現在位置" : `${hours} 小時前`;
                focusMarker.bindPopup(label, {
                    closeButton: false,
                    autoClose: false,
                    closeOnClick: false,
                    className: "history-time-popup",
                }).openPopup();
            }

            if (!skipViewUpdate) {
                mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 8), { animate: true, duration: 0.5 });
            }
        };

        const applyMapPayload = (payload) => {
            if (!mapInstance || !payload) return;
            if (payload.trackPoints?.length) {
                drawTrajectory(payload.trackPoints, payload.ship);
            } else {
                clearTrajectory();
            }
            if (payload.predictionPoints?.length) {
                drawPrediction(payload.predictionPoints, {
                    fit: !payload.trackPoints?.length,
                    speedKnots: payload.speedKnots,
                });
            } else {
                clearPrediction();
            }

            const current = (Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) 
                ? [payload.lat, payload.lng] 
                : null;
            
            let viewUpdated = false;

            // Custom Zoom: Center on ship, Prediction end at edge
            if (current && payload.predictionPoints?.length > 0) {
                 const endPoint = payload.predictionPoints[payload.predictionPoints.length - 1];
                 const startLatLng = L.latLng(current);
                 const endLatLng = L.latLng(endPoint);
                 
                 const latDiff = Math.abs(startLatLng.lat - endLatLng.lat);
                 const lngDiff = Math.abs(startLatLng.lng - endLatLng.lng);
                 
                 // Threshold for "meaningful" movement to create a bounding box
                 const MOVEMENT_THRESHOLD = 0.0005; // approx 50 meters

                 if (latDiff > MOVEMENT_THRESHOLD || lngDiff > MOVEMENT_THRESHOLD) {
                     // Create symmetric bounds for movement visualization
                     const sw = L.latLng(startLatLng.lat - latDiff, startLatLng.lng - lngDiff);
                     const ne = L.latLng(startLatLng.lat + latDiff, startLatLng.lng + lngDiff);
                     const bounds = L.latLngBounds(sw, ne);
                     
                     mapInstance.fitBounds(bounds, { 
                         padding: [100, 100], 
                         animate: true, 
                         duration: 0.8, 
                         maxZoom: 16 
                     });
                 } else {
                     // For very small or no movement, just zoom in tight to show detail
                     mapInstance.setView(startLatLng, 15, { animate: true, duration: 0.8 });
                 }
                 viewUpdated = true;
            }

            if (current) {
                // If we haven't updated view via prediction logic, use standard focus
                // Increase default min zoom from 8 to 14 for better "focus" effect
                if (!viewUpdated) {
                     mapInstance.setView(current, Math.max(mapInstance.getZoom(), 14), { animate: true, duration: 0.5 });
                }
                
                // Always highlight the ship marker
                highlightShip(payload.lat, payload.lng, null, { skipViewUpdate: true }); 
            }
        };

        const getRawTrajectoryPoints = (ship) => {
            const entries = Array.isArray(ship?.trajectory) ? ship.trajectory : [];
            return entries
                .map((entry) => {
                    if (!entry) return null;
                    const lat = Number(entry.lat ?? entry[0] ?? entry.coord?.[0]);
                    const lng = Number(entry.lng ?? entry[1] ?? entry.coord?.[1]);
                    if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
                    return [lat, lng];
                })
                .filter(Boolean);
        };

        const updateMapForShip = (card) => {
            if (!card || typeof getShipData !== "function" || typeof getTrajectoryEntries !== "function") return;
            const ship = getShipData(card?.dataset?.shipId);
            if (!ship) return;
            const rawTrackPoints = getRawTrajectoryPoints(ship);
            const trackPoints = rawTrackPoints.length
                ? rawTrackPoints
                : getTrajectoryEntries(ship).map(e => [e.lat, e.lng]);
            const listType = card.dataset.listType || "region";
            const scheduledCoords = listType === "dispatch" && typeof getDispatchedShipPosition === "function"
                ? getDispatchedShipPosition(ship)
                : null;
            const trajectoryEntries = typeof getTrajectoryEntries === "function"
                ? getTrajectoryEntries(ship)
                : [];
            const latestTrajectory = trajectoryEntries.length
                ? findLatestTrajectoryEntry(trajectoryEntries)
                : null;
            const baseCoords = latestTrajectory || scheduledCoords || ship?.coords || null;
            let predictionPoints = typeof getRoutePredictionPoints === "function"
                ? getRoutePredictionPoints(ship, { baseCoords })
                : [];
            const markerLat = Number(baseCoords?.lat);
            const markerLng = Number(baseCoords?.lng);
            if (predictionPoints.length && Number.isFinite(markerLat) && Number.isFinite(markerLng)) {
                predictionPoints = [[markerLat, markerLng], ...predictionPoints.slice(1)];
            }
            const speedKnots = Number.isFinite(Number(ship?.sog)) ? Number(ship.sog) : null;
            const payload = {
                lat: markerLat,
                lng: markerLng,
                trackPoints,
                predictionPoints,
                speedKnots,
                ship: ship,
            };
            if (!mapInstance) {
                pendingMapPayload = payload;
                return;
            }
            pendingMapPayload = null;
            applyMapPayload(payload);
        };

        const addDispatchScheduleMarker = (shipId, coords, scheduleLabel) => {
            if (!mapInstance || !(Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng))) return null;
            const existing = scheduledPositionMarkers.get(shipId);
            if (existing) {
                mapInstance.removeLayer(existing);
                scheduledPositionMarkers.delete(shipId);
            }
            const icon = L.divIcon({
                className: "dispatch-schedule-icon",
                html: `<div class="dispatch-schedule-dot"></div><div class="dispatch-schedule-label">${scheduleLabel || ""}</div>`,
                iconSize: [16, 16],
                iconAnchor: [8, 8],
            });
            const marker = L.marker([coords.lat, coords.lng], { icon }).addTo(mapInstance);
            scheduledPositionMarkers.set(shipId, marker);
            return marker;
        };

        const createShipMarker = (card, options = {}) => {
            if (!card || typeof getShipData !== "function") return null;
            const { activeTab } = options;
            const ship = getShipData(card?.dataset?.shipId);
            const isDispatchCard = (card.dataset.listType || activeTab) === "dispatch";
            const scheduledCoords = isDispatchCard && typeof getDispatchedShipPosition === "function"
                ? getDispatchedShipPosition(ship)
                : null;
            let coordArr = Array.isArray(ship?.coord) ? ship.coord : null;
            if (!coordArr && ship?.coords && Number.isFinite(ship.coords.lat) && Number.isFinite(ship.coords.lng)) {
                coordArr = [ship.coords.lat, ship.coords.lng];
            }
            const lat = Number(scheduledCoords?.lat ?? coordArr?.[0]);
            const lng = Number(scheduledCoords?.lng ?? coordArr?.[1]);
            if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
            const threatScore = ship?.threatScore;
            const threatClass = window.ThreatUtils?.getThreatLevelInfo?.(threatScore)?.class;
            const key = threatClass || "default";
            const colors = SHIP_MARKER_STYLES[key] || SHIP_MARKER_STYLES.default;
            const marker = L.circleMarker([lat, lng], {
                radius: 3,
                weight: 0,
                fillColor: colors.fill,
                fillOpacity: 1,
                className: `ship-dot ship-dot-${key}`,
            }).addTo(mapInstance);
            const label = ship?.name || card.querySelector(".ship-label")?.textContent?.trim();
            const tooltip = `
                <div>
                    <strong>${ship?.name || ship?.mmsi || "未知"}</strong><br>
                    威脅分數：${threatScore ?? "--"}<br>
                    AIS：${ship?.aisFlag === true ? "已開啟" : "未開啟"}<br>
                    座標：${typeof getCoordinateLabel === "function" ? getCoordinateLabel(ship) : "-"}
                </div>
            `;
            if (label) {
                marker.bindTooltip(tooltip, { direction: "top", opacity: 0.92, sticky: true });
            }
            marker.on("click", () => {
                card.scrollIntoView({ behavior: "smooth", block: "center" });
                if (typeof onCardClick === "function") {
                    onCardClick(card);
                } else {
                    card.click();
                }
            });
            shipMarkers.set(card.dataset.shipId, marker);

            if (isDispatchCard && scheduledCoords && card.dataset.shipId) {
                addDispatchScheduleMarker(card.dataset.shipId, scheduledCoords, ship?.action?.schedule);
            }
            return marker;
        };

        const renderShipMarkers = (cards, options = {}) => {
            if (!mapInstance) {
                pendingMarkers = { cards, options };
                return;
            }
            clearShipMarkers();
            const list = Array.isArray(cards) ? cards : Array.from(cards || []);
            list.forEach((card) => createShipMarker(card, options));
            pendingMarkers = null;
        };

        const setMapCenter = (lat, lon, zoom = 8) => {
            if (!mapInstance) return;
            if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
            mapInstance.setView([lat, lon], zoom, { animate: true, duration: 0.5 });
        };

        const setSearchRadius = (lat, lon, radiusNm, { fit = true } = {}) => {
            if (!(Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(radiusNm))) return;
            const radiusMeters = radiusNm * 1852;
            const payload = { lat, lon, radiusMeters };
            if (!mapInstance) {
                pendingSearchRadius = payload;
                return;
            }
            if (searchRadiusLayer) {
                mapInstance.removeLayer(searchRadiusLayer);
                searchRadiusLayer = null;
            }
            searchRadiusLayer = L.circle([lat, lon], {
                radius: radiusMeters,
                color: "#e2f2ff",
                weight: 2,
                opacity: 0.9,
                fillColor: "#38bdf8",
                fillOpacity: 0.12,
                pane: "radiusPane",
            }).addTo(mapInstance);
            searchRadiusLayer.bringToFront();
            if (fit) {
                mapInstance.fitBounds(searchRadiusLayer.getBounds(), { padding: [10, 10], maxZoom: 6 });
            }
        };

        const fitMapToAllShips = (ships) => {
            if (!mapInstance || !Array.isArray(ships)) return;
            const bounds = ships
                .map((ship) => ship?.coords)
                .filter((coords) => Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng))
                .map((coords) => [coords.lat, coords.lng]);
            if (bounds.length) {
                mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
            }
        };

        const updateHistoryButtons = () => {
            if (!historyButtons.length) return;
            historyButtons.forEach((btn) => {
                const hours = Number(btn.dataset.history || "0");
                const hasData = Boolean(historyLookup?.[hours]);
                btn.disabled = !hasData;
                if (!hasData && hours === activeHistoryHours) {
                    activeHistoryHours = 0;
                }
            });
            historyButtons.forEach((btn) => {
                const hours = Number(btn.dataset.history || "0");
                btn.classList.toggle("active", hours === activeHistoryHours && !btn.disabled);
            });
            focusHistoryPoint(activeHistoryHours, true);
        };

        const focusHistoryPoint = (hours, skipActiveUpdate = false) => {
            const coords = historyLookup?.[hours];
            if (!coords) {
                if (!skipActiveUpdate) {
                    alert(`無此時間點的軌跡數據 (${hours}小時前)`);
                }
                return;
            }
            highlightShip(coords[0], coords[1], hours);
            if (!skipActiveUpdate && historyButtons.length) {
                historyButtons.forEach((btn) => {
                    const btnHours = Number(btn.dataset.history || "0");
                    btn.classList.toggle("active", btnHours === hours && !btn.disabled);
                });
            }
        };

        const setHistoryLookup = (lookup, { resetActive = true } = {}) => {
            historyLookup = lookup || {};
            if (resetActive) {
                activeHistoryHours = 0;
            }
        };

        const setupHistoryButtons = () => {
            historyButtons.forEach((button) => {
                button.addEventListener("click", () => {
                    if (button.disabled) return;
                    const hours = Number(button.dataset.history || "0");
                    if (!historyLookup?.[hours]) {
                        return;
                    }
                    activeHistoryHours = hours;
                    focusHistoryPoint(hours);
                });
            });
        };

        const init = ({ mapContainerId = "sea-map", mapFallbackId = "map-fallback" } = {}) => {
            const mapContainer = document.getElementById(mapContainerId);
            const mapFallback = document.getElementById(mapFallbackId);
            if (mapContainer && window.L) {
                mapFallback?.classList.add("hide");
                // Default center: Taiwan Strait (23.974°N, 120.973°E)
                mapInstance = L.map(mapContainer, { zoomControl: false }).setView([23.974, 120.973], 8);
                L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                    attribution: "© OpenStreetMap contributors",
                }).addTo(mapInstance);
                L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
                    attribution: "Map data © OpenSeaMap contributors",
                }).addTo(mapInstance);

                mapInstance.on("click", (e) => {
                    if (typeof onMapClick === "function") {
                        onMapClick(e);
                    }
                });

                const radiusPane = mapInstance.createPane("radiusPane");
                radiusPane.style.zIndex = "350";

                const ScaleControl = L.Control.extend({
                    onAdd: (map) => {
                        const container = L.DomUtil.create("div", "custom-scale-control");
                        const kmEl = L.DomUtil.create("div", "custom-scale-line", container);
                        kmEl.innerHTML = `
                            <div class="scale-bar">
                                <span class="scale-seg scale-seg-1000"></span>
                                <span class="scale-seg scale-seg-2000"></span>
                                <span class="scale-tick scale-tick-start">0</span>
                                <span class="scale-tick scale-tick-mid">0</span>
                                <span class="scale-tick scale-tick-end">0</span>
                            </div>
                        `;
                        L.DomEvent.disableClickPropagation(container);

                        const updateScale = () => {
                            const y = map.getSize().y / 2;
                            const p1 = map.containerPointToLatLng([10, y]);
                            const p2a = map.containerPointToLatLng([110, y]);
                            const sampleMeters = map.distance(p1, p2a) || 1;
                            const pxPerMeter = 100 / sampleMeters;

                            const targetWidthPx = 140;
                            const targetMeters = targetWidthPx / pxPerMeter;
                            const targetKm = targetMeters / 1000;
                            const niceKmCandidates = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
                            const niceKm = niceKmCandidates.reduce((best, val) => {
                                if (!best) return val;
                                const diff = Math.abs(val - targetKm);
                                const bestDiff = Math.abs(best - targetKm);
                                return diff < bestDiff ? val : best;
                            }, null);

                            const totalMeters = niceKm * 1000;
                            const totalWidth = Math.round(totalMeters * pxPerMeter);
                            const midWidth = Math.round(totalWidth / 2);

                            const bar = kmEl.querySelector(".scale-bar");
                            bar.style.width = `${totalWidth}px`;
                            bar.style.setProperty("--scale-1000-width", `${midWidth}px`);
                            bar.style.setProperty("--scale-mid-left", `${midWidth}px`);
                            bar.style.setProperty("--scale-end-left", `${totalWidth}px`);
                            kmEl.querySelector(".scale-tick-start").textContent = "0";
                            kmEl.querySelector(".scale-tick-mid").textContent = `${Math.round(niceKm / 2)}km`;
                            kmEl.querySelector(".scale-tick-end").textContent = `${niceKm}km`;
                        };

                        map.on("zoomend moveend", updateScale);
                        updateScale();

                        return container;
                    },
                });

                new ScaleControl({ position: "bottomleft" }).addTo(mapInstance);

                setTimeout(() => {
                    mapInstance.invalidateSize();
                    if (pendingSearchRadius) {
                        setSearchRadius(
                            pendingSearchRadius.lat,
                            pendingSearchRadius.lon,
                            pendingSearchRadius.radiusMeters / 1852
                        );
                        pendingSearchRadius = null;
                    }
                }, 300);
                window.addEventListener("resize", () => mapInstance.invalidateSize());

                if (pendingMarkers) {
                    renderShipMarkers(pendingMarkers.cards, pendingMarkers.options);
                }
                if (pendingMapPayload) {
                    applyMapPayload(pendingMapPayload);
                }
            } else if (mapFallback) {
                mapFallback.textContent = "無法載入海圖，請保持網路連線後重新整理頁面。";
            }
        };

        setupHistoryButtons();

        /* Threat Annotation Layer */
        let threatAnnotationLayer = null;

        const showThreatAnnotation = (type, data) => {
            if (!mapInstance) return;
            
            console.log(`[MapManager] showThreatAnnotation type=${type}`, data);

            // Clear existing annotation
            hideThreatAnnotation();

            threatAnnotationLayer = L.featureGroup().addTo(mapInstance);

            if (type === 'meandering') {
               // data: { segmentsDetails: [] }
               if (!data || !data.segmentsDetails || !Array.isArray(data.segmentsDetails)) {
                   console.warn("[MapManager] Invalid meandering data", data);
                   return;
               }

               data.segmentsDetails.forEach((segment, idx) => {
                   let center, radiusKm;
                   // console.log(`[MapManager] Processing segment ${idx}`, segment);

                   if (segment.location) {
                       // Handle structure from makeSmallestEnclosingCircle: { center: {lat, lon}, r: km }
                       if (segment.location.center && (typeof segment.location.r !== 'undefined')) {
                           center = segment.location.center;
                           radiusKm = segment.location.r;
                       } 
                       // Handle logic fallback structure: { center: {lat, lon}, radius: km }
                       else if (segment.location.center && (typeof segment.location.radius !== 'undefined')) {
                           center = segment.location.center;
                           radiusKm = segment.location.radius;
                       }
                   }
                   // Fallback for missing location property but existing coordinates
                   if (!center && segment.startCoord && segment.endCoord) {
                       // Calculate rough center from start/end points
                       const startLat = segment.startCoord[0];
                       const startLon = segment.startCoord[1];
                       const endLat = segment.endCoord[0];
                       const endLon = segment.endCoord[1];
                       
                       center = {
                           lat: (startLat + endLat) / 2,
                           lon: (startLon + endLon) / 2
                       };
                       
                       // Calculate rough radius (half distance between points + padding)
                       // Simple distance approx for display
                       const R = 6371; // km
                       const dLat = (endLat - startLat) * Math.PI / 180;
                       const dLon = (endLon - startLon) * Math.PI / 180;
                       const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                               Math.cos(startLat * Math.PI / 180) * Math.cos(endLat * Math.PI / 180) *
                               Math.sin(dLon/2) * Math.sin(dLon/2);
                       const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
                       const distKm = R * c;
                       
                       radiusKm = (distKm / 2) * 1.5; // Add 50% padding
                   }
                   
                   // console.log(`[MapManager] Center:`, center, `RadiusKm:`, radiusKm);

                   if (center && (typeof radiusKm !== 'undefined')) {
                       // Convert km to meters for Leaflet circle
                       // Radius cannot be 0 for L.circle
                       const radiusMeters = Math.max(radiusKm * 1000, 100); 
                       
                       const circle = L.circle([center.lat, center.lon], {
                           color: '#ff4d4f',      // Red outline
                           fillColor: '#ff4d4f',  // Red fill
                           fillOpacity: 0.2,      // Semi-transparent
                           weight: 2,
                           radius: radiusMeters,
                           interactive: true      // Ensure it receives mouse events
                       }).addTo(threatAnnotationLayer);

                       // Add tooltip
                       const startTime = formatTime(segment.startTime);
                       // const endTime = formatTime(segment.endTime); // Unused currently
                       const duration = segment.durationMinutes ? `${segment.durationMinutes.toFixed(1)} 分鐘` : '-';
                       const score = segment.coreScore ? segment.coreScore.toFixed(0) : '-';

                       const tooltipContent = `
                           <div class="threat-tooltip">
                               <div><b>發生時間:</b> ${startTime}</div>
                               <div><b>累計遊蕩時間:</b> ${duration}</div>
                               <div><b>遊蕩分數:</b> ${score}</div>
                           </div>
                       `;

                       circle.bindTooltip(tooltipContent, {
                           permanent: false,
                           direction: 'top',
                           opacity: 0.9,
                           className: 'threat-map-tooltip'
                       });
                   } else {
                       console.warn("[MapManager] Segment missing location data", segment);
                   }
               });

            } else if (type === 'loitering') {
               // data: { loiterArea: { center: {lat, lon}, radius: number } }
               if (!data || !data.loiterArea || !data.loiterArea.center) {
                   console.warn("[MapManager] Invalid loitering data", data);
                   return;
               }

               const { center, radius } = data.loiterArea;
               const radiusKm = radius || 0.5; // Default fallback if radius missing
               const radiusMeters = Math.max(radiusKm * 1000, 100);

               const circle = L.circle([center.lat, center.lon], {
                    color: '#ff4d4f',
                    fillColor: '#ff4d4f',
                    fillOpacity: 0.2,
                    weight: 2,
                    radius: radiusMeters,
                    interactive: true
               }).addTo(threatAnnotationLayer);

               // Add tooltip
               const startTime = formatTime(data.startTime);
               const duration = data.loiterTimeMinutes ? `${data.loiterTimeMinutes} 分鐘` : '-';
               const threshold = data.thresholds?.t1 ? `${data.thresholds.t1 * 60} 分鐘` : '-'; 

               const tooltipContent = `
                   <div class="threat-tooltip">
                       <div><b>發生時間:</b> ${startTime}</div>
                       <div><b>累計停留時間:</b> ${duration}</div>
                   </div>
               `;

               circle.bindTooltip(tooltipContent, {
                   permanent: false,
                   direction: 'top',
                   opacity: 0.9,
                   className: 'threat-map-tooltip'
               });
            } else if (type === 'speedDrop') {
               // data: { dropEvents: [ { location: {lat, lon}, time, acceleration } ] }
               if (!data || !data.dropEvents || !Array.isArray(data.dropEvents)) {
                   console.warn("[MapManager] Invalid speedDrop data", data);
                   return;
               }

               data.dropEvents.forEach(event => {
                   if (event.location) {
                       const { lat, lon } = event.location;
                       
                       // Use circleMarker for point-based event
                       const marker = L.circleMarker([lat, lon], {
                           color: '#ff4d4f',      // Red outline
                           fillColor: 'transparent', // Transparent center to show track point
                           fillOpacity: 0,
                           weight: 3,             // Thicker border
                           radius: 12,            // Pixel radius to frame the dot
                           interactive: true
                       }).addTo(threatAnnotationLayer);

                       // Add tooltip
                       const time = formatTime(event.time);
                       const acc = event.acceleration ? `${event.acceleration} 節/秒` : '-';
                       
                       const tooltipContent = `
                           <div class="threat-tooltip">
                               <div><b>發生時間:</b> ${time}</div>
                               <div><b>驟降負加速度:</b> ${acc}</div>
                           </div>
                       `;

                       marker.bindTooltip(tooltipContent, {
                           permanent: false,
                           direction: 'top',
                           opacity: 0.9,
                           className: 'threat-map-tooltip'
                       });
                   }
               });
            } else if (type === 'smuggle' || type === 'aisSwitch') {
               // data: { affectedAreas: [ { center: {lat, lon}, radius, earliestAnomalyTime, missingCount, missingRatio, totalMissingTimeMinutes } ] }
               if (!data || !data.affectedAreas || !Array.isArray(data.affectedAreas)) {
                   console.warn("[MapManager] Invalid aisSwitch/smuggle data", data);
                   return;
               }

               data.affectedAreas.forEach(areaData => {
                   if (areaData.center) {
                       const { lat, lon } = areaData.center;
                       const radiusKm = areaData.radius || 1; // Default fallback
                       const radiusMeters = Math.max(radiusKm * 1000, 100);

                       const circle = L.circle([lat, lon], {
                           color: '#ff4d4f',      // Red outline
                           fillColor: '#ff4d4f',  // Red fill
                           fillOpacity: 0.2,      // Semi-transparent
                           weight: 2,
                           radius: radiusMeters,
                           interactive: true
                       }).addTo(threatAnnotationLayer);

                       // Add tooltip
                       const startTime = formatTime(areaData.earliestAnomalyTime);
                       const missingCount = areaData.missingCount || 0;
                       
                       // Format ratio as percentage
                       const ratioVal = areaData.missingRatio !== undefined ? areaData.missingRatio : 0;
                       const ratioStr = `${(ratioVal * 100).toFixed(1)}%`;
                       
                       const totalTime = areaData.totalMissingTimeMinutes ? `${areaData.totalMissingTimeMinutes} 分鐘` : '-';

                       const tooltipContent = `
                           <div class="threat-tooltip">
                               <div><b>發生時間:</b> ${startTime}</div>
                               <div><b>AIS未發送次數估算:</b> ${missingCount}</div>
                               <div><b>異常關閉AIS比例:</b> ${ratioStr}</div>
                               <div><b>累計關閉AIS時長:</b> ${totalTime}</div>
                           </div>
                       `;

                       circle.bindTooltip(tooltipContent, {
                           permanent: false,
                           direction: 'top',
                           opacity: 0.9,
                           className: 'threat-map-tooltip'
                       });
                   }
               });
            }

            // Auto-zoom to show all threat annotations AND the current ship position
            if (threatAnnotationLayer && threatAnnotationLayer.getLayers().length > 0) {
                try {
                    let bounds = threatAnnotationLayer.getBounds();
                    
                    // Also include the ship's current position if available (via focusMarker or cache)
                    // If focusMarker exists, it represents the ship's current/highlighted position
                    if (focusMarker) {
                         bounds.extend(focusMarker.getLatLng());
                    } else if (pendingMapPayload?.lat && pendingMapPayload?.lng) {
                        // Fallback to pending payload just in case
                         bounds.extend([pendingMapPayload.lat, pendingMapPayload.lng]);
                    }

                    if (bounds.isValid()) {
                        mapInstance.fitBounds(bounds, { 
                            padding: [60, 60], 
                            maxZoom: 16, 
                            animate: true,
                            duration: 0.8 
                        });
                    }
                } catch (e) {
                    console.warn("[MapManager] Failed to zoom to threat annotation", e);
                }
            }
        };

        const hideThreatAnnotation = () => {
            if (threatAnnotationLayer) {
                threatAnnotationLayer.clearLayers();
                if (mapInstance && mapInstance.hasLayer(threatAnnotationLayer)) {
                    mapInstance.removeLayer(threatAnnotationLayer);
                }
                threatAnnotationLayer = null;
            }
        };

        const formatTime = (isoString) => {
             if (!isoString) return '-';
             const date = new Date(isoString);
             return `${date.getFullYear()}/${date.getMonth()+1}/${date.getDate()} ${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
        };

        return {
            init,
            renderShipMarkers,
            updateMapForShip,
            clearTrajectory,
            clearPrediction,
            clearFocusMarker,
            fitMapToAllShips,
            setMapCenter,
            setSearchRadius,
            setHistoryLookup,
            updateHistoryButtons,
            showThreatAnnotation,
            hideThreatAnnotation,
        };
    };

    window.MapManager = { create: createMapManager };
})(window);
