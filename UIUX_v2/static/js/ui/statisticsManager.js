/**
 * Statistics manager
 */
(function(window) {
    'use strict';

    const createStatisticsManager = (options = {}) => {
        const {
            shipListContainers,
            dispatchListContainers,
            trackingListContainer,
            getShipData,
        } = options;
        const getThreatLevelInfo = window.ThreatUtils?.getThreatLevelInfo;

        const calculateThreatStats = (cards) => {
            const stats = { threatHigh: 0, threatMedium: 0, threatLow: 0 };

            cards.forEach(card => {
                const ship = getShipData?.(card?.dataset?.shipId);
                if (!ship) return;

                const score = Number(ship.threat?.score);
                if (!Number.isFinite(score)) return;
                const threatClass = getThreatLevelInfo(score).class;
                if (threatClass === "high") stats.threatHigh++;
                else if (threatClass === "medium") stats.threatMedium++;
                else if (threatClass === "low") stats.threatLow++;
            });

            return stats;
        };

        const updateStatElements = (elements, stats) => {
            Object.keys(stats).forEach(key => {
                if (elements[key]) {
                    elements[key].textContent = stats[key];
                }
            });
        };

        const updateRegionStatistics = () => {
            const regionListContainer = shipListContainers?.get("left-region");
            if (!regionListContainer) return;

            const regionCards = regionListContainer.querySelectorAll('.ship-card[data-ship-id]');

            let aisOn = 0, aisOff = 0;
            regionCards.forEach(card => {
                const ship = getShipData?.(card?.dataset?.shipId);
                if (!ship) return;
                if (ship.aisFlag === true) aisOn++;
                else aisOff++;
            });

            const threatStats = calculateThreatStats(regionCards);

            updateStatElements({
                aisOn: document.querySelector('[data-stat="ais-on"]'),
                aisOff: document.querySelector('[data-stat="ais-off"]'),
                threatHigh: document.querySelector('[data-stat="threat-high"]'),
                threatMedium: document.querySelector('[data-stat="threat-medium"]'),
                threatLow: document.querySelector('[data-stat="threat-low"]'),
            }, { aisOn, aisOff, ...threatStats });
        };

        const updateTrackingStatistics = () => {
            if (!trackingListContainer) return;

            const trackingCards = trackingListContainer.querySelectorAll('.ship-card[data-ship-id]');
            const trackingCount = trackingCards.length;
            const threatStats = calculateThreatStats(trackingCards);

            updateStatElements({
                trackingCount: document.querySelector('[data-stat="tracking-count"]'),
                threatHigh: document.querySelector('[data-stat="tracking-threat-high"]'),
                threatMedium: document.querySelector('[data-stat="tracking-threat-medium"]'),
                threatLow: document.querySelector('[data-stat="tracking-threat-low"]'),
            }, { trackingCount, ...threatStats });
        };

        const updateDispatchStatistics = () => {
            const allDispatchCards = [];
            dispatchListContainers?.forEach(container => {
                const cards = container.querySelectorAll('.ship-card[data-ship-id]');
                allDispatchCards.push(...cards);
            });

            const dispatchCount = allDispatchCards.length;
            const threatStats = calculateThreatStats(allDispatchCards);

            updateStatElements({
                dispatchCount: document.querySelector('[data-stat="dispatch-count"]'),
                threatHigh: document.querySelector('[data-stat="dispatch-threat-high"]'),
                threatMedium: document.querySelector('[data-stat="dispatch-threat-medium"]'),
                threatLow: document.querySelector('[data-stat="dispatch-threat-low"]'),
            }, { dispatchCount, ...threatStats });
        };

        return {
            updateRegionStatistics,
            updateTrackingStatistics,
            updateDispatchStatistics,
        };
    };

    window.StatisticsManager = { create: createStatisticsManager };
})(window);
