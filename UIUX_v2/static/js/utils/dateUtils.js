/**
 * Date utility helpers
 */
(function(window) {
    'use strict';

    const formatUtcTime = (dateValue) => {
        const d = dateValue instanceof Date ? dateValue : new Date(dateValue);
        if (Number.isNaN(d.getTime())) return "";
        const hh = String(d.getUTCHours()).padStart(2, "0");
        const mm = String(d.getUTCMinutes()).padStart(2, "0");
        return `${hh}:${mm}Z`;
    };

    const toScheduleDate = (value) => {
        if (!value) return null;
        if (value instanceof Date) return value;
        const num = Number(value);
        if (!Number.isNaN(num)) return new Date(num);
        const parsed = Date.parse(value);
        return Number.isNaN(parsed) ? null : new Date(parsed);
    };

    window.DateUtils = {
        formatUtcTime,
        toScheduleDate,
    };
})(window);
