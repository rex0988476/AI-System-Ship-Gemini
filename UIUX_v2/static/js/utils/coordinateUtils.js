/**
 * Coordinate formatting helpers
 */
(function(window) {
    'use strict';

    const formatCoordinate = (lat, lng) => {
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return "-";
        return `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
    };

    const getCoordinateLabel = (ship) => {
        if (!ship) return "-";
        const coordArr = Array.isArray(ship.coord) ? ship.coord : null;
        const lat = Number(coordArr?.[0]);
        const lng = Number(coordArr?.[1]);
        return formatCoordinate(lat, lng);
    };

    window.CoordinateUtils = {
        formatCoordinate,
        getCoordinateLabel,
    };
})(window);
