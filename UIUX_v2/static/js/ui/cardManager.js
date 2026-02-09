/**
 * Ship card manager
 */
(function(window) {
    'use strict';

    const createCardManager = (options = {}) => {
        const {
            shipListContainers,
            shipDataMap,
            getShipData,
            getThreatLevelInfo,
            threatLevels,
        } = options;

        const getThreatScore = (ship) => {
            if (!ship) return null;
            if (ship.threatScore != null) return ship.threatScore;
            return null;
        };

        const resolveCoordArray = (ship) => {
            const coordArr = Array.isArray(ship?.coord) ? ship.coord : null;
            if (coordArr && coordArr.length >= 2) return coordArr;
            const coordsObj = ship?.coords;
            if (coordsObj && Number.isFinite(coordsObj.lat) && Number.isFinite(coordsObj.lng)) {
                return [coordsObj.lat, coordsObj.lng];
            }
            return null;
        };

        const createCard = (ship) => {
            const article = document.createElement("article");
            const listType = ship.category;
            const severityClass = getThreatLevelInfo(getThreatScore(ship)).class;
            article.className = ["ship-card", severityClass, listType].filter(Boolean).join(" ").trim();
            const shipId = ship.mmsi;
            if (shipId) {
                article.dataset.shipId = shipId;
            }
            article.dataset.listType = listType;
            const coordArr = resolveCoordArray(ship);
            const coordLabel = coordArr ? `${coordArr[0].toFixed(3)}°N, ${coordArr[1].toFixed(3)}°E` : "-";
            const aisLabel = ship.aisFlag === true ? "已開啟" : "未開啟";
            let summary = `座標：${coordLabel}<br />AIS 狀態：${aisLabel}<br />威脅分數：${getThreatScore(ship)}`;
            let labelHtml = `<div class="ship-label">MMSI：<span>${ship.mmsi}</span></div>`;

            if (listType === "dispatch") {
                const actionData = ship.mission?.action;
                const actionLabel = ship.mission?.id;
                const actionSchedule = actionData?.schedule;
                const cardLabel = actionLabel;
                const detail = [
                    actionLabel ? `行動：${actionLabel}` : "",
                    actionSchedule ? `排程：${actionSchedule}` : "",
                    ship.mission?.support ? `支援單位：${ship.mission.support}` : "",
                    ship.mission?.status ? `狀態：${ship.mission.status}` : "",
                ]
                    .filter(Boolean)
                    .join("<br />");
                summary = detail;
                labelHtml = `<div class="ship-label">任務 ID：<span>${cardLabel}</span></div>`;
            }
            article.innerHTML = `
                ${labelHtml}
                <p class="ship-detail">${summary}</p>
                <div class="ship-status-badge" style="display: none;" data-status-badge>${ship.event_status}</div>
            `;
            return article;
        };

        const getSuspiciousVesselThreatClass = (vessel) => {
            const score = getThreatScore(vessel);
            if (score == null) {
                return "default";
            }
            return getThreatLevelInfo(score).class;
        };

        const convertSuspiciousToShip = (vessel) => ({
            mmsi: vessel.mmsi,
            threatScore: vessel.threatScore ?? vessel.threat?.score ?? -1,
            aisFlag: vessel.aisFlag,
            vesselType: null,
            imoNum: null,
            navStatus: null,
            cog: null,
            sog: null,
            rfFreq: null,
            coord: vessel.coord,
            accuracy: null,
            pulsesDuration: null,
            pulsesFreq: null,
            waveform: null,
            isUnknownIdentity: vessel.isUnknownIdentity,
        });

        const createSuspiciousVesselCard = (vessel) => {
            const article = document.createElement("article");
            const severityClass = getSuspiciousVesselThreatClass(vessel);

            article.className = `ship-card ${severityClass} region suspicious-vessel`;
            article.dataset.shipId = vessel.mmsi;
            article.dataset.listType = "region";
            article.dataset.suspiciousVessel = "true";

            const coordLabel = `${vessel.coord[0].toFixed(3)}°N, ${vessel.coord[1].toFixed(3)}°E`;
            const aisStatus = vessel.aisFlag ? "已開啟" : "未開啟";
            const threatDisplay = getThreatScore(vessel);
            const displayMmsi = vessel.displayName || vessel.mmsi; // Use displayName if available

            article.innerHTML = `
                <div class="ship-label">MMSI：<span>${displayMmsi}</span></div>
                <p class="ship-detail">
                    座標：${coordLabel}<br />
                    AIS 狀態：${aisStatus}<br />
                    威脅分數：${threatDisplay}
                </p>
                <div class="ship-status-badge" style="display: none;" data-status-badge></div>
            `;

            return article;
        };

        const renderSuspiciousVessels = (suspiciousVesselsData) => {
            const regionContainer = shipListContainers?.get("left-region");
            if (!regionContainer) {
                console.error("Region container not found");
                return;
            }

            // Clear all cards and clean up shipDataMap for ALL cards in region
            const allCards = regionContainer.querySelectorAll('.ship-card');
            allCards.forEach(card => {
                const mmsi = card.dataset.shipId;
                if (mmsi && shipDataMap) {
                    shipDataMap.delete(mmsi);
                }
            });
            
            // Clear entire container
            regionContainer.innerHTML = '';

            // Add new suspicious vessels (if any)
            if (Array.isArray(suspiciousVesselsData) && suspiciousVesselsData.length > 0) {
                suspiciousVesselsData.forEach(vessel => {
                    if (vessel && vessel.threatScore == null && vessel.threat?.score != null) {
                        vessel.threatScore = vessel.threat.score;
                    }
                    const card = createSuspiciousVesselCard(vessel);
                    regionContainer.appendChild(card);

                    if (shipDataMap) {
                        const shipData = convertSuspiciousToShip(vessel);
                        shipDataMap.set(vessel.mmsi, shipData);
                    }
                });
            }

            console.log(`✅ Rendered ${suspiciousVesselsData?.length} suspicious vessels`);
        };

        const sortRegionShipCards = () => {
            const regionListContainer = shipListContainers?.get("left-region");
            if (!regionListContainer || typeof getShipData !== "function") return;

            const cards = Array.from(regionListContainer.querySelectorAll('.ship-card[data-ship-id]'));
            cards.sort((cardA, cardB) => {
                const shipA = getShipData(cardA?.dataset?.shipId);
                const shipB = getShipData(cardB?.dataset?.shipId);

                const scoreA = Number(shipA?.threatScore);
                const scoreB = Number(shipB?.threatScore);

                const validScoreA = Number.isFinite(scoreA) ? scoreA : -Infinity;
                const validScoreB = Number.isFinite(scoreB) ? scoreB : -Infinity;

                return validScoreB - validScoreA;
            });

            cards.forEach(card => regionListContainer.appendChild(card));
        };

        return {
            createCard,
            renderSuspiciousVessels,
            sortRegionShipCards,
        };
    };

    window.CardManager = { create: createCardManager };
})(window);
