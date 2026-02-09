/**
 * Threat detail panel module
 */
(function(window) {
    'use strict';

    const resolveThreatLevel = (score, ship, getThreatLevelInfo) => {
        if (ship?.threat?.level) return ship.threat.level;
        if (typeof getThreatLevelInfo === 'function') {
            return getThreatLevelInfo(score).label;
        }
        const numericScore = Number(score);
        if (numericScore >= 80) return "高風險";
        if (numericScore >= 60) return "中風險";
        return "低風險";
    };

    const renderThreatLevel = (fields, threatScore, threatLevel) => {
        if (fields.score) {
            const val = parseFloat(threatScore);
            const scoreNum = isNaN(val) ? 0 : val;
            fields.score.textContent = scoreNum.toFixed(1);
        }
        if (fields.level) {
            fields.level.textContent = threatLevel;
            fields.level.className = 'threat-level-badge';
            if (Number(threatScore) >= 80) {
                fields.level.classList.add('high');
            } else if (Number(threatScore) >= 60) {
                fields.level.classList.add('medium');
            } else {
                fields.level.classList.add('low');
            }
        }
        if (fields.scoreBar) {
            fields.scoreBar.style.width = `${threatScore}%`;
        }
    };

    const renderDetailScores = (fields, weightedScores) => {
        if (fields.meandering) {
            fields.meandering.textContent = (weightedScores?.meandering ?? 0).toFixed(1);
        }
        if (fields.loitering) {
            fields.loitering.textContent = (weightedScores?.loitering ?? 0).toFixed(1);
        }
        if (fields.speedDrop) {
            fields.speedDrop.textContent = (weightedScores?.speedDrop ?? 0).toFixed(1);
        }
        if (fields.smuggle) {
            fields.smuggle.textContent = (weightedScores?.aisSwitch ?? 0).toFixed(1);
        }
    };

    const detailElementCache = new Map();
    const getDetailElement = (selector) => {
        if (detailElementCache.has(selector)) {
            return detailElementCache.get(selector);
        }
        const el = document.querySelector(selector);
        detailElementCache.set(selector, el);
        return el;
    };

    const renderThreatDetails = (data) => {
        if (!data) return;

        const pickFirst = (value) => (Array.isArray(value) ? value[0] : value);
        const setText = (selector, value, fallback = '-') => {
            const el = getDetailElement(selector);
            if (!el) return;
            const safeValue = value ?? fallback;
            el.textContent = safeValue === "" ? fallback : safeValue;
        };
        const formatDateTime = (value) => {
            if (!value) return null;
            const date = new Date(value);
            if (Number.isNaN(date.getTime())) return null;
            const pad2 = (num) => String(num).padStart(2, '0');
            const year = date.getFullYear();
            const month = pad2(date.getMonth() + 1);
            const day = pad2(date.getDate());
            const hours = pad2(date.getHours());
            const minutes = pad2(date.getMinutes());
            return `${year}/${month}/${day} ${hours}:${minutes}`;
        };
        const formatTimeRange = (start, end) => {
            const formattedStart = formatDateTime(start);
            const formattedEnd = formatDateTime(end);
            return `${formattedStart}\n~${formattedEnd}`;
        };

        const loiter = pickFirst(data.loiter || data.loitering);
        const meander = pickFirst(data.meander || data.meandering);
        const speed = pickFirst(data.speed || data.speedDrop);
        const ais = pickFirst(data.ais || data.aisSwitch);
        
        /* Meandering Details */
        setText(
            '[data-detail="meandering-analysisPeriod"]', 
            formatTimeRange(meander?.analysisPeriod?.start, meander?.analysisPeriod?.end),
            '-'
        );
        setText('[data-detail="meandering-meanderingCount"]', 
            `${meander?.meanderingCount} 次`, '0 次'
        );
        setText('[data-detail="meandering-totalMeanderingDuration"]', 
            `${meander?.totalMeanderingDuration} 分鐘`, '0 分鐘');
        setText('[data-detail="meandering-totalMeanderingScore"]', 
            meander?.totalMeanderingScore, '0');
        setText('[data-detail="meandering-f_crit"]', 
            meander?.f_crit, '-');

        /* Loitering Details */
        setText('[data-detail="loitering-startTime"]', loiter?.startTime, '-');
        setText('[data-detail="loitering-loiterTimeMinutes"]', 
            `${loiter?.loiterTimeMinutes} 分鐘`, '0 分鐘');
        setText('[data-detail="loitering-thresholds-t1"]', 
            `${loiter?.thresholds?.t1} 分鐘`, '0 分鐘');
        
        /* Speed Drop Details */
        setText(
            '[data-detail="speed-timeWindow"]',
            formatTimeRange(speed?.timeWindow?.startTime, speed?.timeWindow?.endTime),
            '-'
        );
        setText('[data-detail="speed-dropCount"]', 
            `${speed?.dropCount} 次`, '0 次');
        setText('[data-detail="speed-totalDropAcceleration"]', 
            `${speed?.totalDropAcceleration} m/s²`, '0 m/s²');
        setText('[data-detail="speed-thresholds-a_free"]', 
            `${speed?.thresholds?.a_free} m/s²`, '2 m/s²');
        setText('[data-detail="speed-thresholds-a_full"]', 
            `${speed?.thresholds?.a_full} m/s²`, '5 m/s²');

        /* AIS Switch Details */
        setText(
            '[data-detail="ais-timeWindow"]',
            formatTimeRange(ais?.timeWindow?.startTime, ais?.timeWindow?.endTime),
            '-'
        );
        setText('[data-detail="ais-totalNormalPoints"]', 
            `${ais?.totalNormalPoints} 次`, '0 次');
        setText('[data-detail="ais-missingCountInArea"]', 
            `${ais?.missingCountInArea} 次`, '0 次');
        setText('[data-detail="ais-missingRatio"]', 
            `${ais?.missingRatio} %`, '0%');
        setText('[data-detail="ais-thresholds-p_free"]', 
            `${ais?.thresholds?.p_free * 100}%`, '10%');
        setText('[data-detail="ais-thresholds-p_full"]', 
            `${ais?.thresholds?.p_full * 100}%`, '50%');
    };

    const setupThreatExpansion = (onExpand) => {
        const threatItems = document.querySelectorAll('.threat-item.expandable');

        threatItems.forEach(item => {
            const expandBtn = item.querySelector('.threat-expand-btn');
            const type = item.dataset.threatItem;

            const toggleExpand = (e) => {
                e.stopPropagation();
                
                // Collapse other items
                threatItems.forEach(otherItem => {
                    if (otherItem !== item && otherItem.classList.contains('expanded')) {
                        otherItem.classList.remove('expanded');
                        if (onExpand) onExpand(otherItem.dataset.threatItem, false);
                    }
                });

                const isExpanded = item.classList.toggle('expanded');
                if (onExpand) {
                    onExpand(type, isExpanded);
                }
            };

            item.addEventListener('click', toggleExpand);
            if (expandBtn) {
                expandBtn.addEventListener('click', toggleExpand);
            }
        });
    };

    const initThreatDetail = (options = {}) => {
        const { getSelectedCard, getShipData, getThreatLevelInfo, onThreatItemExpand } = options;
        const threatDetailPanel = document.getElementById('threatDetailPanel');
        const showThreatDetailBtn = document.getElementById('showThreatDetailBtn');
        const closeThreatDetailBtn = document.getElementById('closeThreatDetailBtn');
        let currentThreatShip = null;
        let requestId = 0;

        const threatDetailFields = {
            score: document.querySelector('[data-threat-detail="score"]'),
            level: document.querySelector('[data-threat-detail="level"]'),
            scoreBar: document.querySelector('[data-threat-detail="scoreBar"]'),
            loitering: document.querySelector('[data-threat-detail="loitering"]'),
            meandering: document.querySelector('[data-threat-detail="meandering"]'),
            speedDrop: document.querySelector('[data-threat-detail="speedDrop"]'),
            smuggle: document.querySelector('[data-threat-detail="smuggle"]'),
        };

        const showThreatDetail = async (ship) => {
            if (!ship || !threatDetailPanel) return;

            currentThreatShip = ship;
            const activeRequestId = ++requestId;

            let details = null;

            // Get threat details from service
            if (window.ThreatService && ship.mmsi) {
                details = await window.ThreatService.fetchThreatDetails(ship.mmsi);
                if (!details) {
                    console.warn(`⚠️ No threat details available for ${ship.mmsi}`);
                } else if (currentThreatShip === ship) {
                    // Update the ship object with fetched details so expand actions can use it
                    currentThreatShip.threatDetails = details.threatDetails || details || {};
                }
            }            
            if (activeRequestId !== requestId) return;
            
            // Render detail info
            const threatScore = details?.totalScore || 0;
            const threatLevel = resolveThreatLevel(threatScore, ship, getThreatLevelInfo);
            renderThreatLevel(threatDetailFields, threatScore, threatLevel);
            renderDetailScores(threatDetailFields, details?.scores);
            renderThreatDetails(details?.threatDetails || {});
            // console.log("Showing threat detail for ship:", ship);

            // Show panel
            threatDetailPanel.classList.add('active');
        };

        const hideThreatDetail = () => {
            if (threatDetailPanel) {
                threatDetailPanel.classList.remove('active');
            }
            // Collapse all expanded items when closing panel
            document.querySelectorAll('.threat-item.expandable.expanded').forEach(item => {
                item.classList.remove('expanded');
                if (onThreatItemExpand) onThreatItemExpand(item.dataset.threatItem, false);
            });
            currentThreatShip = null;
        };

        setupThreatExpansion((type, isExpanded) => {
            if (onThreatItemExpand && currentThreatShip) {
                onThreatItemExpand(type, isExpanded, currentThreatShip);
            }
        });

        showThreatDetailBtn?.addEventListener('click', () => {
            const selected = typeof getSelectedCard === 'function' ? getSelectedCard() : null;
            if (!selected) return;
            if (typeof getShipData !== 'function') return;
            const ship = getShipData(selected?.dataset?.shipId);
            if (!ship) return;
            showThreatDetail(ship);
        });

        closeThreatDetailBtn?.addEventListener('click', () => {
            hideThreatDetail();
        });

        return { showThreatDetail, hideThreatDetail };
    };

    window.ThreatDetail = { init: initThreatDetail };
})(window);
