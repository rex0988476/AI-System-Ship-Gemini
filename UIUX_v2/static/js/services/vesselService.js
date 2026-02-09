/**
 * Vessel info service
 */
(function(window) {
    'use strict';

    const detailCache = new Map();
    const trajectoryCache = new Map();
    let shipDataMap = null;
    let shipApiBase = "";

    const initShipData = (options = {}) => {
        shipDataMap = options.shipDataMap || shipDataMap;
        shipApiBase = options.apiBase || shipApiBase;
    };

    const resolveApiBase = (apiBase) => apiBase || window.API_BASE || "";

    const resolveDetailPayload = (data) => {
        if (Array.isArray(data)) return data[0] || null;
        if (data?.data) return data.data;
        if (data?.vesselInfo) return data.vesselInfo;
        return data || null;
    };

    const fetchVesselInfo = async (mmsi, apiBase) => {
        if (!mmsi) return null;
        const normalized = String(mmsi);
        if (detailCache.has(normalized)) return detailCache.get(normalized);
        const base = resolveApiBase(apiBase);
        if (!base) return null;
        try {
            const res = await fetch(`${base}/vesselInfo?mmsi=${encodeURIComponent(normalized)}`);
            if (!res.ok) {
                detailCache.set(normalized, null);
                return null;
            }
            const data = await res.json();
            const resolved = resolveDetailPayload(data);
            const hasData = resolved && (typeof resolved !== "object" || Object.keys(resolved).length);
            const result = hasData ? resolved : null;
            detailCache.set(normalized, result);
            return result;
        } catch (error) {
            console.error("❌ Failed to fetch vesselInfo:", error);
            detailCache.set(normalized, null);
            return null;
        }
    };

    const fetchVesselTrajectory = async (mmsi, apiBase) => {
        if (!mmsi) return [];
        const normalized = String(mmsi);
        if (trajectoryCache.has(normalized)) return trajectoryCache.get(normalized);
        const base = resolveApiBase(apiBase);
        if (!base) return [];
        try {
            const res = await fetch(`${base}/vesselTrack?mmsi=${encodeURIComponent(normalized)}`);
            if (!res.ok) {
                trajectoryCache.set(normalized, []);
                return [];
            }
            const data = await res.json();
            const result = Array.isArray(data) ? data : [];
            trajectoryCache.set(normalized, result);
            return result;
        } catch (error) {
            console.error("❌ Failed to fetch vesselTrack:", error);
            trajectoryCache.set(normalized, []);
            return [];
        }
    };
    
    const fetchNormalizedVesselInfo = async (mmsi, apiBase) => {
        if (!mmsi) return null;
        const vesselInfo = await fetchVesselInfo(mmsi, apiBase);
        if (!vesselInfo) return null;
        return {
            mmsi,
            threatScore: -1,
            aisFlag: typeof vesselInfo?.aisFlag === "boolean" ? vesselInfo.aisFlag : null,
            vesselType: vesselInfo?.vesselType,
            imoNum: vesselInfo?.imoNum,
            navStatus: vesselInfo?.navStatus,
            cog: vesselInfo?.cog,
            sog: vesselInfo?.sog,
            rfFreq: vesselInfo?.rfFreq,
            coord: Array.isArray(vesselInfo?.coord) ? vesselInfo.coord : null,
            accuracy: vesselInfo?.accuracy,
            pulsesDuration: vesselInfo?.pulsesDuration,
            pulsesFreq: vesselInfo?.pulsesFreq,
            waveform: vesselInfo?.waveform,
        };
    };

    const ensureShip = async (mmsi) => {
        if (!shipDataMap || !mmsi) return null;
        const normalizedMmsi = String(mmsi);
        const existing = shipDataMap.get(normalizedMmsi);
        if (existing) return existing;
        const ship = await fetchNormalizedVesselInfo(normalizedMmsi, shipApiBase);
        if (!ship) return null;
        shipDataMap.set(normalizedMmsi, ship);
        return ship;
    };

    window.VesselService = {
        fetchVesselInfo,
        fetchVesselTrajectory,
        fetchNormalizedVesselInfo,
        initShipData,
        ensureShip,
    };

})(window);
