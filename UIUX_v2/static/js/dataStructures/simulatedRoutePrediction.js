/**
 * Simulated route prediction data for vessels.
 * Kept minimal and deterministic in structure to avoid special cases.
 */
(function(window) {
    'use strict';

    const predictionHorizonMinutes = 60*3;
    const predictionStepMinutes = 5;
    const predictionPointCount = Math.floor(predictionHorizonMinutes / predictionStepMinutes) + 1;

    const baseLat = 23.8;
    const baseLng = 120.6;

    const createRoutePoints = (startLat, startLng, headingDeg, speedKnots, startTime) => {
        const points = [];
        const headingRad = headingDeg * (Math.PI / 180);
        const metersPerMinute = speedKnots * 0.514444 * 60;

        for (let i = 0; i < predictionPointCount; i += 1) {
            const distanceMeters = metersPerMinute * (predictionStepMinutes * i);
            const dLat = (distanceMeters * Math.cos(headingRad)) / 111320;
            const dLng = (distanceMeters * Math.sin(headingRad)) / (111320 * Math.cos(startLat * (Math.PI / 180)));
            const eta = new Date(startTime.getTime() + predictionStepMinutes * i * 60000);

            points.push({
                lat: Number((startLat + dLat).toFixed(6)),
                lng: Number((startLng + dLng).toFixed(6)),
                eta: eta.toISOString()
            });
        }

        return points;
    };

    const createSimulatedRoutePrediction = (mmsi, index = 0) => {
        const now = new Date();
        const heading = (index * 37) % 360;
        const speed = 8 + (index % 18);
        const startLat = baseLat + (index % 10) * 0.08;
        const startLng = baseLng + (index % 12) * 0.06;

        return {
            mmsi: String(mmsi),
            generatedAt: now.toISOString(),
            horizonMinutes: predictionHorizonMinutes,
            stepMinutes: predictionStepMinutes,
            points: createRoutePoints(startLat, startLng, heading, speed, now)
        };
    };

    window.createSimulatedRoutePrediction = createSimulatedRoutePrediction;
})(window);
