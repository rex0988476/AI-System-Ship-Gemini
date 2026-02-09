const getThreatLevelInfo = window.ThreatUtils?.getThreatLevelInfo;
const formatUtcTime = window.DateUtils?.formatUtcTime;
const toScheduleDate = window.DateUtils?.toScheduleDate;
const getCoordinateLabel = window.CoordinateUtils?.getCoordinateLabel;
const TYPE_MAP = {
    70: "cargo",
    30: "fishing",
    // add more codes here
};

/*
ABOUT AUTOMATICALLY UPDATING DATA
    Update every 6 minutes:
    - Extract data from database to ShipDataMap based on region, track, and dispatch
    - Compute threat scores for each ship in ShipDataMap
    - Update Suspicious, track, and dispatch ship cards and data
    - If a ship is not in ShipDataMap, fetch from vesselInfo API
DATA STRUCTURES
    ShipDataMap: Map of MMSI to ship detail object
    CardDataMap: WeakMap of card element to { type, ship } object
    TrackedShipIds: Set of MMSI for tracked ships
    DispatchedShipIds: Set of MMSI for dispatched ships
DATABASE
    For Cards:
        SuspiciousVessels
        TrackList 
        DispatchList
    For Detail:
        VesselInfo
        TrackList
        DispatchList
*/

