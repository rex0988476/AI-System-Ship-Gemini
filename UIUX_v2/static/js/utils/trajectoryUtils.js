/**
 * Trajectory utilities - Simplified with auto-fetch and caching
 */
(function(window) {
    'use strict';

    let config = {
        apiBase: null,
        cache: null,
        vesselService: null,
    };

    const init = (options) => {
        config.apiBase = options.apiBase;
        config.cache = options.cache;
        config.vesselService = options.vesselService;
    };

    const normalizePoint = (entry) => {
        if (!entry) return null;
        
        const lat = Number(entry.coord?.[0] ?? entry.lat ?? entry[0]);
        const lng = Number(entry.coord?.[1] ?? entry.lng ?? entry[1]);
        if (!(Number.isFinite(lat) && Number.isFinite(lng))) return null;
        
        const timestamp = Number(entry.timestamp);
        const hoursAgo = Number(entry.hoursAgo);
        
        console.log('🔍 normalizePoint:', {
            rawTimestamp: entry.timestamp,
            parsedTimestamp: timestamp,
            rawHoursAgo: entry.hoursAgo,
            parsedHoursAgo: hoursAgo,
            coords: [lat, lng]
        });
        
        return {
            lat,
            lng,
            timestamp: Number.isFinite(timestamp) ? timestamp : null,
            hoursAgo: Number.isFinite(hoursAgo) ? hoursAgo : null,
        };
    };

    const computeHoursAgo = (points) => {
        const withTimestamps = points.filter(p => p.timestamp !== null);
        if (withTimestamps.length === 0) return;
        
        const latestTs = Math.max(...withTimestamps.map(p => p.timestamp));
        const isMilliseconds = latestTs > 1e12;
        const divisor = isMilliseconds ? 36e5 : 3600;
        
        console.log('🔍 computeHoursAgo:', {
            sampleTimestamp: withTimestamps[0]?.timestamp,
            latestTs,
            isMilliseconds,
            divisor,
            pointsCount: points.length
        });
        
        points.forEach(point => {
            if (point.timestamp !== null) {
                point.hoursAgo = Math.max(0, (latestTs - point.timestamp) / divisor);
            }
        });
    };

    const getTrajectoryEntries = async (mmsi, ship = null) => {
        if (!mmsi) return [];
        const key = String(mmsi);
        
        if (config.cache?.has(key)) {
            return config.cache.get(key);
        }
        
        if (!config.vesselService?.fetchVesselTrajectory) {
            console.error('❌ VesselService not initialized');
            return [];
        }
        
        const trackRaw = await config.vesselService.fetchVesselTrajectory(mmsi, config.apiBase);
        if (!trackRaw || !trackRaw.length) return [];
        
        const points = trackRaw.map(normalizePoint).filter(Boolean);
        
        const hasHoursAgo = points.some(p => p.hoursAgo !== null);
        if (!hasHoursAgo && points.length > 0) {
            computeHoursAgo(points);
        }
        
        if (ship?.coord) {
            const [shipLat, shipLng] = ship.coord;
            if (Number.isFinite(shipLat) && Number.isFinite(shipLng)) {
                const hasCurrent = points.some(p => p.hoursAgo === 0);
                if (!hasCurrent) {
                    points.push({ lat: shipLat, lng: shipLng, hoursAgo: 0, timestamp: null });
                }
            }
        }
        
        points.sort((a, b) => {
            const aVal = a.hoursAgo ?? Infinity;
            const bVal = b.hoursAgo ?? Infinity;
            return aVal - bVal;
        });
        
        if (config.cache) {
            config.cache.set(key, points);
        }
        
        return points;
    };

    const findLatestTrajectoryEntry = (entries = []) => {
        return entries.find(e => Number.isFinite(e?.hoursAgo)) || entries[0] || null;
    };

    window.TrajectoryUtils = {
        init,
        getTrajectoryEntries,
        findLatestTrajectoryEntry,
    };
})(window);
