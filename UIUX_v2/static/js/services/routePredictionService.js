/**
 * Route prediction service.
 */
(function(window) {
    'use strict';

    const degreesToRadians = (value) => value * (Math.PI / 180);
    const radiansToDegrees = (value) => value * (180 / Math.PI);

    const haversineMeters = (lat1, lng1, lat2, lng2) => {
        const earthRadius = 6371000;
        const dLat = degreesToRadians(lat2 - lat1);
        const dLng = degreesToRadians(lng2 - lng1);
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(degreesToRadians(lat1)) * Math.cos(degreesToRadians(lat2)) *
            Math.sin(dLng / 2) ** 2;
        return 2 * earthRadius * Math.asin(Math.min(1, Math.sqrt(a)));
    };

    const computeHeadingDegrees = (lat1, lng1, lat2, lng2) => {
        const lat1Rad = degreesToRadians(lat1);
        const lat2Rad = degreesToRadians(lat2);
        const dLng = degreesToRadians(lng2 - lng1);
        const y = Math.sin(dLng) * Math.cos(lat2Rad);
        const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
            Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLng);
        const heading = radiansToDegrees(Math.atan2(y, x));
        return (heading + 360) % 360;
    };

    const resolvePredictionHeadingAndSpeed = (ship, getTrajectoryEntries) => {
        const cog = Number(ship?.cog);
        const sog = Number(ship?.sog);
        if (Number.isFinite(cog) && Number.isFinite(sog)) {
            return { heading: cog, speed: sog };
        }

        if (typeof getTrajectoryEntries !== "function") return null;
        const entries = getTrajectoryEntries(ship);
        if (entries.length < 2) return null;

        const entriesWithTimestamp = entries.filter(entry => Number.isFinite(entry.timestamp));
        if (entriesWithTimestamp.length >= 2) {
            const sorted = entriesWithTimestamp.slice().sort((a, b) => b.timestamp - a.timestamp);
            const latest = sorted[0];
            const prior = sorted[1];
            const hoursDelta = (latest.timestamp - prior.timestamp) / 36e5;
            if (!(hoursDelta > 0)) return null;
            const distanceMeters = haversineMeters(latest.lat, latest.lng, prior.lat, prior.lng);
            const speedKnots = (distanceMeters / 1852) / hoursDelta;
            const heading = computeHeadingDegrees(prior.lat, prior.lng, latest.lat, latest.lng);
            if (!Number.isFinite(speedKnots) || speedKnots <= 0) return null;
            return { heading, speed: speedKnots };
        }

        const latest = entries.reduce((acc, entry) => {
            if (!Number.isFinite(entry.hoursAgo)) return acc;
            if (!acc || entry.hoursAgo < acc.hoursAgo) return entry;
            return acc;
        }, null);
        if (!latest) return null;
        const prior = entries
            .filter(entry => Number.isFinite(entry.hoursAgo) && entry.hoursAgo > latest.hoursAgo)
            .sort((a, b) => a.hoursAgo - b.hoursAgo)[0];
        if (!prior) return null;

        const hoursDelta = prior.hoursAgo - latest.hoursAgo;
        if (!(hoursDelta > 0)) return null;
        const distanceMeters = haversineMeters(latest.lat, latest.lng, prior.lat, prior.lng);
        const speedKnots = (distanceMeters / 1852) / hoursDelta;
        const heading = computeHeadingDegrees(prior.lat, prior.lng, latest.lat, latest.lng);

        if (!Number.isFinite(speedKnots) || speedKnots <= 0) return null;
        return { heading, speed: speedKnots };
    };

    const getRoutePredictionPoints = (ship, options = {}) => {
        const baseCoords = options.baseCoords;
        const lat = Number(baseCoords?.lat ?? ship?.coords?.lat);
        const lng = Number(baseCoords?.lng ?? ship?.coords?.lng);
        console.log('[Prediction] Base coords:', { lat, lng, ship_mmsi: ship?.mmsi });
        if (!(Number.isFinite(lat) && Number.isFinite(lng))) {
            console.log('[Prediction] ❌ Invalid coordinates');
            return [];
        }

        const motion = resolvePredictionHeadingAndSpeed(ship, options.getTrajectoryEntries);
        console.log('[Prediction] Motion:', motion);
        if (!motion) {
            console.log('[Prediction] ❌ No motion data');
            return [];
        }

        const predictionHorizonMinutes = 60*3;
        const predictionStepMinutes = 60;
        const predictionPointCount = Math.floor(predictionHorizonMinutes / predictionStepMinutes) + 1;
        const headingRad = degreesToRadians(motion.heading);
        const metersPerMinute = motion.speed * 0.514444 * 60; 
        const points = [];
        
        let lastValidPoint = [lat, lng];

        for (let i = 0; i < predictionPointCount; i += 1) {
            const distanceMeters = metersPerMinute * (predictionStepMinutes * i);
            const dLat = (distanceMeters * Math.cos(headingRad)) / 111320;
            const dLng = (distanceMeters * Math.sin(headingRad)) / (111320 * Math.cos(degreesToRadians(lat)));
            const newLat = Number((lat + dLat).toFixed(6));
            const newLng = Number((lng + dLng).toFixed(6));
            
            // Use LandDetectionService for bounds checking
            const inBounds = window.LandDetectionService?.isInSeaBounds(newLat, newLng) ?? true;
            const checkDetails = window.LandDetectionService?.getCheckDetails(newLat, newLng);
            
            console.log(`[Prediction] Point ${i}: [${newLat}, ${newLng}] - ${checkDetails?.status || (inBounds ? '✅' : '❌')}`, checkDetails);
            
            // Check if prediction is within sea bounds
            if (!inBounds) {
                console.warn(`⚠️ Prediction point ${i} blocked: [${newLat}, ${newLng}], using last valid position`);
                points.push([...lastValidPoint]);
            } else {
                lastValidPoint = [newLat, newLng];
                points.push(lastValidPoint);
            }
        }

        console.log(`[Prediction] ✅ Generated ${points.length} prediction points:`, points);
        return points;
    };

    window.RoutePredictionService = {
        getRoutePredictionPoints,
    };
})(window);
