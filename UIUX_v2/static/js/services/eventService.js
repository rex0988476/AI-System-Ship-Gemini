/**
 * Event Service
 * Tracking / Dispatch API helpers
 */
(function(window) {
    'use strict';

    const API_BASE = window.API_BASE || "http://140.115.53.51:3000/api/v1";

    const fetchJson = async (url, options = {}) => {
        const res = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            ...options,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
        }
        return res.json();
    };

    const createTrackingEvent = async (mmsi) => {
        if (!mmsi) throw new Error("mmsi is required");
        return fetchJson(`${API_BASE}/trackingEvent`, {
            method: 'POST',
            body: JSON.stringify({ mmsi: String(mmsi) }),
        });
    };

    const getTrackingEvent = async (mmsi) => {
        if (!mmsi) throw new Error("mmsi is required");
        const query = encodeURIComponent(String(mmsi));
        return fetchJson(`${API_BASE}/trackingEvent?mmsi=${query}`);
    };

    const formatDispatchPayloadForApi = (payload = {}) => {
        const dispatchCoord = Array.isArray(payload.dispatchCoord)
            ? payload.dispatchCoord
            : [payload.dispatchLat, payload.dispatchLon];
        const excuteCoord = Array.isArray(payload.excuteCoord)
            ? payload.excuteCoord
            : [payload.excuteLat, payload.excuteLon];

        return {
            mmsi: payload.mmsi != null ? String(payload.mmsi) : undefined,
            imageDir: payload.imageDir,
            excuteTime: payload.excuteTime,
            action: payload.action,
            status: payload.status,
            dispatchLat: dispatchCoord?.[0],
            dispatchLon: dispatchCoord?.[1],
            excuteLat: excuteCoord?.[0],
            excuteLon: excuteCoord?.[1],
        };
    };

    const createDispatchEvent = async (payload) => {
        const body = formatDispatchPayloadForApi(payload);
        if (!body.mmsi) throw new Error("mmsi is required");
        return fetchJson(`${API_BASE}/dispatchEvent`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
    };

    const getDispatchEvent = async (mmsi) => {
        if (!mmsi) throw new Error("mmsi is required");
        const query = encodeURIComponent(String(mmsi));
        return fetchJson(`${API_BASE}/dispatchEvent?mmsi=${query}`);
    };

    const getAllTrackingEvents = async () => {
        return fetchJson(`${API_BASE}/trackingEvent`);
    };

    const getAllDispatchEvents = async () => {
        return fetchJson(`${API_BASE}/dispatchEvent`);
    };

    window.EventService = {
        API_BASE,
        createTrackingEvent,
        getTrackingEvent,
        createDispatchEvent,
        getDispatchEvent,
        getAllTrackingEvents,
        getAllDispatchEvents,
    };
})(window);
