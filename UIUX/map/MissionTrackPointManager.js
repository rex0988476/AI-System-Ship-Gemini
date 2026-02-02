(function(){
    let missionCounter = 3; // 任務ID計數器

    // 統一的任務-軌跡點數據管理器 (支援多對多關聯)
    class MissionTrackPointManager {
        constructor() {
            this.missions = new Map();           // 派遣任務
            this.trackPoints = new Map();        // 軌跡點
            this.initializeDefaultData();
        }

        // 安全獲取船舶ID的輔助方法
        getVesselIdString(point) {
            if (typeof window !== 'undefined' && window.safePointHelpers && window.safePointHelpers.getVesselIdString) {
                return window.safePointHelpers.getVesselIdString(point);
            }
            try {
                const tp = (point && point.data) || point || {};
                const id = tp.vesselId || tp.vessel_id || tp.mmsi || tp.imo || 'UNKNOWN';
                return id == null ? 'UNKNOWN' : String(id);
            } catch (error) {
                console.warn('Error getting vessel ID:', error);
                return 'UNKNOWN';
            }
        }

        // 創建或更新派遣任務
        createMission(missionData) {
            const missionId = missionData.missionId || `MISSION-${++missionCounter}`;
            const mission = {
                ...missionData,
                missionId: missionId,
                timestamp: missionData.timestamp || new Date().toISOString(),
                boundPointIds: [], // 初始化為陣列以支援多對多
            };
            this.missions.set(missionId, mission);
            console.log('Mission created in manager:', mission);
            this.autoLinkTrackPoints(missionId);

            // 診斷：檢查綁定是否成功
            if (mission.sourceTrackPointId && mission.boundPointIds.length === 0) {
                console.warn('⚠️ Mission binding failed:', missionId);
                console.warn('   sourceTrackPointId:', mission.sourceTrackPointId);
                console.warn('   Available track points:', [...this.trackPoints.keys()]);
                console.warn('   Mission data:', mission);
            } else if (mission.boundPointIds.length > 0) {
                console.log('✅ Mission successfully bound to points:', mission.boundPointIds);
            }

            return missionId;
        }

        // 創建或更新軌跡點
        createTrackPoint(pointData) {
            let normalized = pointData;
            try {
                if (typeof window !== 'undefined' && window.safePointHelpers && window.safePointHelpers.createCanonicalPoint) {
                    normalized = window.safePointHelpers.createCanonicalPoint(pointData, { legacy: true });
                } else if (pointData && !pointData.pointId) {
                    normalized = Object.assign({}, pointData, { pointId: pointData.id || `TRACK-${Date.now()}-${Math.random().toString(16).substr(2,6)}` });
                }
            } catch (err) { console.warn('Normalization failed, using original pointData', err); normalized = pointData; }

            const pointId = normalized.pointId || normalized.id || `TRACK-${Date.now()}-${Math.random().toString(16).substr(2, 6)}`;
            const trackPoint = {
                ...normalized,
                pointId: pointId,
                boundMissionIds: [], // 初始化為陣列以支援多對多
            };
            this.trackPoints.set(pointId, trackPoint);
            this.autoLinkMissions(pointId);
            return pointId;
        }

        // 綁定一個任務到一個點 (多對多)
        bindMissionToPoint(missionId, pointId) {
            const mission = this.missions.get(missionId);
            const point = this.trackPoints.get(pointId);
            if (!mission || !point) return false;

            // 如果ID不存在，則添加到陣列中
            if (!mission.boundPointIds.includes(pointId)) {
                mission.boundPointIds.push(pointId);
            }
            if (!point.boundMissionIds.includes(missionId)) {
                point.boundMissionIds.push(missionId);
            }
            return true;
        }

        // 從一個點解除一個任務的綁定
        unbindMissionFromPoint(missionId, pointId) {
            const mission = this.missions.get(missionId);
            const point = this.trackPoints.get(pointId);

            if (mission && mission.boundPointIds) {
                mission.boundPointIds = mission.boundPointIds.filter(id => id !== pointId);
            }
            if (point && point.boundMissionIds) {
                point.boundMissionIds = point.boundMissionIds.filter(id => id !== missionId);
            }
            return true;
        }

        // 簡化的自動關聯邏輯，僅基於明確的 sourceTrackPointId
        autoLinkTrackPoints(missionId) {
            const mission = this.missions.get(missionId);
            // 確保 mission 和 sourceTrackPointId 存在
            if (!mission || !mission.sourceTrackPointId) return;
            
            const point = this.trackPoints.get(mission.sourceTrackPointId);
            if (point) {
                this.bindMissionToPoint(mission.missionId, point.pointId);
                console.log(`Auto-linked mission ${missionId} to source point ${point.pointId}`);
            }
        }

        autoLinkMissions(pointId) {
            const point = this.trackPoints.get(pointId);
            if (!point) return;

            this.missions.forEach((mission, missionId) => {
                if (mission.sourceTrackPointId && mission.sourceTrackPointId === pointId) {
                    this.bindMissionToPoint(missionId, pointId);
                    console.log(`Auto-linked point ${pointId} to mission ${missionId}`);
                }
            });
        }

        // 獲取軌跡點上的所有任務
        getLinkedMissions(pointId) {
            const point = this.trackPoints.get(pointId);
            if (!point || !point.boundMissionIds) return [];
            // 返回所有綁定的任務物件
            return point.boundMissionIds.map(missionId => this.missions.get(missionId)).filter(Boolean);
        }

        // 獲取任務關聯的所有軌跡點
        getLinkedTrackPoints(missionId) {
            const mission = this.missions.get(missionId);
            if (!mission || !mission.boundPointIds) return [];
            // 返回所有綁定的軌跡點物件
            return mission.boundPointIds.map(pointId => this.trackPoints.get(pointId)).filter(Boolean);
        }

        initializeDefaultData() {
            console.log('MissionTrackPointManager initialized for many-to-many relationships.');
        }
    }

    window.missionTrackManager = new MissionTrackPointManager();
})();