/**
 * Safe Point Helpers - 安全的軌跡點處理工具函數
 * 用於統一處理不同格式的軌跡點數據
 */

(function() {
    'use strict';

    // --- Canonical-safe helper functions (used during migration) ---
    function getSafePointId(point) {
        if (!point) return null;
        if (point.pointId) return point.pointId;
        if (point.id) return point.id;
        if (point.trackPointData && point.trackPointData.id) return point.trackPointData.id;
        return null;
    }

    function getTrackPointData(point) {
        if (!point) return null;
        // If the consumer passed in the legacy wrapper (dotData), prefer .trackPointData
        if (point.trackPointData) return point.trackPointData;
        // If it's already a canonical point, return as-is
        return point;
    }

    function getDisplay(point) {
        const tp = getTrackPointData(point) || {};
        if (tp.display) return tp.display;
        // fallback to legacy top-level fields
        return {
            dotColor: tp.dotColor || tp.color || null,
            backgroundColor: tp.backgroundColor || tp.bgColor || null
        };
    }

    function getDotColor(point) {
        const disp = getDisplay(point) || {};
        if (disp.dotColor) return disp.dotColor;
        const tp = getTrackPointData(point) || {};
        if (tp.dotColor) return tp.dotColor;
        if (tp.color) return tp.color;
        
        // Future points default to yellow during migration
        if (tp.type === 'Future') return '#FFD54A';
        
        // History track points 保持原有的顏色邏輯
        if (tp.type === 'History' || tp.type === 'Current') {
            if (tp.status === 'No AIS' || tp.status === '未開啟') return '#ef4444';
            if (tp.status === 'AIS' || tp.status === '已開啟') return '#059669';
        }
        
        // 非 track point 的普通 SeaDot 統一使用淺藍色
        if (tp.type === 'Normal' || !tp.type) {
            return '#1eb0f9ff'; // 淺藍色
        }
        
        // fallback default
        return '#1eb0f9ff'; // 淺藍色作為預設
    }

    function getBackgroundColor(point) {
        const disp = getDisplay(point) || {};
        if (disp.backgroundColor) return disp.backgroundColor;
        const tp = getTrackPointData(point) || {};
        return tp.backgroundColor || tp.bgColor || null;
    }

    function getVesselIdString(point) {
        const tp = getTrackPointData(point) || {};
        const id = tp.vesselId || tp.vessel_id || tp.mmsi || tp.imo || 'UNKNOWN';
        return id == null ? 'UNKNOWN' : String(id);
    }

    // --- Canonical Point Creation Helpers ---
    function createCanonicalPoint(pointData, options = {}) {
        if (!pointData) return null;
        
        const { legacy = false } = options;
        const tp = getTrackPointData(pointData) || {};
        
        // Create canonical point structure
        const canonical = {
            pointId: getSafePointId(pointData) || tp.id || `POINT-${Date.now()}-${Math.random().toString(16).substr(2, 6)}`,
            timestamp: tp.timestamp || pointData.timestamp || new Date().toISOString(),
            lat: tp.lat || pointData.lat || 0,
            lon: tp.lon || pointData.lon || 0,
            type: tp.type || pointData.type || 'Current',
            status: tp.status || pointData.status || 'unknown',
            // vessel identification
            vesselId: tp.vesselId || tp.vessel_id || pointData.vesselId || pointData.vessel_id || 'UNKNOWN',
            mmsi: tp.mmsi || pointData.mmsi || null,
            imo: tp.imo || pointData.imo || null,
            // display properties
            display: {
                dotColor: getDotColor(pointData),
                backgroundColor: getBackgroundColor(pointData)
            },
            // legacy support
            ...(legacy && {
                id: getSafePointId(pointData),
                color: getDotColor(pointData)
            })
        };
        
        return canonical;
    }

    // --- Export helpers to global scope ---
    const safePointHelpers = {
        getSafePointId,
        getTrackPointData,
        getDisplay,
        getDotColor,
        getBackgroundColor,
        getVesselIdString,
        createCanonicalPoint
    };

    // Make available globally
    if (typeof window !== 'undefined') {
        window.safePointHelpers = safePointHelpers;
        
        // Also expose individual functions for backward compatibility
        Object.assign(window, {
            getSafePointId,
            getTrackPointData,
            getDisplay,
            getDotColor,
            getBackgroundColor,
            getVesselIdString,
            createCanonicalPoint
        });
        
        console.log('✅ safePointHelpers 已載入並可在全域範圍使用');
    }

    // For module environments
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = safePointHelpers;
    }
})();
