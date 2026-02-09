/**
 * TEMP simulated suspicious vessel (to be removed later).
 */
(function(window) {
    'use strict';

    const seaZones = [
        { latMin: 23.4, latMax: 26.0, lngMin: 121.2, lngMax: 123.6 }, // 東北外海
        { latMin: 21.6, latMax: 23.6, lngMin: 120.8, lngMax: 123.2 }, // 東南外海
        { latMin: 22.0, latMax: 24.8, lngMin: 118.0, lngMax: 120.4 }, // 西南外海
        { latMin: 24.6, latMax: 26.1, lngMin: 119.2, lngMax: 121.0 }, // 西北外海
    ];
    const threatBuckets = [
        { min: 20, max: 59 },
        { min: 60, max: 79 },
        { min: 80, max: 99 }
    ];

    const createSimulatedVessels = (count) => {
        const vessels = [];
        for (let i = 0; i < count; i += 1) {
            const bucket = threatBuckets[i % threatBuckets.length];
            const threatScore = bucket.min + (i % (bucket.max - bucket.min + 1));
            const aisFlag = i % 2 === 0;
            const zone = seaZones[i % seaZones.length];
            const lat = zone.latMin + Math.random() * (zone.latMax - zone.latMin);
            const lng = zone.lngMin + Math.random() * (zone.lngMax - zone.lngMin);
            vessels.push({
                mmsi: `SIM${String(i + 1).padStart(6, "0")}`,
                aisFlag,
                threat: { score: threatScore },
                coord: [lat, lng]
            });
        }
        return vessels;
    };

    window.SIMULATED_SUSPICIOUS_VESSELS = createSimulatedVessels(100);
})(window);
