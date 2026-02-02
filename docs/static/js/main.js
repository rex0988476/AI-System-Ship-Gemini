// Styles for ship markers based on threat level
const SHIP_MARKER_STYLES = {
    high: { border: "#fb7185", fill: "#fecaca" },
    medium: { border: "#fb923c", fill: "#fed7aa" },
    low: { border: "#38bdf8", fill: "#bae6fd" },
    default: { border: "#36d399", fill: "#bbf7d0" },
};

document.addEventListener("DOMContentLoaded", () => {
    // window.showDispatchDetail = showDispatchDetail;
    /* 
    */

    // Tab elements for switching views
    const tabs = document.querySelectorAll(".tab");
    // Panel elements for each tab's content
    const panels = document.querySelectorAll("[data-panel]");
    // The right-side detail panel
    const rightPanel = document.querySelector(".right-panel");
    // Title element in the right panel
    const rightTitle = document.querySelector(".right-title");
    // Ship detail panel inside the right panel
    const shipDetailPanel = document.querySelector(".ship-detail-panel");
    // Back button in the detail panel
    const detailBack = document.querySelector(".detail-back");
    // Button to add ship to tracking
    const addTrackingBtn = document.querySelector(".detail-action.add-track");
    // Button to confirm dispatch action
    const addActionBtn = document.querySelector(".detail-action.confirm-action");
    // Button to select region settings
    const selectRegionBtn = document.querySelector(".btn-select-region");
    // Panel for area settings
    const areaSettingsPanel = document.getElementById("area-settings-panel");
    // Mapping of tab names to right panel titles
    const panelTitleMap = {
        region: "區域事件總覽",
        tracking: "追蹤船舶總覽",
        dispatch: "派遣任務總覽",
    };
    // References to detail fields in the ship detail panel
    const detailFields = shipDetailPanel
        ? {
            name: shipDetailPanel.querySelector('[data-detail="name"]'),
            mmsi: shipDetailPanel.querySelector('[data-detail="mmsi"]'),
            ais: shipDetailPanel.querySelector('[data-detail="ais"]'),
            threatLevel: shipDetailPanel.querySelector('[data-detail="threatLevel"]'),
            threatScore: shipDetailPanel.querySelector('[data-detail="threatScore"]'),
            status: shipDetailPanel.querySelector('[data-detail="status"]'),
            lastUpdate: shipDetailPanel.querySelector('[data-detail="lastUpdate"]'),
            coordinates: shipDetailPanel.querySelector('[data-detail="coordinates"]'),
            infoCards: {
                aisStatus: shipDetailPanel.querySelector('[data-info="aisStatus"]'),
                shipType: shipDetailPanel.querySelector('[data-info="shipType"]'),
                shipName: shipDetailPanel.querySelector('[data-info="shipName"]'),
                imo: shipDetailPanel.querySelector('[data-info="imo"]'),
                navStatus: shipDetailPanel.querySelector('[data-info="navStatus"]'),
                cog: shipDetailPanel.querySelector('[data-info="cog"]'),
                sog: shipDetailPanel.querySelector('[data-info="sog"]'),
                rfFrequency: shipDetailPanel.querySelector('[data-info="rfFrequency"]'),
                rfCoordinate: shipDetailPanel.querySelector('[data-info="rfCoordinate"]'),
                rfTimestamp: shipDetailPanel.querySelector('[data-info="rfTimestamp"]'),
                rfPulseWidth: shipDetailPanel.querySelector('[data-info="rfPulseWidth"]'),
                rfPrf: shipDetailPanel.querySelector('[data-info="rfPrf"]'),
                rfAccuracy: shipDetailPanel.querySelector('[data-info="rfAccuracy"]'),
            },
            threatExtras: {
                score: shipDetailPanel.querySelector('[data-threat="score"]'),
                level: shipDetailPanel.querySelector('[data-threat="level"]'),
                smuggle: shipDetailPanel.querySelector('[data-threat="smuggle"]'),
                stop: shipDetailPanel.querySelector('[data-threat="stop"]'),
                offset: shipDetailPanel.querySelector('[data-threat="offset"]'),
            },
            trackingBlock: shipDetailPanel.querySelector("[data-tracking-block]"),
            trackingAction: shipDetailPanel.querySelector('[data-tracking="action"]'),
            trackingSchedule: shipDetailPanel.querySelector('[data-tracking="schedule"]'),
            detailSection: shipDetailPanel.querySelector(".detail-section"),
        }
    : null;

    // List of ship data objects from global window
    const shipDataList = Array.isArray(window.SHIP_DATA) ? window.SHIP_DATA : [];
    shipDataList.forEach((ship) => {
        if (!ship) return;
        if (!ship.id) ship.id = ship.mmsi;
        if (!ship.coordinatesLabel && ship.coords) {
            ship.coordinatesLabel = `${ship.coords.lat}°, ${ship.coords.lng}°`;
        }
        const score = ship.threat?.score ?? ship.threatScore;
        if (!ship.threat && Number.isFinite(Number(score))) {
            const numScore = Number(score);
            ship.threat = {
                score: numScore,
                level: numScore >= 80 ? "高風險" : numScore >= 60 ? "中風險" : "低風險",
            };
        }
        if (!ship.ais && Object.prototype.hasOwnProperty.call(ship, "aisFlag")) {
            ship.ais = ship.aisFlag ? "已開啟" : "未開啟";
        }
    });
    // Map of shipId to ship data object
    const shipDataMap = new Map();
    shipDataList.forEach((ship) => shipDataMap.set(ship.id, ship));
    // List of dispatch mission data from global window
    const dispatchDataList = Array.isArray(window.DISPATCH_DATA) ? window.DISPATCH_DATA : [];
    // Map of missionId to dispatch mission object
    const dispatchDataMap = new Map();
    dispatchDataList.forEach((mission) => {
        if (mission && mission.id) dispatchDataMap.set(mission.id, mission);
    });

    // Map of ship list container elements by slot name
    const shipListContainers = new Map();
    document.querySelectorAll("[data-ship-list]").forEach((container) => {
        shipListContainers.set(container.dataset.shipList, container);
    });

    // Map of dispatch list container elements by slot name
    const dispatchListContainers = new Map();
    document.querySelectorAll("[data-dispatch-list]").forEach((container) => {
        dispatchListContainers.set(container.dataset.dispatchList, container);
    });

    // API base for live ship details (fallback to local data if request fails)
    const API_BASE = window.API_BASE || "http://localhost:3005/api/v1";
    const shipDetailCache = new Map();
    const shipTrackCache = new Map();
    let latestDetailMmsi = null;

    // Container for tracking ship cards
    const trackingListContainer = shipListContainers.get("left-tracking");
    // Container for dispatch mission cards
    const dispatchListContainer = dispatchListContainers.get("left-dispatch");
    // Set of ship IDs currently being tracked
    const trackedShipIds = new Set();
    // Set of ship IDs currently dispatched
    const dispatchedShipIds = new Set();

    // Selector for ship card elements
    const shipCardSelector = ".ship-card[data-ship-id]";
    // Function to get all ship card elements
    const getAllShipCards = () => document.querySelectorAll(shipCardSelector);
    // Function to clear selected state from all ship cards
    const clearSelectedCards = () => {
        getAllShipCards().forEach((card) => card.classList.remove("selected"));
    };

    // Function to determine threat class from score
    const threatClassFromScore = (score, ship) => {
        const val = Number.isFinite(Number(score))
            ? Number(score)
            : Number(ship?.threatScore);
        if (Number.isFinite(val)) {
            if (val >= 80) return "high";
            if (val >= 60) return "medium";
            return "low";
        }
        return "";
    };

    // Create a ship card element for the left panel
    const createShipCard = (ship, listTypeParam) => {
        const article = document.createElement("article");
        const listType = listTypeParam || ship.category || "region";
        const severityClass = threatClassFromScore(ship.threat?.score, ship);
        article.className = ["ship-card", severityClass, listType].filter(Boolean).join(" ").trim();
        article.dataset.shipId = ship.id;
        article.dataset.listType = listType;
        let summary = `座標：${ship.coordinatesLabel || "-"}<br />AIS 狀態：${ship.ais || "-"}<br />威脅分數：${ship.threat?.score ?? "--"}`;
        if (listType === "dispatch") {
            summary = `行動：${ship.action?.label || "待確定"}<br />排程：${ship.action?.schedule || "--"}<br />派遣狀態：${ship.action?.status || "--"}`;
        }
        article.innerHTML = `
			<div class="ship-label">MMSI：<span>${ship.mmsi}</span></div>
			<p class="ship-detail">${summary}</p>
			<div class="ship-status-badge" style="display: none;" data-status-badge>${ship.event_status || ""}</div>
		`;
        return article;
    };

    // 提取威脅等級判斷邏輯
    const getSuspiciousVesselThreatClass = (vessel) => {
        if (vessel.threatScore === -1 || vessel.threatScore === null) {
            return "default"; // 未知風險
        }
        if (vessel.threatScore >= 80) return "high";
        if (vessel.threatScore >= 60) return "medium";
        return "low"; // 60分以下
    };

    // 轉換 API 資料為內部格式
    const convertSuspiciousVesselToShipData = (vessel) => {
        let threatLevel = "未知";
        if (vessel.threatScore !== -1 && vessel.threatScore !== null) {
            if (vessel.threatScore >= 80) threatLevel = "高風險";
            else if (vessel.threatScore >= 60) threatLevel = "中風險";
            else threatLevel = "低風險";
        }
        
        return {
            id: vessel.mmsi,
            mmsi: vessel.mmsi,
            name: "未知",
            ais: vessel.aisFlag ? "已開啟" : "未開啟",
            threat: {
                score: vessel.threatScore === -1 ? null : vessel.threatScore,
                level: threatLevel
            },
            coords: {
                lat: vessel.coord[0],
                lng: vessel.coord[1]
            },
            coordinatesLabel: `${vessel.coord[0].toFixed(3)}°N, ${vessel.coord[1].toFixed(3)}°E`,
            status: "可疑船舶",
            lastUpdate: "未知",
            shipType: "未知",
            navStatus: "未知",
            slot: "left-region",
            isSuspicious: true // 標記為可疑船舶
        };
    };

    // 優化後的創建卡片函式
    const createSuspiciousVesselCard = (vessel) => {
        const article = document.createElement("article");
        const severityClass = getSuspiciousVesselThreatClass(vessel);
        
        article.className = `ship-card ${severityClass} region suspicious-vessel`;
        article.dataset.shipId = vessel.mmsi;
        article.dataset.listType = "region";
        article.dataset.suspiciousVessel = "true";
        
        const coordLabel = `${vessel.coord[0].toFixed(3)}°N, ${vessel.coord[1].toFixed(3)}°E`;
        const aisStatus = vessel.aisFlag ? "已開啟" : "未開啟";
        const threatDisplay = vessel.threatScore === -1 ? "分析中" : vessel.threatScore;
        
        article.innerHTML = `
            <div class="ship-label">MMSI：<span>${vessel.mmsi}</span></div>
            <p class="ship-detail">
                座標：${coordLabel}<br />
                AIS 狀態：${aisStatus}<br />
                威脅分數：${threatDisplay}
            </p>
            <div class="ship-status-badge" style="display: none;" data-status-badge></div>
        `;
        
        return article;
    };

    // 簡化後的渲染函式（單一職責）
    const renderSuspiciousVessels = (suspiciousVesselsData) => {
        if (!Array.isArray(suspiciousVesselsData) || suspiciousVesselsData.length === 0) {
            console.log("No suspicious vessels data to render");
            return;
        }
        
        const regionContainer = shipListContainers.get("left-region");
        if (!regionContainer) {
            console.error("Region container not found");
            return;
        }
        
        // 移除舊的可疑船舶卡片
        const existingCards = regionContainer.querySelectorAll('.ship-card[data-suspicious-vessel="true"]');
        existingCards.forEach(card => card.remove());
        
        // 創建並加入新卡片 + 更新資料映射
        suspiciousVesselsData.forEach(vessel => {
            // 創建卡片
            const card = createSuspiciousVesselCard(vessel);
            regionContainer.appendChild(card);
            
            // 更新 shipDataMap（使用轉換函式）
            const shipData = convertSuspiciousVesselToShipData(vessel);
            shipDataMap.set(vessel.mmsi, shipData);
        });
        
        console.log(`✅ Rendered ${suspiciousVesselsData.length} suspicious vessels`);
    };

    // 渲染後的更新操作（獨立函式）
    const updateAfterSuspiciousVesselsRendered = () => {
        sortRegionShipCards();
        updateRegionStatistics();
        
        if (mapMode === "region") {
            refreshMapMarkers();
        }
    };

    // 優化後的 API 獲取函式（可配置參數）
    const fetchSuspiciousVessels = async ({ lat, lon, radius } = {}) => {
        // 使用預設值或傳入參數
        const searchLat = lat ?? 23.974;
        const searchLon = lon ?? 120.973;
        const searchRadius = radius ?? 150;
        
        try {
            console.log(`⏳ Fetching suspicious vessels (lat: ${searchLat}, lon: ${searchLon}, radius: ${searchRadius}km)...`);
            
            const url = `http://localhost:3005/api/v1/suspiciousVessels?lat=${searchLat}&lon=${searchLon}&radius=${searchRadius}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                const err = await res.json();
                console.error("❌ Error fetching suspicious vessels:", err);
                return null;
            }
            
            const data = await res.json();
            console.log(`✅ Fetched ${data.length} suspicious vessels`, data);
            return data;
            
        } catch (error) {
            console.error("❌ Connection error:", error);
            return null;
        }
    };

    // 整合函式（呼叫者）
    const loadAndDisplaySuspiciousVessels = async (searchParams = {}) => {
        const vessels = await fetchSuspiciousVessels(searchParams);
        
        if (vessels && vessels.length > 0) {
            renderSuspiciousVessels(vessels);
            updateAfterSuspiciousVesselsRendered();
        }
    };

    loadAndDisplaySuspiciousVessels({ lat: 23.974, lon: 120.973, radius: 150 });

    // Create a dispatch mission card element for the left panel
    const createDispatchCard = (mission) => {
        const mappedShipId = mission.shipId || mission.ship_id;
        const article = document.createElement("article");
        const severityClass = mission.severity || "";
        article.className = ["ship-card", severityClass, mission.category || "dispatch"].filter(Boolean).join(" ").trim();
        if (mappedShipId) {
            article.dataset.shipId = mappedShipId;
        }
        article.dataset.listType = "dispatch";
        if (mission.id) {
            article.dataset.missionId = mission.id;
        }
        const actionLabel =
            mission.action?.label ||
            mission.action_label ||
            mission.actionLabel ||
            mission.action ||
            (mission.target ? `對 ${mission.target}` : null);
        const actionSchedule = mission.action?.schedule || mission.schedule || mission.dispatch_time || mission.dispatchTime;
        const label = mission.name || mission.id || actionLabel || "派遣任務";
        const detail = [
            actionLabel ? `行動：${actionLabel}` : "",
            actionSchedule ? `排程：${actionSchedule}` : "",
            mission.support ? `支援單位：${mission.support}` : "",
            mission.status ? `狀態：${mission.status}` : "",
        ]
            .filter(Boolean)
            .join("<br />") || "尚無任務資訊";
        article.innerHTML = `
			<div class="ship-label">任務：<span>${label}</span></div>
			<p class="ship-detail">${detail}</p>
		`;
        return article;
    };

    // Retrieve ship data from shipDataMap using a card or shipId
    const getShipData = (source) => {
        if (!source) return null;
        const id = typeof source === "string" ? source : source.dataset?.shipId;
        if (!id) return null;
        return shipDataMap.get(id) || null;
    };

    // Format and return the coordinates label for a ship
    const getCoordinateLabel = (ship) => {
        if (!ship) return "-";
        if (ship.coordinatesLabel) return ship.coordinatesLabel;
        const lat = Number(ship.coords?.lat);
        const lng = Number(ship.coords?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
            return `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
        }
        return "-";
    };

    // Get and process trajectory entries for a ship
    const getTrajectoryEntries = (ship) => {
        if (!ship) return [];
        const entries = Array.isArray(ship.trajectory) ? ship.trajectory : [];
        const processed = entries
            .map((entry) => {
                if (!entry) return null;
                const lat = Number(entry.lat ?? entry[0]);
                const lng = Number(entry.lng ?? entry[1]);
                if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
                const hoursAgoRaw = entry.hoursAgo ?? entry.hours ?? entry[2];
                const hoursAgo = Number.isFinite(Number(hoursAgoRaw)) ? Number(hoursAgoRaw) : null;
                return { lat, lng, hoursAgo };
            })
            .filter(Boolean);
        const lat = Number(ship.coords?.lat);
        const lng = Number(ship.coords?.lng);
        const hasCurrent = processed.some((entry) => entry.hoursAgo === 0);
        if (!hasCurrent && Number.isFinite(lat) && Number.isFinite(lng)) {
            processed.push({ lat, lng, hoursAgo: 0 });
        }
        processed.sort((a, b) => {
            const aHours = Number.isFinite(a.hoursAgo) ? a.hoursAgo : Number.NEGATIVE_INFINITY;
            const bHours = Number.isFinite(b.hoursAgo) ? b.hoursAgo : Number.NEGATIVE_INFINITY;
            if (aHours === bHours) return 0;
            return bHours - aHours;
        });
        return processed;
    };

    // Get an array of track points for a ship's trajectory
    const getTrackPoints = (ship) => {
        const entries = getTrajectoryEntries(ship);
        if (entries.length) {
            return entries.map((entry) => [entry.lat, entry.lng]);
        }
        const lat = Number(ship?.coords?.lat);
        const lng = Number(ship?.coords?.lng);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [[lat, lng]] : [];
    };

    // Build a lookup object for ship trajectory history by hoursAgo
    const buildHistoryLookup = (ship) => {
        const entries = getTrajectoryEntries(ship);
        if (!entries.length) return {};
        const lookup = {};
        entries.forEach((entry) => {
            if (Number.isFinite(entry.hoursAgo)) {
                lookup[entry.hoursAgo] = [entry.lat, entry.lng];
            }
        });
        if (!lookup[0]) {
            const latest = entries[entries.length - 1];
            lookup[0] = [latest.lat, latest.lng];
        }
        return lookup;
    };

    // Array of currently displayed ship cards for the active tab
    let currentShipCards = [];
    // Tab name for pending marker rendering if map not ready
    let pendingMarkersTab = null;
    // Map of shipId to map marker object
    const shipMarkers = new Map();
    // History navigation buttons for ship trajectory
    const historyButtons = document.querySelectorAll(".history-tags button");
    // Currently active history point (hours ago)
    let activeHistoryHours = 0;
    // Lookup object for ship trajectory history
    let historyLookup = {};
    // Default title for the right panel
    const defaultTitle = rightTitle?.dataset.defaultTitle || rightTitle?.textContent || "";

    // Currently active tab name
    let activeTab = "region";
    // Currently selected ship card element
    let selectedCard = null;
    // Whether the area settings panel is open
    let areaSettingsOpen = false;
    // Memory of last selected ship/dispatch for each tab
    const detailMemory = { tracking: null, dispatch: null };

    // Map state
    // Leaflet map instance
    let mapInstance = null;
    // Polyline layer for ship trajectory
    let trajectoryLayer = null;
    // Marker for focused ship location
    let focusMarker = null;
    // Pending map payload if map not ready
    let pendingMapPayload = null;
    // Current map mode (region, tracking, dispatch)
    let mapMode = "region";

    // Remove the trajectory polyline from the map
    const clearTrajectory = () => {
        if (trajectoryLayer && mapInstance) {
            mapInstance.removeLayer(trajectoryLayer);
            trajectoryLayer = null;
        }
    };

    // Remove the focus marker from the map
    const clearFocusMarker = () => {
        if (focusMarker && mapInstance) {
            mapInstance.removeLayer(focusMarker);
            focusMarker = null;
        }
    };

    // Draw a trajectory polyline on the map for given points
    const drawTrajectory = (points) => {
        clearTrajectory();
        if (!mapInstance || !points.length) return;
        trajectoryLayer = L.polyline(points, {
            color: "#38bdf8",
            weight: 3,
            opacity: 0.9,
            dashArray: "6 4",
        }).addTo(mapInstance);
        mapInstance.fitBounds(trajectoryLayer.getBounds().pad(0.2));
    };

    // Highlight a ship's location on the map with a marker
    const highlightShip = (lat, lng) => {
        if (!mapInstance || !(Number.isFinite(lat) && Number.isFinite(lng))) return;
        if (focusMarker) {
            mapInstance.removeLayer(focusMarker);
            focusMarker = null;
        }
        focusMarker = L.circleMarker([lat, lng], {
            radius: 10,
            color: "#f97316",
            weight: 2,
            fillColor: "#facc15",
            fillOpacity: 0.9,
        }).addTo(mapInstance);
        mapInstance.setView([lat, lng], Math.max(mapInstance.getZoom(), 6), { animate: true });
    };

    // Update the state of history navigation buttons
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

    // Focus the map and UI on a specific history point
    function focusHistoryPoint(hours, skipActiveUpdate = false) {
        const coords = historyLookup?.[hours] || historyLookup?.[0];
        if (!coords) return;
        highlightShip(coords[0], coords[1]);
        if (!skipActiveUpdate && historyButtons.length) {
            historyButtons.forEach((btn) => {
                const btnHours = Number(btn.dataset.history || "0");
                btn.classList.toggle("active", btnHours === hours && !btn.disabled);
            });
        }
    }

    // Apply map payload (trajectory and focus) for a ship
    const applyMapPayload = (payload) => {
        if (!mapInstance || !payload) return;
        if (payload.trackPoints?.length) {
            drawTrajectory(payload.trackPoints);
        } else {
            clearTrajectory();
        }
        if (Number.isFinite(payload.lat) && Number.isFinite(payload.lng)) {
            highlightShip(payload.lat, payload.lng);
        }
    };

    // Update the map view for a selected ship card
    const updateMapForShip = (card) => {
        if (!card) return;
        const ship = getShipData(card);
        if (!ship) return;
        const payload = {
            lat: Number(ship.coords?.lat),
            lng: Number(ship.coords?.lng),
            trackPoints: getTrackPoints(ship),
        };
        if (!mapInstance) {
            pendingMapPayload = payload;
            return;
        }
        pendingMapPayload = null;
        applyMapPayload(payload);
    };

    // Set the right panel title based on the active tab
    const setRightTitle = (tabName) => {
        if (rightTitle && !rightPanel?.classList.contains("show-detail")) {
            rightTitle.textContent = panelTitleMap[tabName] || defaultTitle;
        }
    };

    // Hide the right panel detail view
    const hideDetailPanel = ({ preserveSelection = false } = {}) => {
        if (!rightPanel) return;
        rightPanel.classList.remove("show-detail");
        
        // Hide ship detail panel
        if (shipDetailPanel) {
            shipDetailPanel.setAttribute("aria-hidden", "true");
            shipDetailPanel.style.display = '';
        }
        
        // Hide dispatch detail panel
        const dispatchDetailPanel = document.getElementById('dispatch-detail');
        if (dispatchDetailPanel) {
            dispatchDetailPanel.style.display = 'none';
        }
        
        const activeListType = selectedCard?.dataset?.listType || null;
        const activeShipId = selectedCard?.dataset?.shipId || null;
        clearSelectedCards();
        if (!preserveSelection && activeListType && detailMemory.hasOwnProperty(activeListType)) {
            if (detailMemory[activeListType] === activeShipId) {
                detailMemory[activeListType] = null;
            }
        }
        selectedCard = null;
        setRightTitle(activeTab);
        clearTrajectory();
        clearFocusMarker();
        pendingMapPayload = null;
    };

    // Show or hide the area settings panel
    const setAreaSettingsVisibility = (shouldShow) => {
        if (!selectRegionBtn || !areaSettingsPanel) return;
        areaSettingsOpen = shouldShow;
        areaSettingsPanel.classList.toggle("is-open", shouldShow);
        areaSettingsPanel.setAttribute("aria-hidden", shouldShow ? "false" : "true");
        selectRegionBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    };

    // Get all ship cards for the specified tab
    const getShipCardsForTab = (tabName) => {
        if (tabName === "tracking" && trackingListContainer) {
            const cards = trackingListContainer.querySelectorAll(".ship-card[data-ship-id]");
            if (cards.length) return cards;
        }
        if (tabName === "dispatch" && dispatchListContainer) {
            const cards = dispatchListContainer.querySelectorAll(".ship-card[data-ship-id]");
            if (cards.length) return cards;
        }
        return document.querySelectorAll(`[data-panel="left-${tabName}"] .ship-card[data-ship-id]`);
    };

    // Remove all ship markers from the map
    const clearShipMarkers = () => {
        if (!mapInstance) {
            shipMarkers.clear();
            return;
        }
        shipMarkers.forEach((marker) => mapInstance.removeLayer(marker));
        shipMarkers.clear();
    };

    // Refresh the list of current ship cards for the tab
    const refreshCurrentShipCards = (tabName) => {
        currentShipCards = Array.from(getShipCardsForTab(tabName));
    };

    // Get the threat key for a ship (high, medium, low, default)
    const getThreatKey = (ship) => threatClassFromScore(ship?.threat?.score) || "default";

    // Create and add a ship marker to the map for a ship card
    const createShipMarker = (card) => {
        const ship = getShipData(card);
        const lat = Number(ship?.coords?.lat);
        const lng = Number(ship?.coords?.lng);
        if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
        const colors = SHIP_MARKER_STYLES[getThreatKey(ship)] || SHIP_MARKER_STYLES.default;
        const marker = L.circleMarker([lat, lng], {
            radius: 7,
            weight: 2,
            color: colors.border,
            fillColor: colors.fill,
            fillOpacity: 0.9,
        }).addTo(mapInstance);
        const label = ship?.name || card.querySelector(".ship-label")?.textContent?.trim();
        const tooltip = `
			<div>
				<strong>${ship?.name || ship?.mmsi || "未知"}</strong><br>
				威脅分數：${ship?.threat?.score ?? "--"}<br>
				AIS：${ship?.ais || "--"}<br>
				座標：${getCoordinateLabel(ship)}
			</div>
		`;
        if (label) {
            marker.bindTooltip(tooltip, { direction: "top", opacity: 0.92, sticky: true });
        }
        marker.on("click", () => {
            card.scrollIntoView({ behavior: "smooth", block: "center" });
            card.click();
        });
        shipMarkers.set(card.dataset.shipId, marker);
        return marker;
    };

    // Render ship markers on the map for the specified tab
    const renderShipMarkersForTab = (tabName) => {
        refreshCurrentShipCards(tabName);
        if (!mapInstance) {
            pendingMarkersTab = tabName;
            return;
        }
        clearShipMarkers();
        const isTrackingView = tabName === "tracking" || activeTab === "tracking";
        currentShipCards.forEach((card) => {
            if (isTrackingView) {
                const ship = getShipData(card);
                if (ship && !trackedShipIds.has(ship.id)) return;
            }
            createShipMarker(card);
        });
        pendingMarkersTab = null;
    };

    // Set the map mode (region, tracking, dispatch) and update markers
    const setMapMode = (mode, options = {}) => {
        const normalized = ["region", "tracking", "dispatch"].includes(mode) ? mode : "region";
        const markerMode = normalized;
        const { force = false, resetView = false } = options;
        if (!force && normalized === mapMode) {
            renderShipMarkersForTab(markerMode);
            return;
        }
        mapMode = normalized;
        if (resetView) {
            clearTrajectory();
            clearFocusMarker();
            pendingMapPayload = null;
        }
        renderShipMarkersForTab(markerMode);
    };

    // Refresh all ship markers on the map for the current mode
    const refreshMapMarkers = () => {
        setMapMode(mapMode, { force: true });
    };

    // Fit the map view to all available ship coordinates
    const fitMapToAllShips = () => {
        if (!mapInstance || !Array.isArray(window.SHIP_DATA)) return;
        const bounds = window.SHIP_DATA
            .map((ship) => ship?.coords)
            .filter((coords) => Number.isFinite(coords?.lat) && Number.isFinite(coords?.lng))
            .map((coords) => [coords.lat, coords.lng]);
        if (bounds.length) {
            mapInstance.fitBounds(bounds, { padding: [40, 40], maxZoom: 12 });
        }
    };

    const updateStatusBadge = (badge, status) => {
        if (!badge) return;
        badge.textContent = status;
        badge.style.display = 'block';

        // Remove all status classes
        badge.classList.remove('status-tracking', 'status-dispatched', 'status-pending', 'status-completed');

        // Apply color based on status
        if (status === "追蹤中") {
            badge.classList.add('status-tracking');
        } else if (status === "派遣中") {
            badge.classList.add('status-dispatched');
        }
    };

    // Render dispatch mission cards in the left panel
    const renderDispatchMissions = (missions) => {
        const iterator = dispatchListContainers.values().next();
        const fallbackContainer = dispatchListContainer || iterator.value || null;
        if (!fallbackContainer) return;
        dispatchListContainers.forEach((container) => {
            container.innerHTML = "";
        });
        dispatchedShipIds.clear();
        dispatchDataMap.clear();
        const missionList = Array.isArray(missions) ? missions : [];
        missionList.forEach((mission) => {
            // Update dispatch data map
            if (mission && mission.id) {
                dispatchDataMap.set(mission.id, mission);
            }
            
            const hasKnownSlot = mission.slot && dispatchListContainers.has(mission.slot);
            const slotKey = hasKnownSlot ? mission.slot : fallbackContainer?.dataset.dispatchList || "";
            const container = dispatchListContainers.get(slotKey) || fallbackContainer;
            if (!container) return;
            const card = createDispatchCard(mission);
            container.appendChild(card);
            const shipId = card.dataset.shipId;
            if (shipId) {
                dispatchedShipIds.add(shipId);
            }
        });
        if (activeTab === "dispatch") {
            refreshCurrentShipCards("dispatch");
            refreshMapMarkers();
        }
    };

    // Add a ship to the tracking list and update the map
    const addShipToTracking = (ship) => {
        if (!trackingListContainer || !ship || trackedShipIds.has(ship.id)) return;

        // Update ship status to "追蹤中"
        ship.event_status = "追蹤中";

        const card = createShipCard(ship, "tracking");
        trackingListContainer.appendChild(card);
        trackedShipIds.add(ship.id);

        // Update tracking statistics
        updateTrackingStatistics();

        if (mapMode === "tracking" || mapMode === "region") {
            setMapMode(mapMode, { force: true });
        }
    };

    // Add a ship to the dispatch list and update the map
    const addShipToDispatch = (ship) => {
        if (!dispatchListContainer || !ship || dispatchedShipIds.has(ship.id)) return;

        // Update ship status to "派遣中"
        ship.event_status = "派遣中";

        const card = createShipCard(ship, "dispatch");
        dispatchListContainer.appendChild(card);
        dispatchedShipIds.add(ship.id);

        // Update dispatch statistics
        updateDispatchStatistics();

        if (mapMode === "dispatch") {
            setMapMode("dispatch", { force: true });
        }
    };
    
    // shipDataList.forEach((ship) => {
    //     const container = shipListContainers.get(ship.slot || "");
    //     if (!container) return;
    //     const listType = container.dataset.shipList === "left-tracking" ? "tracking" : "region";
    //     container.appendChild(createShipCard(ship, listType));
    // });

    renderDispatchMissions(dispatchDataList);

    // Sort region ship cards by threat score (high to low)
    const sortRegionShipCards = () => {
        const regionListContainer = shipListContainers.get("left-region");
        if (!regionListContainer) return;

        const cards = Array.from(regionListContainer.querySelectorAll('.ship-card[data-ship-id]'));

        // Sort cards by threat score (descending)
        cards.sort((cardA, cardB) => {
            const shipA = getShipData(cardA);
            const shipB = getShipData(cardB);

            const scoreA = Number(shipA?.threat?.score);
            const scoreB = Number(shipB?.threat?.score);

            const validScoreA = Number.isFinite(scoreA) ? scoreA : -Infinity;
            const validScoreB = Number.isFinite(scoreB) ? scoreB : -Infinity;

            return validScoreB - validScoreA; // Descending order
        });

        // Re-append cards in sorted order
        cards.forEach(card => regionListContainer.appendChild(card));
    };

    // Sort region cards after initial load
    sortRegionShipCards();

    // Helper function to calculate threat statistics from ship cards
    const calculateThreatStats = (cards) => {
        const stats = { threatHigh: 0, threatMedium: 0, threatLow: 0 };

        cards.forEach(card => {
            const ship = getShipData(card);
            if (!ship) return;

            const score = Number(ship.threat?.score);
            if (Number.isFinite(score)) {
                if (score >= 80) stats.threatHigh++;
                else if (score >= 60) stats.threatMedium++;
                else stats.threatLow++;
            }
        });

        return stats;
    };

    // Helper function to update DOM elements with statistics
    const updateStatElements = (elements, stats) => {
        Object.keys(stats).forEach(key => {
            if (elements[key]) {
                elements[key].textContent = stats[key];
            }
        });
    };

    // Update region statistics
    const updateRegionStatistics = () => {
        const regionListContainer = shipListContainers.get("left-region");
        if (!regionListContainer) return;

        const regionCards = regionListContainer.querySelectorAll('.ship-card[data-ship-id]');

        // AIS statistics
        let aisOn = 0, aisOff = 0;
        regionCards.forEach(card => {
            const ship = getShipData(card);
            if (!ship) return;
            if (ship.ais && ship.ais !== "未開啟") aisOn++;
            else aisOff++;
        });

        // Threat statistics
        const threatStats = calculateThreatStats(regionCards);

        // Update DOM
        updateStatElements({
            aisOn: document.querySelector('[data-stat="ais-on"]'),
            aisOff: document.querySelector('[data-stat="ais-off"]'),
            threatHigh: document.querySelector('[data-stat="threat-high"]'),
            threatMedium: document.querySelector('[data-stat="threat-medium"]'),
            threatLow: document.querySelector('[data-stat="threat-low"]')
        }, { aisOn, aisOff, ...threatStats });
    };

    // Update tracking statistics
    const updateTrackingStatistics = () => {
        if (!trackingListContainer) return;

        const trackingCards = trackingListContainer.querySelectorAll('.ship-card[data-ship-id]');
        const threatStats = calculateThreatStats(trackingCards);

        updateStatElements({
            threatHigh: document.querySelector('[data-stat="tracking-threat-high"]'),
            threatMedium: document.querySelector('[data-stat="tracking-threat-medium"]'),
            threatLow: document.querySelector('[data-stat="tracking-threat-low"]')
        }, threatStats);
    };

    // Update dispatch statistics
    const updateDispatchStatistics = () => {
        if (!dispatchListContainer) return;

        const dispatchCards = dispatchListContainer.querySelectorAll('.ship-card[data-ship-id]');
        const threatStats = calculateThreatStats(dispatchCards);

        updateStatElements({
            threatHigh: document.querySelector('[data-stat="dispatch-threat-high"]'),
            threatMedium: document.querySelector('[data-stat="dispatch-threat-medium"]'),
            threatLow: document.querySelector('[data-stat="dispatch-threat-low"]')
        }, threatStats);
    };

    // Call statistics update after ships are loaded
    updateRegionStatistics();
    updateTrackingStatistics();
    updateDispatchStatistics();

    // Store the tab state for remembering selections
    const tabState = { region: null, tracking: null, dispatch: null };
    
    // Store the tab state for remembering selections
    function rememberSelection(tabName, card) {
        tabState[tabName] = card?.dataset.shipId || null;
    }

    // Restore the selected card for a tab from memory
    function restoreSelection(tabName) {
        const id = tabState[tabName];
        if (!id) return null;
        return document.querySelector(`[data-panel="left-${tabName}"] .ship-card[data-ship-id="${id}"]`);
    }

    const activateTab = (tabName) => {

        // Store the state of detail panel before switching tabs
        const wasShowingDetail = rightPanel?.classList.contains("show-detail");
        const currentShipId = selectedCard?.dataset?.shipId || null;
        
        // Check if the currently selected card belongs to the new tab
        const cardBelongsToNewTab = selectedCard && (
            (tabName === "region" && selectedCard.closest('[data-panel="left-region"]')) ||
            (tabName === "tracking" && selectedCard.closest('[data-ship-list="left-tracking"]')) ||
            (tabName === "dispatch" && selectedCard.closest('[data-dispatch-list="left-dispatch"]'))
        );
        
        // Hide detail panel if the selected card doesn't belong to the new tab
        if (wasShowingDetail && !cardBelongsToNewTab) {
            hideDetailPanel();
        }
        
        activeTab = tabName;
        tabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === tabName));
        panels.forEach((panel) => {
            const panelTab = panel.dataset.panel.split("-").pop();
            panel.classList.toggle("active", panelTab === tabName);
        });
        
        // Update title if not showing detail or card doesn't belong to new tab
        if (!rightPanel?.classList.contains("show-detail")) {
            setRightTitle(tabName);
        }
        
        if (tabName !== "region") {
            setAreaSettingsVisibility(false);
        }
        
        const isShowingDetail = rightPanel?.classList.contains("show-detail");
        const shouldResetMap = !isShowingDetail && tabName === "tracking";
        const newMode = isShowingDetail ? tabName : "region";
        setMapMode(newMode, { force: true, resetView: shouldResetMap });
        if (shouldResetMap) {
            fitMapToAllShips();
        }
        
        if (tabName === "dispatch") {
            const loader = window.loadDispatchData;
            if (typeof loader === "function") {
                loader().catch(() => { });
            }
        }
    };

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => activateTab(tab.dataset.tab));
    });

    const initialTab = document.querySelector(".tab.active")?.dataset.tab || "region";
    activateTab(initialTab);

    const mapContainer = document.getElementById("sea-map");
    const mapFallback = document.getElementById("map-fallback");
    if (mapContainer && window.L) {
        mapFallback?.classList.add("hide");
        mapInstance = L.map(mapContainer, { zoomControl: false }).setView([17.5, 116.5], 5.5);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            attribution: "© OpenStreetMap contributors",
        }).addTo(mapInstance);
        L.tileLayer("https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png", {
            attribution: "Map data © OpenSeaMap contributors",
        }).addTo(mapInstance);

        // Initial map setup - render markers for the active tab
        const initialMarkerTab = pendingMarkersTab || (mapMode === "region" ? "region" : mapMode);
        renderShipMarkersForTab(initialMarkerTab);

        setTimeout(() => mapInstance.invalidateSize(), 300);
        window.addEventListener("resize", () => mapInstance.invalidateSize());

        if (pendingMapPayload) {
            applyMapPayload(pendingMapPayload);
        }
    } else if (mapFallback) {
        mapFallback.textContent = "無法載入海圖，請保持網路連線後重新整理頁面。";
    }

    async function fetchVesselInfo(mmsi) {
        if (!mmsi) return null;

        try {
            console.log(`⏳ 查詢船舶 ${mmsi} 的資訊...`);

            const res = await fetch(`http://localhost:3005/api/v1/vesselInfo?mmsi=${mmsi}`);

            if (!res.ok) {
                const err = await res.json();
                console.error("❌ 查詢船舶資訊錯誤：", err);
                return null;
            }

            const data = await res.json();
            console.log(`✅ 船舶 ${mmsi} 資訊：`, data);
            return data;
        } catch (error) {
            console.error("❌ 無法連線：", error);
            return null;
        }
    }
    // fetchVesselInfo船舶資訊回傳格式： {
    //   "vesselType": 70,
    //   "imoNum": "0",
    //   "navStatus": "15",
    //   "cog": 63.5,
    //   "sog": 11.1,
    //   "rfFreq": "3506.1",
    //   "coord": [
    //     21.608828,
    //     121.118434
    //   ],
    //   "accuracy": "HIGH",
    //   "pulsesDuration": "216.3",
    //   "pulsesFreq": "2214.0",
    //   "waveform": "2011885.8"
    // }

    // Fill the right panel with details for the selected ship card
    // Fill the right panel with details for the selected ship card
    const renderShipDetail = async (ship, currentListType) => {
        if (!detailFields) {
            console.error("❌ detailFields is null");
            return;
        }
        // const ship = getShipData(card);
        if (!ship) {
            console.error("❌ ship data not found");
            return;
        }
        
        const threatScore = ship.threat?.score ?? "--";
        const threatLevel = ship.threat?.level || (Number(threatScore) >= 80
            ? "高風險"
            : Number(threatScore) >= 60
                ? "中風險"
                : "低風險");
        const coordsLabel = getCoordinateLabel(ship);
        const infoCards = detailFields?.infoCards;
        const threatExtras = detailFields?.threatExtras;
        const rfData = ship.rf || {};

        // 填充基本資料
        if (detailFields?.name) detailFields.name.textContent = ship.name || "-";
        if (detailFields?.mmsi) detailFields.mmsi.textContent = `MMSI：${ship.mmsi || "-"}`;
        if (detailFields?.ais) detailFields.ais.textContent = `AIS：${ship.ais || "--"}`;
        if (detailFields?.threatLevel) detailFields.threatLevel.textContent = threatLevel;
        if (detailFields?.threatScore) detailFields.threatScore.textContent = threatScore;
        if (detailFields?.status) detailFields.status.textContent = ship.status || "資料更新中";
        if (detailFields?.lastUpdate) detailFields.lastUpdate.textContent = ship.lastUpdate || "最新偵測：--";
        if (detailFields?.coordinates) detailFields.coordinates.textContent = coordsLabel;

        if (threatExtras) {
            if (threatExtras.score) threatExtras.score.textContent = threatScore;
            if (threatExtras.level) threatExtras.level.textContent = threatLevel;
            if (threatExtras.smuggle) threatExtras.smuggle.textContent = ship.threatSmuggle || "走私區域偵測：20 / 20";
            if (threatExtras.stop) threatExtras.stop.textContent = ship.threatStop || "航跡異常停留：40 / 40";
            if (threatExtras.offset) threatExtras.offset.textContent = ship.threatOffset || "距離偏移延遲：40 / 40";
        }

        // 從 API 獲取最新船舶資訊並整合更新
        const vesselInfo = await fetchVesselInfo(ship.mmsi);
        
        if (infoCards) {
            // 優先使用 API 資料，其次使用本地資料，最後使用預設值
            if (infoCards.aisStatus) infoCards.aisStatus.textContent = ship.ais || "--";
            if (infoCards.shipName) infoCards.shipName.textContent = ship.name || "-";
            if (infoCards.shipType) infoCards.shipType.textContent = vesselInfo?.vesselType?.toString() || ship.shipType || "-";
            if (infoCards.imo) infoCards.imo.textContent = vesselInfo?.imoNum || "-";
            if (infoCards.navStatus) infoCards.navStatus.textContent = vesselInfo?.navStatus || ship.navStatus || "-";
            if (infoCards.cog) infoCards.cog.textContent = vesselInfo?.cog !== undefined ? `${vesselInfo.cog}°` : (ship.cog || "-");
            if (infoCards.sog) infoCards.sog.textContent = vesselInfo?.sog !== undefined ? `${vesselInfo.sog} 節` : (ship.sog || "-");
            
            // RF 相關資訊
            if (infoCards.rfFrequency) infoCards.rfFrequency.textContent = vesselInfo?.rfFreq !== undefined ? `${vesselInfo.rfFreq} MHz` : (rfData.frequency || "-");
            if (infoCards.rfTimestamp) infoCards.rfTimestamp.textContent = rfData.timestamp || "-";
            if (infoCards.rfPulseWidth) infoCards.rfPulseWidth.textContent = vesselInfo?.pulsesDuration !== undefined ? `${vesselInfo.pulsesDuration} μs` : (rfData.pulseWidth || "-");
            if (infoCards.rfPrf) infoCards.rfPrf.textContent = vesselInfo?.pulsesFreq !== undefined ? `${vesselInfo.pulsesFreq} Hz` : (rfData.prf || "-");
            if (infoCards.rfAccuracy) infoCards.rfAccuracy.textContent = vesselInfo?.accuracy || rfData.status || "-";
            
            // 座標資訊 - 使用 API 提供的座標
            if (vesselInfo?.coord && Array.isArray(vesselInfo.coord) && vesselInfo.coord.length >= 2) {
                const lat = vesselInfo.coord[0];
                const lng = vesselInfo.coord[1];
                const apiCoordsLabel = `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
                if (detailFields?.coordinates) detailFields.coordinates.textContent = apiCoordsLabel;
                if (infoCards?.rfCoordinate) infoCards.rfCoordinate.textContent = apiCoordsLabel;
            }

            console.log(`✅ 已更新船舶 ${ship.mmsi} 的詳細資訊`);
        }

        if (detailFields?.trackingBlock) {
            const isTracked = trackedShipIds.has(ship.id);
            const isDispatched = dispatchedShipIds.has(ship.id);
            const isRegionEvent = currentListType === "region";
            const isDispatchEvent = currentListType === "dispatch";
            
            // Hide entire operation section for dispatch event
            if (detailFields?.detailSection) {
                detailFields.detailSection.style.display = isDispatchEvent ? "none" : "";
            }

            // Toggle tracking block visibility
            detailFields.trackingBlock.classList.toggle("show", isTracked);

            // Handle tracking button visibility
            if (addTrackingBtn) {
                addTrackingBtn.style.display = isTracked ? "none" : "block";
            }

            // Handle action/schedule fields visibility and content
            const actionParent = detailFields?.trackingAction?.parentElement;
            const scheduleParent = detailFields?.trackingSchedule?.parentElement;

            if (isRegionEvent) {
                // Region event: hide action/schedule fields, show confirmation button only when tracked
                if (actionParent) actionParent.style.display = "none";
                if (scheduleParent) scheduleParent.style.display = "none";

                if (addActionBtn) {
                    addActionBtn.style.display = isTracked ? "block" : "none";
                    if (isTracked) {
                        addActionBtn.disabled = true;
                        addActionBtn.textContent = "已加入追蹤事件";
                        addActionBtn.classList.add("detail-action-confirmed");
                    }
                }
            } else if (!isDispatchEvent) {
                // Tracking event: show action/schedule fields and update content
                if (actionParent) actionParent.style.display = "";
                if (scheduleParent) scheduleParent.style.display = "";

                const actionLabel = ship.action?.label || "衛星拍攝";
                const actionSchedule = ship.action?.schedule || "3小時後";
                if (detailFields?.trackingAction) detailFields.trackingAction.textContent = actionLabel;
                if (detailFields?.trackingSchedule) detailFields.trackingSchedule.textContent = actionSchedule;

                if (addActionBtn) {
                    addActionBtn.style.display = isTracked ? "block" : "none";
                    addActionBtn.disabled = isDispatched;
                    addActionBtn.textContent = isDispatched ? "已確認派遣" : "確認派遣";
                    addActionBtn.classList.toggle("detail-action-confirmed", isDispatched);
                }
            }
        }

        historyLookup = buildHistoryLookup(ship);
        activeHistoryHours = 0;
        updateHistoryButtons();
    };

    // Mapping API response to ship detail structure
    const mapApiDetailToShip = (apiData) => {
        if (!apiData) return null;
        const coords = Array.isArray(apiData.coord) && apiData.coord.length === 2
            ? { lat: apiData.coord[0], lng: apiData.coord[1] }
            : null;
        const coordsLabel = coords ? `${coords.lat}°, ${coords.lng}°` : undefined;
        return {
            shipType: apiData.vesselType,
            imo: apiData.imoNum,
            navigation: apiData.navStatus,
            cog: apiData.cog,
            sog: apiData.sog,
            coords,
            coordinatesLabel: coordsLabel,
            rf: {
                frequency: apiData.rfFreq,
                location: coordsLabel,
                status: apiData.waveform || "最新蒐集",
                pulseWidth: apiData.pulsesDuration ? `${apiData.pulsesDuration} ns` : undefined,
                prf: apiData.pulsesFreq ? `${apiData.pulsesFreq} Hz` : undefined,
            },
        };
    };

    const mapTrackResponseToEntries = (apiTrack) => {
        if (!Array.isArray(apiTrack) || !apiTrack.length) return [];
        const now = Date.now();
        return apiTrack
            .map((point) => {
                const [lat, lng] = Array.isArray(point.coord) ? point.coord : [];
                const ts = point.timestamp ? new Date(point.timestamp).getTime() : NaN;
                const hoursAgo = Number.isFinite(ts) ? Math.max(0, Math.round((now - ts) / 36e5)) : null;
                if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
                return {
                    lat: Number(lat),
                    lng: Number(lng),
                    hoursAgo: Number.isFinite(hoursAgo) ? hoursAgo : null,
                };
            })
            .filter(Boolean);
    };

    // Fetch detailed ship info from the API
    const fetchShipDetail = async (mmsi) => {
        if (!mmsi) return null;
        if (shipDetailCache.has(mmsi)) return shipDetailCache.get(mmsi);
        try {
            const res = await fetch(`${API_BASE}/vesselInfo?mmsi=${encodeURIComponent(mmsi)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const mapped = mapApiDetailToShip(data);
            shipDetailCache.set(mmsi, mapped);
            return mapped;
        } catch (err) {
            console.error("Failed to fetch vessel info", err);
            shipDetailCache.set(mmsi, null);
            return null;
        }
    };

    const fetchShipTrack = async (mmsi) => {
        if (!mmsi) return [];
        if (shipTrackCache.has(mmsi)) return shipTrackCache.get(mmsi);
        try {
            const res = await fetch(`${API_BASE}/vesselTrack?mmsi=${encodeURIComponent(mmsi)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const entries = mapTrackResponseToEntries(data);
            shipTrackCache.set(mmsi, entries);
            return entries;
        } catch (err) {
            console.error("Failed to fetch vessel track", err);
            shipTrackCache.set(mmsi, []);
            return [];
        }
    };

    // Fill the right panel with details for the selected ship card
    const fillDetailContent = (card) => {
        if (!detailFields) return;
        const ship = getShipData(card);
        if (!ship) return;
        const currentListType = card.dataset.listType || activeTab;
        latestDetailMmsi = ship.mmsi;

        // Try DB/API first; fallback to static data if unavailable.
        const renderAndHistory = (shipObj) => {
            renderShipDetail(shipObj, currentListType);
            historyLookup = buildHistoryLookup(shipObj);
            activeHistoryHours = 0;
            updateHistoryButtons();
        };

        renderAndHistory({ ...ship, status: "資料載入中…" });

        Promise.all([fetchShipDetail(ship.mmsi), fetchShipTrack(ship.mmsi)])
            .then(([apiDetail, trackEntries]) => {
                if (latestDetailMmsi !== ship.mmsi) return; // user switched selection
                const merged = {
                    ...ship,
                    ...apiDetail,
                    rf: { ...(ship.rf || {}), ...(apiDetail?.rf || {}) },
                };
                if (trackEntries && trackEntries.length) {
                    merged.trajectory = trackEntries;
                    const latest = trackEntries[0];
                    if (Number.isFinite(latest?.lat) && Number.isFinite(latest?.lng)) {
                        merged.coords = { lat: latest.lat, lng: latest.lng };
                        merged.coordinatesLabel = `${latest.lat}°, ${latest.lng}°`;
                    }
                }
                if (ship.id) {
                    shipDataMap.set(ship.id, merged);
                }
                renderAndHistory(merged);
                updateMapForShip(card);
            })
            .catch(() => {
                if (latestDetailMmsi !== ship.mmsi) return;
                console.debug("Using static shipData.js detail (API fetch failed)", ship.mmsi);
                renderAndHistory(ship);
            });
    };

    const dispatchEventName = window.DISPATCH_EVENTS?.UPDATED || "dispatchData:updated";
    if (dispatchEventName) {
        window.addEventListener(dispatchEventName, (event) => {
            const missions = Array.isArray(event?.detail) ? event.detail : [];
            renderDispatchMissions(missions);
        });
    }

    const initialDispatchLoader = window.loadDispatchData;
    if (typeof initialDispatchLoader === "function") {
        initialDispatchLoader().catch(() => { });
    }

    // Store the current mission when viewing ship info from dispatch
    let currentDispatchMission = null;
    // Remember last dispatch image to avoid immediate repeats
    let lastDispatchImage = null;

    // Show ship detail in right panel
    const showShipDetailPanel = (card, fromMission = null) => {
        // Get data from database with shipId (MMSI)
        if (!rightPanel || !shipDetailPanel) return;
        clearSelectedCards();
        card.classList.add("selected");
        selectedCard = card;
        const listType = card.dataset.listType || activeTab;
        const shipId = card.dataset.shipId || null;
        if (listType && detailMemory.hasOwnProperty(listType)) {
            detailMemory[listType] = shipId;
        }
        
        // Store mission if viewing from dispatch
        currentDispatchMission = fromMission;
        
        fillDetailContent(card);
        updateMapForShip(card);
        rightPanel.classList.add("show-detail");
        shipDetailPanel.setAttribute("aria-hidden", "false");
        if (rightTitle) {
            rightTitle.textContent = "單船資訊";
        }
        
        // Add "Back to Dispatch" button if viewing from dispatch mission
        if (fromMission) {
            let backToDispatchBtn = shipDetailPanel.querySelector('.btn-back-to-dispatch');
            if (!backToDispatchBtn) {
                backToDispatchBtn = document.createElement('button');
                backToDispatchBtn.className = 'btn-back-to-dispatch detail-action';
                backToDispatchBtn.style.cssText = 'margin-top: 1rem; background: #8b5cf6; color: white;';
                backToDispatchBtn.textContent = '返回派遣任務';
                
                // Insert after the detail header
                const detailHeader = shipDetailPanel.querySelector('.detail-header');
                if (detailHeader) {
                    detailHeader.after(backToDispatchBtn);
                }
            }
            backToDispatchBtn.style.display = 'block';
            
            // Add click handler
            backToDispatchBtn.onclick = () => {
                if (currentDispatchMission) {
                    showDispatchDetail(currentDispatchMission);
                    currentDispatchMission = null;
                }
            };
        } else {
            // Hide the button if not from dispatch
            const backToDispatchBtn = shipDetailPanel.querySelector('.btn-back-to-dispatch');
            if (backToDispatchBtn) {
                backToDispatchBtn.style.display = 'none';
            }
        }
    };

    // Show dispatch mission detail in right panel (image-first view)
    const showDispatchDetail = (mission) => {
        if (!rightPanel) return;

        // Prefer images folder next to the current page. Try multiple base paths to avoid 404s.
        const imageBaseCandidates = [
            window.DISPATCH_IMAGE_BASE,
            "./images",
            "images",
            "/images",
        ].filter(Boolean);

        const buildImageList = (base) => [
            `${base}/AIS/cargo.jpg`,
            `${base}/AIS/fishing.jpg`,
            `${base}/No_AIS/cargo.jpg`,
            `${base}/No_AIS/shiping.jpg`,
        ];

        const dispatchImages = Array.from(
            new Set(imageBaseCandidates.flatMap((base) => buildImageList(base)))
        );
        
        // Select image
        const pickDispatchImage = (missionData) => {
            // If mission provides an explicit image URL, use it.
            const explicitImage = missionData?.image || missionData?.image_url || missionData?.imageUrl;
            if (explicitImage) return explicitImage;

            // Otherwise randomly pick, avoiding an immediate repeat.
            const pool = dispatchImages.filter(Boolean);
            if (!pool.length) return "";
            const candidates = lastDispatchImage ? pool.filter((src) => src !== lastDispatchImage) : pool;
            const choicePool = candidates.length ? candidates : pool;
            const choice = choicePool[Math.floor(Math.random() * choicePool.length)];
            lastDispatchImage = choice;
            return choice;
        };

        // Hide the ship detail panel
        if (shipDetailPanel) {
            shipDetailPanel.style.display = "none";
        }

        // Get or create dispatch detail panel
        let dispatchDetailPanel = document.getElementById("dispatch-detail");
        if (!dispatchDetailPanel) {
            dispatchDetailPanel = document.createElement("div");
            dispatchDetailPanel.id = "dispatch-detail";
            dispatchDetailPanel.className = "dispatch-detail-panel";
            if (rightPanel) rightPanel.appendChild(dispatchDetailPanel);
        }

        
        // Show dispatch detail panel
        dispatchDetailPanel.style.display = "block";

        // Build image content
        const shipId = mission.ship_id || mission.shipId;
        const imageSrc = pickDispatchImage(mission);
        const altText = shipId || mission.id || "dispatch-ship";
        const fallbackQueue = dispatchImages.filter((src) => src !== imageSrc);
        
        /* deprecated
        const metaBlocks = [
            { label: "任務ID", value: mission.id },
            { label: "船舶ID", value: shipId },
            { label: "行動", value: mission.action_label || mission.action },
            { label: "派遣時間", value: mission.dispatch_time || mission.dispatchTime },
            { label: "排程", value: mission.schedule },
            { label: "狀態", value: mission.status },
        ]
            .filter((item) => item.value)
            .map(
                (item) =>
                    `<div class="detail-field"><span class="field-label">${item.label}：</span><span class="field-value">${item.value}</span></div>`
            )
            .join("");
        */

        dispatchDetailPanel.innerHTML = `
            <div class="detail-header">
                <h3>派遣船舶影像</h3>
            </div>
            <div class="detail-content">
                <div class="dispatch-image-frame" style="width:100%;display:flex;justify-content:center;align-items:center;">
                    <img src="${imageSrc}" alt="${altText}" style="max-width: 100%; height: auto; border-radius: 0.5rem;" data-fallback="true" />
                </div>
                ${
                    shipId
                        ? `
                <div class="detail-actions" style="margin-top: 1rem;">
                    <button class="btn-view-ship-info" data-ship-id="${shipId}" style="padding: 0.5rem 1rem; background: #3b82f6; color: white; border: none; border-radius: 0.375rem; cursor: pointer;">
                        查看船舶資訊
                    </button>
                </div>
                `
                        : ""
                }
            </div>
        `;

        // Wire the "view ship" button
        if (shipId) {
            const viewShipBtn = dispatchDetailPanel.querySelector(".btn-view-ship-info");
            if (viewShipBtn) {
                viewShipBtn.addEventListener("click", () => {
                    const ship = shipDataMap.get(shipId);
                    if (!ship) return;
                    dispatchDetailPanel.style.display = "none";
                    if (shipDetailPanel) {
                        shipDetailPanel.style.display = "";
                        shipDetailPanel.setAttribute("aria-hidden", "false");
                    }
                    let shipCard = trackingListContainer?.querySelector(`.ship-card[data-ship-id="${shipId}"]`);
                    if (!shipCard) {
                        const regionContainer = shipListContainers.get("left-region");
                        shipCard = regionContainer?.querySelector(`.ship-card[data-ship-id="${shipId}"]`);
                    }
                    if (!shipCard) {
                        shipCard = document.querySelector(`.ship-card[data-ship-id="${shipId}"]`);
                    }
                    if (shipCard) {
                        showShipDetailPanel(shipCard, mission);
                    }
                });
            }
        }

        // If the primary image fails (e.g., wrong base path), walk through other known paths.
        const dispatchImg = dispatchDetailPanel.querySelector("img[data-fallback]");
        if (dispatchImg && fallbackQueue.length) {
            dispatchImg.onerror = () => {
                const nextSrc = fallbackQueue.shift();
                if (nextSrc) {
                    dispatchImg.src = nextSrc;
                }
            };
        }

        // Show the right panel and update title
        rightPanel.classList.add("show-detail");
        rightPanel.setAttribute("aria-hidden", "false");
        if (rightTitle) {
            rightTitle.textContent = "派遣任務詳情";
        }
    };

    document.addEventListener("click", (event) => {
        const card = event.target.closest(".ship-card");
        if (!card || !card.closest(".left-panel")) return;
        
        // Handle dispatch cards (with mission data if available, otherwise synthesize from ship)
        if (card.dataset.listType === "dispatch") {
            let mission = card.dataset.missionId ? dispatchDataMap.get(card.dataset.missionId) : null;
            if (!mission && card.dataset.shipId) {
                mission = {
                    id: card.dataset.missionId || `dispatch-${card.dataset.shipId}`,
                    shipId: card.dataset.shipId,
                    action: { label: "派遣" },
                    status: "派遣中",
                };
            }
            if (mission) {
                showDispatchDetail(mission);
                return;
            }
        }
        
        // Show ship detail for regular cards
        if (card.dataset.shipId) {
            showShipDetailPanel(card);
        }
    });

    selectRegionBtn?.addEventListener("click", () => {
        setAreaSettingsVisibility(!areaSettingsOpen);
    });

    // Handle area settings apply button
    const areaApplyBtn = document.querySelector(".area-apply");
    const areaResetBtn = document.querySelector(".area-reset");
    const latInput = areaSettingsPanel?.querySelector('input[type="number"][placeholder="23.974"]');
    const lonInput = areaSettingsPanel?.querySelector('input[type="number"][placeholder="120.973"]');
    const radiusInput = areaSettingsPanel?.querySelector('input[type="number"][placeholder="150"]');

    // Apply area settings and refresh suspicious vessels
    areaApplyBtn?.addEventListener("click", async () => {
        const lat = parseFloat(latInput?.value) || 23.974;
        const lon = parseFloat(lonInput?.value) || 120.973;
        const radius = parseFloat(radiusInput?.value) || 150;

        console.log(`🔄 Applying new area settings: lat=${lat}, lon=${lon}, radius=${radius}`);

        // Update current area display
        const latDisplay = document.querySelector('[data-current="lat"]');
        const lonDisplay = document.querySelector('[data-current="lon"]');
        const radiusDisplay = document.querySelector('[data-current="radius"]');
        
        if (latDisplay) latDisplay.textContent = lat.toFixed(3);
        if (lonDisplay) lonDisplay.textContent = lon.toFixed(3);
        if (radiusDisplay) radiusDisplay.textContent = radius.toString();

        // Refresh suspicious vessels with new parameters
        await loadAndDisplaySuspiciousVessels({ lat, lon, radius });

        // Close the settings panel
        setAreaSettingsVisibility(false);
    });

    // Reset area settings to default values
    areaResetBtn?.addEventListener("click", () => {
        if (latInput) latInput.value = "";
        if (lonInput) lonInput.value = "";
        if (radiusInput) radiusInput.value = "";
        console.log("🔄 Area settings reset to default");
    });

    historyButtons.forEach((button) => {
        button.addEventListener("click", () => {
            if (button.disabled) return;
            const hours = Number(button.dataset.history || "0");
            if (!historyLookup?.[hours]) return;
            activeHistoryHours = hours;
            focusHistoryPoint(hours);
        });
    });

    updateHistoryButtons();

    detailBack?.addEventListener("click", () => {
        hideDetailPanel();
        setMapMode("region", { force: true, resetView: true });
        // Fit map view to all ships (region mode)
        fitMapToAllShips();
    });

    addTrackingBtn?.addEventListener("click", () => {
        if (!selectedCard) return;
        const ship = getShipData(selectedCard);
        if (!ship) return;

        addShipToTracking(ship);

        // Update status badge on the region event card (where the button was clicked)
        const statusBadge = selectedCard.querySelector('[data-status-badge]');
        updateStatusBadge(statusBadge, ship.event_status);

        fillDetailContent(selectedCard);
    });

    addActionBtn?.addEventListener("click", () => {
        if (!selectedCard) return;
        const ship = getShipData(selectedCard);
        if (!ship) return;

        addShipToDispatch(ship);

        addActionBtn.classList.add("detail-action-confirmed");
        addActionBtn.disabled = true;
        addActionBtn.textContent = "已確認派遣";

        // Update status badge on both tracking and region event cards
        const trackingStatusBadge = selectedCard.querySelector('[data-status-badge]');
        updateStatusBadge(trackingStatusBadge, ship.event_status);

        const regionPanel = document.querySelector('[data-panel="left-region"]');
        if (regionPanel) {
            const regionCard = regionPanel.querySelector(`.ship-card[data-ship-id="${ship.id}"]`);
            if (regionCard) {
                const regionStatusBadge = regionCard.querySelector('[data-status-badge]');
                updateStatusBadge(regionStatusBadge, ship.event_status);
            }
        }

        fillDetailContent(selectedCard);

        // Build the mission object
        const mission = {
            id: `mission-${ship.id}-${Date.now()}`,
            shipId: ship.id,
            action: ship.action?.label || "衛星拍攝",
            dispatchTime: new Date().toISOString(),
            schedule: ship.action?.schedule || "3小時後",
            status: "pending",
            slot: "left-dispatch",
        };

        // add action to dispatch database
        window.addDispatchMission(mission);

    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && rightPanel?.classList.contains("show-detail")) {
            hideDetailPanel();
        }
    });
});
