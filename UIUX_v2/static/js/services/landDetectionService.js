/**
 * Land detection service
 * Fast boundary-based detection for Taiwan waters
 */
(function(window) {
    'use strict';

    // Taiwan sea area boundaries (outer bounds)
    const TAIWAN_SEA_BOUNDS = {
        north: 26.5,   // North of Keelung
        south: 20.5,   // South of Hengchun
        west: 117.0,   // Taiwan Strait
        east: 124.0    // Pacific Ocean
    };
    
    // Taiwan island exclusion zone (approximate rectangle)
    const TAIWAN_ISLAND_BOUNDS = {
        north: 25.3,   // Northern tip
        south: 21.9,   // Southern tip (Hengchun)
        west: 120.0,   // West coast
        east: 122.1    // East coast
    };
    
    /**
     * Check if coordinates are on Taiwan island
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {boolean} - True if on Taiwan island
     */
    const isOnTaiwanIsland = (lat, lng) => {
        const result = lat >= TAIWAN_ISLAND_BOUNDS.south &&
                       lat <= TAIWAN_ISLAND_BOUNDS.north &&
                       lng >= TAIWAN_ISLAND_BOUNDS.west &&
                       lng <= TAIWAN_ISLAND_BOUNDS.east;
        
        console.log(`[LandDetection] isOnTaiwanIsland([${lat}, ${lng}]) = ${result}`, {
            lat,
            lng,
            bounds: TAIWAN_ISLAND_BOUNDS,
            checks: {
                south: lat >= TAIWAN_ISLAND_BOUNDS.south,
                north: lat <= TAIWAN_ISLAND_BOUNDS.north,
                west: lng >= TAIWAN_ISLAND_BOUNDS.west,
                east: lng <= TAIWAN_ISLAND_BOUNDS.east
            }
        });
        
        return result;
    };
    
    /**
     * Check if coordinates are in valid sea bounds (not on land)
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {boolean} - True if in sea, false if on land or out of bounds
     */
    const isInSeaBounds = (lat, lng) => {
        // Check if on Taiwan island first
        const onIsland = isOnTaiwanIsland(lat, lng);
        
        if (onIsland) {
            // Definitely on land
            console.log(`[LandDetection] isInSeaBounds([${lat}, ${lng}]) = false (ON TAIWAN ISLAND)`);
            return false;
        }
        
        // Not on Taiwan island - assume sea (allow global waters)
        // This allows ships in Singapore, South China Sea, etc.
        console.log(`[LandDetection] isInSeaBounds([${lat}, ${lng}]) = true (OPEN WATERS)`);
        return true;
    };

    /**
     * Get detailed check information for debugging
     * @param {number} lat - Latitude
     * @param {number} lng - Longitude
     * @returns {object} - Detailed check results
     */
    const getCheckDetails = (lat, lng) => {
        const onIsland = isOnTaiwanIsland(lat, lng);
        const inBounds = isInSeaBounds(lat, lng);
        
        return {
            lat,
            lng,
            onTaiwanIsland: onIsland,
            inSeaBounds: inBounds,
            status: inBounds ? '✅ IN SEA' : '❌ BLOCKED',
            checks: {
                seaBounds: {
                    south: lat >= TAIWAN_SEA_BOUNDS.south,
                    north: lat <= TAIWAN_SEA_BOUNDS.north,
                    west: lng >= TAIWAN_SEA_BOUNDS.west,
                    east: lng <= TAIWAN_SEA_BOUNDS.east
                },
                islandCheck: onIsland ? {
                    south: lat >= TAIWAN_ISLAND_BOUNDS.south,
                    north: lat <= TAIWAN_ISLAND_BOUNDS.north,
                    west: lng >= TAIWAN_ISLAND_BOUNDS.west,
                    east: lng <= TAIWAN_ISLAND_BOUNDS.east
                } : null
            }
        };
    };

    window.LandDetectionService = {
        isInSeaBounds,
        isOnTaiwanIsland,
        getCheckDetails,
    };
})(window);