document.addEventListener("DOMContentLoaded", () => {
    // API base for live ship details (fallback to local data if request fails)
    const API_BASE = window.API_BASE;
    
    let threatDetailManager = null;
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
    // Button to confirm action
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

    // Map of MMSI to ship detail data object (using string MMSI as key)
    const shipDataMap = new Map();
    // Map of MMSI to trajectory entries (keeps shipDataMap minimal)
    const shipTrajectoryMap = new Map();
    // Map of ship list container elements by slot name
    const shipListContainers = new Map();
    document.querySelectorAll("[data-ship-list]").forEach((container) => {
        shipListContainers.set(container.dataset.shipList, container);
    });
    // Container for tracking ship cards
    const trackingListContainer = shipListContainers.get("left-tracking");
    // Container for dispatch mission cards
    const dispatchListContainer = document.querySelector('[data-dispatch-list="left-dispatch"]');
    // Set of ship IDs currently being tracked
    const trackedShipIds = new Set();
    // Set of ship IDs currently dispatched
    const dispatchedShipIds = new Set();
    const currentArea = { lat: 23.974, lon: 120.973, radius: 2000 };

    // In-memory dispatch missions
    const dispatchMissions = [];
    
    // WeakMap to store all card data (type, ship)
    const cardDataMap = new WeakMap();
    
    // Initialize TrajectoryUtils with dependencies
    window.TrajectoryUtils.init({
        apiBase: API_BASE,
        cache: shipTrajectoryMap,
        vesselService: window.VesselService
    });

    // Selector for ship card elements
    const shipCardSelector = ".ship-card[data-ship-id]";
    // Function to get all ship card elements
    const getAllShipCards =  () => document.querySelectorAll(shipCardSelector);
    // Function to clear selected state from all ship cards
    const clearSelectedCards = () => {
        getAllShipCards().forEach((card) => card.classList.remove("selected"));
    };

    const getShipData = (mmsi) => {
        if (!mmsi) return null;
        const normalizedMmsi = String(mmsi);
        const raw = shipDataMap.get(normalizedMmsi) || null;
        return window.DetailPanel?.normalizeShipDetail
            ? window.DetailPanel.normalizeShipDetail(raw)
            : raw;
    };

    const getShipIdFromCard = (card) => card?.dataset?.shipId || null;

    const cardManager = window.CardManager?.create({
        shipListContainers,
        shipDataMap: shipDataMap,
        cardDataMap,
        getShipData,
        getThreatLevelInfo,
        threatLevels: window.ThreatUtils?.THREAT_LEVELS,
    });

    const statisticsManager = window.StatisticsManager?.create({
        shipListContainers,
        dispatchListContainer,
        trackingListContainer,
        getShipData,
    });

    window.VesselService?.initShipData({ shipDataMap, apiBase: API_BASE });

    // 渲染後的更新操作（獨立函式）
    const updateAfterSuspiciousVesselsRendered = () => {
        cardManager?.sortRegionShipCards();
        statisticsManager?.updateRegionStatistics();
        
        // Update status badges for tracked/dispatched ships
        const regionPanel = document.querySelector('[data-panel="left-region"]');
        if (regionPanel) {
            const cards = regionPanel.querySelectorAll('.ship-card[data-ship-id]');
            cards.forEach(card => {
                const shipId = card.dataset.shipId;
                const badge = card.querySelector('[data-status-badge]');
                if (!badge) return;
                
                let status = '';
                if (dispatchedShipIds.has(shipId)) {
                    status = '派遣中';
                } else if (trackedShipIds.has(shipId)) {
                    status = '追蹤中';
                }
                
                if (status) {
                    updateStatusBadge(badge, status);
                }
            });
        }
        
        if (mapMode === "region") {
            refreshMapMarkers();
        }
    };

    // 優化後的 API 獲取函式（可配置參數）
    const fetchSuspiciousVessels = async ({ lat, lon, radius } = {}) => {
        const searchLat = Number(lat);
        const searchLon = Number(lon);
        const searchRadius = Number(radius);
        if (!Number.isFinite(searchLat) || !Number.isFinite(searchLon) || !Number.isFinite(searchRadius)) {
            throw new Error("Invalid search area parameters");
        }
        
        try {
            const url = `${API_BASE}/suspiciousVessels?lat=${searchLat}&lon=${searchLon}&radius=${searchRadius}`;
            const res = await fetch(url);
            
            if (!res.ok) {
                const err = await res.json();
                console.error("❌ Error fetching suspicious vessels:", err);
                return null;
            }
            
            const data = await res.json();
            
            // 批量獲取威脅分數 (使用 ThreatService)
            if (!window.ThreatService) {
                console.error("❌ ThreatService not loaded! Returning vessels without threat scores.");
                return data.map(vessel => ({ ...vessel, threatScore: null }));
            }
            
            const mmsiList = data.map(v => v.mmsi);
            const threatScores = await window.ThreatService.fetchBatchThreatScores(mmsiList);
            
            const vesselsWithScores = data.map(vessel => {
                const score = threatScores.get(vessel.mmsi);
                return {
                    ...vessel,
                    threatScore: score !== undefined ? score : null
                };
            });
            
            return vesselsWithScores;
            
        } catch (error) {
            console.error("❌ Connection error:", error);
            return null;
        }
    };

    // 整合函式（呼叫者）
    const loadAndDisplaySuspiciousVessels = async (searchParams = {}) => {
        // Clean up ALL suspicious vessel data from shipDataMap first
        Array.from(shipDataMap.keys()).forEach(mmsi => {
            const ship = shipDataMap.get(mmsi);
            if (ship?.isSuspicious) {
                shipDataMap.delete(mmsi);
            }
        });
        
        let vessels = await fetchSuspiciousVessels(searchParams);

        if (!Array.isArray(vessels)) {
            vessels = [];
        }

        // 1. First, save specific vessels (like 41200008) to global cache so tracking can use them
        vessels.forEach(v => {
             if (v.mmsi === "41200008" && cardManager) {
                 // We manually convert and save it, mocking what cardManager usually does
                 // We need to use internal helper from cardManager if exposed, or manually replicate
                 // Since convertSuspiciousToShip is internal to cardManager closure,
                 // we might rely on the fact that cardManager.renderSuspiciousVessels updates the map,
                 // BUt since we are filtering it OUT before render, we need to manually set it.
                 
                 // Construct a data object similar to what convertSuspiciousToShip produces
                 const shipData = {
                    id: v.mmsi,
                    mmsi: v.mmsi,
                    name: v.displayName || v.mmsi,
                    ais: v.aisFlag ? "已開啟" : "未開啟",
                    threatScore: v.threatScore ?? v.threat?.score ?? -1, // Handle raw API format
                    coords: (v.coord && v.coord.length === 2) ? { lat: v.coord[0], lng: v.coord[1] } : null,
                    coordinatesLabel: (v.coord && v.coord.length === 2) ? `${v.coord[0].toFixed(3)}°N, ${v.coord[1].toFixed(3)}°E` : "-",
                    status: "監控中", // Default status
                    category: "region",
                    isSuspicious: true, // Mark as suspicious origin
                    lastUpdate: "Just now"
                 };
                 shipDataMap.set(v.mmsi, shipData);
                 console.log(`Silently cached vessel ${v.mmsi}`);
             }
        });

        // 2. Then Filter out specific MMSIs so they don't appear in the list/map
        vessels = vessels.filter(v => v.mmsi !== "41200008");

        // --- INJECT FAKE UNKNOWN VESSEL ---
        const fakeUnknownVessel = {
            mmsi: "UNKNOWN_TARGET_001", // Use unique ID internally
            displayName: "未知", // Custom property for display name
            coord: [7.955278, 103.911583],
            aisFlag: false,
            threatScore: 30,
            isUnknownIdentity: true // Custom flag for detail panel logic
        };
        vessels.push(fakeUnknownVessel);
        console.log("Injecting fake vessel:", fakeUnknownVessel);
        // Always call render to clear old cards, even if no new vessels
        cardManager?.renderSuspiciousVessels(vessels);
        updateAfterSuspiciousVesselsRendered();
    };

    // Get and process trajectory entries for a ship
    // Returns cached data synchronously, or empty array if not cached
    function getTrajectoryEntries(ship) {
        const mmsi = String(ship?.mmsi);
        if (!mmsi) return [];
        
        // Return cached data synchronously
        if (shipTrajectoryMap.has(mmsi)) {
            return shipTrajectoryMap.get(mmsi);
        }
        
        // If not cached, return empty array (detailPanel.js will fetch async)
        return [];
    }

    const getRoutePredictionPoints = (ship, options = {}) => {
        return window.RoutePredictionService?.getRoutePredictionPoints(ship, {
            ...options,
            getTrajectoryEntries,
        }) || [];
    };

    // Build a lookup object for ship trajectory history by hoursAgo
    const buildHistoryLookup = (ship) => {
        const entries = getTrajectoryEntries(ship);
        if (!entries.length) return {};
        
        // Find the minimum hoursAgo to use as baseline (this is "now")
        // Include hoursAgo=0 since getTrajectoryEntries already normalized the data
        const minHours = Math.min(...entries.map(e => e.hoursAgo).filter(h => Number.isFinite(h)));
        
        // Normalize entries to be relative to "now"
        const normalizedEntries = entries.map(entry => ({
            ...entry,
            relativeHours: entry.hoursAgo - minHours
        }));
        
        // Standard time points we want to map to (matching button values)
        const standardHours = [0, 3, 6, 12, 24, 48, 72, 96];
        const lookup = {};
        const MATCH_THRESHOLD = 2; // Only match if within 2 hours
        
        // Map each standard hour to the closest trajectory entry
        standardHours.forEach(targetHours => {
            // Find the entry closest to this target hour (using normalized values)
            let closestEntry = null;
            let minDiff = Infinity;
            
            normalizedEntries.forEach(entry => {
                if (Number.isFinite(entry.relativeHours)) {
                    const diff = Math.abs(entry.relativeHours - targetHours);
                    if (diff < minDiff) {
                        minDiff = diff;
                        closestEntry = entry;
                    }
                }
            });
            
            // Only add to lookup if the match is close enough
            if (closestEntry && minDiff <= MATCH_THRESHOLD) {
                lookup[targetHours] = [closestEntry.lat, closestEntry.lng];
            }
        });
        
        return lookup;
    };    
    
    const getActiveTab = () => tabManager?.getActiveTab();

    const mapManager = window.MapManager?.create({
        getShipData,
        getTrajectoryEntries,
        getRoutePredictionPoints,
        getCoordinateLabel,
        getSelectedCard: () => selectedCard,
        getActiveTab,
        onMapClick: () => setAreaSettingsVisibility(false),
    });

    // Array of currently displayed ship cards for the active tab
    let currentVesselCards = [];
    // Default title for the right panel
    const defaultTitle = rightTitle?.dataset.defaultTitle;

    let tabManager = null;
    // Currently selected ship card element
    let selectedCard = null;
    // Whether the area settings panel is open
    let areaSettingsOpen = false;
    // Memory of last selected ship/dispatch for each tab
    const detailMemory = { tracking: null, dispatch: null };

    // Current map mode (region, tracking, dispatch)
    let mapMode = "region";

    // Set the right panel title based on the active tab
    const setRightTitle = (tabName) => {
        if (!rightTitle || rightPanel?.classList.contains("show-detail")) return;
        const title = panelTitleMap[tabName] || defaultTitle;
        if (title) rightTitle.textContent = title;
    };

    // Hide the right panel detail view
    const hideDetailPanel = () => {
        if (!rightPanel) return;
        rightPanel.classList.remove("show-detail");
        
        // Hide ship detail panel
        if (shipDetailPanel) {
            // Remove focus from any descendant before hiding
            if (shipDetailPanel.contains(document.activeElement)) {
                document.activeElement.blur();
            }
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
        if (activeListType && detailMemory.hasOwnProperty(activeListType)) {
            if (detailMemory[activeListType] === activeShipId) {
                detailMemory[activeListType] = null;
            }
        }
        selectedCard = null;
        setRightTitle(getActiveTab());
        mapManager?.clearTrajectory();
        mapManager?.clearFocusMarker();
    };

    // Show or hide the area settings panel
    const setAreaSettingsVisibility = (shouldShow) => {
        if (!selectRegionBtn || !areaSettingsPanel) return;
        
        // Remove focus from any descendant before hiding
        if (!shouldShow && areaSettingsPanel.contains(document.activeElement)) {
            document.activeElement.blur();
        }
        
        areaSettingsOpen = shouldShow;
        areaSettingsPanel.classList.toggle("is-open", shouldShow);
        areaSettingsPanel.setAttribute("aria-hidden", shouldShow ? "false" : "true");
        selectRegionBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    };

    // Refresh the list of current ship cards for the tab
    const getCurrentVesselCards = (tabName) => {
        let cards = [];
        if (tabName === "tracking" && trackingListContainer) {
            cards = trackingListContainer.querySelectorAll(".ship-card[data-ship-id]");
        } else if (tabName === "dispatch" && dispatchListContainer) {
            cards = dispatchListContainer.querySelectorAll(".ship-card[data-ship-id]");
        } else if (tabName === "region") {
            // For region tab, only select suspicious vessel cards
            cards = document.querySelectorAll(`[data-panel="left-${tabName}"] .ship-card[data-suspicious-vessel="true"]`);
        } else {
            cards = document.querySelectorAll(`[data-panel="left-${tabName}"] .ship-card[data-ship-id]`);
        }
        currentVesselCards = Array.from(cards);
    };

    // Render ship markers on the map for the specified tab
    const renderShipMarkersForTab = (tabName) => {
        getCurrentVesselCards(tabName);
        const activeTab = getActiveTab();
        const isTrackingView = tabName === "tracking" || activeTab === "tracking";
        const cards = currentVesselCards.filter((card) => {
            if (!isTrackingView) return true;
            const ship = getShipData(getShipIdFromCard(card));
            return ship && trackedShipIds.has(ship.mmsi);
        });
        mapManager?.renderShipMarkers(cards, { activeTab });
    };

    const applyRegionRadiusView = () => {
        mapManager?.setSearchRadius(currentArea.lat, currentArea.lon, currentArea.radius, { fit: true });
    };

    // Set the map mode (region, tracking, dispatch) and update markers
    const setMapMode = (mode, options = {}) => {
        const markerMode = ["region", "tracking", "dispatch"].includes(mode) ? mode : "region";
        const { force = false, resetView = false } = options;
        if (!force && markerMode === mapMode) {
            renderShipMarkersForTab(markerMode);
            return;
        }
        mapMode = markerMode;
        if (resetView) {
            mapManager?.clearTrajectory();
            mapManager?.clearFocusMarker();
        }
        renderShipMarkersForTab(markerMode);
        if (markerMode === "region") {
            applyRegionRadiusView();
        }
    };

    // Refresh all ship markers on the map for the current mode
    const refreshMapMarkers = () => {
        setMapMode(mapMode, { force: true });
    };

    // Fit the map view to all available ship coordinates
    const fitMapToAllShips = () => {
        if (!Array.isArray(window.SHIP_DATA)) return;
        mapManager?.fitMapToAllShips(window.SHIP_DATA);
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

    // Render dispatch missions
    const renderDispatchMissions = (missions) => {
        if (!dispatchListContainer) return;
        
        dispatchListContainer.innerHTML = "";
        dispatchedShipIds.clear();
        const missionList = Array.isArray(missions) ? missions : [];

        missionList.forEach((mission) => {
            const shipId = mission.mmsi;
            const ship = shipId ? shipDataMap.get(shipId) : null;

            const mergedShip = {
                ...(ship || {}),
                mission,
                category: "dispatch",
                event_status: mission.status || ship?.event_status,
            };

            const card = cardManager?.createCard(mergedShip);
            if (!card) return;
            
            // Store card data in WeakMap
            cardDataMap.set(card, {
                type: 'dispatch',
                ship: mergedShip
            });
            
            dispatchListContainer.appendChild(card);
            const cardShipId = card.dataset.shipId;
            if (cardShipId) {
                dispatchedShipIds.add(cardShipId);
            }
        });
        if (getActiveTab() === "dispatch") {
            getCurrentVesselCards("dispatch");
            refreshMapMarkers();
        }
    };
    
    // Add a ship to the tracking list and update the map
    const addShipToTracking = async (ship) => {
        if (!trackingListContainer || !ship || trackedShipIds.has(ship.mmsi)) return;
        if (ship.mission === undefined) {
            ship.mission = null;
        }

        try {
            // Save to database first
            if (window.EventService?.createTrackingEvent) {
                await window.EventService.createTrackingEvent(ship.mmsi);
            }
        } catch (error) {
            console.error("❌ Failed to save tracking event:", error);
            alert("無法保存追蹤事件到數據庫");
            return;
        }

        // Update ship status to "追蹤中"
        ship.event_status = "追蹤中";

        const card = cardManager?.createCard(ship);
        if (!card) return;
        
        // Store card data in WeakMap
        cardDataMap.set(card, {
            type: 'tracking',
            ship: ship
        });
        
        trackingListContainer.appendChild(card);
        trackedShipIds.add(ship.mmsi);

        // Check if ship is dispatched and update badge accordingly
        if (dispatchedShipIds.has(ship.mmsi)) {
            const badge = card.querySelector('[data-status-badge]');
            updateStatusBadge(badge, '派遣中');
        }

        // Update tracking statistics
        statisticsManager?.updateTrackingStatistics();

        // Update region panel badge if ship exists there
        const regionPanel = document.querySelector('[data-panel="left-region"]');
        if (regionPanel) {
            const regionCard = regionPanel.querySelector(`.ship-card[data-ship-id="${ship.mmsi}"]`);
            if (regionCard) {
                const badge = regionCard.querySelector('[data-status-badge]');
                if (badge) {
                    updateStatusBadge(badge, ship.event_status);
                }
            }
        }

        if (mapMode === "tracking" || mapMode === "region") {
            setMapMode(mapMode, { force: true });
        }
    };

    // Add a ship to tracking by MMSI
    const addShipToTrackingByMmsi = async (mmsi) => {
        if (!mmsi) {
            console.error("❌ No MMSI provided");
            return false;
        }
        
        const normalizedMmsi = String(mmsi);
        
        // Check if already tracked
        if (trackedShipIds.has(normalizedMmsi)) {
            console.warn(`⚠️ Ship ${normalizedMmsi} already tracked`);
            return false;
        }
        
        // Get ship data from cache or verify from vesselInfo
        let ship = shipDataMap.get(normalizedMmsi);
        if (!ship) {
            ship = await window.VesselService?.ensureShip(normalizedMmsi);
            if (!ship) {
                console.warn(`⚠️ MMSI ${normalizedMmsi} not found in vesselInfo`);
                return false;
            }
        }
        
        // Add to tracking
        await addShipToTracking(ship);
        return true;
    };

    const loadTrackingEventsFromDatabase = async () => {
        if (!window.EventService?.getAllTrackingEvents || !trackingListContainer) {
            console.warn("⚠️ Cannot load tracking: EventService or container missing");
            return;
        } 
        
        try {
            const data = await window.EventService.getAllTrackingEvents();
            const events = Array.isArray(data) ? data : (data ? [data] : []);
                        
            trackingListContainer.innerHTML = "";
            trackedShipIds.clear();
            
            let loadedCount = 0;
            let notFoundCount = 0;
            
            for (const event of events) {
                const mmsi = event?.mmsi || event?.data?.mmsi;
                if (!mmsi) return;
                
                const normalizedMmsi = String(mmsi);
                let ship = shipDataMap.get(normalizedMmsi);
                
                if (ship) {
                    loadedCount++;
                } else {
                    ship = await window.VesselService?.ensureShip(normalizedMmsi);
                    if (!ship) {
                        notFoundCount++;
                        continue;
                    }
                }
                                
                if (ship) {
                    addShipToTrackingBatch(ship);
                }
            }
            
            console.log(`✅ Loaded ${trackedShipIds.size} tracked ships (${loadedCount} from data, ${notFoundCount} missing vesselInfo)`);
            
            // Update badges for ships that are also dispatched
            if (trackingListContainer) {
                trackedShipIds.forEach(shipId => {
                    if (dispatchedShipIds.has(shipId)) {
                        const card = trackingListContainer.querySelector(`[data-ship-id="${shipId}"]`);
                        if (card) {
                            const badge = card.querySelector('[data-status-badge]');
                            updateStatusBadge(badge, '派遣中');
                        }
                    }
                });
            }
            
            statisticsManager?.updateTrackingStatistics();
            
            // Refresh detail panel if it's currently open
            if (rightPanel?.classList.contains("show-detail") && selectedCard) {
                detailPanel?.fillDetailContent(selectedCard);
            }
            
            if (mapMode === "tracking" || mapMode === "region") {
                setMapMode(mapMode, { force: true });
            }
        } catch (error) {
            console.error("❌ Failed to load tracking events:", error);
        }
    };
    
    // Batch version of addShipToTracking without map updates
    const addShipToTrackingBatch = (ship) => {
        if (!trackingListContainer) {
            console.error("❌ No tracking container");
            return;
        }
        if (!ship) {
            console.error("❌ No ship data");
            return;
        }
        if (trackedShipIds.has(ship.mmsi)) {
            console.warn(`⚠️ Ship ${ship.mmsi} already tracked, skipping`);
            return;
        }

        ship.event_status = "追蹤中";
        if (ship.mission === undefined) {
            ship.mission = null;
        }
        const card = cardManager?.createCard(ship);
        if (!card) {
            console.error(`❌ Failed to create card for ship ${ship.mmsi} (${ship.name})`);
            return;
        }
        
        trackingListContainer.appendChild(card);
        trackedShipIds.add(ship.mmsi);
        
        // Check if ship is dispatched and update badge accordingly
        if (dispatchedShipIds.has(ship.mmsi)) {
            const badge = card.querySelector('[data-status-badge]');
            updateStatusBadge(badge, '派遣中');
        }
    };

    // Add a ship to dispatch
    const addShipToDispatch = async (ship) => {
        if (!dispatchListContainer || !ship || dispatchedShipIds.has(ship.mmsi)) return;

        ship.event_status = "派遣中";

        // Select dispatch image based on ship properties
        let selectedImage = "";

        // Create mission object
        const mission = {
            id: `mission-${ship.mmsi}-${Date.now()}`,
            shipId: ship.mmsi,
            action: ship.action,
            dispatchTime: new Date().toISOString(),
            status: ship.action.status,
            schedule: ship.action.schedule,
            imageDir: selectedImage,
        };

        try {
            const imageBaseCandidates = [
                window.DISPATCH_IMAGE_BASE,
                "./images",
            ].filter(Boolean);
            const base = imageBaseCandidates[0] || "./images";
            
            const rawType = ship?.shipType;
            const typeKey = Number.isFinite(Number(rawType))
                ? TYPE_MAP[Number(rawType)]
                : String(rawType || "").toLowerCase();
            const type = typeKey || (String(rawType || "").toLowerCase().includes("fishing") ? "fishing" : "cargo");
            
            const aisOn = ship?.aisFlag === true;
            const folder = aisOn ? "AIS" : "No_AIS";
            selectedImage = `${base}/${folder}/${type.includes("fishing") ? "fishing" : "cargo"}.jpg`;
        } catch (error) {
            selectedImage = "./images/No_AIS/cargo.jpg"; // Fallback
        }

        // Prepare dispatch payload
        const dispatchPayload = {
            mmsi: ship.mmsi,
            action: ship.action.label || "衛星拍攝",
            status: ship.action.status || "待派遣",
            excuteTime: ship.action.scheduleDate || ship.action.schedule,
            dispatchCoord: Array.isArray(ship.coord) ? ship.coord : null,
            excuteCoord: Array.isArray(ship.coord) ? ship.coord : null,
            imageDir: selectedImage,
        };

        try {
            // Save to database first
            if (window.EventService?.createDispatchEvent) {
                await window.EventService.createDispatchEvent(dispatchPayload);
            }
        } catch (error) {
            console.error("❌ Failed to save dispatch event:", error);
            alert("無法保存派遣事件到數據庫");
            return;
        }

        dispatchMissions.push(mission);

        const mergedShip = {
            ...ship,
            mission,
            category: "dispatch",
        };

        const card = cardManager?.createCard(mergedShip);
        if (!card) return;
        
        // Store card data in WeakMap
        cardDataMap.set(card, {
            type: 'dispatch',
            ship: mergedShip
        });
        
        dispatchListContainer.appendChild(card);
        dispatchedShipIds.add(mergedShip.mmsi);

        statisticsManager?.updateDispatchStatistics();

        if (mapMode === "dispatch") {
            setMapMode("dispatch", { force: true });
        }
    };

    const loadDispatchEventsFromDatabase = async () => {
        if (!window.EventService?.getAllDispatchEvents || !dispatchListContainer) {
            console.warn("⚠️ Cannot load dispatch: EventService or container missing");
            return;
        }

        try {
            const data = await window.EventService.getAllDispatchEvents();
            const events = Array.isArray(data) ? data : (data ? [data] : []);

            // Clear existing dispatch list
            if (dispatchListContainer) dispatchListContainer.innerHTML = "";
            dispatchedShipIds.clear();
            dispatchMissions.length = 0;

            let loadedCount = 0;
            let notFoundCount = 0;

            for (const event of events) {
                const mmsi = event?.mmsi;
                if (!mmsi) return;

                const normalizedMmsi = String(mmsi);
                let ship = shipDataMap.get(normalizedMmsi);

                if (ship) {
                    loadedCount++;
                } else {
                    ship = await window.VesselService?.ensureShip(normalizedMmsi);
                    if (!ship) {
                        notFoundCount++;
                        continue;
                    }
                }

                if (ship) {
                    // Create mission from database event
                    ship.event_status = "派遣中";
                    ship.action = {
                        label: event.action,
                        status: event.status,
                        schedule: event.excuteTime,
                        dispatchTime: event.dispatchTime,
                    };

                    const mission = {
                        id: event._id || `mission-${ship.mmsi}-${Date.now()}`,
                        shipId: ship.mmsi,
                        action: ship.action,
                        dispatchTime: event.dispatchTime,
                        status: ship.action.status,
                        schedule: ship.action.schedule,
                        imageDir: event.imageDir, // Preserve imageDir from database
                    };

                    dispatchMissions.push(mission);

                    const mergedShip = {
                        ...ship,
                        mission,
                        category: "dispatch",
                    };

                    const card = cardManager?.createCard(mergedShip);
                    if (card) {
                        // Store card data in WeakMap
                        cardDataMap.set(card, {
                            type: 'dispatch',
                            ship: mergedShip
                        });
                        
                        dispatchListContainer.appendChild(card);
                        dispatchedShipIds.add(mergedShip.mmsi);
                    }
                }
            }

            console.log(`✅ Loaded ${dispatchedShipIds.size} dispatch missions (${loadedCount} from data, ${notFoundCount} missing vesselInfo)`);

            // Update tracking cards badges for dispatched ships
            if (trackingListContainer) {
                dispatchedShipIds.forEach(shipId => {
                    const card = trackingListContainer.querySelector(`[data-ship-id="${shipId}"]`);
                    if (card) {
                        const badge = card.querySelector('[data-status-badge]');
                        updateStatusBadge(badge, '派遣中');
                    }
                });
            }

            statisticsManager?.updateDispatchStatistics();

            // Refresh detail panel if it's currently open
            if (rightPanel?.classList.contains("show-detail") && selectedCard) {
                detailPanel?.fillDetailContent(selectedCard);
            }

            if (mapMode === "dispatch") {
                setMapMode("dispatch", { force: true });
            }
        } catch (error) {
            console.error("❌ Failed to load dispatch events:", error);
        }
    };
    
    // Initialize dispatch missions (empty by default)
    renderDispatchMissions([]);

    // Clear region panel before loading suspicious vessels
    const regionContainer = shipListContainers.get("left-region");
    if (regionContainer) {
        regionContainer.innerHTML = '';
    }

    // Load tracking and dispatch events from database on startup, then load region vessels
    Promise.all([
        loadTrackingEventsFromDatabase(),
        loadDispatchEventsFromDatabase()
    ]).then(() => {
        // After loading tracked/dispatched ships, load and display suspicious vessels
        loadAndDisplaySuspiciousVessels(currentArea);
    });

    cardManager?.sortRegionShipCards();
    statisticsManager?.updateRegionStatistics();
    statisticsManager?.updateTrackingStatistics();
    statisticsManager?.updateDispatchStatistics();

    tabManager = window.TabManager?.create({
        tabs,
        panels,
        defaultTab: "region",
        onBeforeChange: () => {
            if (rightPanel?.classList.contains("show-detail")) {
                hideDetailPanel();
            }
        },
        onAfterChange: (tabName) => {
            setRightTitle(tabName);
            if (tabName !== "region") {
                setAreaSettingsVisibility(false);
            }
            if (tabName === "tracking") {
                loadTrackingEventsFromDatabase();
            }
            if (tabName === "dispatch") {
                loadDispatchEventsFromDatabase();
            }
            const shouldResetMap = tabName === "tracking";
            setMapMode("region", { force: true, resetView: shouldResetMap });
            if (shouldResetMap) {
                applyRegionRadiusView();
            }
        },
    });
    tabManager?.init();

    tabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            if (tab.dataset.tab === "tracking") {
                loadTrackingEventsFromDatabase();
            }
            if (tab.dataset.tab === "dispatch") {
                loadDispatchEventsFromDatabase();
            }
        });
    });

    mapManager?.init({ mapContainerId: "sea-map", mapFallbackId: "map-fallback" });
    applyRegionRadiusView();
    renderShipMarkersForTab(mapMode === "region" ? "region" : mapMode);

    const detailPanel = window.DetailPanel?.create({
        apiBase: API_BASE,
        detailFields,
        shipDetailPanel,
        getShipData,
        getCoordinateLabel,
        getThreatLevelInfo,
        buildHistoryLookup,
        mapManager,
        trackedShipIds,
        dispatchedShipIds,
        addTrackingBtn,
        addActionBtn,
        shipDataMap: shipDataMap,
        shipTrajectoryMap: shipTrajectoryMap,
        getCurrentDispatchImageData: () => currentDispatchImageData,
    });

    let lastDispatchImage = null;
    let currentDispatchImageData = null; // Store image data for re-injection

    // Show ship detail in right panel
    const showDetailPanel = (card) => {
        if (!rightPanel || !card?.dataset) return;
        
        // Get all data from WeakMap (unified approach)
        const data = cardDataMap.get(card);
        
        let ship, shipId, isDispatch, listType;
        
        // Fallback for cards not in WeakMap (e.g., old region cards)
        if (!data) {
            shipId = card.dataset.shipId;
            listType = card.dataset.listType || "region";
            if (!shipId) {
                console.warn("No ship ID found");
                return;
            }
            // Use legacy approach for backwards compatibility
            ship = shipDataMap.get(shipId);
            if (!ship) {
                console.warn("Ship data not found for", shipId);
                return;
            }
            // Create temporary data structure
            isDispatch = false;
        } else {
            // Use data from WeakMap
            ship = data.ship;
            isDispatch = data.type === 'dispatch';
            listType = data.type;
            shipId = ship.mmsi;
        }
        
        if (!shipDetailPanel) return;
        
        // Hide threat detail panel and reset map annotations
        if (threatDetailManager) {
            threatDetailManager.hideThreatDetail();
        } else {
            // Fallback
            const threatDetailPanel = document.getElementById('threatDetailPanel');
            if (threatDetailPanel && threatDetailPanel.classList.contains('active')) {
                threatDetailPanel.classList.remove('active');
            }
        }
        
        // Handle dispatch image preparation
        if (isDispatch) {
            // Use imageDir from ship (selected at creation time)
            const imageSrc = ship?.mission?.imageDir || "./images/No_AIS/cargo.jpg";
            const altText = ship?.mission?.id || shipId || "dispatch-ship";
            
            // Build fallback queue for error handling
            const imageBaseCandidates = [
                window.DISPATCH_IMAGE_BASE,
                "./images",
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
            const fallbackQueue = dispatchImages.filter((src) => src !== imageSrc);
            
            currentDispatchImageData = { imageSrc, altText, fallbackQueue };
        } else {
            currentDispatchImageData = null;
        }
        
        // Show ship detail panel and prepare it
        shipDetailPanel.style.display = "";
        
        if (!isDispatch) {
            // Clear and highlight selected card for non-dispatch mode
            clearSelectedCards();
            card.classList.add("selected");
            
            if (detailMemory.hasOwnProperty(listType)) {
                detailMemory[listType] = shipId;
            }
            
            // Remove dispatch image wrapper if exists
            const dispatchImageWrapper = shipDetailPanel.querySelector('.dispatch-image-wrapper');
            if (dispatchImageWrapper) {
                dispatchImageWrapper.remove();
            }
        }
        
        // Set selectedCard (needed for threat evaluate button)
        selectedCard = card;
        
        // Fill detail content directly with card
        detailPanel?.fillDetailContent(card);
        // Map update happens after detail data resolves to avoid duplicate trajectory renders.
        
        rightPanel.classList.add("show-detail");
        shipDetailPanel.setAttribute("aria-hidden", "false");
        if (rightTitle) {
            if (ship.isUnknownIdentity) {
                rightTitle.textContent = "可能身分列表";
            } else {
                rightTitle.textContent = isDispatch ? "派遣任務詳情" : "單船資訊";
            }
        }
    };
    
    document.addEventListener("click", (event) => {
        const card = event.target.closest(".ship-card");
        if (!card || !card.closest(".left-panel")) return;
        
        showDetailPanel(card);
    });

    selectRegionBtn?.addEventListener("click", () => {
        setAreaSettingsVisibility(!areaSettingsOpen);
    });

    // Handle area settings apply button
    const areaApplyBtn = document.getElementById("area-apply-btn");
    const addSmugglingBtn = document.getElementById("add-smuggling-btn");
    const areaResetBtn = document.querySelector(".area-reset");
    const areaCloseBtn = document.getElementById("area-close-btn");
    const latInput = document.getElementById("area-lat-input");
    const lonInput = document.getElementById("area-lon-input");
    const radiusInput = document.getElementById("area-radius-input");
    
    // New inputs for smuggling area
    const smugglingLatInput = document.getElementById("smuggling-lat-input");
    const smugglingLonInput = document.getElementById("smuggling-lon-input");
    const smugglingRadiusInput = document.getElementById("smuggling-radius-input");

    // Apply area settings and refresh suspicious vessels
    if (!areaApplyBtn) {
        console.warn("[areaApply] apply button not found");
    }
    areaApplyBtn?.addEventListener("click", async () => {
        const lat = Number(latInput?.value);
        const lon = Number(lonInput?.value);
        const radius = Number(radiusInput?.value);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(radius)) {
            throw new Error("Invalid area input");
        }
        console.log("[areaApply]", {
            lat,
            lon,
            radius,
            inputs: {
                lat: latInput?.value ?? null,
                lon: lonInput?.value ?? null,
                radius: radiusInput?.value ?? null,
            },
        });

        // Update current area display
        const latDisplay = document.querySelector('[data-current="lat"]');
        const lonDisplay = document.querySelector('[data-current="lon"]');
        const radiusDisplay = document.querySelector('[data-current="radius"]');
        
        if (latDisplay) latDisplay.textContent = lat.toFixed(3);
        if (lonDisplay) lonDisplay.textContent = lon.toFixed(3);
        if (radiusDisplay) radiusDisplay.textContent = radius.toString();
        if (latInput) latInput.value = lat.toFixed(3);
        if (lonInput) lonInput.value = lon.toFixed(3);
        if (radiusInput) radiusInput.value = radius.toString();
        const regionLatDisplay = document.querySelector('[data-region="lat"]');
        const regionLonDisplay = document.querySelector('[data-region="lon"]');
        const regionRadiusDisplay = document.querySelector('[data-region="radius"]');
        if (regionLatDisplay) regionLatDisplay.textContent = lat.toFixed(3);
        if (regionLonDisplay) regionLonDisplay.textContent = lon.toFixed(3);
        if (regionRadiusDisplay) regionRadiusDisplay.textContent = radius.toString();

        // Center map on the selected area and fit the search radius
        currentArea.lat = lat;
        currentArea.lon = lon;
        currentArea.radius = radius;
        applyRegionRadiusView();

        // Refresh suspicious vessels with new parameters
        await loadAndDisplaySuspiciousVessels({ lat, lon, radius });

        // Clear ship detail panel so the right panel reflects region mode
        hideDetailPanel();

        // Close the settings panel
        setAreaSettingsVisibility(false);
    });

    // Handle add smuggling area button
    addSmugglingBtn?.addEventListener("click", async () => {
        const latVal = parseFloat(smugglingLatInput.value);
        const lonVal = parseFloat(smugglingLonInput.value);
        const radiusVal = parseFloat(smugglingRadiusInput.value);

        if (isNaN(latVal) || isNaN(lonVal) || isNaN(radiusVal)) {
            alert("請輸入有效的經緯度與範圍！");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/smuggling-areas`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: latVal,
                    lon: lonVal,
                    radius: radiusVal
                })
            });
            const data = await res.json();
            
            if (res.ok && data.success) {
                alert(`新增成功！\n訊息: ${data.message}\nID: ${data.id}`);
                setAreaSettingsVisibility(false);
            } else {
                alert(`新增失敗：${data.message || '未知錯誤'}`);
            }
        } catch (err) {
            console.error(err);
            alert("連線錯誤，無法新增走私區域");
        }
    });

    // Reset area settings to default values
    areaResetBtn?.addEventListener("click", () => {
        if (latInput) latInput.value = "";
        if (lonInput) lonInput.value = "";
        if (radiusInput) radiusInput.value = "";
    });

    areaCloseBtn?.addEventListener("click", () => {
        setAreaSettingsVisibility(false);
    });

    threatDetailManager = window.ThreatDetail?.init({
        getSelectedCard: () => selectedCard,
        getShipData,
        getThreatLevelInfo,
        onThreatItemExpand: (type, isExpanded, ship) => {
             // console.log(`[ThreatDetail] Expanded ${type} for ship`, ship);
             if (isExpanded && ship) {
                 const threatDetails = ship.threatDetails || ship.threat?.details;
                 let data = null;
                 
                 // Map threat types to data object from schema
                 if (type === 'meandering' || type === 'stop') { // 'stop' in UI is Meandering
                     data = threatDetails?.meandering;
                 } else if (type === 'loitering') {
                     data = threatDetails?.loitering;
                 } else if (type === 'speedDrop') {
                     data = threatDetails?.speedDrop;
                 } else if (type === 'smuggle' || type === 'aisSwitch') { // 'smuggle' in UI maps to 'aisSwitch' in schema
                     data = threatDetails?.aisSwitch;
                 }
                 
                 if (data) {
                    mapManager?.showThreatAnnotation(type === 'stop' ? 'meandering' : type, data);
                 } else {
                    mapManager?.hideThreatAnnotation();
                 }
             } else {
                 mapManager?.hideThreatAnnotation();
             }
        }
    });

    detailBack?.addEventListener("click", () => {
        hideDetailPanel();
        setMapMode("region", { force: true, resetView: true });
        applyRegionRadiusView();
    });

    addTrackingBtn?.addEventListener("click", async () => {
        if (!selectedCard) return;
        const ship = getShipData(getShipIdFromCard(selectedCard));
        if (!ship) return;

        await addShipToTracking(ship);

        // Update status badge on the region event card (where the button was clicked)
        const statusBadge = selectedCard.querySelector('[data-status-badge]');
        updateStatusBadge(statusBadge, ship.event_status);

        detailPanel?.fillDetailContent(selectedCard);
    });

    // Add tracking by MMSI button
    const addTrackingByMmsiBtn = document.getElementById('add-tracking-by-mmsi-btn');
    const mmsiInput = document.getElementById('mmsi-input');
    
    addTrackingByMmsiBtn?.addEventListener('click', async () => {
        const mmsi = mmsiInput?.value?.trim();
        if (!mmsi) {
            alert('請輸入 MMSI');
            return;
        }
        
        const success = await addShipToTrackingByMmsi(mmsi);
        if (success) {
            mmsiInput.value = '';
            alert(`成功新增 MMSI ${mmsi} 到追蹤列表`);
        } else {
            alert(`無法新增 MMSI ${mmsi}`);
        }
    });

    addActionBtn?.addEventListener("click", () => {
        if (!selectedCard) return;
        const ship = getShipData(getShipIdFromCard(selectedCard));
        if (!ship) return;

        addShipToDispatch(ship);

        addActionBtn.classList.add("detail-action-confirmed");
        addActionBtn.disabled = true;
        addActionBtn.textContent = "已確認派遣";

        const trackingStatusBadge = selectedCard.querySelector('[data-status-badge]');
        updateStatusBadge(trackingStatusBadge, ship.event_status);

        const regionPanel = document.querySelector('[data-panel="left-region"]');
        if (regionPanel) {
            const regionCard = regionPanel.querySelector(`.ship-card[data-ship-id="${ship.mmsi}"]`);
            if (regionCard) {
                const regionStatusBadge = regionCard.querySelector('[data-status-badge]');
                updateStatusBadge(regionStatusBadge, ship.event_status);
            }
        }

        detailPanel?.fillDetailContent(selectedCard);
    });

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && rightPanel?.classList.contains("show-detail")) {
            hideDetailPanel();
        }
    });
});
