/**
 * Threat score helpers
 */
(function(window) {
    'use strict';

    const THREAT_THRESHOLDS = {
        HIGH: 15,
        MEDIUM: 5,
    };

    const THREAT_LEVELS = {
        HIGH: { class: "high", label: "高風險" },
        MEDIUM: { class: "medium", label: "中風險" },
        LOW: { class: "low", label: "低風險" },
        UNKNOWN: { class: "", label: "未知" },
    };

    const THREAT_WEIGHTS = {
        aisSwitch: 10,
        loitering: 30,
        meandering: 30,
        speedDrop: 30,
    };

    const getThreatLevelInfo = (score) => {
        const numScore = Number(score);
        if (!Number.isFinite(numScore)) return THREAT_LEVELS.UNKNOWN;
        if (numScore >= THREAT_THRESHOLDS.HIGH) return THREAT_LEVELS.HIGH;
        if (numScore >= THREAT_THRESHOLDS.MEDIUM) return THREAT_LEVELS.MEDIUM;
        return THREAT_LEVELS.LOW;
    };

    window.ThreatUtils = {
        THREAT_THRESHOLDS,
        THREAT_LEVELS,
        THREAT_WEIGHTS,
        getThreatLevelInfo,
    };
})(window);
