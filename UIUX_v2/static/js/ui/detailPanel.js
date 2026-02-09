/**
 * Ship detail panel manager
 */
(function(window) {
    'use strict';

    const normalizeShipDetail = (raw) => {
        if (!raw) return null;
        const mmsi = raw.mmsi ?? raw.id;
        if (!mmsi) return null;
        const coordArr = Array.isArray(raw.coord) ? raw.coord : null;
        const threatScore = raw.threatScore ?? raw.threat?.score ?? null;
        const aisFlag = typeof raw.aisFlag === "boolean" ? raw.aisFlag : null;
        return {
            mmsi: String(mmsi),
            threatScore,
            aisFlag,
            isUnknownIdentity: raw.isUnknownIdentity,
            coord: coordArr || null,
            vesselType: raw.vesselType ?? null,
            imoNum: raw.imoNum ?? null,
            navStatus: raw.navStatus ?? null,
            cog: raw.cog ?? null,
            sog: raw.sog ?? null,
            rfFreq: raw.rfFreq ?? null,
            accuracy: raw.accuracy ?? null,
            pulsesDuration: raw.pulsesDuration ?? null,
            pulsesFreq: raw.pulsesFreq ?? null,
            waveform: raw.waveform ?? null,
            threat: { score: threatScore },
        };
    };

    const createDetailPanel = (options = {}) => {
        const {
            apiBase,
            detailFields,
            shipDetailPanel,
            getShipData,
            getCoordinateLabel,
            getThreatLevelInfo,
            buildHistoryLookup,
            mapManager,
            trackedShipIds,
            dispatchedShipIds,
            addTrackingBtn,
            addActionBtn,
            shipDataMap,
            shipTrajectoryMap,
            getCurrentDispatchImageData,
        } = options;

        let latestDetailMmsi = null;


        const renderShipDetail = (ship, currentListType) => {
            if (!detailFields || !ship) {
                if (!detailFields) console.error("❌ detailFields is null");
                if (!ship) console.error("❌ ship data not found");
                return;
            }

            const threatScore = ship.threatScore ?? "--";
            const threatInfo = ship.threat?.level
                ? { label: ship.threat.level }
                : getThreatLevelInfo(threatScore);
            const threatLevel = threatInfo.label;
            const coordsLabel = typeof getCoordinateLabel === "function" ? getCoordinateLabel(ship) : "-";
            const infoCards = detailFields?.infoCards;
            const threatExtras = detailFields?.threatExtras;
            const rfData = ship.rf || {};

            if (detailFields?.name) detailFields.name.textContent = ship.name || "船名";
            if (detailFields?.mmsi) detailFields.mmsi.textContent = `MMSI：${ship.mmsi || "-"}`;
            if (detailFields?.ais) {
                const aisLabel = ship.aisFlag === true ? "已開啟" : "未開啟";
                detailFields.ais.textContent = `AIS：${aisLabel}`;
            }
            if (detailFields?.threatLevel) detailFields.threatLevel.textContent = threatLevel;
            if (detailFields?.threatScore) detailFields.threatScore.textContent = threatScore;
            if (detailFields?.status) detailFields.status.textContent = ship.status || "資料更新中";
            if (detailFields?.lastUpdate) detailFields.lastUpdate.textContent = ship.lastUpdate || "最新偵測：--";
            if (detailFields?.coordinates) detailFields.coordinates.textContent = coordsLabel;

            if (threatExtras) {
                if (threatExtras.score) threatExtras.score.textContent = threatScore;
                if (threatExtras.level) threatExtras.level.textContent = threatLevel;
                if (threatExtras.smuggle) threatExtras.smuggle.textContent = ship.threatSmuggle || "走私區域偵測：20 / 20";
                if (threatExtras.stop) threatExtras.stop.textContent = ship.threatStop || "航跡異常停留：40 / 40";
                if (threatExtras.offset) threatExtras.offset.textContent = ship.threatOffset || "距離偏移延遲：40 / 40";
            }

            if (infoCards) {
                if (infoCards.aisStatus) {
                    const aisLabel = ship.aisFlag === true ? "已開啟" : "未開啟";
                    infoCards.aisStatus.textContent = aisLabel;
                }
                if (infoCards.shipName) infoCards.shipName.textContent = ship.name || "-";
                if (infoCards.shipType) infoCards.shipType.textContent = ship.vesselType ?? "-";
                if (infoCards.imo) infoCards.imo.textContent = ship.imoNum ?? "-";
                if (infoCards.navStatus) infoCards.navStatus.textContent = ship.navStatus ?? "-";
                if (infoCards.cog) infoCards.cog.textContent = Number.isFinite(ship.cog) ? `${ship.cog}°` : (ship.cog ?? "-");
                if (infoCards.sog) infoCards.sog.textContent = Number.isFinite(ship.sog) ? `${ship.sog} 節` : (ship.sog ?? "-");

                if (infoCards.rfFrequency) infoCards.rfFrequency.textContent = ship.rfFreq ? `${ship.rfFreq} MHz` : "-";
                if (infoCards.rfTimestamp) infoCards.rfTimestamp.textContent = rfData.timestamp || "-";
                if (infoCards.rfPulseWidth) infoCards.rfPulseWidth.textContent = ship.pulsesDuration ? `${ship.pulsesDuration} ns` : "-";
                if (infoCards.rfPrf) infoCards.rfPrf.textContent = ship.pulsesFreq ? `${ship.pulsesFreq} Hz` : "-";
                if (infoCards.rfAccuracy) infoCards.rfAccuracy.textContent = ship.accuracy ? `${ship.accuracy}` : "-";

                if (Array.isArray(ship.coord) && Number.isFinite(ship.coord[0]) && Number.isFinite(ship.coord[1])) {
                    const lat = ship.coord[0];
                    const lng = ship.coord[1];
                    const apiCoordsLabel = `${lat.toFixed(3)}°N, ${lng.toFixed(3)}°E`;
                    if (detailFields?.coordinates) detailFields.coordinates.textContent = apiCoordsLabel;
                    if (infoCards?.rfCoordinate) infoCards.rfCoordinate.textContent = apiCoordsLabel;
                }
            }

            if (detailFields?.trackingBlock) {
                const isTracked = trackedShipIds?.has(ship.mmsi);
                const isDispatched = dispatchedShipIds?.has(ship.mmsi);
                const isRegionEvent = currentListType === "region";
                const isDispatchEvent = currentListType === "dispatch";

                if (detailFields?.detailSection) {
                    detailFields.detailSection.style.display = isDispatchEvent ? "none" : "";
                }

                detailFields.trackingBlock.classList.toggle("show", Boolean(isTracked));

                if (addTrackingBtn) {
                    addTrackingBtn.style.display = isTracked ? "none" : "block";
                }

                const actionParent = detailFields?.trackingAction?.parentElement;
                const scheduleParent = detailFields?.trackingSchedule?.parentElement;

                if (isRegionEvent) {
                    if (actionParent) actionParent.style.display = "none";
                    if (scheduleParent) scheduleParent.style.display = "none";

                    if (addActionBtn) {
                        addActionBtn.style.display = isTracked ? "block" : "none";
                        if (isTracked) {
                            addActionBtn.disabled = true;
                            addActionBtn.textContent = "已加入追蹤事件";
                            addActionBtn.classList.add("detail-action-confirmed");
                        }
                    }
                } else if (!isDispatchEvent) {
                    if (actionParent) actionParent.style.display = "";
                    if (scheduleParent) scheduleParent.style.display = "";

                    if (detailFields?.trackingAction) detailFields.trackingAction.textContent = ship.action?.label || "";
                    if (detailFields?.trackingSchedule) detailFields.trackingSchedule.textContent = ship.action?.schedule || "";

                    if (addActionBtn) {
                        addActionBtn.style.display = isTracked ? "block" : "none";
                        addActionBtn.disabled = Boolean(isDispatched);
                        addActionBtn.textContent = isDispatched ? "已確認派遣" : "確認派遣";
                        addActionBtn.classList.toggle("detail-action-confirmed", Boolean(isDispatched));
                    }
                }
            }

            const historyLookup = typeof buildHistoryLookup === "function" ? buildHistoryLookup(ship) : {};
            mapManager?.setHistoryLookup(historyLookup);
            mapManager?.updateHistoryButtons();

            const currentDispatchImageData = typeof getCurrentDispatchImageData === "function"
                ? getCurrentDispatchImageData()
                : null;
            if (currentDispatchImageData && shipDetailPanel) {
                const detailSummary = shipDetailPanel.querySelector('.detail-summary');

                if (detailSummary) {
                    let dispatchImageWrapper = shipDetailPanel.querySelector('.dispatch-image-wrapper');

                    if (!dispatchImageWrapper) {
                        dispatchImageWrapper = document.createElement('div');
                        dispatchImageWrapper.className = 'dispatch-image-wrapper';
                        dispatchImageWrapper.style.cssText = 'margin: 1rem; padding: 0.5rem; background: #f8fafc; border-radius: 0.5rem;';
                        detailSummary.parentNode.insertBefore(dispatchImageWrapper, detailSummary.nextSibling);
                    }

                    dispatchImageWrapper.innerHTML = `
                        <div class="dispatch-image-frame" style="width:100%;display:flex;justify-content:center;align-items:center;">
                            <img src="${currentDispatchImageData.imageSrc}" alt="${currentDispatchImageData.altText}" style="max-width: 100%; height: auto; border-radius: 0.5rem;" data-fallback="true" />
                        </div>
                    `;

                    const dispatchImg = dispatchImageWrapper.querySelector("img[data-fallback]");
                    if (dispatchImg && currentDispatchImageData.fallbackQueue.length) {
                        const fallbackQueue = [...currentDispatchImageData.fallbackQueue];
                        dispatchImg.onerror = () => {
                            const nextSrc = fallbackQueue.shift();
                            if (nextSrc) dispatchImg.src = nextSrc;
                        };
                    }
                }
            }
        };

        const fillDetailContent = (card) => {
            if (!detailFields) return;
            if (typeof getShipData !== "function") return;
            const ship = getShipData(String(card?.dataset?.shipId));
            if (!ship) return;
            const currentListType = card.dataset.listType || "region";
            latestDetailMmsi = ship.mmsi;
            
            // --- Custom Logic for Unknown Identity ---
            const unknownSection = shipDetailPanel.querySelector(".candidate-list-section");
            const normalSection = shipDetailPanel.querySelector(".detail-section");
            const detailInfoCards = shipDetailPanel.querySelector(".detail-info-cards");
            const detailTopInfo = shipDetailPanel.querySelector(".detail-top-info");
            const detailThreatHistory = shipDetailPanel.querySelector(".detail-threat-history");
            const detailSummary = shipDetailPanel.querySelector(".detail-summary"); // Add detail summary selection
            const candidateListContainer = shipDetailPanel.querySelector(".candidate-list");
            const candidateTitle = unknownSection?.querySelector(".section-title"); // Get section title in candidate section

            if (ship.isUnknownIdentity) {
                // Hide standard sections
                if (normalSection) normalSection.style.display = "none";
                if (detailInfoCards) detailInfoCards.style.display = "none";
                if (detailTopInfo) detailTopInfo.style.display = "none";
                if (detailThreatHistory) detailThreatHistory.style.display = "none";
                if (detailSummary) detailSummary.style.display = "none"; // Hide summary block
                
                // Show candidate list
                if (unknownSection) {
                    unknownSection.style.display = "flex";
                    // Hide the section title "可能身分列表"
                    if (candidateTitle) candidateTitle.style.display = "none";

                    // Generate candidates
                    if (candidateListContainer) {
                        // Hardcoded candidates
                        const candidates = [
                             { mmsi: "41200008", score: 30 },
                             { mmsi: "41200009", score: 20 },
                             { mmsi: "41200010", score: 10 }
                        ];
                        
                        candidateListContainer.innerHTML = candidates.map(c => `
                            <article class="ship-card ${getThreatLevelInfo(c.score).class}">
                                <div class="ship-label">MMSI：<span>${c.mmsi}</span></div>
                                <p class="ship-detail">
                                    威脅分數：${c.score}
                                </p>
                            </article>
                        `).join('');
                    }
                }
                
                // Still update map
                 mapManager?.updateMapForShip(card);
                 return; // Stop standard rendering
            } else {
                 // Restore standard sections
                if (normalSection) normalSection.style.display = "";
                if (detailInfoCards) detailInfoCards.style.display = "";
                if (detailTopInfo) detailTopInfo.style.display = "";
                if (detailThreatHistory) detailThreatHistory.style.display = "";
                if (detailSummary) detailSummary.style.display = ""; // Restore summary block
                if (unknownSection) unknownSection.style.display = "none";
                if (candidateTitle) candidateTitle.style.display = ""; // Restore section title
            }
            // ------------------------------------------

            renderShipDetail({ ...ship, status: "資料載入中…" }, currentListType);

            // Check if ship data already in cache with full details
            const cached = shipDataMap.get(String(ship.mmsi));
            const hasFullData = cached && (cached.vesselType != null || cached.imoNum != null || cached.rfFreq != null);
 
            Promise.all([
                hasFullData ? Promise.resolve(cached) : window.VesselService?.fetchVesselInfo(ship.mmsi, apiBase).catch(() => null),
            ])
                .then(async ([shipDetail]) => {
                    if (latestDetailMmsi !== ship.mmsi) return;
                    const merged = {
                        ...ship,
                        ...(shipDetail || {}),
                    };
                    
                    // Use new TrajectoryUtils async API with auto-fetch
                    const trackEntries = await window.TrajectoryUtils.getTrajectoryEntries(merged.mmsi, merged);
                    
                    if (trackEntries && trackEntries.length) {
                        const latest = window.TrajectoryUtils.findLatestTrajectoryEntry(trackEntries);
                        if (Number.isFinite(latest?.lat) && Number.isFinite(latest?.lng)) {
                            merged.coord = [latest.lat, latest.lng];
                        }
                    }
                    shipDataMap.set(String(merged.mmsi), merged);
                    if (trackEntries) {
                        shipTrajectoryMap.set(String(merged.mmsi), trackEntries);
                    }
                    renderShipDetail(merged, currentListType);
                    mapManager?.updateMapForShip(card);
                })
                .catch(() => {
                    if (latestDetailMmsi !== ship.mmsi) return;
                    console.debug("Using static shipData.js detail (API fetch failed)", ship.mmsi);
                    renderShipDetail(ship, currentListType);
                });
        };

        return {
            fillDetailContent,
        };
    };

    window.DetailPanel = { create: createDetailPanel, normalizeShipDetail };
})(window);
