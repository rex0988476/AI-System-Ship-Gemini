// 座標格式轉換工具函數
function formatCoordinates(lat, lon) {
  const latDir = lat >= 0 ? 'N' : 'S';
  const lonDir = lon >= 0 ? 'E' : 'W';
  const absLat = Math.abs(lat);
  const absLon = Math.abs(lon);
  
  return `${absLat.toFixed(6)}°${latDir}, ${absLon.toFixed(6)}°${lonDir}`;
}

// 動態載入管理器類別
let AreaEventManager, VesselEventManager;

AreaEventManager = window.AreaEventManager;
VesselEventManager = window.VesselEventManager;

// 全域變數
window.currentEventId = null;
let previousEventId = null; // 追蹤上一個選中的事件，用於避免重複處理
let selectedEventType = null;
let selectedAction = null;
window.eventCounter = 4;
let creatingEventIds = new Set(); // 追蹤正在創建中的事件ID

// === 泰國灣走私活動中心點配置 ===
const THAILAND_GULF_SMUGGLING_CENTER = {
  lat: 12.697111,  // 緯度 (泰國灣中部)
  lon: 100.503556,  // 經度 (泰國灣中部)
  radius: 50,       // 半徑 50 海里 (推薦值，涵蓋主要走私活動範圍)
  radiusUnit: 'nm', // 半徑單位：海里
  radiusInKm: 92.6, // 半徑換算為公里 (50 * 1.852)
  name: '泰國灣走私活動中心',
  description: '根據歷史數據分析的走私活動高發區域中心點，半徑50海里涵蓋主要走私航線',
  // 輔助方法
  getCoordinates() {
    return { lat: this.lat, lon: this.lon };
  },
  getFormattedCoordinates() {
    return `${this.lat.toFixed(3)}°N, ${this.lon.toFixed(3)}°E`;
  },
  getRadius() {
    return { radius: this.radius, unit: this.radiusUnit, km: this.radiusInKm };
  },
  getFormattedRadius() {
    return `半徑 ${this.radius} ${this.radiusUnit} (${this.radiusInKm} 公里)`;
  },
  getAreaDescription() {
    return `${this.name} - ${this.getFormattedCoordinates()} ${this.getFormattedRadius()}`;
  },
  isValid() {
    return this.lat !== 0.0 && this.lon !== 0.0 && this.radius > 0;
  },
  // 計算某個點是否在走私中心範圍內
  isPointInRange(pointLat, pointLon) {
    const distance = this.calculateDistance(pointLat, pointLon);
    return distance <= this.radiusInKm;
  },
  // 計算兩點間距離 (公里)
  calculateDistance(pointLat, pointLon) {
    const R = 6371; // 地球半徑 (公里)
    const dLat = (pointLat - this.lat) * Math.PI / 180;
    const dLon = (pointLon - this.lon) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.lat * Math.PI / 180) * Math.cos(pointLat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
};

// 时间轴模式管理
let timelineMode = 'global'; // 'global' 或 'vessel'
let currentTrackingVessel = null; // 当前追踪的船隻

// 用於存儲調查範圍圖層的全域變數
let investigationRangeLayer = null;

// 主地圖
let mainMap = null;

// 取用全域事件資料儲存實例
const eventStorage = window.eventStorage; 

// 取用全域任務軌跡點管理器實例
const missionTrackManager = window.missionTrackManager;

// 取用全域歷史軌跡管理器實例
const historyTrackManager = window.historyTrackManager;

// -----------

// 顯示新增事件彈窗(index.html)
function showNewEventModal() {
    document.getElementById('newEventModal').style.display = 'flex';

    selectedEventType = null;
    document.querySelectorAll('.type-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelectorAll('.form-section').forEach(form => {
        form.style.display = 'none';
    });
    // 隱藏按鈕區域並禁用建立按鈕
    document.getElementById('modalActions').style.display = 'none';
    document.getElementById('createEventBtn').disabled = true;

    // 清空所有表單欄位
    document.querySelectorAll('.form-input, .form-textarea').forEach(input => {
        input.value = '';
    });
}

// 選擇事件類型(index.html)
function selectEventType(type) {
    selectedEventType = type;

    // 更新選中狀態
    document.querySelectorAll('.type-option').forEach(option => {
        option.classList.remove('selected');
    });
    document.querySelector(`[data-type="${type}"]`).classList.add('selected');

    // 顯示對應表單
    document.querySelectorAll('.form-section').forEach(form => {
        form.style.display = 'none';
    });
    document.getElementById(`${type}Form`).style.display = 'block';

    // 顯示按鈕區域並啟用建立按鈕
    document.getElementById('modalActions').style.display = 'flex';
    document.getElementById('createEventBtn').disabled = false;
}

// -----------

// 建立事件(index.html)
function createNewEvent() {
    const eventId = `${selectedEventType.toUpperCase()}-${String(++window.eventCounter).padStart(3, '0')}`;

    // 建立事件資料結構
    let eventData = {
        type: selectedEventType,
        createTime: new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }),
        status: 'creating'
    };

    let displayInfo = { content: '', updateData: {} };

    if (selectedEventType === 'area') {
        const aoiName = document.getElementById('aoiName').value || '未命名區域';

        // 讀取用戶輸入的中心座標和半徑
        const centerLat = parseFloat(document.getElementById('centerLat').value);
        const centerLon = parseFloat(document.getElementById('centerLon').value);
        const centerLatDirection = document.getElementById('centerLatDirection').value;
        const centerLonDirection = document.getElementById('centerLonDirection').value;
        const radius = parseFloat(document.getElementById('radius').value);
        const radiusUnit = document.getElementById('radiusUnit').value;

        let centerCoordinates, monitorRange;

        // 檢查是否有完整的座標和半徑輸入
        if (!isNaN(centerLat) && !isNaN(centerLon) && !isNaN(radius)) {
            // 驗證輸入值的合理性
            if (centerLat < 0 || centerLat > 90) {
                alert('緯度值必須在0-90之間');
                return;
            }
            if (centerLon < 0 || centerLon > 180) {
                alert('經度值必須在0-180之間');
                return;
            }
            if (radius <= 0) {
                alert('半徑必須大於0');
                return;
            }

            // 轉換為標準格式
            centerCoordinates = `${centerLat.toFixed(3)}°${centerLatDirection}, ${centerLon.toFixed(3)}°${centerLonDirection}`;
            
            // 將半徑轉換為公里（如果是海里的話）
            const radiusInKm = radiusUnit === 'nm' ? radius * 1.852 : radius;
            monitorRange = `半徑 ${radius} ${radiusUnit === 'km' ? '公里' : '海里'}`;
            
        } else if (document.getElementById('centerLat').value || document.getElementById('centerLon').value || 
                   document.getElementById('radius').value) {
            // 有部分輸入但不完整
            alert('請填寫完整的中心座標（緯度、經度）和監控半徑');
            return;
        } else {
            alert('請填寫完整的中心座標（緯度、經度）和監控半徑');
            return;
        }

        const monitorHours = document.getElementById('monitorHours').value || '24';

        // 計算監控時間範圍
        const monitorTimeRange = calculateMonitorTimeRange(eventData.createTime, monitorHours);

        eventData = {
            ...eventData,
            aoiName: aoiName,
            centerCoordinates: centerCoordinates,
            centerLat: centerLat,
            centerLon: centerLon,
            centerLatDirection: centerLatDirection,
            centerLonDirection: centerLonDirection,
            radius: radius,
            radiusUnit: radiusUnit,
            radiusInKm: radiusUnit === 'nm' ? radius * 1.852 : radius,
            monitorRange: monitorRange,
            monitorHours: monitorHours,
            monitorTimeRange: monitorTimeRange,
        };

        displayInfo.content = `監控區域: ${aoiName}<br>監控時間: ${monitorTimeRange}<br>中心座標: ${centerCoordinates}<br>監控範圍: ${monitorRange}`;
    } else if (selectedEventType === 'vessel') {
        const mmsi = document.getElementById('vesselMMSI').value || '未知';
        
        // 使用 vesselDataGenerator 根據 MMSI 自動生成完整的船舶資料
        let vesselData;
        if (window.vesselDataGenerator) {
            vesselData = window.vesselDataGenerator.generateVesselDataByMMSI(mmsi);
            console.log(`✅ 已為 MMSI ${mmsi} 自動生成完整船舶資料:`, vesselData);
        } else {
            console.warn('⚠️ VesselDataGenerator 不可用，使用預設值');
            vesselData = {
                mmsi: mmsi,
                vesselName: '未知船舶',
                vesselType: '未知',
                coordinates: '未知',
                lat: null,
                lon: null,
                threatScore: 30,
                aisStatus: '未知',
                speed: 0,
                course: 0,
                trackPoints: []
            };
        }

        // 建立事件資料，整合自動生成的船舶資料
        eventData = {
            ...eventData,
            mmsi: vesselData.mmsi,
            coordinates: vesselData.coordinates,
            lat: vesselData.lat,
            lon: vesselData.lon,
            vesselName: vesselData.vesselName,
            vesselType: vesselData.vesselType,
            threatScore: vesselData.threatScore,
            aisStatus: vesselData.aisStatus,
            speed: vesselData.speed,
            course: vesselData.course,
            trackPoints: vesselData.trackPoints,
            timestamp: vesselData.timestamp
        };

        // 如果威脅分數 >= 70，自動生成警示時間
        if (vesselData.threatScore >= 70 && vesselData.alertTime) {
            eventData.alertTime = vesselData.alertTime;
        }

        displayInfo.content = `MMSI: ${mmsi}<br>座標: ${vesselData.coordinates}<br> AIS狀態: ${vesselData.aisStatus}<br>威脅分數: ${vesselData.threatScore}`;
    }

    closeEventModal();

    // 使用統一的事件卡建立函數
    createEventCard(eventId, selectedEventType, eventData, displayInfo);
}

// 計算監控時間範圍的輔助函數（包含日期考量）
function calculateMonitorTimeRange(createTime, monitorHours) {
    if (!createTime || !monitorHours) return '未設定';

    try {
        const monitorHoursNum = parseInt(monitorHours);
        if (isNaN(monitorHoursNum) || monitorHoursNum <= 0) return '無效的監控時間';

        // 解析建立時間 (格式: HH:MM)
        const [hours, minutes] = createTime.split(':').map(Number);
        const startTime = new Date();
        startTime.setHours(hours, minutes, 0, 0);

        // 計算結束時間
        const endTime = new Date(startTime);
        endTime.setTime(startTime.getTime() + (monitorHoursNum * 60 * 60 * 1000));

        // 格式化時間的函數
        const formatDateTime = (date) => {
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(today.getDate() + 1);
            const yesterday = new Date(today);
            yesterday.setDate(today.getDate() - 1);

            const timeString = date.toLocaleTimeString('zh-TW', {
                hour12: false,
                hour: '2-digit',
                minute: '2-digit'
            });

            // 檢查是否為今天、明天或昨天
            if (date.toDateString() === today.toDateString()) {
                return timeString; // 只顯示時間
            } else if (date.toDateString() === tomorrow.toDateString()) {
                return `明日 ${timeString}`;
            } else if (date.toDateString() === yesterday.toDateString()) {
                return `昨日 ${timeString}`;
            } else {
                // 顯示完整日期和時間
                const dateString = date.toLocaleDateString('zh-TW', {
                    month: '2-digit',
                    day: '2-digit'
                });
                return `${dateString} ${timeString}`;
            }
        };

        const startFormatted = formatDateTime(startTime);
        const endFormatted = formatDateTime(endTime);

        // 如果監控時間超過24小時，添加持續時間提示
        let durationHint = '';
        if (monitorHoursNum >= 24) {
            const days = Math.floor(monitorHoursNum / 24);
            const remainingHours = monitorHoursNum % 24;
            if (days > 0 && remainingHours > 0) {
                durationHint = ` (${days}天${remainingHours}小時)`;
            } else if (days > 0) {
                durationHint = ` (${days}天)`;
            }
        }

        return `${startFormatted} - ${endFormatted}${durationHint}`;
    } catch (error) {
        console.warn('計算監控時間範圍時發生錯誤:', error);
        return `${createTime} - (${monitorHours || '未設定'})`;
    }
}

// 關閉事件彈窗(index.html)
function closeEventModal() {
    document.getElementById('newEventModal').style.display = 'none';
}

/**
 * 建立新事件卡的統一函數（包含狀態更新模擬）
 * @param {string} eventId - 事件ID（大寫格式）
 * @param {string} eventType - 事件類型 ('area', 'rf', 'vessel')
 * @param {Object} eventData - 事件資料
 * @param {Object} displayInfo - 顯示資訊配置
 * @returns {HTMLElement} 新建立的事件卡元素
 */
function createEventCard(eventId, eventType, eventData, displayInfo) {
    const eventIdLowerCase = eventId.toLowerCase();

    // 將該事件ID添加到創建中的集合
    creatingEventIds.add(eventIdLowerCase);

    // 事件類型配置（包含狀態更新配置）
    const typeConfig = {
        'area': {
            className: 'type-area',
            displayName: '區域監控',
            initialStatus: '建立中',
            delay: 2000,
            finalStatusClass: 'status-investigating',
            finalStatusText: '調查中',
            storageStatus: 'investigating'
        },
        'vessel': {
            className: 'type-vessel',
            displayName: '船舶追蹤',
            initialStatus: '風險分析中',
            delay: 3000,
            finalStatusClass: 'status-investigating',
            finalStatusText: '等待決策',
            storageStatus: 'investigating'
        }
    };

    const config = typeConfig[eventType];
    if (!config) {
        console.error(`不支援的事件類型: ${eventType}`);
        return null;
    }

    // 儲存事件資料
    eventStorage.saveEvent(eventIdLowerCase, eventData);

    // 建立新事件卡
    const eventsContainer = document.querySelector('.events-container');
    const newCard = document.createElement('div');
    newCard.className = 'event-card';
    newCard.setAttribute('data-event-id', eventIdLowerCase);
    newCard.onclick = () => selectEvent(newCard, eventIdLowerCase);

    newCard.innerHTML = `
        <div class="event-card-header">
            <span class="event-id">${eventId}</span>
            <span class="event-type-badge ${config.className}">${config.displayName}</span>
        </div>
        <div class="event-info">${displayInfo.content}</div>
        <div class="event-status">
            <div class="status-dot status-creating"></div>
            <span>${config.initialStatus}</span>
        </div>
    `;

    // ⚠️ 修復：檢查當前 tab，只有在對應的 tab 頁面才插入事件卡到 DOM
    const activeTab = document.querySelector('.stats-tab-btn.active');
    const currentTab = activeTab?.dataset.tab || 'area';
    
    // 判斷是否應該立即插入事件卡
    // - 區域事件：只在 area tab 時插入
    // - 船舶追蹤事件：只在 tracking tab 時插入
    // - 其他情況：不插入（事件卡會在切換到對應 tab 時由渲染函數生成）
    const shouldInsertCard = (eventType === 'area' && currentTab === 'area') || 
                            (eventType === 'vessel' && currentTab === 'tracking');
    
    if (shouldInsertCard) {
        // 插入事件卡到容器頂部
        eventsContainer.insertBefore(newCard, eventsContainer.firstChild);
        console.log(`✅ 事件卡 ${eventId} 已插入到當前 tab (${currentTab})`);
    } else {
        console.log(`⏸️ 事件卡 ${eventId} 暫不插入 DOM (當前 tab: ${currentTab}, 事件類型: ${eventType})`);
    }

    // 立即設置該事件卡為禁用狀態（僅在事件卡已插入 DOM 時）
    if (shouldInsertCard) {
        setTimeout(() => {
            setEventCardDisabled(eventIdLowerCase, true);
        }, 10);
    }

    // 模擬事件狀態更新
    setTimeout(() => {
        // 只有當事件卡在 DOM 中時才更新 UI 元素
        if (shouldInsertCard) {
            const statusDot = newCard.querySelector('.status-dot');
            const statusText = newCard.querySelector('.event-status span');

            if (statusDot && statusText) {
                statusDot.className = `status-dot ${config.finalStatusClass}`;
                statusText.textContent = config.finalStatusText;
            }

            // 特殊處理：船舶事件需要更新威脅分數顯示
            const updateData = displayInfo.updateData || {};
            if (eventType === 'vessel' && updateData.mmsi && updateData.coordinates && updateData.threatScore) {
                const riskInfo = newCard.querySelector('.event-info');
                if (riskInfo) {
                    // 始終顯示 MMSI、座標和威脅分數
                    riskInfo.innerHTML = `MMSI: ${updateData.mmsi}<br>座標: ${updateData.coordinates}<br>AIS狀態: ${updateData.aisStatus}<br>威脅分數: ${updateData.threatScore}`;
                    console.log(`✅ 事件 ${eventId} 顯示完整資訊，威脅分數: ${updateData.threatScore}`);
                }
            }
        }

        // 更新儲存的事件狀態（無論事件卡是否在 DOM 中都要更新）
        const updateData = displayInfo.updateData || {};
        const storageUpdateData = {
            status: config.storageStatus,
            ...updateData
        };

        eventStorage.updateEvent(eventIdLowerCase, storageUpdateData);

        // 模擬完成後，從創建中的集合移除該事件ID並恢復該事件卡功能
        creatingEventIds.delete(eventIdLowerCase);
        
        // 只有當事件卡在 DOM 中時才恢復功能
        if (shouldInsertCard) {
            setEventCardDisabled(eventIdLowerCase, false);
        }

        // 🆕 如果是區域監控事件，啟動定期更新機制
        if (eventType === 'area' && window.areaEventUpdateManager) {
            console.log(`🔄 為區域監控事件 ${eventId} 啟動定期威脅分數更新`);
            window.areaEventUpdateManager.startEventUpdates(eventIdLowerCase);
        }

        // 更新事件計數
        updateEventCounts();
        console.log('📊 事件計數已更新');
    }, config.delay);

    console.log(`✅ 事件卡 ${eventId} (${eventType}) 已建立完成`);
    return newCard;
}

// 事件卡選擇
function selectEvent(element, eventId) {
    // 如果該事件正在創建中，阻止選擇
    if (creatingEventIds.has(eventId)) {
        console.log(`事件 ${eventId} 正在創建中，無法選擇`);
        return;
    }

    // 檢查是否重複點擊同一個事件
    const isRepeatedClick = (previousEventId === eventId);

    // 移除其他卡片的 active 狀態
    document.querySelectorAll('.event-card').forEach(card => {
        card.classList.remove('active');
    });

    // 激活選中的卡片
    element.classList.add('active');

    // 更新事件 ID
    previousEventId = window.currentEventId;
    window.currentEventId = eventId;

    // ⚠️ 修復：只在區域事件 tab 時更新可疑船隻列表
    const activeTab = document.querySelector('.stats-tab-btn.active');
    const currentTab = activeTab?.dataset.tab || 'area';

    console.log(`🔍 [selectEvent] 當前 tab: ${currentTab}, eventId: ${eventId}`);

    if (currentTab === 'area') {
        renderSuspiciousVesselsList(eventId);
    }

    // 更新詳情面板
    updateDetailsPanel(eventId);

    // 根據事件類型調整地圖視圖（如果是重複點擊，傳遞標記）
    adjustMapViewForEvent(eventId, isRepeatedClick);

    // 根據事件類型控制底部面板和時間軸
    const storedEvent = eventStorage.getEvent(eventId);
    const missionSection = document.querySelector('.mission-section');
    const systemLayout = document.querySelector('.system-layout');

    if (storedEvent && storedEvent.type === 'vessel') {
        // 船舶事件：顯示底部面板和時間軸
        if (missionSection) missionSection.classList.remove('hidden');
        if (systemLayout) systemLayout.classList.remove('hide-bottom');
        switchToTrackingMode(eventId);
    } else if (storedEvent && storedEvent.type === 'area') {
        // 區域監控事件：隱藏整個底部面板
        if (missionSection) missionSection.classList.add('hidden');
        if (systemLayout) systemLayout.classList.add('hide-bottom');
        switchToGlobalMode();
    } else {
        // 其他類型事件：顯示底部面板但清空時間軸
        if (missionSection) missionSection.classList.remove('hidden');
        if (systemLayout) systemLayout.classList.remove('hide-bottom');
        switchToGlobalMode();
    }
}

// 初始化區域事件選擇器
function initializeAreaEventSelector() {
    const selector = document.getElementById('areaEventSelector');
    if (!selector) return;

    // 清空現有選項（保留第一個預設選項）
    selector.innerHTML = '<option value="">選擇區域事件</option>';

    // 獲取所有區域事件
    const areaEvents = [];
    eventStorage.events.forEach((event, eventId) => {
        if (event.type === 'area') {
            areaEvents.push({ id: eventId, data: event });
        }
    });

    // 添加到選擇器
    areaEvents.forEach(({ id, data }) => {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = `${id.toUpperCase()} - ${data.area?.name || '未命名區域'}`;
        selector.appendChild(option);
    });

    console.log(`✅ 已初始化區域事件選擇器，共 ${areaEvents.length} 個區域事件`);
}

// 處理區域事件選擇變更
function onAreaEventChange(eventId) {
    console.log(`🔄 [onAreaEventChange] 被調用，eventId: ${eventId}`);

    // 首先檢查當前 tab
    const activeTab = document.querySelector('.stats-tab-btn.active');
    const currentTab = activeTab?.dataset.tab || 'area';

    console.log(`📍 [onAreaEventChange] 當前 tab: ${currentTab}`);

    // ⚠️ 關鍵修復：如果當前不在區域事件 tab，直接返回
    if (currentTab !== 'area') {
        console.log(`⚠️ [onAreaEventChange] 當前不在區域事件 tab，忽略此次調用`);
        // 只更新 currentEventId，其他什麼都不做
        if (eventId) {
            window.currentEventId = eventId;
        }
        return;
    }

    if (!eventId) {
        // 清空列表
        const eventsContainer = document.querySelector('.events-container');
        if (eventsContainer) {
            eventsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">請選擇區域事件</div>';
        }
        // 顯示預設統計頁面
        renderAreaStatsTab();
        return;
    }

    // 更新當前事件 ID
    window.currentEventId = eventId;

    // 強制觸發可疑船隻數據生成（如果尚未生成）
    const areaEvent = eventStorage.getEvent(eventId);
    if (areaEvent && areaEvent.type === 'area') {
        if (!areaEvent.suspiciousVesselCandidatesData || areaEvent.suspiciousVesselCandidatesData.length === 0) {
            console.log(`🔄 [onAreaEventChange] 可疑船隻數據尚未生成，手動觸發生成...`);

            // 手動調用 getAreaEventDetailsFromStorage 來觸發數據生成
            if (typeof AreaEventManager !== 'undefined') {
                AreaEventManager.getAreaEventDetailsFromStorage(areaEvent);

                // ⚡ 優化：減少延遲從 1000ms 到 300ms
                // 數據生成是同步的，只需要短暫延遲確保 DOM 更新
                setTimeout(() => {
                    // 到這裡時，我們已經確認在 area tab
                    renderSuspiciousVesselsList(eventId);
                    renderAreaStatsTab();
                }, 300);
                return;
            }
        }
    }

    // 到這裡時，我們已經確認在 area tab，直接渲染
    renderSuspiciousVesselsList(eventId);
    renderAreaStatsTab();

    console.log(`✅ 已切換到區域事件: ${eventId}`);
}

// 渲染左側可疑船隻列表
function renderSuspiciousVesselsList(eventId) {
    console.log(`🔍 [renderSuspiciousVesselsList] 開始渲染，eventId: ${eventId}`);

    const eventsContainer = document.querySelector('.events-container');
    if (!eventsContainer) {
        console.warn('⚠️ 找不到 events-container 元素');
        return;
    }

    // 獲取事件數據
    const storedEvent = eventStorage.getEvent(eventId);
    console.log(`📦 [renderSuspiciousVesselsList] 獲取事件數據:`, storedEvent);

    // 只處理區域監控事件
    if (!storedEvent || storedEvent.type !== 'area') {
        console.warn(`⚠️ [renderSuspiciousVesselsList] 不是區域事件或事件不存在`);
        eventsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">請選擇區域監控事件以查看可疑船隻</div>';
        return;
    }

    // 獲取可疑船隻候選數據
    const suspiciousVessels = storedEvent.suspiciousVesselCandidatesData;
    console.log(`🚢 [renderSuspiciousVesselsList] 可疑船隻數據:`, suspiciousVessels);

    if (!suspiciousVessels || suspiciousVessels.length === 0) {
        console.warn(`⚠️ [renderSuspiciousVesselsList] 暫無可疑船隻數據`);
        console.log(`📊 [renderSuspiciousVesselsList] SeaDotManager 狀態:`,{
            exists: !!window.seaDotManager,
            dotsCount: window.seaDotManager?.seaDots?.size || 0
        });

        eventsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">暫無可疑船隻數據<br><br>請確認 SeaDotManager 已初始化並有監測點數據</div>';
        return;
    }

    // ⚡ 優化：使用 requestAnimationFrame 來批量處理 DOM 更新
    // 這樣可以讓瀏覽器在最佳時機進行渲染，避免阻塞主線程
    requestAnimationFrame(() => {
        // 處理並排序可疑船隻（按威脅分數降序）
        const processedVessels = suspiciousVessels
            .map(candidateData => {
                // 如果沒有 suspiciousVessel，生成一個
                let vessel = candidateData.suspiciousVessel;
                if (!vessel && typeof AreaEventManager !== 'undefined') {
                    vessel = AreaEventManager.generateSuspiciousVesselCandidate(candidateData);
                    candidateData.suspiciousVessel = vessel;
                }
                return { candidateData, vessel };
            })
            .filter(item => item.vessel) // 過濾掉沒有船隻數據的項目
            .sort((a, b) => {
                const scoreA = a.vessel?.threatScore || 0;
                const scoreB = b.vessel?.threatScore || 0;
                return scoreB - scoreA; // 降序排序
            });

        // ⚡ 優化：使用批量 innerHTML 更新而非逐個插入 DOM
        // 這樣可以減少 DOM 重排次數，提升渲染速度
        const htmlFragments = processedVessels.map(({ candidateData, vessel }) => {
            const threatScore = vessel.threatScore || 0;
            const threatClass = threatScore > 80 ? 'high' : threatScore > 60 ? 'medium' : 'low';
            const aisStatus = candidateData.aisStatus || '未開啟';

            return `
                <div class="event-card vessel-card" data-rf-id="${candidateData.rfId}">
                    <div class="event-card-header">
                        <span class="event-id">${vessel.vesselMmsi || 'Unknown'}</span>
                        <span class="threat-badge threat-${threatClass}">${threatScore}</span>
                    </div>
                    <div class="event-info">
                        船舶類型: ${vessel.vesselType || '未知'}<br>
                        AIS 狀態: ${aisStatus}<br>
                        座標: ${vessel.lat?.toFixed(3)}°N, ${vessel.lon?.toFixed(3)}°E<br>
                        RF 信號: ${candidateData.frequency || 'N/A'}
                    </div>
                    <div class="event-status" style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="status-dot status-investigating"></div>
                            <span>可疑船隻</span>
                        </div>
                        <button class="btn btn-primary" style="padding: 6px 12px; font-size: 11px; background: #00d4ff; border: none; border-radius: 4px; color: #0a0f1c; font-weight: bold; cursor: pointer;"
                                onclick="event.stopPropagation(); createVesselEventFromAreaKeepView('${candidateData.rfId}')">
                            建立追蹤
                        </button>
                    </div>
                </div>
            `;
        });

        // 一次性更新 DOM
        eventsContainer.innerHTML = htmlFragments.join('');

        console.log(`✅ 已渲染 ${processedVessels.length} 個可疑船隻`);
    });
}

// 選擇追蹤事件並顯示詳情
function selectTrackingEvent(eventId) {
    console.log(`🎯 [selectTrackingEvent] 選中追蹤事件: ${eventId}`);

    // 保存選中的追蹤事件 ID
    window.selectedTrackingEventId = eventId;

    // 更新選中狀態（不重新渲染整個列表）
    document.querySelectorAll('.tracking-card').forEach(card => {
        card.classList.remove('active');
    });
    const selectedCard = document.querySelector(`[data-event-id="${eventId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('active');
    }

    // 顯示該追蹤事件的詳情（使用原本的船舶事件詳情格式）
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsContent) return;

    const storedEvent = eventStorage.getEvent(eventId);
    if (storedEvent && storedEvent.type === 'vessel') {
        // 使用原本的 VesselEventManager 來生成詳情 HTML
        if (typeof VesselEventManager !== 'undefined') {
            const detailsHtml = VesselEventManager.getVesselEventDetailsFromStorage(storedEvent);
            detailsContent.innerHTML = detailsHtml;

            // 同時調用原本的 selectEvent 以更新地圖、顯示軌跡等
            if (selectedCard) {
                selectEvent(selectedCard, eventId);
            }
        } else {
            console.error('❌ VesselEventManager 未定義');
        }
    } else {
        console.error('❌ 追蹤事件不存在或類型不正確:', eventId);
    }
}

// 建立船舶追蹤事件但保持當前視圖（不切換 tab）
async function createVesselEventFromAreaKeepView(rfId) {
    console.log(`🚢 [KeepView] 建立船舶追蹤事件，RF ID: ${rfId}`);

    // 調用原本的建立函數，但不自動跳轉
    await createVesselEventFromArea(rfId, false);

    // 建立完成後，保持當前視圖
    const activeTab = document.querySelector('.stats-tab-btn.active');
    const currentTab = activeTab?.dataset.tab || 'area';

    console.log(`✅ [KeepView] 船舶追蹤事件建立完成，當前 tab: ${currentTab}`);

    // ⚠️ 修復：立即重新渲染可疑船隻列表，移除已建立追蹤的船隻
    // 由於 createEventCard 已經修改為只在對應 tab 插入事件卡，
    // 這裡只需要立即重新渲染可疑船隻列表即可
    if (currentTab === 'area' && window.currentEventId) {
        console.log(`🔄 [KeepView] 立即重新渲染可疑船隻列表`);
        // 使用短暫延遲確保 eventStorage 已更新
        setTimeout(() => {
            renderSuspiciousVesselsList(window.currentEventId);
        }, 100);
    } else if (currentTab === 'tracking') {
        console.log(`🔄 [KeepView] 重新渲染追蹤事件列表`);
        setTimeout(() => {
            renderTrackingEventsList();
        }, 100);
    }
}

// === 調試工具函數 ===
// 調試工具：檢查所有事件
window.debugAllEvents = function() {
    console.log('=== 所有事件調試資訊 ===');
    console.log(`📦 eventStorage.events.size: ${eventStorage.events.size}`);

    let areaCount = 0, vesselCount = 0, rfCount = 0;

    eventStorage.events.forEach((event, eventId) => {
        console.log(`\n事件 ${eventId}:`);
        console.log(`  type: ${event.type}`);
        console.log(`  mmsi: ${event.mmsi || 'N/A'}`);
        console.log(`  threatScore: ${event.threatScore || 'N/A'}`);

        if (event.type === 'area') areaCount++;
        if (event.type === 'vessel') vesselCount++;
        if (event.type === 'rf') rfCount++;
    });

    console.log(`\n統計：`);
    console.log(`  區域事件: ${areaCount}`);
    console.log(`  追蹤事件: ${vesselCount}`);
    console.log(`  RF 事件: ${rfCount}`);
};

// 在控制台運行 debugAreaEvent() 來檢查區域事件狀態
window.debugAreaEvent = function() {
    console.log('=== 區域事件調試資訊 ===');

    // 1. 檢查 SeaDotManager
    console.log('\n1. SeaDotManager 狀態:');
    if (window.seaDotManager) {
        console.log('✅ SeaDotManager 已初始化');
        console.log(`   監測點數量: ${window.seaDotManager.seaDots?.size || 0}`);
        if (window.seaDotManager.seaDots?.size > 0) {
            const allDots = window.seaDotManager.getAllDots();
            const noAISDots = allDots.filter(dot => dot.status === 'No AIS');
            console.log(`   無 AIS 監測點: ${noAISDots.length}`);
            console.log('   前 3 個無 AIS 監測點:', noAISDots.slice(0, 3));
        }
    } else {
        console.error('❌ SeaDotManager 未初始化');
    }

    // 2. 檢查區域事件數據
    console.log('\n2. 區域事件 area-001 數據:');
    const areaEvent = eventStorage.getEvent('area-001');
    if (areaEvent) {
        console.log('✅ 區域事件已存在');
        console.log('   事件類型:', areaEvent.type);
        console.log('   區域名稱:', areaEvent.aoiName);
        console.log('   中心座標:', areaEvent.centerLat, areaEvent.centerLon);
        console.log('   半徑:', areaEvent.radius, areaEvent.radiusUnit);
        console.log('   半徑(km):', areaEvent.radiusInKm);
        console.log('   監控時間:', areaEvent.monitorTimeRange);
        console.log('   可疑船隻候選 IDs:', areaEvent.suspiciousVesselCandidates);
        console.log('   可疑船隻數據:', areaEvent.suspiciousVesselCandidatesData);
        console.log('   數據長度:', areaEvent.suspiciousVesselCandidatesData?.length || 0);

        if (areaEvent.suspiciousVesselCandidatesData && areaEvent.suspiciousVesselCandidatesData.length > 0) {
            console.log('   前 2 個可疑船隻:', areaEvent.suspiciousVesselCandidatesData.slice(0, 2));
        }
    } else {
        console.error('❌ 區域事件 area-001 不存在');
    }

    // 3. 手動觸發數據生成
    console.log('\n3. 嘗試手動生成可疑船隻數據:');
    if (areaEvent && typeof AreaEventManager !== 'undefined') {
        const result = AreaEventManager.getRFSignalsWithoutAIS(areaEvent);
        console.log('   getRFSignalsWithoutAIS 結果:', result);

        if (result) {
            console.log(`   找到 ${result.rfSignalsWithoutAIS?.length || 0} 個 RF 信號`);
        }
    }

    console.log('\n=== 調試結束 ===');
    console.log('如需重新渲染，請在控制台運行: onAreaEventChange("area-001")');
};

// 渲染追蹤事件列表
function renderTrackingEventsList() {
    console.log(`🔍 [renderTrackingEventsList] 開始渲染追蹤事件列表`);

    const eventsContainer = document.querySelector('.events-container');
    if (!eventsContainer) {
        console.warn('⚠️ 找不到 events-container 元素');
        return;
    }
    console.log(`✅ [renderTrackingEventsList] 找到 events-container`);

    // 獲取所有追蹤事件
    const trackingEvents = [];
    console.log(`📦 [renderTrackingEventsList] eventStorage.events size:`, eventStorage.events.size);

    eventStorage.events.forEach((event, eventId) => {
        console.log(`   檢查事件 ${eventId}: type=${event.type}`);
        if (event.type === 'vessel') {
            trackingEvents.push({ id: eventId, data: event });
        }
    });

    console.log(`📊 [renderTrackingEventsList] 找到 ${trackingEvents.length} 個追蹤事件`);

    if (trackingEvents.length === 0) {
        eventsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">暫無追蹤事件</div>';
        console.log(`⚠️ [renderTrackingEventsList] 沒有追蹤事件，顯示空狀態`);
        return;
    }

    // 按威脅分數排序
    trackingEvents.sort((a, b) => {
        const scoreA = a.data.threatScore || 0;
        const scoreB = b.data.threatScore || 0;
        return scoreB - scoreA;
    });

    // 渲染事件卡片
    eventsContainer.innerHTML = trackingEvents.map(({ id, data }) => {
        const threatScore = data.threatScore || 0;
        const threatClass = threatScore > 80 ? 'high' : threatScore > 60 ? 'medium' : 'low';
        const mmsi = data.mmsi || 'Unknown';
        const aisStatus = data.aisStatus || '未知';
        const isSelected = window.selectedTrackingEventId === id;

        return `
            <div class="event-card tracking-card ${isSelected ? 'active' : ''}"
                 onclick="selectTrackingEvent('${id}')"
                 data-event-id="${id}">
                <div class="event-card-header">
                    <span class="event-id">${id.toUpperCase()}</span>
                    <span class="threat-badge threat-${threatClass}">${threatScore}</span>
                </div>
                <div class="event-info">
                    MMSI: ${mmsi}<br>
                    AIS 狀態: ${aisStatus}<br>
                    船舶類型: ${data.vesselType || '未知'}<br>
                    座標: ${data.lat?.toFixed(3) || 'N/A'}°N, ${data.lon?.toFixed(3) || 'N/A'}°E
                </div>
                <div class="event-status">
                    <div class="status-dot status-investigating"></div>
                    <span>追蹤中</span>
                </div>
            </div>
        `;
    }).join('');

    console.log(`✅ 已渲染 ${trackingEvents.length} 個追蹤事件`);

    // 驗證渲染結果
    setTimeout(() => {
        const container = document.querySelector('.events-container');
        console.log(`🔍 [renderTrackingEventsList] 渲染後驗證:`);
        console.log(`   container 存在:`, !!container);
        console.log(`   innerHTML 長度:`, container?.innerHTML.length || 0);
        console.log(`   子元素數量:`, container?.children.length || 0);
    }, 100);
}

// 渲染派遣事件列表
function renderMissionEventsList() {
    console.log(`🔍 [renderMissionEventsList] 開始渲染派遣事件列表`);

    const eventsContainer = document.querySelector('.events-container');
    if (!eventsContainer) {
        console.warn('⚠️ 找不到 events-container 元素');
        return;
    }

    // 從底部面板的 mission-list 獲取所有任務卡片
    const missionList = document.querySelector('.mission-list');
    console.log(`📦 [renderMissionEventsList] mission-list 元素:`, missionList);

    const missionCards = missionList ? missionList.querySelectorAll('.mission-card') : [];
    console.log(`📊 [renderMissionEventsList] 找到 ${missionCards.length} 個任務卡片`);

    if (missionCards.length === 0) {
        eventsContainer.innerHTML = `
            <div style="padding: 20px; text-align: center; color: #888;">
                暫無派遣事件<br><br>
                <small>任務會在船舶追蹤事件初始化後自動生成</small>
            </div>
        `;
        return;
    }

    // 解析任務卡片數據
    const missions = [];
    missionCards.forEach((card, index) => {
        const missionId = card.getAttribute('data-mission-id');
        const typeEl = card.querySelector('.mission-type');
        const statusEl = card.querySelector('.mission-status');
        const detailsEl = card.querySelector('.mission-details');
        const progressEl = card.querySelector('.progress-fill');

        // 解析任務詳情文本
        const detailsText = detailsEl ? detailsEl.textContent : '';
        const targetMatch = detailsText.match(/目標[：:]\s*([^\n]+)/);

        // 從 mission-type 中提取動作圖標和類型
        const typeText = typeEl ? typeEl.textContent.trim() : '';
        const missionType = typeText.replace(/^[\u{1F300}-\u{1F9FF}]\s*/u, ''); // 移除 emoji

        missions.push({
            id: missionId || `mission-${index}`,
            name: typeText || `任務 ${index + 1}`,
            type: missionType || '派遣',
            status: statusEl ? statusEl.textContent.trim() : '未知',
            target: targetMatch ? targetMatch[1].trim() : '未知',
            progress: progressEl ? parseInt(progressEl.style.width) || 0 : 0
        });

        console.log(`📋 [renderMissionEventsList] 解析任務 ${index + 1}:`, missions[missions.length - 1]);
    });

    // 渲染派遣卡片
    eventsContainer.innerHTML = missions.map((mission) => {
        const statusClass = mission.status === '已完成' ? 'completed' :
                           mission.status === '執行任務' || mission.status === '抵達' ? 'executing' :
                           mission.status === '派遣' ? 'dispatched' : 'scheduled';

        const statusColor = mission.status === '已完成' ? 'success' :
                           mission.status === '執行任務' || mission.status === '抵達' ? 'warning' : 'primary';

        return `
            <div class="event-card mission-card" data-mission-id="${mission.id}">
                <div class="event-card-header">
                    <span class="event-id">${mission.name}</span>
                    <span class="event-type-badge type-${statusColor}">${mission.status}</span>
                </div>
                <div class="event-info">
                    目標: ${mission.target}<br>
                    類型: ${mission.type}<br>
                    進度: ${mission.progress}%
                </div>
                <div class="event-status">
                    <div class="status-dot status-${statusClass}"></div>
                    <span>${mission.status}</span>
                </div>
            </div>
        `;
    }).join('');

    console.log(`✅ 已渲染 ${missions.length} 個派遣事件`);
}

// Tab 切換函數
function switchStatsTab(tabName) {
    console.log(`🔄 [switchStatsTab] 切換到 ${tabName} Tab`);

    // 檢查 events-container 是否存在
    const eventsContainer = document.querySelector('.events-container');
    console.log(`📦 [switchStatsTab] events-container 存在:`, !!eventsContainer);
    if (eventsContainer) {
        console.log(`   當前內容長度:`, eventsContainer.innerHTML.length);
    }

    // 更新 Tab 按鈕狀態
    document.querySelectorAll('.stats-tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');

    // 更新左側面板標題和選擇器顯示
    const sidebarTitle = document.getElementById('sidebarTitle');
    const areaEventSelector = document.getElementById('areaEventSelector');

    // 渲染對應的左側列表和右側統計
    switch (tabName) {
        case 'area':
            console.log(`📋 [switchStatsTab] 切換到區域事件 tab`);
            if (sidebarTitle) sidebarTitle.textContent = '可疑船隻列表';
            if (areaEventSelector) areaEventSelector.style.display = 'block';

            // 確定要顯示哪個區域事件
            let areaEventId = null;

            // 優先使用 currentEventId（如果它是區域事件）
            if (window.currentEventId) {
                const event = eventStorage.getEvent(window.currentEventId);
                if (event && event.type === 'area') {
                    areaEventId = window.currentEventId;
                }
            }

            // 如果 currentEventId 不是區域事件，從選擇器獲取
            if (!areaEventId && areaEventSelector) {
                areaEventId = areaEventSelector.value;
            }

            // 如果都沒有，嘗試使用第一個區域事件
            if (!areaEventId) {
                eventStorage.events.forEach((event, eventId) => {
                    if (!areaEventId && event.type === 'area') {
                        areaEventId = eventId;
                    }
                });
            }

            console.log(`   使用的區域事件 ID: ${areaEventId}`);

            // 渲染左側可疑船隻列表
            if (areaEventId) {
                renderSuspiciousVesselsList(areaEventId);
                // 確保選擇器同步
                if (areaEventSelector) areaEventSelector.value = areaEventId;
                window.currentEventId = areaEventId;
            } else {
                // 沒有任何區域事件
                const eventsContainer = document.querySelector('.events-container');
                if (eventsContainer) {
                    eventsContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #888;">暫無區域事件</div>';
                }
            }

            // 渲染右側區域統計
            renderAreaStatsTab();
            break;
        case 'tracking':
            console.log(`📋 [switchStatsTab] 切換到追蹤事件 tab`);
            if (sidebarTitle) sidebarTitle.textContent = '追蹤事件列表';
            if (areaEventSelector) areaEventSelector.style.display = 'none';

            // 渲染追蹤事件列表到左側
            renderTrackingEventsList();

            // 渲染右側內容
            if (window.selectedTrackingEventId) {
                console.log(`   已選中追蹤事件: ${window.selectedTrackingEventId}`);
                const storedEvent = eventStorage.getEvent(window.selectedTrackingEventId);
                if (storedEvent && storedEvent.type === 'vessel' && typeof VesselEventManager !== 'undefined') {
                    const detailsHtml = VesselEventManager.getVesselEventDetailsFromStorage(storedEvent);
                    if (detailsContent) detailsContent.innerHTML = detailsHtml;
                } else {
                    renderTrackingStatsTab();
                }
            } else {
                console.log(`   無選中追蹤事件，顯示統計資訊`);
                renderTrackingStatsTab();
            }
            break;
        case 'mission':
            if (sidebarTitle) sidebarTitle.textContent = '派遣事件列表';
            if (areaEventSelector) areaEventSelector.style.display = 'none';
            renderMissionEventsList();
            renderMissionStatsTab();
            break;
    }

    console.log(`✅ 已切換到 ${tabName} Tab`);
}

// 計算統計數據
function calculateStatistics() {
    const stats = {
        area: {
            totalVessels: 0,
            visibleVessels: 0,    // 明船（AIS 開啟）
            darkVessels: 0,        // 暗船（AIS 未開啟）
            highThreat: 0,         // 高風險（> 80）
            mediumThreat: 0,       // 中風險（60-80）
            lowThreat: 0,          // 低風險（≤ 60）
            areaInfo: null
        },
        tracking: {
            totalTracking: 0,
            visibleVessels: 0,
            darkVessels: 0,
            highThreat: 0,
            mediumThreat: 0,
            lowThreat: 0
        },
        mission: {
            totalMissions: 0,
            dispatching: 0,        // 派遣中
            completed: 0           // 已完成
        }
    };

    // 計算區域事件統計
    const currentEvent = window.currentEventId ? eventStorage.getEvent(window.currentEventId) : null;
    if (currentEvent && currentEvent.type === 'area') {
        // 構建區域資訊對象
        stats.area.areaInfo = {
            name: currentEvent.aoiName || '未命名區域',
            center: [currentEvent.centerLat, currentEvent.centerLon],
            radius: currentEvent.radius,
            radiusUnit: currentEvent.radiusUnit || '海里',
            monitorTimeRange: currentEvent.monitorTimeRange
        };

        const vessels = currentEvent.suspiciousVesselCandidatesData || [];
        stats.area.totalVessels = vessels.length;

        vessels.forEach(candidateData => {
            const vessel = candidateData.suspiciousVessel;
            const threatScore = vessel?.threatScore || 0;

            // AIS 狀態統計
            if (candidateData.aisStatus === '未開啟' || candidateData.aisStatus === 'No AIS') {
                stats.area.darkVessels++;
            } else {
                stats.area.visibleVessels++;
            }

            // 威脅等級統計
            if (threatScore > 80) {
                stats.area.highThreat++;
            } else if (threatScore > 60) {
                stats.area.mediumThreat++;
            } else {
                stats.area.lowThreat++;
            }
        });
    }

    // 計算追蹤事件統計
    eventStorage.events.forEach((event, eventId) => {
        if (event.type === 'vessel') {
            stats.tracking.totalTracking++;

            const threatScore = event.threatScore || 0;
            const aisStatus = event.aisStatus || '';

            // AIS 狀態統計
            if (aisStatus.includes('未開啟') || aisStatus === 'No AIS') {
                stats.tracking.darkVessels++;
            } else {
                stats.tracking.visibleVessels++;
            }

            // 威脅等級統計
            if (threatScore > 80) {
                stats.tracking.highThreat++;
            } else if (threatScore > 60) {
                stats.tracking.mediumThreat++;
            } else {
                stats.tracking.lowThreat++;
            }
        }
    });

    // 計算派遣事件統計（從 DOM 獲取）
    const missionList = document.querySelector('.mission-list');
    const missionCards = missionList ? missionList.querySelectorAll('.mission-card') : [];

    missionCards.forEach(card => {
        const statusEl = card.querySelector('.mission-status');
        const status = statusEl ? statusEl.textContent.trim() : '';

        stats.mission.totalMissions++;
        if (status === '已完成') {
            stats.mission.completed++;
        } else {
            stats.mission.dispatching++;
        }
    });

    return stats;
}

// 渲染區域事件 Tab
function renderAreaStatsTab() {
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsContent) return;

    // ⚡ 優化：使用 requestAnimationFrame 批量更新 DOM
    requestAnimationFrame(() => {
        const stats = calculateStatistics();
        const areaStats = stats.area;

        if (!areaStats.areaInfo) {
            detailsContent.innerHTML = `
                <div style="padding: 40px; text-align: center; color: #888;">
                    <div style="font-size: 48px; margin-bottom: 16px; opacity: 0.5;">📍</div>
                    <div>請選擇區域事件</div>
                </div>
            `;
            return;
        }

        const html = `
            <!-- 區域資訊 -->
            <div class="stat-section">
                <div class="stat-section-title">📍 區域資訊</div>
                <div class="stat-grid single-col" style="margin-bottom: 12px;">
                    <div class="stat-item primary">
                        <div class="stat-label">監控區域</div>
                        <div class="stat-value" style="font-size: 16px;">
                            ${areaStats.areaInfo.name}
                        </div>
                    </div>
                </div>
                <div class="stat-grid">
                    <div class="stat-item primary">
                        <div class="stat-label">中心座標</div>
                        <div class="stat-value" style="font-size: 14px;">
                            ${areaStats.areaInfo.center[0].toFixed(3)}°N<br>
                            ${areaStats.areaInfo.center[1].toFixed(3)}°E
                        </div>
                    </div>
                    <div class="stat-item primary">
                        <div class="stat-label">監控範圍</div>
                        <div class="stat-value">
                            ${areaStats.areaInfo.radius}<span class="unit">${areaStats.areaInfo.radiusUnit}</span>
                        </div>
                    </div>
                </div>
                ${areaStats.areaInfo.monitorTimeRange ? `
                    <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px; color: #b8c5d1;">
                        監控時間: ${areaStats.areaInfo.monitorTimeRange}
                    </div>
                ` : ''}
            </div>

            <!-- 船隻統計 -->
            <div class="stat-section">
                <div class="stat-section-title">🚢 船隻統計</div>
                <div class="stat-grid">
                    <div class="stat-item success">
                        <div class="stat-label">明船（AIS開啟）</div>
                        <div class="stat-value">${areaStats.visibleVessels}<span class="unit">艘</span></div>
                    </div>
                    <div class="stat-item warning">
                        <div class="stat-label">暗船（AIS未開啟）</div>
                        <div class="stat-value">${areaStats.darkVessels}<span class="unit">艘</span></div>
                    </div>
                </div>
            </div>

            <!-- 威脅統計 -->
            <div class="stat-section">
                <div class="stat-section-title">⚠️ 威脅統計</div>
                <div class="stat-grid">
                    <div class="stat-item danger">
                        <div class="stat-label">高風險（> 80）</div>
                        <div class="stat-value">${areaStats.highThreat}<span class="unit">艘</span></div>
                    </div>
                    <div class="stat-item warning">
                        <div class="stat-label">中風險（60-80）</div>
                        <div class="stat-value">${areaStats.mediumThreat}<span class="unit">艘</span></div>
                    </div>
                    <div class="stat-item success">
                        <div class="stat-label">低風險（≤ 60）</div>
                        <div class="stat-value">${areaStats.lowThreat}<span class="unit">艘</span></div>
                    </div>
                </div>
            </div>
        `;

        detailsContent.innerHTML = html;
    });
}

// 渲染單個追蹤事件詳情 (未使用)
// function renderTrackingEventDetails(eventId) {
//     const detailsContent = document.getElementById('detailsContent');
//     if (!detailsContent) return;

//     const event = eventStorage.getEvent(eventId);
//     if (!event || event.type !== 'vessel') {
//         detailsContent.innerHTML = '<div style="padding: 40px; text-align: center; color: #888;">請選擇追蹤事件</div>';
//         return;
//     }

//     const threatScore = event.threatScore || 0;
//     const threatClass = threatScore > 80 ? 'danger' : threatScore > 60 ? 'warning' : 'success';
//     const threatLabel = threatScore > 80 ? '高風險' : threatScore > 60 ? '中風險' : '低風險';

//     const html = `
//         <!-- 船隻基本資訊 -->
//         <div class="stat-section">
//             <div class="stat-section-title">🚢 船隻基本資訊</div>
//             <div class="stat-grid">
//                 <div class="stat-item primary">
//                     <div class="stat-label">MMSI</div>
//                     <div class="stat-value" style="font-size: 16px;">${event.mmsi || 'Unknown'}</div>
//                 </div>
//                 <div class="stat-item primary">
//                     <div class="stat-label">船舶類型</div>
//                     <div class="stat-value" style="font-size: 16px;">${event.vesselType || '未知'}</div>
//                 </div>
//             </div>
//             <div class="stat-grid" style="margin-top: 12px;">
//                 <div class="stat-item primary">
//                     <div class="stat-label">當前座標</div>
//                     <div class="stat-value" style="font-size: 14px;">
//                         ${event.lat?.toFixed(3) || 'N/A'}°N<br>
//                         ${event.lon?.toFixed(3) || 'N/A'}°E
//                     </div>
//                 </div>
//                 <div class="stat-item ${threatClass}">
//                     <div class="stat-label">威脅等級</div>
//                     <div class="stat-value">${threatScore}<span class="unit">分</span></div>
//                     <div style="font-size: 11px; margin-top: 4px; color: #b8c5d1;">${threatLabel}</div>
//                 </div>
//             </div>
//         </div>

//         <!-- AIS 資訊 -->
//         <div class="stat-section">
//             <div class="stat-section-title">📡 AIS 資訊</div>
//             <div class="stat-grid single-col">
//                 <div class="stat-item ${event.aisStatus?.includes('未開啟') || event.aisStatus === 'No AIS' ? 'danger' : 'success'}">
//                     <div class="stat-label">AIS 狀態</div>
//                     <div class="stat-value" style="font-size: 16px;">${event.aisStatus || '未知'}</div>
//                 </div>
//             </div>
//         </div>

//         <!-- RF 信號資訊 -->
//         ${event.rfId ? `
//         <div class="stat-section">
//             <div class="stat-section-title">📻 RF 信號資訊</div>
//             <div class="stat-grid">
//                 <div class="stat-item primary">
//                     <div class="stat-label">RF ID</div>
//                     <div class="stat-value" style="font-size: 14px;">${event.rfId}</div>
//                 </div>
//                 ${event.frequency ? `
//                 <div class="stat-item primary">
//                     <div class="stat-label">頻率</div>
//                     <div class="stat-value" style="font-size: 14px;">${event.frequency}</div>
//                 </div>
//                 ` : ''}
//             </div>
//         </div>
//         ` : ''}

//         <!-- 追蹤狀態 -->
//         <div class="stat-section">
//             <div class="stat-section-title">🎯 追蹤狀態</div>
//             <div class="stat-grid single-col">
//                 <div class="stat-item primary">
//                     <div class="stat-label">事件狀態</div>
//                     <div class="stat-value" style="font-size: 16px;">
//                         ${event.status === 'completed' ? '已結束' : '追蹤中'}
//                     </div>
//                 </div>
//             </div>
//             ${event.trackPoints && event.trackPoints.length > 0 ? `
//                 <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px; color: #b8c5d1;">
//                     軌跡點數: ${event.trackPoints.length} 個
//                 </div>
//             ` : ''}
//         </div>
//     `;

//     detailsContent.innerHTML = html;
// }

// 渲染追蹤事件 Tab（統計視圖）
function renderTrackingStatsTab() {
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsContent) return;

    const stats = calculateStatistics();
    const trackingStats = stats.tracking;

    const html = `
        <!-- 追蹤概況 -->
        <div class="stat-section">
            <div class="stat-section-title">🎯 追蹤概況</div>
            <div class="stat-grid single-col">
                <div class="stat-item primary">
                    <div class="stat-label">追蹤筆數</div>
                    <div class="stat-value">${trackingStats.totalTracking}<span class="unit">筆</span></div>
                </div>
            </div>
        </div>

        <!-- 船隻統計 -->
        <div class="stat-section">
            <div class="stat-section-title">🚢 船隻統計</div>
            <div class="stat-grid">
                <div class="stat-item success">
                    <div class="stat-label">明船（AIS開啟）</div>
                    <div class="stat-value">${trackingStats.visibleVessels}<span class="unit">艘</span></div>
                </div>
                <div class="stat-item warning">
                    <div class="stat-label">暗船（AIS未開啟）</div>
                    <div class="stat-value">${trackingStats.darkVessels}<span class="unit">艘</span></div>
                </div>
            </div>
        </div>

        <!-- 威脅統計 -->
        <div class="stat-section">
            <div class="stat-section-title">⚠️ 威脅統計</div>
            <div class="stat-grid">
                <div class="stat-item danger">
                    <div class="stat-label">高風險（> 80）</div>
                    <div class="stat-value">${trackingStats.highThreat}<span class="unit">艘</span></div>
                </div>
                <div class="stat-item warning">
                    <div class="stat-label">中風險（60-80）</div>
                    <div class="stat-value">${trackingStats.mediumThreat}<span class="unit">艘</span></div>
                </div>
                <div class="stat-item success">
                    <div class="stat-label">低風險（≤ 60）</div>
                    <div class="stat-value">${trackingStats.lowThreat}<span class="unit">艘</span></div>
                </div>
            </div>
        </div>
    `;

    detailsContent.innerHTML = html;
}

// 渲染派遣事件 Tab
function renderMissionStatsTab() {
    const detailsContent = document.getElementById('detailsContent');
    if (!detailsContent) return;

    const stats = calculateStatistics();
    const missionStats = stats.mission;

    const html = `
        <!-- 派遣概況 -->
        <div class="stat-section">
            <div class="stat-section-title">🚁 派遣概況</div>
            <div class="stat-grid single-col">
                <div class="stat-item primary">
                    <div class="stat-label">派遣筆數</div>
                    <div class="stat-value">${missionStats.totalMissions}<span class="unit">筆</span></div>
                </div>
            </div>
        </div>

        <!-- 派遣狀況 -->
        <div class="stat-section">
            <div class="stat-section-title">📊 派遣狀況</div>
            <div class="stat-grid">
                <div class="stat-item warning">
                    <div class="stat-label">派遣中</div>
                    <div class="stat-value">${missionStats.dispatching}<span class="unit">筆</span></div>
                </div>
                <div class="stat-item success">
                    <div class="stat-label">已完成</div>
                    <div class="stat-value">${missionStats.completed}<span class="unit">筆</span></div>
                </div>
            </div>
        </div>
    `;

    detailsContent.innerHTML = html;
}

// 更新詳情面板內容
function updateDetailsPanel(eventId) {
    const detailsTitle = document.getElementById('detailsTitle');
    const detailsSubtitle = document.getElementById('detailsSubtitle');
    const detailsContent = document.getElementById('detailsContent');

    // 從儲存中取得事件資料
    const storedEvent = eventStorage.getEvent(eventId);

    let data;
    if (storedEvent) {
        // 使用儲存的資料生成詳情
        const eventIdUpper = eventId.toUpperCase();

        switch (storedEvent.type) {
            case 'area':
                data = {
                    title: `${eventIdUpper} 事件詳情`,
                    subtitle: `區域監控事件`,
                    content: AreaEventManager.getAreaEventDetailsFromStorage(storedEvent)
                };
                break;
            case 'vessel':
                data = {
                    title: `${eventIdUpper} 事件詳情`,
                    subtitle: `船舶追蹤事件${storedEvent.status === 'completed' ? ' | 已結束' : ''}`,
                    content: VesselEventManager.getVesselEventDetailsFromStorage(storedEvent)
                };
                // 顯示船舶歷史軌跡
                if (window.historyTrackManager && storedEvent.trackPoints) {
                    console.log(`🔵 [script.js] 呼叫 displayHistoryTrack，事件ID: ${storedEvent.id}`);
                    window.historyTrackManager.displayHistoryTrack(storedEvent);
                }
                break;
        }
    }

    detailsTitle.textContent = data.title;
    detailsSubtitle.textContent = data.subtitle;
    detailsContent.innerHTML = data.content;
}

// 從區域監控建立船舶追蹤事件 (onclick)
// @param {string} rfId - RF 信號 ID
// @param {boolean} autoSwitch - 是否自動跳轉到新建立的船舶事件（預設 true）
async function createVesselEventFromArea(rfId, autoSwitch = true) {
    console.log(`🚢 開始建立船舶追蹤事件，RF ID: ${rfId}, 自動跳轉: ${autoSwitch}`);
    
    const eventId = `VESSEL-${String(++window.eventCounter).padStart(3, '0')}`;
    const eventIdLowerCase = eventId.toLowerCase();

    // 將該事件ID添加到創建中的集合
    creatingEventIds.add(eventIdLowerCase);

    // 獲取當前區域監控事件的資料
    const currentAreaEvent = eventStorage.getEvent(window.currentEventId);
    if (!currentAreaEvent || currentAreaEvent.type !== 'area') {
        console.error('❌ 無法從非區域監控事件建立船舶追蹤');
        creatingEventIds.delete(eventIdLowerCase);
        return;
    }

    console.log(`📋 來源區域事件:`, currentAreaEvent);

    // 從區域事件中提取指定可疑船隻候選的數據
    let suspiciousVesselData = null;
    let vesselCandidate = null;
    
    if (currentAreaEvent.suspiciousVesselCandidatesData) {
        suspiciousVesselData = currentAreaEvent.suspiciousVesselCandidatesData.find(data => data.rfId === rfId);
        console.log(`🔍 找到的可疑船隻基礎資料:`, suspiciousVesselData);
        
        if (suspiciousVesselData) {
            // 使用已儲存的可疑船隻資訊(包含固定的 MMSI 和威脅分數)
            if (suspiciousVesselData.suspiciousVessel) {
                vesselCandidate = suspiciousVesselData.suspiciousVessel;
                console.log(`✅ 使用已儲存的可疑船隻候選資訊 (MMSI: ${vesselCandidate.vesselMmsi}, 威脅分數: ${vesselCandidate.threatScore})`);
            } else {
                console.warn(`⚠️ 未找到已儲存的可疑船隻資訊,重新生成 (MMSI: ${vesselCandidate?.vesselMmsi})`);
            }
            console.log(`🎯 最終使用的可疑船隻候選資訊:`, vesselCandidate);
        }
    }

    if (!suspiciousVesselData) {
        console.error(`❌ 無法找到 RF ID ${rfId} 對應的可疑船隻資料`);
        console.error(`📊 當前區域事件的 suspiciousVesselCandidatesData:`, currentAreaEvent.suspiciousVesselCandidatesData);
        creatingEventIds.delete(eventIdLowerCase);
        return;
    }

    // 從當前區域事件提取數據來建立船舶追蹤
    const currentTime = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
    
    // 使用可疑船隻的 MMSI 或生成新的
    const mmsi = vesselCandidate?.vesselMmsi || `416${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    
    // 🆕 優先使用已在創建區域事件時初始化的威脅分數
    // 優先順序: candidateData.threatScore > vesselCandidate.threatScore > 隨機生成(70-85)
    const threatScore = suspiciousVesselData.threatScore || vesselCandidate?.threatScore || Math.floor(Math.random() * 16) + 70;
    
    console.log(`🎯 威脅分數來源: ${suspiciousVesselData.threatScore ? 'candidateData' : (vesselCandidate?.threatScore ? 'vesselCandidate' : '隨機生成')} = ${threatScore}`);

    // 從 seaDotManager 獲取額外的 RF 信號資訊（如果可用）
    let seaDotInfo = null;
    if (typeof window.seaDotManager !== 'undefined') {
        seaDotInfo = window.seaDotManager.getDotByRFId(rfId);
        console.log(`🛰️ SeaDot 資訊:`, seaDotInfo);
    }

    // 直接從 sourceSeaDot 獲取原始精確座標
    if (!suspiciousVesselData.sourceSeaDot || 
        suspiciousVesselData.sourceSeaDot.lat === undefined || 
        suspiciousVesselData.sourceSeaDot.lon === undefined) {
        console.error(`❌ 缺少 sourceSeaDot 座標資訊`);
        creatingEventIds.delete(eventIdLowerCase);
        return;
    }
    
    const lat = suspiciousVesselData.sourceSeaDot.lat;
    const lon = suspiciousVesselData.sourceSeaDot.lon;
    const preciseCoordinates = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
    console.log(`📍 使用原始精確座標: lat=${lat}, lon=${lon} -> ${preciseCoordinates}`);

    // === 先生成船舶歷史軌跡點 ===
    let trackPoints = null;
    try {
        if (window.trackPointGenerator) {
            // 使用統一的軌跡生成器
            const vessel = {
                mmsi: vesselCandidate?.mmsi || mmsi,
                vesselType: vesselCandidate?.vesselType || '不明',
                lat: vesselCandidate?.lat || lat,
                lon: vesselCandidate?.lon || lon
            };

            console.log(`🔧 準備生成軌跡點，vessel 資料:`, vessel);

            // 使用 mock 資料（開發模式）
            trackPoints = await window.trackPointGenerator.generateTrackPoints(vessel, {
                source: 'mock',
                eventId: eventId
            });

            console.log(`✅ 為船舶事件 ${eventId} 生成了軌跡 (${trackPoints.length} 個點)`);
        } else {
            console.warn(`⚠️ trackPointGenerator 不可用，無法生成軌跡點`);
        }
    } catch (error) {
        console.error(`❌ 生成軌跡點失敗:`, error);
        trackPoints = null;
    }

    // === 計算遺漏的 AIS 發送點 ===
    let missingAISPoints = [];
    if (trackPoints && trackPoints.length > 0 && window.vesselDataGenerator) {
        const vesselType = vesselCandidate?.vesselType || '不明';
        missingAISPoints = window.vesselDataGenerator.calculateMissingAISPoints(trackPoints, vesselType);
        console.log(`📡 為 ${vesselType} 計算了 ${missingAISPoints.length} 個遺漏的 AIS 點`);
        
        // 詳細輸出遺漏點信息
        if (missingAISPoints.length > 0) {
            console.log(`🔴 遺漏 AIS 點詳細信息:`);
            missingAISPoints.forEach((point, index) => {
                const coordinates = formatCoordinates(point.lat, point.lon);
                console.log(`  ${index + 1}. 位置: ${coordinates}, 時間: ${point.timestamp}, 速度: ${point.estimatedSpeed}節`);
            });
        } else {
            console.log(`✅ 沒有發現遺漏的 AIS 點 - 軌跡點間隔正常`);
        }
    }

    // === 使用軌跡點計算威脅分數 ===
    let threatScore;
    if (trackPoints && window.vesselDataGenerator && typeof window.vesselDataGenerator.calculateThreatScoreByFormula === 'function') {
        const vesselType = vesselCandidate?.vesselType || '不明';
        threatScore = window.vesselDataGenerator.calculateThreatScoreByFormula(lat, lon, trackPoints, vesselType);
        console.log(`✅ 使用軌跡點資料計算威脅分數: ${threatScore}`);
    } else {
        // 降級處理：使用原有邏輯
        threatScore = vesselCandidate?.threatScore || Math.floor(Math.random() * 16) + 70;
        console.log(`⚠️ 使用降級邏輯計算威脅分數: ${threatScore}`);
    }

    // 建立完整的船舶事件資料，整合所有可用資訊
    let eventData = {
        id: eventId,
        type: 'vessel',
        mmsi: mmsi,
        coordinates: preciseCoordinates,
        vesselName: vesselCandidate?.vesselType || '未知船舶',
        vesselType: vesselCandidate?.vesselType || '不明',
        threatScore: threatScore,
        createTime: currentTime,
        status: 'investigating',
        sourceAreaEvent: currentAreaEvent.id,
        aoiName: currentAreaEvent.aoiName,
        rfId: rfId,
        
        // === RF 信號資訊 ===
        frequency: suspiciousVesselData.frequency || seaDotInfo?.frequency || '檢測中',
        signalStrength: suspiciousVesselData.strength || seaDotInfo?.signalStrength || '檢測中',
        
        // 從 seaDotInfo 補充更多 RF 信號細節（如果可用）
        timestamp_utc: seaDotInfo?.timestamp_utc || new Date().toISOString(),
        latitude_deg: seaDotInfo?.lat || suspiciousVesselData.coordinates.match(/(\d+\.\d+)°N/)?.[1] || '檢測中',
        longitude_deg: seaDotInfo?.lon || suspiciousVesselData.coordinates.match(/(\d+\.\d+)°E/)?.[1] || '檢測中',
        accuracy_level: seaDotInfo?.accuracy_level || '標準',
        pulses_duration_ns: seaDotInfo?.pulses_duration_ns || Math.floor(Math.random() * 100) + 50,
        pulses_repetition_frequency_hz: seaDotInfo?.pulses_repetition_frequency_hz || Math.floor(Math.random() * 1000) + 500,
        waveform: seaDotInfo?.waveform || '正弦波',
        
        // === AIS 狀態 ===
        aisStatus: vesselCandidate?.aisStatus || suspiciousVesselData.aisStatus || '未開啟',
        
        // === 可疑船隻資訊 ===
        distance: vesselCandidate?.distance,
        
        // 保存完整的來源資料以供追溯
        _sourceData: {
            suspiciousVesselData: suspiciousVesselData,
            vesselCandidate: vesselCandidate,
            seaDotInfo: seaDotInfo
        },
        
        trackPoints: trackPoints, // 已生成的軌跡點
        missingAISPoints: missingAISPoints // 計算出的遺漏 AIS 發送點
    };

    console.log(`📦 建立的船舶事件完整資料:`, eventData);

    // 儲存船舶追蹤事件資料到 eventStorage
    eventStorage.saveEvent(eventId.toLowerCase(), eventData);
    console.log(`💾 船舶事件已儲存到 eventStorage`);

    // 準備顯示資訊（始終顯示威脅分數）
    const displayInfo = {
        content: `MMSI: ${eventData.mmsi}<br>座標: ${eventData.coordinates}<br>AIS狀態: ${eventData.aisStatus}<br>威脅分數: ${eventData.threatScore}`,
        updateData: {
            mmsi: eventData.mmsi,
            coordinates: eventData.coordinates,
            aisStatus: eventData.aisStatus,
            threatScore: eventData.threatScore,
        }
    };
    
    console.log(`📋 事件卡顯示 - MMSI: ${eventData.mmsi}, 威脅分數: 分析中 → ${eventData.threatScore}`);

    // 使用統一的事件卡建立函數
    createEventCard(eventId, 'vessel', eventData, displayInfo);
    
    // 將地圖上的 RF 信號點標記為正在追蹤（黃色）
    if (window.seaDotManager && typeof window.seaDotManager.markRFSignalAsTracked === 'function') {
        const marked = window.seaDotManager.markRFSignalAsTracked(rfId);
        if (marked) {
            console.log(`🟡 已將地圖上的 RF 信號 ${rfId} 標記為正在追蹤（黃色）`);
        }
    }
    
    // 從來源區域事件中移除已建立船舶追蹤的可疑船隻候選
    if (currentAreaEvent.suspiciousVesselCandidates) {
        const updatedCandidates = currentAreaEvent.suspiciousVesselCandidates.filter(candidate => candidate !== rfId);
        const updatedCandidatesData = currentAreaEvent.suspiciousVesselCandidatesData.filter(data => data.rfId !== rfId);

        eventStorage.updateEvent(window.currentEventId, {
            suspiciousVesselCandidates: updatedCandidates,
            suspiciousVesselCandidatesData: updatedCandidatesData
        });

        console.log(`🗑️ 已從區域事件移除可疑船隻 ${rfId}`);

        // 更新區域事件的詳情面板
        setTimeout(() => {
            if (window.currentEventId === currentAreaEvent.id) {
                updateDetailsPanel(window.currentEventId);
                console.log(`🔄 已更新區域事件詳情面板`);
            }
        }, 2000);
    }

    console.log(`✅ 船舶追蹤事件 ${eventId} 已從區域監控事件 ${currentAreaEvent.id} 的可疑船隻 ${rfId} 建立完成`);
    console.log(`📊 事件摘要 - MMSI: ${mmsi}, 威脅分數: ${threatScore}, AIS: ${eventData.aisStatus}`);

    // 只有在 autoSwitch 為 true 時才自動跳轉到新建立的船舶事件
    if (autoSwitch) {
        setTimeout(() => {
            const newEventCard = document.querySelector(`[data-event-id="${eventIdLowerCase}"]`) ||
                                Array.from(document.querySelectorAll('.event-card')).find(card =>
                                    card.getAttribute('onclick')?.includes(eventIdLowerCase)
                                );

            if (newEventCard) {
                console.log(`🎯 自動跳轉到新建立的船舶事件: ${eventId}`);
                selectEvent(newEventCard, eventIdLowerCase);
            } else {
                console.warn(`⚠️ 找不到新建立的事件卡: ${eventId}`);
            }
        }, 3500); // 等待事件卡建立完成（3秒狀態更新 + 0.5秒緩衝）
    } else {
        console.log(`⏸️ 不自動跳轉，保持當前視圖`);
    }
}

/**
 * 從 RF 信號點直接建立船舶追蹤事件
 * @param {string} rfId - RF 信號 ID
 * @param {string} coordinates - 座標字串 (格式: "24.123°N, 121.456°E")
 */
async function createVesselEventFromRFSignal(rfId, coordinates) {
    console.log(`🚢 [新功能] 從 RF 信號直接建立船舶追蹤事件`);
    console.log(`📡 RF ID: ${rfId}`);
    console.log(`📍 座標: ${coordinates}`);
    
    // 驗證 rfId
    if (!rfId || rfId === 'undefined' || rfId === 'null' || rfId.trim() === '') {
        console.error('❌ RF ID 無效:', rfId);
        alert('RF 信號 ID 無效，無法建立事件');
        return;
    }
    
    // 生成新的船舶事件 ID
    const eventId = `VESSEL-${String(++window.eventCounter).padStart(3, '0')}`;
    const eventIdLowerCase = eventId.toLowerCase();
    
    // 將該事件ID添加到創建中的集合
    creatingEventIds.add(eventIdLowerCase);
    
    // 解析座標
    const coordMatch = coordinates.match(/([\d.]+)°N,\s*([\d.]+)°E/);
    if (!coordMatch) {
        console.error('❌ 無法解析座標格式');
        creatingEventIds.delete(eventIdLowerCase);
        alert('座標格式錯誤，無法建立事件');
        return;
    }
    
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    
    // 從 seaDotManager 獲取 RF 信號詳細資訊
    let seaDotInfo = null;
    let aisStatus = '未知'; // 預設值
    
    if (typeof window.seaDotManager !== 'undefined') {
        seaDotInfo = window.seaDotManager.getDotByRFId(rfId);
        console.log(`🛰️ SeaDot 資訊:`, seaDotInfo);
        
        // 從多個可能的來源提取 AIS 狀態
        if (seaDotInfo) {
            // 優先順序：display.status > trackPointData.status > status > 從其他屬性推斷
            const displayStatus = seaDotInfo.display?.status;
            const trackPointStatus = seaDotInfo.trackPointData?.status;
            const directStatus = seaDotInfo.status;
            
            const rawStatus = displayStatus || trackPointStatus || directStatus;
            
            console.log(`🔍 [AIS 狀態偵測] 原始狀態值:`, {
                displayStatus,
                trackPointStatus,
                directStatus,
                rawStatus
            });
            
            if (rawStatus) {
                // 更完整的狀態映射邏輯
                const normalizedStatus = String(rawStatus).toLowerCase();
                
                if (normalizedStatus === 'no ais' || normalizedStatus === '未開啟') {
                    aisStatus = '未開啟';
                } else if (normalizedStatus === 'ais' || normalizedStatus === '已開啟') {
                    aisStatus = '已開啟';
                } else if (normalizedStatus === 'unknown' || normalizedStatus === '未知') {
                    aisStatus = '未知';
                } else {
                    // 對於其他未知狀態，嘗試判斷
                    console.warn(`⚠️ 未知的 AIS 狀態: "${rawStatus}"，使用預設值`);
                    aisStatus = '未開啟';
                }
                
                console.log(`📡 AIS 狀態來自 SeaDot.${displayStatus ? 'display.status' : trackPointStatus ? 'trackPointData.status' : 'status'}: "${rawStatus}" → "${aisStatus}"`);
            } else {
                // 如果沒有 status，嘗試從其他屬性推斷
                console.log(`⚠️ SeaDot 沒有明確的 status 屬性，使用預設值: ${aisStatus}`);
            }
            
            // 同步更新 seaDotInfo 的 status（確保一致性）
            if (!seaDotInfo.status && aisStatus) {
                const mappedStatus = aisStatus === '已開啟' ? 'AIS' : aisStatus === '未開啟' ? 'No AIS' : 'unknown';
                seaDotInfo.status = mappedStatus;
                console.log(`✅ 已將 SeaDot 的 status 設定為: ${mappedStatus}`);
            }
        } else {
            console.log(`⚠️ 找不到 RF ID ${rfId} 對應的 SeaDot，使用預設 AIS 狀態: ${aisStatus}`);
        }
    } else {
        console.log(`⚠️ SeaDotManager 不可用，使用預設 AIS 狀態: ${aisStatus}`);
    }
    
    // === 模擬生成船舶身份資訊 ===
    const vesselTypes = ['貨輪', '漁船'];
    const vesselType = vesselTypes[Math.floor(Math.random() * vesselTypes.length)];
    
    // 生成 MMSI (Maritime Mobile Service Identity)
    // 台灣船舶 MMSI 以 416 開頭
    const mmsi = `416${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
    
    // 🆕 生成威脅分數 (60-90範圍,與區域監控事件初始化的範圍保持一致)
    const threatScore = Math.floor(Math.random() * 31) + 60; // 60-90
    
    // 注意：aisStatus 已在上方從 seaDotInfo 提取並設定，此處直接使用
    console.log(`📡 最終使用的 AIS 狀態: ${aisStatus}${seaDotInfo ? ' (來自 SeaDot)' : ' (預設值)'}`);
    
    // 模擬船舶名稱
    const vesselNamePrefix = ['海洋', '太平洋', '東海', '福爾摩沙', '台灣'];
    const vesselNameSuffix = ['號', '輪', '星號', '之星'];
    const vesselName = `${vesselNamePrefix[Math.floor(Math.random() * vesselNamePrefix.length)]}${vesselNameSuffix[Math.floor(Math.random() * vesselNameSuffix.length)]}`;
    
    // 取得當前時間
    const currentTime = new Date().toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' });
    
    // 建立完整的船舶事件資料
    const eventData = {
        id: eventId,
        type: 'vessel',
        mmsi: mmsi,
        coordinates: coordinates,
        vesselName: vesselName,
        vesselType: vesselType,
        threatScore: threatScore,
        createTime: currentTime,
        status: 'investigating',
        investigationReason: ``,
        sourceAreaEvent: null, // 直接從 RF 信號建立，無來源區域事件
        aoiName: null,
        rfId: rfId,
        
        // === RF 信號資訊 ===
        frequency: seaDotInfo?.frequency || `${(400 + Math.random() * 100).toFixed(2)} MHz`,
        signalStrength: seaDotInfo?.signalStrength || `${(-80 + Math.random() * 20).toFixed(1)} dBm`,
        timestamp_utc: seaDotInfo?.timestamp_utc || new Date().toISOString(),
        latitude_deg: seaDotInfo?.lat || lat,
        longitude_deg: seaDotInfo?.lon || lon,
        accuracy_level: seaDotInfo?.accuracy_level || '標準',
        pulses_duration_ns: seaDotInfo?.pulses_duration_ns || Math.floor(Math.random() * 100) + 50,
        pulses_repetition_frequency_hz: seaDotInfo?.pulses_repetition_frequency_hz || Math.floor(Math.random() * 1000) + 500,
        waveform: seaDotInfo?.waveform || '正弦波',
        
        // === AIS 狀態 ===
        aisStatus: aisStatus,
        
        // === 模擬船舶資訊 ===
        distance: `${(Math.random() * 50 + 10).toFixed(1)} km`, // 10-60 km
        
        // 保存完整的來源資料以供追溯
        _sourceData: {
            rfSignalDirect: true,
            seaDotInfo: seaDotInfo,
            generatedVesselInfo: {
                vesselName: vesselName,
                vesselType: vesselType,
                mmsi: mmsi,
                threatScore: threatScore,
                aisStatus: aisStatus
            }
        },
        
        trackPoints: null, // 待生成
        missingAISPoints: [] // 待計算
    };

    // === 生成船舶歷史軌跡點 ===
    try {
        if (window.trackPointGenerator) {
            // 使用統一的軌跡生成器
            const vessel = {
                mmsi: mmsi,
                vesselType: vesselType,
                lat: lat,
                lon: lon
            };

            console.log(`🔧 準備生成軌跡點，vessel 資料:`, vessel);

            // 使用 mock 資料（開發模式）
            eventData.trackPoints = await window.trackPointGenerator.generateTrackPoints(vessel, {
                source: 'mock',
                eventId: eventId
            });

            console.log(`✅ 為船舶事件 ${eventId} 生成了軌跡 (${eventData.trackPoints.length} 個點)`);

            // === 計算遺漏的 AIS 發送點 ===
            if (eventData.trackPoints && eventData.trackPoints.length > 0 && window.vesselDataGenerator) {
                eventData.missingAISPoints = window.vesselDataGenerator.calculateMissingAISPoints(eventData.trackPoints, vesselType);
                console.log(`📡 為 ${vesselType} 計算了 ${eventData.missingAISPoints.length} 個遺漏的 AIS 點`);
                
                // 詳細輸出遺漏點信息
                if (eventData.missingAISPoints.length > 0) {
                    console.log(`🔴 遺漏 AIS 點詳細信息:`);
                    eventData.missingAISPoints.forEach((point, index) => {
                        const coordinates = formatCoordinates(point.lat, point.lon);
                        console.log(`  ${index + 1}. 位置: ${coordinates}, 時間: ${point.timestamp}, 速度: ${point.estimatedSpeed}節`);
                    });
                } else {
                    console.log(`✅ 沒有發現遺漏的 AIS 點 - 軌跡點間隔正常`);
                }
            }
        } else {
            console.warn(`⚠️ trackPointGenerator 不可用，無法生成軌跡點`);
        }
    } catch (error) {
        console.error(`❌ 生成軌跡點失敗:`, error);
        eventData.trackPoints = null;
        eventData.missingAISPoints = [];
    }
    
    console.log(`📦 建立的船舶事件完整資料:`, eventData);
    
    // 儲存船舶追蹤事件資料到 eventStorage
    eventStorage.saveEvent(eventId.toLowerCase(), eventData);
    console.log(`💾 船舶事件已儲存到 eventStorage`);
    
    // 準備顯示資訊（始終顯示威脅分數）
    const displayInfo = {
        content: `MMSI: ${eventData.mmsi}<br>座標: ${eventData.coordinates}<br>AIS狀態: ${aisStatus}<br>威脅分數: ${eventData.threatScore}`,
        updateData: {
            mmsi: eventData.mmsi,
            coordinates: eventData.coordinates,
            aisStatus: aisStatus,
            threatScore: eventData.threatScore,
        }
    };
    
    console.log(`📋 事件卡顯示 - MMSI: ${eventData.mmsi}, 座標: ${eventData.coordinates}, 威脅分數: ${eventData.threatScore}`);
    
    // 使用統一的事件卡建立函數
    createEventCard(eventId, 'vessel', eventData, displayInfo);
    
    // 將地圖上的 RF 信號點標記為正在追蹤（黃色）
    if (window.seaDotManager && typeof window.seaDotManager.markRFSignalAsTracked === 'function') {
        const marked = window.seaDotManager.markRFSignalAsTracked(rfId);
        if (marked) {
            console.log(`🟡 已將地圖上的 RF 信號 ${rfId} 標記為正在追蹤（黃色）`);
        }
    }
    
    // 關閉所有打開的彈窗
    if (mainMap) {
        mainMap.closePopup();
        console.log(`✅ 已關閉 RF 信號點彈窗`);
    }
    
    // 更新該 RF 信號點的彈窗內容（移除建立按鈕）
    if (window.seaDotManager && typeof window.seaDotManager.updateRFSignalPopup === 'function') {
        window.seaDotManager.updateRFSignalPopup(rfId);
        console.log(`✅ 已更新 RF 信號 ${rfId} 的彈窗內容`);
    }
        
    console.log(`✅ 船舶追蹤事件 ${eventId} 已從 RF 信號 ${rfId} 建立完成`);
    console.log(`📊 事件摘要 - MMSI: ${mmsi}, 船名: ${vesselName}, 威脅分數: ${threatScore}, AIS: ${aisStatus}`);
    
    // 移除創建中標記
    creatingEventIds.delete(eventIdLowerCase);
}

// -----------

// 全域橋樑函數：跳轉到歷史軌跡點 (onclick)
function jumpToHistoryPoint(hoursBack) {
    console.log(`🔵 [script.js] jumpToHistoryPoint 被呼叫, hoursBack: ${hoursBack}`);

    // 檢查 VesselEventManager 是否存在
    if (typeof VesselEventManager === 'undefined') {
        console.error('❌ VesselEventManager 未定義');
        return;
    }

    // 使用重構後的 VesselEventManager 類別方法
    VesselEventManager.jumpToHistoryPoint(hoursBack);
}

// 選擇行動 -> Confirm Button (onclick)
function selectAction(action, element) {
    selectedAction = action;

    // Check if this is from action modal or vessel details
    if (element && element.classList.contains('action-btn')) {
        // This is from vessel details - handle action-btn
        const parentContainer = element.closest('.action-grid');
        if (parentContainer) {
            // Clear all action-btn selections in this container
            parentContainer.querySelectorAll('.action-btn').forEach(btn => {
                btn.classList.remove('selected');
            });
            // Select the clicked button
            element.classList.add('selected');
        }
    } else {
        // This is from action modal - handle type-option
        document.querySelectorAll('#actionModal .type-option').forEach(option => {
            option.classList.remove('selected');
        });

        const targetElement = element || event.target.closest('.type-option');
        if (targetElement) {
            targetElement.classList.add('selected');
        }
    }

    // 啟用執行按鈕
    const executeBtn = document.getElementById('executeActionBtn');
    if (executeBtn) {
        executeBtn.disabled = false;
    }
}

// 切換時間選擇器顯示(onchange)
function toggleTimeSelector() {
    const scheduledPicker = document.getElementById('scheduledTimePicker');
    const scheduledRadio = document.querySelector('input[name="executeTime"][value="scheduled"]');

    if (scheduledRadio && scheduledRadio.checked) {
        scheduledPicker.style.display = 'block';
        // 設置默認時間為 3 小時後（符合最小時間粒度要求）
        const defaultTime = new Date(Date.now() + 3 * 60 * 60 * 1000);
        document.getElementById('scheduledDateTime').value = defaultTime.toISOString().slice(0, 16);
    } else {
        scheduledPicker.style.display = 'none';
    }
}

// 拒絕行動 (onclick)
function rejectAction() {
    return 'reject';
}

// 結束船舶事件
function completeVesselEvent(eventId) {
    console.log(`📋 開始結束事件: ${eventId}`);

    const eventData = window.eventStorage.getEvent(eventId);

    if (!eventData) {
        console.error(`❌ 找不到事件: ${eventId}`);
        alert('找不到該事件');
        return;
    }

    if (eventData.status === 'completed') {
        alert('該事件已經結束');
        return;
    }

    // 顯示確認對話框
    const confirmClose = confirm(`確定要結束事件 ${eventId.toUpperCase()} 嗎？\n\n結束後將無法繼續追蹤此船舶。`);

    if (!confirmClose) {
        console.log('❌ 用戶取消結束事件');
        return;
    }

    // 更新事件狀態
    const completedTime = new Date().toISOString();
    window.eventStorage.updateEvent(eventId, {
        status: 'completed',
        completedTime: completedTime
    });

    // 🆕 如果是區域監控事件，停止定期更新
    if (eventData.type === 'area' && window.areaEventUpdateManager) {
        console.log(`🛑 停止區域監控事件 ${eventId} 的定期更新`);
        window.areaEventUpdateManager.stopEventUpdates(eventId);
    }

    // 更新事件卡樣式
    const eventCard = document.querySelector(`[data-event-id="${eventId}"]`) ||
                      Array.from(document.querySelectorAll('.event-card')).find(card =>
                          card.getAttribute('onclick')?.includes(eventId)
                      );

    if (eventCard) {
        eventCard.classList.add('completed');

        const statusDot = eventCard.querySelector('.status-dot');
        const statusText = eventCard.querySelector('.event-status span');

        if (statusDot) statusDot.className = 'status-dot status-completed';
        if (statusText) statusText.textContent = '已結束';
    }

    // 清除地圖上的歷史軌跡
    if (window.historyTrackManager) {
        window.historyTrackManager.clearHistoryTrack();
    }

    // 更新詳情面板顯示已結束狀態
    updateDetailsPanel(eventId);

    // 更新 Tab 計數
    updateEventCounts();

    // 顯示成功訊息
    const completedTimeStr = new Date(completedTime).toLocaleString('zh-TW', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });

    alert(`✅ 事件 ${eventId.toUpperCase()} 已成功結束\n\n結束時間: ${completedTimeStr}`);

    console.log(`✅ 事件 ${eventId} 已標記為完成，完成時間: ${completedTimeStr}`);
}

// Tab 切換功能
function switchEventTab(tab) {
    console.log(`🔄 切換到 ${tab} Tab`);

    // 更新 Tab 按鈕狀態
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // 過濾事件顯示
    filterEventsByStatus(tab);

    // 更新容器的 data-view 屬性
    const eventsContainer = document.querySelector('.events-container');
    if (eventsContainer) {
        eventsContainer.dataset.view = tab;
    }
}

// 過濾事件顯示
function filterEventsByStatus(tab) {
    const eventsContainer = document.querySelector('.events-container');
    const allCards = eventsContainer.querySelectorAll('.event-card');

    allCards.forEach(card => {
        const eventId = card.dataset.eventId ||
                       card.getAttribute('onclick')?.match(/'([^']+)'/)?.[1];

        if (!eventId) {
            card.style.display = 'block';
            return;
        }

        const eventData = window.eventStorage.getEvent(eventId);

        if (tab === 'active') {
            // 顯示進行中的事件（非 completed 狀態）
            card.style.display = (eventData?.status !== 'completed') ? 'block' : 'none';
        } else if (tab === 'completed') {
            // 顯示已結束的事件
            card.style.display = (eventData?.status === 'completed') ? 'block' : 'none';
        }
    });
}

// 更新事件計數
function updateEventCounts() {
    const activeCountEl = document.getElementById('activeCount');
    const completedCountEl = document.getElementById('completedCount');

    if (!window.eventStorage || !window.eventStorage.events) {
        if (activeCountEl) activeCountEl.textContent = '0';
        if (completedCountEl) completedCountEl.textContent = '0';
        return;
    }

    const allEvents = Array.from(window.eventStorage.events.values());
    const activeCount = allEvents.filter(e => e.status !== 'completed').length;
    const completedCount = allEvents.filter(e => e.status === 'completed').length;

    if (activeCountEl) activeCountEl.textContent = activeCount;
    if (completedCountEl) completedCountEl.textContent = completedCount;

    console.log(`📊 事件計數更新 - 進行中: ${activeCount}, 已結束: ${completedCount}`);
}

// TODO 整理 executeAction 內部相關 function 程式碼
// 執行行動 (onclick)
function executeAction() {
    const actionNames = {
        'track': '持續追蹤',
        'satellite': '衛星重拍',
        'notify': '通知單位',
        'uav': 'UAV 派遣'
    };
    const actionIcons = {
        'track': '🎯',
        'satellite': '🛰️',
        'notify': '📞',
        'uav': '🚁'
    };

    console.log('executeAction called, selectedAction:', selectedAction);

    if (!selectedAction) {
        alert('請先選擇一個行動選項！');
        return;
    }

    // 特殊處理：結束事件
    if (selectedAction === 'close') {
        completeVesselEvent(window.currentEventId);
        return;
    }

    // 獲取時間選擇
    const executeTimeRadios = document.querySelectorAll('input[name="executeTime"]');
    let executeTime = new Date().toISOString(); // 默認立即執行
    let isScheduled = false;

    console.log('Found executeTime radios:', executeTimeRadios.length);

    executeTimeRadios.forEach(radio => {
        if (radio.checked) {
            console.log('Checked radio value:', radio.value);
            if (radio.value === 'scheduled') {
                const scheduledDateTime = document.getElementById('scheduledDateTime');
                if (scheduledDateTime && scheduledDateTime.value) {
                    const selectedTime = new Date(scheduledDateTime.value);
                    const minTime = new Date(Date.now() + 5 * 60000); // 5分鐘後

                    if (selectedTime < minTime) {
                        alert('排程時間必須在未來至少5分鐘！');
                        return;
                    }

                    executeTime = selectedTime.toISOString();
                    isScheduled = true;
                } else {
                    alert('請選擇排程時間！');
                    return;
                }
            }
        }
    });

    // 獲取目標信息
    const targetInfo = getTargetInfo();
    console.log('Target info:', targetInfo);

    // 檢查missionTrackManager是否存在
    if (typeof missionTrackManager === 'undefined') {
        console.error('missionTrackManager is undefined!');
        alert('系統錯誤：任務管理器未初始化');
        return;
    }

    // Helper: snap a Date to nearest 3-hour block
    function snapTo3Hours(date) {
        const d = new Date(date);
        const ms = 3 * 60 * 60 * 1000;
        const snapped = new Date(Math.round(d.getTime() / ms) * ms);
        return snapped;
    }

    // Helper: find closest current track point for a vessel (prefer type 'Current', fallback to latest 'History')
    function findClosestCurrentPointForVessel(vesselId) {
        try {
            const event = eventStorage.getEvent(vesselId);
            if (!event || !event.trackPoints) return null;
            // prefer type === 'Current'
            const current = event.trackPoints.find(p => p.type === 'Current');
            if (current) return current;
            // else return latest history by timestamp
            const history = event.trackPoints.filter(p => p.type === 'History');
            if (history.length === 0) return null;
            history.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            return history[0];
        } catch (err) { console.warn('findClosestCurrentPointForVessel error', err); return null; }
    }

    // Helper: find a future point in vessel's trackPoints that matches scheduledTime (snapped to 3 hours)
    function findFuturePointForVesselByTime(vesselId, scheduledDate) {
        try {
            const event = eventStorage.getEvent(vesselId);
            if (!event || !event.trackPoints) return null;
            const snapped = snapTo3Hours(scheduledDate).getTime();
            // find future point whose snapped time equals
            for (const p of event.trackPoints) {
                if (p.type === 'Future') {
                    const pt = snapTo3Hours(new Date(p.timestamp)).getTime();
                    if (pt === snapped) return p;
                }
            }
            // fallback: nearest future by absolute time diff
            const futures = event.trackPoints.filter(p => p.type === 'Future');
            if (futures.length === 0) return null;
            futures.sort((a, b) => Math.abs(new Date(a.timestamp) - scheduledDate) - Math.abs(new Date(b.timestamp) - scheduledDate));
            return futures[0];
        } catch (err) { console.warn('findFuturePointForVesselByTime error', err); return null; }
    }

    // 使用統一管理器創建派遣任務，並根據是否為立即/排程自動綁定軌跡點（優先處理 vessel-003 / vessel-004）
    let boundTrackPoint = null;
    const missionPayload = {
        action: selectedAction,
        actionName: actionNames[selectedAction],
        actionIcon: actionIcons[selectedAction],
        targetInfo: targetInfo,
        targetVesselId: currentTrackingVessel || 'all',
        status: isScheduled ? 'scheduled' : 'dispatched',
        timestamp: executeTime,
        isScheduled: isScheduled,
        executeTime: executeTime
    };

    // Only prioritize predefined vessel events (vessel-003, vessel-004)
    const preferredVessels = ['vessel-003', 'vessel-004'];
    const vesselIdToUse = currentTrackingVessel || (preferredVessels.includes(window.currentEventId) ? window.currentEventId : null);

    if (!isScheduled) {
        // Immediate: bind to current track point
        if (vesselIdToUse) boundTrackPoint = findClosestCurrentPointForVessel(vesselIdToUse);
    } else {
        // Scheduled: snap to 3-hour and bind to future point matching that time
        const scheduledDate = snapTo3Hours(new Date(executeTime));
        missionPayload.timestamp = scheduledDate.toISOString();
        missionPayload.executeTime = scheduledDate.toISOString();
        if (vesselIdToUse) boundTrackPoint = findFuturePointForVesselByTime(vesselIdToUse, scheduledDate);
    }

    // If we determined a boundTrackPoint, pass its stable id into the mission payload so
    // the mission manager can auto-reuse or link correctly.
    if (boundTrackPoint) {
        missionPayload.sourceTrackPointId = getSafePointId(boundTrackPoint);
    }

    const missionId = missionTrackManager.createMission(missionPayload);

    // If we found a suitable track point, create a persistent link: add missionId to track point and pointId to mission
    if (boundTrackPoint) {
        // ensure the track point is registered in manager
        const pointId = getSafePointId(boundTrackPoint) || null;
        try {
            // If the manager already has this point (by pointId), use it; otherwise, create it
            let managerPointId = pointId && missionTrackManager.trackPoints.has(pointId) ? pointId : null;
            // If the point already exists in manager, ensure it's not owned by another mission
            if (managerPointId) {
                const existingPoint = missionTrackManager.trackPoints.get(managerPointId);
                if (existingPoint && existingPoint.boundMissionId && existingPoint.boundMissionId !== missionId) {
                    console.warn(`Explicit bind skipped: track point ${managerPointId} already bound to another mission.`);
                } else {
                    // safe to bind one-to-one
                    const mission = missionTrackManager.missions.get(missionId);
                    if (mission) mission.boundPointId = managerPointId;
                    const mp = missionTrackManager.trackPoints.get(managerPointId);
                    if (mp) mp.boundMissionId = missionId;
                    missionTrackManager.missionTrackLinks.set(`${missionId}-${managerPointId}`, { missionId, pointId: managerPointId, linkTime: new Date().toISOString(), linkReason: 'explicit_bind' });
                    console.log('Mission bound to track point:', missionId, managerPointId);
                }
            } else {
                // create a new track point in manager and bind it (newly created point has no existing boundMissionId)
                managerPointId = missionTrackManager.createTrackPoint(boundTrackPoint);
                const mission = missionTrackManager.missions.get(missionId);
                if (mission) mission.boundPointId = managerPointId;
                const mp = missionTrackManager.trackPoints.get(managerPointId);
                if (mp) mp.boundMissionId = missionId;
                missionTrackManager.missionTrackLinks.set(`${missionId}-${managerPointId}`, { missionId, pointId: managerPointId, linkTime: new Date().toISOString(), linkReason: 'explicit_bind' });
                console.log('Mission bound to track point (new):', missionId, managerPointId);
            }
        } catch (err) { console.warn('Error binding mission to track point', err); }
    }

    console.log('Created mission with ID:', missionId);

    // 創建新任務卡
    const missionTimeline = document.querySelector('.mission-list');
    console.log('Mission timeline element found:', !!missionTimeline);

    if (!missionTimeline) {
        console.error('Mission timeline element not found!');
        alert('錯誤：找不到任務列表容器');
        return;
    }

    const newMission = document.createElement('div');
    newMission.className = 'mission-card';
    newMission.setAttribute('data-mission-id', missionId);

    const executeTimeFormatted = new Date(executeTime).toLocaleString('zh-TW');
    const statusText = isScheduled ? '排程' : '派遣';
    const statusClass = isScheduled ? 'status-scheduled' : 'status-dispatched';

    console.log('Creating mission card with:', {
        missionId,
        selectedAction,
        targetInfo,
        executeTimeFormatted,
        statusText,
        statusClass
    });

    newMission.innerHTML = `
        <div class="mission-card-header">
            <span class="mission-type">${actionIcons[selectedAction]} ${actionNames[selectedAction]}</span>
            <span class="mission-status ${statusClass}">${statusText}</span>
        </div>
        <div class="mission-details">
            目標: ${targetInfo}<br>
            ${isScheduled ? '預定執行' : '排程'}: ${executeTimeFormatted}
        </div>
        <div class="mission-progress">
            <div class="progress-bar">
                <div class="progress-fill" style="width: 0%;"></div>
            </div>
            <div class="progress-text">${isScheduled ? '等待排程時間' : '等待執行'}</div>
        </div>
    `;

    missionTimeline.insertBefore(newMission, missionTimeline.firstChild);
    console.log('Mission card inserted into timeline');

    // If action is satellite, show image on map at the CURRENT track point
    if (selectedAction === 'satellite') {
        const vesselEvent = eventStorage.getEvent(currentEventId);
        if (vesselEvent && vesselEvent.type === 'vessel' && vesselEvent.trackPoints && mainMap) {
            
            const currentPoint = vesselEvent.trackPoints.find(p => p.type === 'Current');

            if (currentPoint && currentPoint.lat && currentPoint.lon) {
                const lat = currentPoint.lat;
                const lon = currentPoint.lon;
                
                // Construct the correct image path as per the new requirement
                const vesselType = vesselEvent.vesselType || '貨輪'; // Default to 貨輪 if type is missing
                const imageUrl = `images/No_AIS/${vesselType}.jpg`; // Always use No_AIS folder for this action

                const imageIcon = L.divIcon({
                    className: 'satellite-image-on-map',
                    html: `<img src="${imageUrl}" style="width: 300px; height: auto; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid white;">`,
                    iconSize: [300, 200],
                    iconAnchor: [-20, 50] 
                });

                const imageMarker = L.marker([lat, lon], { icon: imageIcon }).addTo(mainMap);

                // 衛星影像永久顯示，不自動消失
                console.log('Satellite image displayed permanently on map');
            } else {
                console.warn('Could not find a "Current" track point for the vessel to display satellite image.');
            }
        }
    }

    // If action is satellite, show image on map
    if (selectedAction === 'satellite') {
        const vesselEvent = eventStorage.getEvent(currentEventId);
        if (vesselEvent && vesselEvent.type === 'vessel' && mainMap) {
            const lat = vesselEvent.lat;
            const lon = vesselEvent.lon;

            if (lat && lon) {
                const imageUrl = 'images/image1.png'; // Placeholder satellite image
                const imageIcon = L.divIcon({
                    className: 'satellite-image-on-map',
                    html: `<img src="${imageUrl}" style="width: 150px; height: auto; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid white;">`,
                    iconSize: [150, 100],
                    iconAnchor: [-20, 50] // Anchor to the side of the point (left: -20px, top: 50px)
                });

                const imageMarker = L.marker([lat, lon], { icon: imageIcon }).addTo(mainMap);

                // 衛星影像永久顯示，不自動消失
                console.log('Satellite image displayed permanently on map');
            }
        }
    }

    // If action is satellite, show image on map
    if (selectedAction === 'satellite') {
        const vesselEvent = eventStorage.getEvent(currentEventId);
        if (vesselEvent && vesselEvent.type === 'vessel' && mainMap) {
            const lat = vesselEvent.lat;
            const lon = vesselEvent.lon;

            if (lat && lon) {
                const imageUrl = 'images/image1.png'; // Placeholder satellite image
                const imageIcon = L.divIcon({
                    className: 'satellite-image-on-map',
                    html: `<img src="${imageUrl}" style="width: 150px; height: auto; border-radius: 5px; box-shadow: 0 0 10px rgba(0,0,0,0.5); border: 2px solid white;">`,
                    iconSize: [150, 100],
                    iconAnchor: [-20, 50] // Anchor to the side of the point (left: -20px, top: 50px)
                });

                const imageMarker = L.marker([lat, lon], { icon: imageIcon }).addTo(mainMap);

                // 衛星影像永久顯示，不自動消失
                console.log('Satellite image displayed permanently on map');
            }
        }
    }

    // 验证任务卡是否成功添加
    const insertedCard = document.querySelector(`[data-mission-id="${missionId}"]`);
    console.log('Mission card found after insertion:', !!insertedCard);

    // 为任务卡添加点击事件
    newMission.addEventListener('click', () => {
        highlightMissionCard(missionId);
        showMissionDetails(missionId);
    });
    newMission.style.cursor = 'pointer';


    // 更新任務統計
    const stats = document.querySelector('.mission-stats');
    const currentActive = parseInt(stats.textContent.match(/進行中: (\d+)/)[1]) + 1;
    const currentTotal = parseInt(stats.textContent.match(/總計: (\d+)/)[1]) + 1;
    stats.textContent = `進行中: ${currentActive} | 已完成: 1 | 總計: ${currentTotal}`;

    // 新增：更新右侧时间轴
    const actionIcon = selectedAction === 'satellite' ? '🛰️' : selectedAction === 'uav' ? '🚁' : selectedAction === 'track' ? '🎯' : '📞';
    const timelineStatus = isScheduled ? '排程' : '派遣';
    addTimelineEvent(timelineStatus, `${actionIcon} ${targetInfo}`, `${actionNames[selectedAction]}${isScheduled ? ' (預定執行)' : ''}`, missionId);

    // 設置任務執行時間
    const executionDelay = isScheduled ?
        Math.max(0, new Date(executeTime) - new Date()) :
        3000; // 立即執行任務延遲3秒

    // 模擬任務進度
    setTimeout(() => {
        const statusBadge = newMission.querySelector('.mission-status');
        const progressFill = newMission.querySelector('.progress-fill');
        const progressText = newMission.querySelector('.progress-text');

        if (!statusBadge) return; // 任務卡可能已被移除

        // 開始執行任務
        statusBadge.className = 'mission-status status-arrived';
        statusBadge.textContent = '抵達';

        setTimeout(() => {
            if (!statusBadge.parentElement) return; // 檢查元素是否還存在
            statusBadge.className = 'mission-status status-executing';
            statusBadge.textContent = '執行任務';
        }, 2000);

        let progress = 0;
        const interval = setInterval(() => {
            if (!progressFill || !progressText) {
                clearInterval(interval);
                return;
            }

            progress += Math.random() * 20;
            if (progress > 100) progress = 100;

            progressFill.style.width = progress + '%';
            progressText.textContent = `進度: ${Math.round(progress)}%`;

            if (progress >= 100) {
                clearInterval(interval);
                if (statusBadge && statusBadge.parentElement) {
                    statusBadge.className = 'mission-status status-completed';
                    statusBadge.textContent = '完成';
                    progressText.textContent = '已完成';

                    // 更新任務狀態到統一管理器
                    const mission = missionTrackManager.missions.get(missionId);
                    if (mission) {
                        mission.status = 'completed';
                        mission.completedTime = new Date().toISOString();
                    }

                    // 更新統計
                    const newStats = document.querySelector('.mission-stats');
                    if (newStats) {
                        const activeCount = Math.max(0, parseInt(newStats.textContent.match(/進行中: (\d+)/)[1]) - 1);
                        const completedCount = parseInt(newStats.textContent.match(/已完成: (\d+)/)[1]) + 1;
                        const totalCount = parseInt(newStats.textContent.match(/總計: (\d+)/)[1]);
                        newStats.textContent = `進行中: ${activeCount} | 已完成: ${completedCount} | 總計: ${totalCount}`;
                    }
                }
            }
        }, 1000);
    }, executionDelay);

    // 重置選項
    selectedAction = null;

    // 清除所有選中狀態
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.classList.remove('selected');
    });

    // 尋找並關閉可能的模態框
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (modal.style.display === 'block' || modal.style.display === 'flex') {
            modal.style.display = 'none';
        }
    });

    // 特定模態框ID的關閉
    const confirmationModal = document.getElementById('confirmationModal');
    if (confirmationModal) {
        confirmationModal.style.display = 'none';
    }

    const detailsModal = document.getElementById('detailsModal');
    if (detailsModal) {
        detailsModal.style.display = 'none';
    }

    // Re-render the bottom task list to show the new mission
    if (timelineMode === 'vessel' && currentEventId) {
        renderVesselTasks(currentEventId);
    }
}

// -----------

// 根據事件調整地圖視圖
function adjustMapViewForEvent(eventId, isRepeatedClick = false) {
    console.log("adjusting map view for event:", eventId, "isRepeatedClick:", isRepeatedClick);
    if (!mainMap) return;

    // 獲取當前事件資料
    const storedEvent = eventStorage.getEvent(eventId);
    if (!storedEvent) return;

    // 如果是重複點擊同一個區域事件，檢查監控範圍是否還存在
    if (isRepeatedClick && storedEvent.type === 'area') {
        // 檢查監控範圍是否已經被清除（例如按了重置按鈕）
        const rangeStillExists = investigationRangeLayer && 
                                mainMap.hasLayer(investigationRangeLayer);
        
        if (rangeStillExists) {
            console.log(`🔄 重複點擊區域事件 ${eventId}，保持現有顯示狀態`);
            
            // 只調整地圖視圖，不重新處理信號點
            if (storedEvent.centerLat && storedEvent.centerLon && storedEvent.radius) {
                let centerLat = storedEvent.centerLat;
                let centerLon = storedEvent.centerLon;
                
                // 根據方向調整座標
                if (storedEvent.centerLatDirection === 'S') {
                    centerLat = -centerLat;
                }
                if (storedEvent.centerLonDirection === 'W') {
                    centerLon = -centerLon;
                }

                const radiusInKm = storedEvent.radiusInKm || storedEvent.radius;
                let zoomLevel = 6;
                
                // 計算縮放等級
                if (radiusInKm < 10) zoomLevel = 10;
                else if (radiusInKm < 25) zoomLevel = 9;
                else if (radiusInKm < 50) zoomLevel = 8;
                else if (radiusInKm < 100) zoomLevel = 7;
                else zoomLevel = 6;

                // 平滑調整地圖視圖
                mainMap.setView([centerLat, centerLon], zoomLevel, {
                    animate: true,
                    duration: 1.5,
                    easeLinearity: 0.25
                });
            }
            return; // 提前返回，不執行後續的信號點處理
        } else {
            console.log(`🔄 重複點擊區域事件 ${eventId}，但監控範圍已被清除，將重新繪製`);
            // 監控範圍已被清除，需要重新繪製，繼續執行下面的邏輯
        }
    }

    // 清除先前的調查範圍顯示
    clearInvestigationRange();

    // 如果是船舶事件且是重複點擊同一個船舶，不清除現有軌跡
    if (storedEvent.type === 'vessel' &&
        historyTrackManager && historyTrackManager.currentTrackingVesselId === eventId &&
        historyTrackManager.historyTrackAnimation) {
        console.log(`🔄 重複點擊船舶事件 ${eventId}，保留現有歷史軌跡動畫`);
        // 使用統一的聚焦函數
        focusMapToEventCoordinates(storedEvent, eventId, 'vessel');
        return; // 提前返回，不繼續執行後面的清除邏輯
    }

    // 清除先前的歷史軌跡動畫（只在非重複點擊時清除）
    if (historyTrackManager && historyTrackManager.historyTrackAnimation) {
        if (historyTrackManager.historyTrackAnimation.timeout) {
            clearTimeout(historyTrackManager.historyTrackAnimation.timeout);
        }
        if (historyTrackManager.historyTrackAnimation.layers) {
            historyTrackManager.historyTrackAnimation.layers.forEach(layer => mainMap.removeLayer(layer));
        }
        historyTrackManager.historyTrackAnimation = null;
        historyTrackManager.currentTrackingVesselId = null;
        console.log('🛑 已停止並清除舊的歷史軌跡動畫。');
    }
    if (!storedEvent) return;

    // 檢查圓形區域格式
    if (storedEvent.type === 'area' && storedEvent.centerLat && storedEvent.centerLon && storedEvent.radius) {
        // 區域監控事件：先畫出調查範圍，再放大地圖

        // 恢復信號點數據但不顯示在地圖上
        restoreHiddenSignalPointsWithoutDisplay();

        // 清除任何現有的歷史軌跡
        if (historyTrackManager) {
            historyTrackManager.clearHistoryTrack();
        }

        try {
            let centerLat, centerLon, zoomLevel = 6;

            // 圓形區域處理
            centerLat = storedEvent.centerLat;
            centerLon = storedEvent.centerLon;
            
            // 根據方向調整座標（如果是南緯或西經，需要變成負數）
            if (storedEvent.centerLatDirection === 'S') {
                centerLat = -centerLat;
            }
            if (storedEvent.centerLonDirection === 'W') {
                centerLon = -centerLon;
            }

            const radiusInKm = storedEvent.radiusInKm || storedEvent.radius;

            // 定義高亮異常信號的函數，帶重試機制
            const highlightAbnormalSignals = (retryCount = 0, maxRetries = 5) => {
                if (window.seaDotManager && 
                    typeof window.seaDotManager.highlightAbnormalRFSignalsInArea === 'function' &&
                    window.seaDotManager.getAllDots && 
                    window.seaDotManager.getAllDots().length > 0) {
                    // SeaDotManager 已載入且有數據
                    const highlightedCount = window.seaDotManager.highlightAbnormalRFSignalsInArea(storedEvent);
                    if (highlightedCount > 0) {
                        console.log(`🔴 已將 ${highlightedCount} 個區域內的異常RF信號點標記為紅色`);
                        return highlightedCount;
                    }
                    return 0;
                } else if (retryCount < maxRetries) {
                    // SeaDotManager 尚未完全載入，延遲重試
                    console.log(`⏳ 等待 SeaDotManager 載入數據... (${retryCount + 1}/${maxRetries})`);
                    setTimeout(() => {
                        const count = highlightAbnormalSignals(retryCount + 1, maxRetries);
                        if (count > 0) {
                            // 重試成功後更新提示訊息
                            setTimeout(() => {
                                showMapAdjustmentMessage(`地圖已聚焦至${storedEvent.aoiName || '監控區域'}`);
                            }, 600);
                        }
                    }, 200); // 每次重試間隔 200ms
                    return -1; // 表示正在重試
                } else {
                    console.warn('⚠️ SeaDotManager 載入超時，無法高亮異常信號');
                    return 0;
                }
            };

            // 短暫延遲後放大到該區域
            setTimeout(() => {
                // 計算適當的縮放等級（根據半徑大小）
                if (radiusInKm < 10) zoomLevel = 10;
                else if (radiusInKm < 25) zoomLevel = 9;
                else if (radiusInKm < 50) zoomLevel = 8;
                else if (radiusInKm < 100) zoomLevel = 7;
                else zoomLevel = 6;

                if (mainMap) {
                    // 步驟 1: 先高亮顯示區域內的異常RF信號（未開啟AIS）
                    let highlightMessageShown = false;
                    const highlightedCount = highlightAbnormalSignals();
                    
                    if (highlightedCount > 0) {
                        highlightMessageShown = true;
                    }
                    // highlightedCount === -1 表示正在重試，不需要立即顯示訊息

                    // 步驟 2: 再創建圓形調查範圍 - 單圈設計
                    
                    // 監控範圍圓圈
                    const monitoringCircle = L.circle([centerLat, centerLon], {
                        color: '#4caf50',          // 綠色邊框
                        fillColor: '#81c784',     // 淺綠色填充
                        fillOpacity: 0.15,        // 淺透明填充
                        weight: 3,                // 邊框粗細
                        opacity: 0.9,             // 邊框透明度
                        dashArray: '12, 8',       // 虛線樣式
                        radius: radiusInKm * 1000, // 半徑（米）
                        className: 'monitoring-range-circle' // CSS類名，用於動畫
                    });

                    // 中心標記點 - 使用固定的圓形標記（避免跳動）
                    const centerMarker = L.circleMarker([centerLat, centerLon], {
                        color: '#1b5e20',         // 深綠色邊框
                        fillColor: '#2e7d32',     // 深綠色填充
                        fillOpacity: 0.9,         // 較高填充度
                        weight: 2,                // 邊框粗細
                        opacity: 1.0,             // 完全不透明
                        radius: 5,                // 標記點大小
                        interactive: false        // 不響應滑鼠事件，保持固定位置
                    });

                    // 創建圖層組以便統一管理（不要先單獨添加到地圖）
                    const layerGroup = L.layerGroup([monitoringCircle, centerMarker]);
                    
                    // 將圖層組添加到地圖
                    layerGroup.addTo(mainMap);
                    
                    // 儲存到全域變數以便後續清除
                    investigationRangeLayer = layerGroup;

                    // 添加動態效果的CSS樣式（如果還沒有的話）
                    if (!document.getElementById('monitoring-range-styles')) {
                        const style = document.createElement('style');
                        style.id = 'monitoring-range-styles';
                        style.textContent = `
                            @keyframes subtle-glow {
                                0% { filter: drop-shadow(0 0 3px rgba(76, 175, 80, 0.4)); }
                                50% { filter: drop-shadow(0 0 10px rgba(76, 175, 80, 0.7)); }
                                100% { filter: drop-shadow(0 0 3px rgba(76, 175, 80, 0.4)); }
                            }
                            
                            .monitoring-range-circle {
                                animation: subtle-glow 3s ease-in-out infinite;
                            }
                        `;
                        document.head.appendChild(style);
                    }

                    const areaName = storedEvent.aoiName || eventId.toUpperCase();
                    const radiusText = storedEvent.radiusUnit === 'nm' ? 
                        `${storedEvent.radius}海里` : `${storedEvent.radius}公里`;
                    console.log(`📍 已繪製調查範圍：${areaName} (中心: ${centerLat.toFixed(3)}°, ${centerLon.toFixed(3)}°, 半徑: ${radiusText})`);

                    // 🆕 統計並輸出威脅分數信息
                    if (highlightedCount > 0 && window.seaDotManager) {
                        const highlightedDots = window.seaDotManager.getAllDots().filter(dot => dot.isHighlighted);
                        if (highlightedDots.length > 0) {
                            const threatScores = highlightedDots
                                .filter(dot => dot.threatScore !== undefined)
                                .map(dot => dot.threatScore);
                            
                            if (threatScores.length > 0) {
                                const avgThreatScore = Math.round(threatScores.reduce((a, b) => a + b, 0) / threatScores.length);
                                const maxThreatScore = Math.max(...threatScores);
                                const minThreatScore = Math.min(...threatScores);
                                
                                console.log(`📊 區域內異常RF信號威脅分數統計:`);
                                console.log(`   - 總數: ${threatScores.length} 個`);
                                console.log(`   - 平均: ${avgThreatScore} 分`);
                                console.log(`   - 最高: ${maxThreatScore} 分`);
                                console.log(`   - 最低: ${minThreatScore} 分`);
                                
                                // 按威脅等級分類
                                const critical = threatScores.filter(s => s >= 100).length;
                                const high = threatScores.filter(s => s >= 70 && s < 100).length;
                                const medium = threatScores.filter(s => s >= 40 && s < 70).length;
                                const low = threatScores.filter(s => s < 40).length;
                                
                                console.log(`   - 威脅等級分布: 極高威脅(${critical}) | 高威脅(${high}) | 中等威脅(${medium}) | 低威脅(${low})`);
                            }
                        }
                    }

                    // 顯示提示訊息
                    if (highlightMessageShown) {
                        // 如果有異常信號被高亮，顯示包含異常信號數量的訊息
                        const highlightedCount = window.seaDotManager.getAllDots().filter(dot => dot.isHighlighted).length;
                        setTimeout(() => {
                            showMapAdjustmentMessage(`地圖已聚焦至${storedEvent.aoiName || '監控區域'}`);
                        }, 600);
                    } else {
                        // 如果沒有異常信號，顯示普通的聚焦訊息
                        setTimeout(() => {
                            showMapAdjustmentMessage(`地圖已聚焦至${storedEvent.aoiName || '監控區域'}`);
                        }, 100);
                    }
                }

                // 平滑地調整地圖視圖到目標區域
                mainMap.setView([centerLat, centerLon], zoomLevel, {
                    animate: true,
                    duration: 1.5,
                    easeLinearity: 0.25
                });

                console.log(`🎯 地圖已調整至 ${storedEvent.aoiName || eventId.toUpperCase()} 區域 (中心: ${centerLat.toFixed(3)}, ${centerLon.toFixed(3)}, 縮放: ${zoomLevel})`);
            }, 100);

        } catch (error) {
            console.warn(`⚠️ 無法解析事件 ${eventId} 的座標範圍:`, error);
        }
    } else if (storedEvent.type === 'vessel') {
        // 船舶事件：找到 'Current' 點並定位，然後顯示軌跡

        // 顯示歷史軌跡
        if (historyTrackManager) {
            historyTrackManager.displayHistoryTrack(storedEvent);
        } else {
            console.warn('⚠️ historyTrackManager 尚未初始化，無法顯示歷史軌跡');
        }

        // 清除非軌跡點的 SeaDots
        clearNonTrackPoints();

        // 找到 'Current' 點來定位地圖
        const currentPoint = storedEvent.trackPoints?.find(p => p.type === 'Current');

        let targetCoords;
        if (currentPoint) {
            targetCoords = { lat: currentPoint.lat, lon: currentPoint.lon };
            console.log(`🎯 找到 'Current' 點，將地圖定位至: (${targetCoords.lat.toFixed(3)}, ${targetCoords.lon.toFixed(3)})`);
        } else {
            // 如果找不到 'Current' 點，作為備用方案，使用 coordinates 屬性
            try {
                targetCoords = parsePointCoordinates(storedEvent.coordinates);
                console.warn(`⚠️ 在 ${eventId} 的軌跡中找不到 'Current' 點，使用備用座標定位`);
            } catch (error) {
                console.error(`❌ 無法為 ${eventId} 找到任何有效座標進行定位`);
                return;
            }
        }

        if (targetCoords) {
            // 為 Current 點創建臨時事件物件或使用原始事件資料
            const eventForFocus = currentPoint ?
                { coordinates: `${targetCoords.lat.toFixed(3)}°N, ${targetCoords.lon.toFixed(3)}°E` } :
                storedEvent;

            // 使用統一的聚焦函數
            focusMapToEventCoordinates(eventForFocus, eventId, 'vessel');
        }
    }
}

// 清除調查範圍顯示和異常信號點高亮
function clearInvestigationRange() {
    // 清除綠色監控範圍顯示
    if (investigationRangeLayer && mainMap) {
        try {
            // 如果是圖層組，先嘗試清除組內的每個圖層
            if (investigationRangeLayer.eachLayer) {
                investigationRangeLayer.eachLayer(function(layer) {
                    if (mainMap.hasLayer(layer)) {
                        mainMap.removeLayer(layer);
                    }
                });
            }
            
            // 移除圖層組本身
            if (mainMap.hasLayer(investigationRangeLayer)) {
                mainMap.removeLayer(investigationRangeLayer);
            }
            
            investigationRangeLayer = null;
            console.log('🗑️ 已清除綠色監控範圍顯示');
        } catch (error) {
            console.error('❌ 清除監控範圍時發生錯誤:', error);
            // 強制重置
            investigationRangeLayer = null;
        }
    }
    
    // 恢復紅色異常信號點的原始顏色和顯示狀態
    if (window.seaDotManager && typeof window.seaDotManager.restoreOriginalColors === 'function') {
        const result = window.seaDotManager.restoreOriginalColors();
        if (result && (result.restoredCount > 0 || result.shownCount > 0)) {
            console.log(`🔵 已恢復 ${result.restoredCount} 個異常信號點的原始顏色，顯示 ${result.shownCount} 個隱藏的信號點`);
        }
    }
}

/**
 * 聚焦地圖到指定事件的座標位置
 * @param {Object} eventData - 事件資料物件
 * @param {string} eventId - 事件ID
 * @param {string} eventType - 事件類型 ('vessel', 'rf', 'area')
 */
function focusMapToEventCoordinates(eventData, eventId, eventType) {
    if (!mainMap || !eventData || !eventData.coordinates) {
        console.warn(`⚠️ 無法聚焦地圖: 缺少必要參數`);
        return false;
    }

    // 事件類型配置
    const typeConfig = {
        'vessel': {
            displayName: '船舶',
            zoomLevel: 7,
            animationOptions: {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.25
            }
        },
        'rf': {
            displayName: 'RF信號',
            zoomLevel: 7,
            animationOptions: {
                animate: true,
                duration: 1.5,
                easeLinearity: 0.25
            }
        },
    };

    const config = typeConfig[eventType];
    if (!config) {
        console.warn(`⚠️ 不支援的事件類型: ${eventType}`);
        return false;
    }

    try {
        const coords = parsePointCoordinates(eventData.coordinates);
        if (coords) {
            // 設定地圖視圖
            mainMap.setView([coords.lat, coords.lon], config.zoomLevel, config.animationOptions);

            // 顯示地圖調整訊息
            showMapAdjustmentMessage(`地圖已聚焦至${config.displayName}位置`);

            // 記錄日誌
            console.log(`🎯 地圖已調整至${config.displayName} ${eventId.toUpperCase()} 位置 (${coords.lat.toFixed(3)}, ${coords.lon.toFixed(3)})`);

            return true;
        } else {
            throw new Error('座標解析失敗');
        }
    } catch (error) {
        console.warn(`⚠️ 無法解析${eventType}事件 ${eventId} 的座標:`, error);
        return false;
    }
}

/**
 * 恢復被 clearNonTrackPoints 隱藏的所有信號點
 * 這個功能會重新顯示之前被清除的RF信號點和其他非歷史軌跡點
 */
function restoreHiddenSignalPoints() {
    console.log('🔄 開始恢復被隱藏的信號點...');

    let restoredCount = 0;

    try {
        // 檢查是否有被隱藏的點
        if (!hiddenSignalPoints.isCleared) {
            console.log('ℹ️ 沒有找到被隱藏的信號點');
            return {
                restored: 0,
                success: true,
                message: '沒有被隱藏的點需要恢復'
            };
        }

        // 獲取有效的地圖實例
        const mapInstance = getValidMapInstance();
        if (!mapInstance) {
            console.warn('⚠️ 未找到有效的地圖實例，無法執行恢復操作');
            return {
                restored: 0,
                success: false,
                error: '地圖未初始化'
            };
        }

        // 1. 恢復 SeaDotManager 管理的信號點
        if (hiddenSignalPoints.seaDots.size > 0) {
            console.log('📍 恢復 SeaDotManager 中的信號點...');

            // 確保 SeaDotManager 存在
            if (!window.seaDotManager) {
                console.warn('⚠️ SeaDotManager 不存在，無法恢復信號點');
            } else {
                hiddenSignalPoints.seaDots.forEach((dotData, dotId) => {
                    try {
                        // 恢復點到 SeaDotManager
                        window.seaDotManager.seaDots.set(dotId, dotData);

                        // 如果點之前在地圖上，重新創建並添加到地圖
                        if (dotData.wasOnMap) {
                            // 重新創建標記
                            const newMarker = window.seaDotManager.createMarker(dotData);
                            dotData.marker = newMarker;

                            // 添加到地圖
                            if (newMarker && mapInstance) {
                                newMarker.addTo(mapInstance);
                                restoredCount++;
                                console.log(`恢復信號點: ${dotId}`);
                            }
                        }
                    } catch (error) {
                        console.warn(`恢復信號點 ${dotId} 時發生錯誤:`, error);
                    }
                });

                console.log(`✅ 已恢復 ${hiddenSignalPoints.seaDots.size} 個 SeaDotManager 管理的信號點`);
            }
        }

        // 2. 恢復船舶標記
        if (Object.keys(hiddenSignalPoints.vesselMarkers).length > 0) {
            console.log('🚢 恢復船舶標記...');

            Object.keys(hiddenSignalPoints.vesselMarkers).forEach(vesselId => {
                const hiddenVesselData = hiddenSignalPoints.vesselMarkers[vesselId];

                // 恢復到 window.vesselMarkers
                if (window.vesselMarkers) {
                    window.vesselMarkers[vesselId] = hiddenVesselData;

                    // 如果有標記且之前在地圖上，重新添加
                    if (hiddenVesselData.marker && hiddenVesselData.wasOnMap) {
                        try {
                            hiddenVesselData.marker.addTo(mapInstance);
                            restoredCount++;
                            console.log(`恢復船舶標記: ${vesselId}`);
                        } catch (error) {
                            console.warn(`恢復船舶標記 ${vesselId} 時發生錯誤:`, error);
                        }
                    }
                }
            });

            console.log(`✅ 已恢復 ${Object.keys(hiddenSignalPoints.vesselMarkers).length} 個船舶標記`);
        }

        // 3. 恢復調查範圍標記
        if (hiddenSignalPoints.investigationRange) {
            console.log('📐 恢復調查範圍標記...');

            try {
                window.investigationRangeLayer = hiddenSignalPoints.investigationRange;
                if (hiddenSignalPoints.investigationRange.addTo) {
                    hiddenSignalPoints.investigationRange.addTo(mapInstance);
                    restoredCount++;
                }
            } catch (error) {
                console.warn('恢復調查範圍標記時發生錯誤:', error);
            }
        }

        // 清除隱藏狀態
        hiddenSignalPoints = {
            seaDots: new Map(),
            vesselMarkers: {},
            investigationRange: null,
            temporaryMarkers: [],
            clearTime: null,
            isCleared: false
        };

        console.log(`🎉 恢復完成！總共恢復 ${restoredCount} 個信號點`);

        return {
            restored: restoredCount,
            success: true
        };

    } catch (error) {
        console.error('❌ 恢復信號點時發生錯誤:', error);
        return {
            restored: restoredCount,
            success: false,
            error: error.message
        };
    }
}

/**
 * 恢復被隱藏的信號點數據但不添加到地圖上
 * 這個功能會恢復之前被清除的RF信號點和其他非歷史軌跡點的數據，但不會將它們顯示在地圖上
 * 適用於需要保留數據但不立即顯示的場景
 */
function restoreHiddenSignalPointsWithoutDisplay() {
    console.log('🔄 開始恢復被隱藏的信號點數據（不顯示）...');

    let restoredCount = 0;

    try {
        // 檢查是否有被隱藏的點
        if (!hiddenSignalPoints.isCleared) {
            console.log('ℹ️ 沒有找到被隱藏的信號點');
            return {
                restored: 0,
                success: true,
                message: '沒有被隱藏的點需要恢復'
            };
        }

        // 1. 恢復 SeaDotManager 管理的信號點數據（不添加到地圖）
        if (hiddenSignalPoints.seaDots.size > 0) {
            console.log('📍 恢復 SeaDotManager 中的信號點數據...');

            // 確保 SeaDotManager 存在
            if (!window.seaDotManager) {
                console.warn('⚠️ SeaDotManager 不存在，無法恢復信號點');
            } else {
                hiddenSignalPoints.seaDots.forEach((dotData, dotId) => {
                    try {
                        // 只恢復點到 SeaDotManager，不添加到地圖
                        window.seaDotManager.seaDots.set(dotId, dotData);
                        restoredCount++;
                        console.log(`恢復信號點數據: ${dotId}`);
                    } catch (error) {
                        console.warn(`恢復信號點數據 ${dotId} 時發生錯誤:`, error);
                    }
                });

                console.log(`✅ 已恢復 ${hiddenSignalPoints.seaDots.size} 個 SeaDotManager 管理的信號點數據`);
            }
        }

        // 2. 恢復船舶標記數據（不添加到地圖）
        if (Object.keys(hiddenSignalPoints.vesselMarkers).length > 0) {
            console.log('🚢 恢復船舶標記數據...');

            Object.keys(hiddenSignalPoints.vesselMarkers).forEach(vesselId => {
                const hiddenVesselData = hiddenSignalPoints.vesselMarkers[vesselId];

                // 只恢復到 window.vesselMarkers，不添加到地圖
                if (window.vesselMarkers) {
                    window.vesselMarkers[vesselId] = hiddenVesselData;
                    restoredCount++;
                    console.log(`恢復船舶標記數據: ${vesselId}`);
                }
            });

            console.log(`✅ 已恢復 ${Object.keys(hiddenSignalPoints.vesselMarkers).length} 個船舶標記數據`);
        }

        // 3. 恢復調查範圍標記數據（不添加到地圖）
        if (hiddenSignalPoints.investigationRange) {
            console.log('📐 恢復調查範圍標記數據...');

            try {
                // 只恢復數據引用，不添加到地圖
                window.investigationRangeLayer = hiddenSignalPoints.investigationRange;
                restoredCount++;
                console.log('恢復調查範圍標記數據完成');
            } catch (error) {
                console.warn('恢復調查範圍標記數據時發生錯誤:', error);
            }
        }

        // 清除隱藏狀態
        hiddenSignalPoints = {
            seaDots: new Map(),
            vesselMarkers: {},
            investigationRange: null,
            temporaryMarkers: [],
            clearTime: null,
            isCleared: false
        };

        console.log(`🎉 數據恢復完成！總共恢復 ${restoredCount} 個信號點的數據（未顯示在地圖上）`);

        return {
            restored: restoredCount,
            success: true,
            message: '數據已恢復但未顯示在地圖上'
        };

    } catch (error) {
        console.error('❌ 恢復信號點數據時發生錯誤:', error);
        return {
            restored: restoredCount,
            success: false,
            error: error.message
        };
    }
}

// 顯示地圖調整訊息的函數
function showMapAdjustmentMessage(message, duration = 1500) {
    // 建立訊息元素
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageElement.style.cssText = `
        position: absolute;
        top: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(0, 0, 0, 0.8);
        color: #66e7ff;
        padding: 10px 20px;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        z-index: 10000;
        border: 1px solid rgba(102, 231, 255, 0.3);
        backdrop-filter: blur(10px);
        box-shadow: 0 4px 15px rgba(0, 0, 0, 0.3);
        transition: opacity 0.3s ease;
        pointer-events: none;
    `;

    // 找到地圖容器並添加到其中
    const mapContainer = document.querySelector('.map-container');
    if (mapContainer) {
        // 確保地圖容器有相對定位
        if (getComputedStyle(mapContainer).position === 'static') {
            mapContainer.style.position = 'relative';
        }
        mapContainer.appendChild(messageElement);
    } else {
        // 如果找不到地圖容器，則使用 body
        document.body.appendChild(messageElement);
    }

    // 延遲移除
    setTimeout(() => {
        messageElement.style.opacity = '0';
        setTimeout(() => {
            if (messageElement.parentNode) {
                messageElement.parentNode.removeChild(messageElement);
            }
        }, 300);
    }, duration - 300);
}

/**
 * 清除地圖上除歷史軌跡點外的所有信號點
 * 此功能會保留歷史軌跡點(History type)，移除其他所有類型的點
 * 包括：RF信號點、當前位置點、未來預測點、普通監測點等
 */
function clearNonTrackPoints() {
    console.log('🧹 開始清除地圖上除歷史軌跡點外的所有信號點...');

    let removedCount = 0;
    let preservedHistoryCount = 0;

    try {
        // 獲取有效的地圖實例
        const mapInstance = getValidMapInstance();
        if (!mapInstance) {
            console.warn('⚠️ 未找到有效的地圖實例，無法執行清除操作');
            return {
                removed: 0,
                preserved: 0,
                success: false,
                error: '地圖未初始化'
            };
        }

        // 獲取需要保留的歷史軌跡圖層
        const historyLayersToPreserve = new Set();
        if (historyTrackManager && historyTrackManager.currentHistoryLayers && Array.isArray(historyTrackManager.currentHistoryLayers)) {
            historyTrackManager.currentHistoryLayers.forEach(layer => {
                historyLayersToPreserve.add(layer);
            });
            console.log(`🗺️ 標記 ${historyTrackManager.currentHistoryLayers.length} 個歷史軌跡圖層為保留項目`);
            preservedHistoryCount += historyTrackManager.currentHistoryLayers.length;
        }

        // 1. 清除 SeaDotManager 管理的所有RF信號點和監測點
        if (window.seaDotManager && typeof window.seaDotManager.seaDots !== 'undefined') {
            console.log('📍 清除 SeaDotManager 中的信號點...');

            // 遍歷所有 SeaDotManager 管理的點，並儲存它們
            const allDots = Array.from(window.seaDotManager.seaDots.values());
            allDots.forEach(dotData => {
                // 儲存被清除的點資料
                hiddenSignalPoints.seaDots.set(dotData.id, {
                    ...dotData,
                    wasOnMap: dotData.marker && mapInstance.hasLayer(dotData.marker)
                });

                // SeaDotManager 管理的都不是歷史軌跡點，全部清除
                if (dotData.marker && mapInstance.hasLayer(dotData.marker)) {
                    mapInstance.removeLayer(dotData.marker);
                    removedCount++;
                }
            });

            // 清空 SeaDotManager 的數據
            window.seaDotManager.seaDots.clear();
            window.seaDotManager.dotIdCounter = 1;
            console.log(`✅ 已清除並儲存 ${allDots.length} 個 SeaDotManager 管理的信號點`);
        }

        // 2. 清除所有非保留的地圖圖層（更徹底的清除）
        console.log('🔍 檢查地圖上的所有圖層...');
        const layersToRemove = [];
        
        mapInstance.eachLayer(function(layer) {
            // 跳過基礎地圖瓦片層
            if (layer instanceof L.TileLayer) {
                return;
            }
            
            // 跳過調查範圍層
            if (layer === investigationRangeLayer) {
                return;
            }
            
            // 跳過歷史軌跡圖層
            if (historyLayersToPreserve.has(layer)) {
                return;
            }
            
            // 其他所有圖層都標記為待移除
            layersToRemove.push(layer);
        });

        // 批量移除非保留圖層
        layersToRemove.forEach(layer => {
            try {
                mapInstance.removeLayer(layer);
                removedCount++;
                console.log('移除非保留圖層:', layer);
            } catch (error) {
                console.warn('移除圖層時發生錯誤:', error);
            }
        });

        // 3. 處理獨立船舶標記（保持原有邏輯作為額外保險）
        if (window.vesselMarkers && typeof window.vesselMarkers === 'object') {
            console.log('🚢 處理獨立船舶標記...');

            Object.keys(window.vesselMarkers).forEach(vesselId => {
                const vesselData = window.vesselMarkers[vesselId];

                // 只移除主要船舶標記（非歷史軌跡類型）
                if (vesselData.marker && mapInstance.hasLayer(vesselData.marker)) {
                    // 檢查是否是歷史軌跡標記
                    if (!vesselData.isHistoryMarker && !vesselData.isTrackMarker && !historyLayersToPreserve.has(vesselData.marker)) {
                        mapInstance.removeLayer(vesselData.marker);
                        console.log(`移除獨立船舶標記: ${vesselId}`);
                    } else {
                        console.log(`保留船舶軌跡標記: ${vesselId}`);
                    }
                }

                // 完全跳過軌跡點的處理（已在步驟2中處理）
                if (vesselData.trackPoints && Array.isArray(vesselData.trackPoints)) {
                    console.log(`保留船舶 ${vesselId} 的 ${vesselData.trackPoints.length} 個軌跡點`);
                }
            });
        }

        console.log(`🎉 清除完成！總共移除 ${removedCount} 個非歷史軌跡點，保留 ${preservedHistoryCount} 個歷史軌跡點`);

        // 更新隱藏狀態
        if (removedCount > 0) {
            hiddenSignalPoints.clearTime = new Date().toISOString();
            hiddenSignalPoints.isCleared = true;
            console.log('📦 已儲存被清除的信號點資料，可使用 restoreHiddenSignalPoints() 恢復');
        }

        return {
            removed: removedCount,
            preserved: preservedHistoryCount,
            success: true
        };

    } catch (error) {
        console.error('❌ 清除地圖點時發生錯誤:', error);
        return {
            removed: removedCount,
            preserved: preservedHistoryCount,
            success: false,
            error: error.message
        };
    }
}

// 解析單點座標字串 (例如: "24.456°N, 120.789°E" 或 "24.123°N, 121.045°E")
function parsePointCoordinates(coordStr) {
    try {
        // 移除度數符號和方位字母
        const cleanCoord = coordStr.replace(/[°NSEW\s]/g, '');
        const parts = cleanCoord.split(',');

        if (parts.length === 2) {
            const lat = parseFloat(parts[0]);
            const lon = parseFloat(parts[1]);

            if (!isNaN(lat) && !isNaN(lon)) {
                return { lat, lon };
            }
        }
        return null;
    } catch (error) {
        console.warn('單點座標解析失敗:', coordStr, error);
        return null;
    }
}

// -----------

// 禁用/啟用特定事件卡的視覺狀態
function setEventCardDisabled(eventId, disabled) {
    const eventCards = document.querySelectorAll('.event-card');
    eventCards.forEach(card => {
        // 檢查事件卡是否對應指定的事件ID
        const cardEventId = eventStorage.getEventIdFromCard(card);
        if (cardEventId === eventId) {
            if (disabled) {
                card.style.opacity = '0.5';
                card.style.pointerEvents = 'none';
                card.style.filter = 'grayscale(50%)';
            } else {
                card.style.opacity = '';
                card.style.pointerEvents = '';
                card.style.filter = '';
            }
        }
    });
}

// -----------

// 顯示地圖載入指示器
function showMapLoadingIndicator() {
    const mapContainer = document.querySelector('#mainMap');
    if (mapContainer) {
        mapContainer.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: center; height: 100%; background: #1a1a1a; color: #66e7ff; font-size: 16px;">
                <div style="text-align: center;">
                    <div style="font-size: 24px; margin-bottom: 10px;">🗺️</div>
                    <div>地圖載入中...</div>
                </div>
            </div>
        `;
    }
}

// 隱藏地圖載入指示器
function hideMapLoadingIndicator() {
    // 載入指示器會在地圖初始化時自動被替換
    console.log('🔄 地圖載入指示器已隱藏');
}

// 地圖初始化函數
function initializeMainMap() {
    try {
        // 顯示載入指示器
        showMapLoadingIndicator();

        // 台灣中心座標
        const taiwanCenter = [23.8, 121.0];

        // 建立地圖
        mainMap = L.map('mainMap', {
            center: taiwanCenter,
            zoom: 7,
            minZoom: 3,//6
            maxZoom: 18,
            zoomControl: true,
            // 優化觸控和拖拽行為
            touchZoom: true,
            doubleClickZoom: true,
            scrollWheelZoom: true,
            boxZoom: true,
            keyboard: true,
            dragging: true,
            // 設定拖拽慣性
            inertia: true,
            inertiaDeceleration: 3000,
            inertiaMaxSpeed: 1500
        });

        // 立即加入海圖圖層（暗色主題，適合海事用途）
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            subdomains: 'abcd',
            maxZoom: 19
        }).addTo(mainMap);

        console.log('✅ 地圖基礎初始化完成');

        // 隱藏載入指示器
        hideMapLoadingIndicator();

        // 延遲添加網格和海域點，避免阻塞地圖顯示
        setTimeout(() => {
            initializeMapFeatures();
        }, 100);
        // 延遲添加網格和海域點，避免阻塞地圖顯示
        setTimeout(() => {
            initializeMapFeatures();
        }, 100);

    } catch (error) {
        console.error('❌ 地圖初始化失敗:', error);
        hideMapLoadingIndicator();
    }
}

// 初始化地圖的輔助功能（網格、事件監聽器、海域點等）
function initializeMapFeatures() {
    if (!mainMap) {
        console.warn('⚠️ 地圖未初始化，無法添加輔助功能');
        return;
    }

    console.log('🔧 正在添加地圖輔助功能...');

    try {
        // 動態偏移量計算函數
        function calculateDynamicOffset(baseOffset, minOffset = null) {
            const currentZoom = mainMap.getZoom();
            const baseZoom = 7; // 基礎縮放等級（地圖初始化時的縮放等級）

            // 如果沒有指定最小偏移量，則使用基礎偏移量的5%作為最小值
            if (minOffset === null) {
                minOffset = Math.abs(baseOffset) * 0.05;
                if (baseOffset < 0) minOffset = -minOffset; // 保持符號一致
            }

            // 計算縮放比例因子：縮放等級越高，因子越小
            const zoomFactor = Math.pow(0.5, Math.max(0, currentZoom - baseZoom));
            const dynamicOffset = baseOffset >= 0
                ? Math.max(minOffset, baseOffset * zoomFactor)
                : Math.min(minOffset, baseOffset * zoomFactor); // 處理負偏移量

            return dynamicOffset;
        }

        // 添加經緯度參考線（自定義實現）
        function addLatLngGrid() {
            // 確保先完全清理舊的網格
            if (window.gridGroup) {
                try {
                    mainMap.removeLayer(window.gridGroup);
                    window.gridGroup = null;
                } catch (e) {
                    console.warn('清理舊網格時出現錯誤:', e);
                }
            }

            const bounds = mainMap.getBounds();
            const gridLines = [];

            // 繪製經線（垂直線）
            for (let lng = Math.floor(bounds.getWest()); lng <= Math.ceil(bounds.getEast()); lng += 1) {
                const line = L.polyline([
                    [bounds.getSouth(), lng],
                    [bounds.getNorth(), lng]
                ], {
                    color: '#ffffff',
                    weight: 1,
                    opacity: 0.4,
                    dashArray: '2, 4'
                });
                gridLines.push(line);

                // 計算經度標籤的動態偏移量
                const longitudeOffset = calculateDynamicOffset(0.4, 0.02);

                // 添加經度標籤（置下，使用動態偏移量）
                const label = L.marker([bounds.getSouth() + longitudeOffset, lng], {
                    icon: L.divIcon({
                        html: `<div style="color: white; font-size: 12px; font-weight: bold;">${lng}°E</div>`,
                        className: 'grid-label',
                        iconSize: [40, 20],
                        iconAnchor: [20, 0]  // 下對齊：錨點設為上邊緣
                    })
                });
                gridLines.push(label);
            }

            // 繪製緯線（水平線）
            for (let lat = Math.floor(bounds.getSouth()); lat <= Math.ceil(bounds.getNorth()); lat += 1) {
                const line = L.polyline([
                    [lat, bounds.getWest()],
                    [lat, bounds.getEast()]
                ], {
                    color: '#ffffff',
                    weight: 1,
                    opacity: 0.4,
                    dashArray: '2, 4'
                });
                gridLines.push(line);

                // 計算緯度標籤的動態偏移量
                const latitudeOffset = calculateDynamicOffset(-0.05, -0.0025);

                // 添加緯度標籤（置右，使用動態偏移量）
                const label = L.marker([lat, bounds.getEast() + latitudeOffset], {
                    icon: L.divIcon({
                        html: `<div style="color: white; font-size: 12px; font-weight: bold;">${lat}°N</div>`,
                        className: 'grid-label',
                        iconSize: [40, 20],
                        iconAnchor: [40, 10]  // 右對齊：錨點設為右邊緣
                    })
                });
                gridLines.push(label);
            }

            // 將網格線添加到地圖
            const gridGroup = L.layerGroup(gridLines);
            gridGroup.addTo(mainMap);

            // 存儲網格組以便後續更新
            window.gridGroup = gridGroup;

            console.log(`🗺️ 網格已更新，包含 ${gridLines.length} 個元素`);
        }

        // 添加防抖機制防止頻繁更新網格
        let gridUpdateTimeout = null;

        // 地圖移動時更新網格（使用防抖）
        mainMap.on('moveend zoomend', function () {
            // 清除之前的延時更新
            if (gridUpdateTimeout) {
                clearTimeout(gridUpdateTimeout);
            }

            // 延遲更新網格，避免頻繁觸發
            gridUpdateTimeout = setTimeout(() => {
                try {
                    addLatLngGrid();
                } catch (error) {
                    console.warn('更新網格時發生錯誤:', error);
                }
                gridUpdateTimeout = null;
            }, 100);
        });

        // 添加地圖事件監聽器來確保指針樣式正確
        mainMap.getContainer().style.cursor = 'grab';

        mainMap.on('mousedown', function () {
            mainMap.getContainer().style.cursor = 'grabbing';
        });

        mainMap.on('mouseup', function () {
            mainMap.getContainer().style.cursor = 'grab';
        });

        // === SeaDot 動態縮放事件監聽器 ===
        mainMap.on('zoomend', function () {
            const currentZoom = mainMap.getZoom();
            console.log(`🔍 地圖縮放變化: ${currentZoom}, 正在更新 SeaDot 大小...`);

            // 更新所有 SeaDot 的大小
            if (window.seaDotManager) {
                window.seaDotManager.updateAllSeaDotSizes(mainMap);
            }
        });

        // 初始添加網格（延遲以避免阻塞）
        setTimeout(addLatLngGrid, 200);

        console.log('🔧 地圖輔助功能初始化完成');

        // 分批生成海域監測點，避免一次性生成造成延遲
        setTimeout(() => {
            addRandomSeaDots();
        }, 300);

        // 嘗試建立全域 seaDotManager（如果 SeaDotManager 已抽出並可用）
        if (window.__attachSeaDotManager) {
            const attached = window.__attachSeaDotManager();
            if (!attached) {
                console.log('SeaDotManager 尚未可用，稍後可重試 attach');
            }
        }

    } catch (error) {
        console.error('❌ 地圖輔助功能初始化失敗:', error);
    }
}

// 優化的海域監測點生成函數（分批處理）
function addRandomSeaDots() {
    if (!mainMap) return;

    console.log('🔵 開始分批生成海域監測點...');

    // 確保全域 seaDotManager 已建立
    if (typeof window.seaDotManager === 'undefined') {
        if (typeof window.__attachSeaDotManager === 'function') {
            const ok = window.__attachSeaDotManager();
            if (!ok) {
                console.log('等待 SeaDotManager 可用，稍後重試生成 SeaDots...');
                setTimeout(addRandomSeaDots, 200);
                return;
            }
        } else {
            console.log('SeaDotManager 尚未定義，稍後重試生成 SeaDots...');
            setTimeout(addRandomSeaDots, 200);
            return;
        }
    }

    // 定義海域範圍（台灣周圍海域 + 南海區域）
    const seaAreas = [
        // 台灣海峽西側
        { latMin: 22.0, latMax: 25.5, lonMin: 119.0, lonMax: 119.8, name: '台灣海峽西側' },
        // 東部海域
        { latMin: 22.0, latMax: 25.5, lonMin: 121.5, lonMax: 122.5, name: '台灣東部海域' },
        // 南部海域
        { latMin: 21.5, latMax: 22.5, lonMin: 120.0, lonMax: 121.5, name: '台灣南部海域' },
        // 巴士海峽
        { latMin: 20.5, latMax: 22.0, lonMin: 120.5, lonMax: 121.8, name: '巴士海峽' },
        // 台灣海峽中央
        { latMin: 23.5, latMax: 24.5, lonMin: 119.2, lonMax: 119.9, name: '台灣海峽中央' },

        // === 南海區域 ===
        // 南海北部（海南島以南）
        { latMin: 16.0, latMax: 20.0, lonMin: 108.0, lonMax: 114.0, name: '南海北部海域' },
        // 西沙群島周邊
        { latMin: 15.5, latMax: 17.5, lonMin: 111.0, lonMax: 113.0, name: '西沙群島海域' },
        // 中沙群島周邊
        { latMin: 13.5, latMax: 16.0, lonMin: 113.5, lonMax: 115.5, name: '中沙群島海域' },
        // 南沙群島北部
        { latMin: 7.0, latMax: 12.0, lonMin: 109.0, lonMax: 116.0, name: '南沙群島北部海域' },
        // 南沙群島南部
        { latMin: 4.0, latMax: 8.0, lonMin: 111.0, lonMax: 114.0, name: '南沙群島南部海域' },
        // 南海中央海盆
        { latMin: 10.0, latMax: 18.0, lonMin: 114.0, lonMax: 118.0, name: '南海中央海盆' },
        // 南海東北部（菲律賓以西）
        { latMin: 14.0, latMax: 20.0, lonMin: 116.0, lonMax: 120.0, name: '南海東北部海域' },
        // 南海東南部
        { latMin: 6.0, latMax: 12.0, lonMin: 116.0, lonMax: 119.0, name: '南海東南部海域' }
    ];

    // 定義台灣本島的大致範圍（避免在陸地上放置圓點）
    const taiwanLandAreas = [
        { latMin: 21.9, latMax: 25.3, lonMin: 120.0, lonMax: 122.0 },
    ];

    // 檢查座標是否在台灣陸地範圍內
    function isOnLand(lat, lon) {
        return taiwanLandAreas.some(area =>
            lat >= area.latMin && lat <= area.latMax &&
            lon >= area.lonMin && lon <= area.lonMax
        );
    }

    // 生成隨機海域座標
    function generateSeaCoordinate() {
        const maxAttempts = 10; // 減少嘗試次數
        let attempts = 0;

        while (attempts < maxAttempts) {
            const seaArea = seaAreas[Math.floor(Math.random() * seaAreas.length)];
            const lat = seaArea.latMin + Math.random() * (seaArea.latMax - seaArea.latMin);
            const lon = seaArea.lonMin + Math.random() * (seaArea.lonMax - seaArea.lonMin);

            if (!isOnLand(lat, lon)) {
                return { lat, lon, area: seaArea.name };
            }
            attempts++;
        }

        return { lat: 24.0, lon: 119.5, area: '台灣海峽' };
    }

    const dotCount = 300; // 固定數量，避免隨機延遲

    // 預先計算狀態分配（保持 AIS 狀態的多樣性，但統一使用淺藍色顯示）
    const aisStatusCount = Math.floor(dotCount * 0.5);
    const noAisStatusCount = dotCount - aisStatusCount;

    const statusList = [];
    for (let i = 0; i < aisStatusCount; i++) {
        statusList.push('AIS'); // AIS 開啟狀態
    }
    for (let i = 0; i < noAisStatusCount; i++) {
        statusList.push('No AIS'); // AIS 未開啟狀態
    }

    // 隨機打亂狀態順序
    for (let i = statusList.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [statusList[i], statusList[j]] = [statusList[j], statusList[i]];
    }

    // 一次性生成所有海域監測點
    console.log(`🔵 開始生成 ${dotCount} 個海域監測點...`);

    for (let i = 0; i < dotCount; i++) {
        const coord = generateSeaCoordinate();
        const dotId = `SD-${String(i + 1).padStart(3, '0')}`;
        const status = statusList[i]; // 使用狀態列表而非顏色

        // 創建完整的點數據對象
        const samplePoint = {
            pointId: dotId,
            id: dotId,
            lat: coord.lat,
            lon: coord.lon,
            timestamp: new Date().toISOString(),
            type: 'Normal',
            display: {
                backgroundColor: '#1eb0f9ff', // 統一使用淺藍色
                dotColor: '#1eb0f9ff',        // 統一使用淺藍色
                borderRadius: '50%',
                status: status
            }
        };

        // 使用 createSeaDotFromPoint 方法並添加到地圖
        const marker = window.seaDotManager.createSeaDotFromPoint(samplePoint);
        if (marker) {
            marker.addTo(mainMap);
        }
    }

    console.log('✅ 所有海域監測點生成完成');
    console.log(`📊 監測點分配: ${aisStatusCount} 個 AIS 開啟狀態 (${(aisStatusCount / dotCount * 100).toFixed(1)}%), ${noAisStatusCount} 個 AIS 未開啟狀態 (${(noAisStatusCount / dotCount * 100).toFixed(1)}%)，所有監測點均顯示為淺藍色`);

    // 在 sea dots 生成完成後，重新初始化 Vessel 事件
    if (window.eventStorage && typeof window.eventStorage.reinitializeVesselEvents === 'function') {
        window.eventStorage.reinitializeVesselEvents('vessel-003', '16.797148°N, 115.850213°E');
        window.eventStorage.reinitializeVesselEvents('vessel-004', '11.583010°N, 111.252487°E');
        
        // 🆕 為預設 vessel 事件創建對應的 sea dot 標記
        setTimeout(() => {
            initializeDefaultVesselSeaDots();
        }, 300);
        
        // 在重新初始化後，額外更新事件卡顯示（延遲以確保 DOM 已更新）
        setTimeout(() => {
            updateDefaultVesselEventCards();
            
            // 驗證預設事件的遺漏點計算
            console.log('🔍 驗證預設船舶事件的遺漏點計算...');
            const vessel003 = window.eventStorage.getEvent('vessel-003');
            const vessel004 = window.eventStorage.getEvent('vessel-004');
            
            if (vessel003 && vessel003.missingAISPoints) {
                console.log(`✅ VESSEL-003 已有 ${vessel003.missingAISPoints.length} 個遺漏 AIS 點`);
            } else {
                console.log(`⚠️ VESSEL-003 沒有遺漏 AIS 點數據`);
            }
            
            if (vessel004 && vessel004.missingAISPoints) {
                console.log(`✅ VESSEL-004 已有 ${vessel004.missingAISPoints.length} 個遺漏 AIS 點`);
            } else {
                console.log(`⚠️ VESSEL-004 沒有遺漏 AIS 點數據`);
            }
        }, 500);
    }

    // 初始化事件計數
    setTimeout(() => {
        updateEventCounts();
    }, 800);
}

// 🆕 為預設 vessel 事件（vessel-003 和 vessel-004）初始化 sea dot 標記
function initializeDefaultVesselSeaDots() {
    console.log('🔵 [initializeDefaultVesselSeaDots] 開始為預設 vessel 事件創建 sea dot 標記...');
    
    if (!window.seaDotManager) {
        console.warn('⚠️ SeaDotManager 未初始化，無法創建 sea dot');
        return;
    }
    
    if (!window.eventStorage) {
        console.warn('⚠️ eventStorage 未初始化，無法獲取事件資料');
        return;
    }
    
    // 定義需要初始化的預設 vessel 事件
    const defaultVesselEvents = ['vessel-003', 'vessel-004'];
    
    defaultVesselEvents.forEach(eventId => {
        const vesselEvent = window.eventStorage.getEvent(eventId);
        
        if (!vesselEvent) {
            console.warn(`⚠️ 找不到事件: ${eventId}`);
            return;
        }
        
        // 解析座標
        const coordMatch = vesselEvent.coordinates.match(/([\d.]+)°N,\s*([\d.]+)°E/);
        if (!coordMatch) {
            console.warn(`⚠️ 無法解析事件 ${eventId} 的座標: ${vesselEvent.coordinates}`);
            return;
        }
        
        const lat = parseFloat(coordMatch[1]);
        const lon = parseFloat(coordMatch[2]);
        
        // 檢查是否已存在相同 RF ID 的 sea dot
        const existingDot = window.seaDotManager.getDotByRFId(vesselEvent.rfId);
        if (existingDot) {
            console.log(`ℹ️ Sea dot 已存在，RF ID: ${vesselEvent.rfId}，跳過創建`);
            return;
        }
        
        // 生成唯一的 dot ID
        const dotId = `vessel-dot-${eventId}-${Date.now()}`;

        let vesselaisStatus = ''
        if (vesselEvent.aisStatus === '已開啟') {
            vesselaisStatus = 'AIS';
        } else if (vesselEvent.aisStatus === '未開啟') {
            vesselaisStatus = 'No AIS';
        }

        // 創建 sea dot 標記
        const marker = window.seaDotManager.createSeaDot(
            lat,
            lon,
            dotId,
            vesselaisStatus
        );
        
        if (marker) {
            // 獲取剛創建的 dot data
            const dotData = window.seaDotManager.seaDots.get(dotId);
            
            if (dotData) {
                // 🔴 關鍵：將 RF ID 更新為事件的 RF ID（保持一致性）
                dotData.rfId = vesselEvent.rfId;
                
                // 🔴 添加威脅分數（用於高威脅標記）
                dotData.threatScore = vesselEvent.threatScore;
                
                // 🔴 添加 vessel 相關資訊
                dotData.vesselMmsi = vesselEvent.mmsi;
                dotData.vesselType = vesselEvent.vesselType;
                dotData.vesselName = vesselEvent.vesselName;
                
                // 🔴 標記為已追蹤（避免在區域監控中重複顯示）
                dotData.isTracked = true;
                
                // 🔴 設定顏色為藍色（與一般 RF 信號點相同）
                dotData.dotColor = '#1eb0f9ff';  // 藍色
                dotData.backgroundColor = '#1eb0f9ff';
                
                // 更新標記顏色
                if (dotData.marker && window.seaDotManager.updateDotMarkerColor) {
                    window.seaDotManager.updateDotMarkerColor(dotData);
                }
                
                // 將標記添加到地圖
                if (mainMap && !mainMap.hasLayer(marker)) {
                    marker.addTo(mainMap);
                }
                
                console.log(`✅ 已為事件 ${eventId} 創建 sea dot 標記:`, {
                    dotId: dotId,
                    rfId: dotData.rfId,
                    mmsi: dotData.vesselMmsi,
                    threatScore: dotData.threatScore,
                    coordinates: `${lat}°N, ${lon}°E`,
                    aisStatus: dotData.status,
                    isTracked: dotData.isTracked
                });
            }
        } else {
            console.warn(`⚠️ 無法為事件 ${eventId} 創建 sea dot 標記`);
        }
    });
    
    console.log(`✅ [initializeDefaultVesselSeaDots] 完成預設 vessel 事件的 sea dot 初始化`);
}

// 更新預設船舶事件卡的顯示內容
function updateDefaultVesselEventCards() {
    console.log('🔄 開始更新預設船舶事件卡顯示...');
    
    if (!window.eventStorage) {
        console.warn('⚠️ eventStorage 未初始化，無法更新事件卡');
        return;
    }
    
    // 更新 vessel-003 事件卡
    const vessel003Data = eventStorage.getEvent('vessel-003');
    if (vessel003Data) {
        console.log('📦 vessel-003 資料:', vessel003Data);
        const vessel003Card = document.querySelector('[onclick*="vessel-003"]');
        if (vessel003Card) {
            const eventInfo = vessel003Card.querySelector('.event-info');
            if (eventInfo) {
                eventInfo.innerHTML = `
                    MMSI: ${vessel003Data.mmsi || '未知'}<br>
                    座標: ${vessel003Data.coordinates}<br>
                    AIS狀態: ${vessel003Data.aisStatus}<br>
                    威脅分數: ${vessel003Data.threatScore}
                `;
                console.log('✅ 已更新 vessel-003 事件卡顯示');
            } else {
                console.warn('⚠️ 找不到 vessel-003 事件卡的 .event-info 元素');
            }
        } else {
            console.warn('⚠️ 找不到 vessel-003 事件卡');
        }
    } else {
        console.warn('⚠️ 找不到 vessel-003 事件資料');
    }

    // 更新 vessel-004 事件卡
    const vessel004Data = eventStorage.getEvent('vessel-004');
    if (vessel004Data) {
        console.log('📦 vessel-004 資料:', vessel004Data);
        const vessel004Card = document.querySelector('[onclick*="vessel-004"]');
        if (vessel004Card) {
            const eventInfo = vessel004Card.querySelector('.event-info');
            if (eventInfo) {
                eventInfo.innerHTML = `
                    MMSI: ${vessel004Data.mmsi || '未知'}<br>
                    座標: ${vessel004Data.coordinates}<br>
                    AIS狀態: ${vessel004Data.ais}<br>
                    威脅分數: ${vessel004Data.threatScore}
                `;
                console.log('✅ 已更新 vessel-004 事件卡顯示');
            } else {
                console.warn('⚠️ 找不到 vessel-004 事件卡的 .event-info 元素');
            }
        } else {
            console.warn('⚠️ 找不到 vessel-004 事件卡');
        }
    } else {
        console.warn('⚠️ 找不到 vessel-004 事件資料');
    }
}

// 清理範例任務卡片
function clearExampleMissions() {
    const missionTimeline = document.querySelector('.mission-list');
    if (missionTimeline) {
        // 清除所有現有的任務卡片
        missionTimeline.innerHTML = '';
        console.log('✅ 已清理任務列表中的範例任務卡片');
    }
}

// 為已存在的船舶事件生成任務卡片
function generateMissionsForExistingVessels() {
    console.log('🚀 開始為已存在的船舶事件生成任務卡片...');

    // 獲取所有船舶事件
    const allEvents = eventStorage.getAllEvents();
    allEvents.forEach(eventData => {
        if (eventData.type === 'vessel' && eventData.trackPoints && eventData.trackPoints.length > 0) {
            console.log(`📍 為船舶事件 ${eventData.id} 生成任務卡片...`);

            // 為該船舶的軌跡點生成任務卡片
            eventStorage.generateMissionCardsFromTrackPoints(eventData.trackPoints, eventData.id);
        }
    });

    console.log('✅ 已完成為所有船舶事件生成任務卡片');
}

// 初始化
document.addEventListener('DOMContentLoaded', function () {
    // 立即初始化地圖，不等待其他依賴
    console.log('🚀 開始地圖初始化...');
    initializeMainMap();

    // 等待 eventStorage 初始化完成
    // ⚡ 優化：減少等待時間和重試間隔
    function waitForEventStorage(callback, maxRetries = 20, currentRetry = 0) {
        if (window.eventStorage && typeof window.eventStorage.reinitializeAreaEvents === 'function') {
            callback();
        } else if (currentRetry < maxRetries) {
            console.log(`⏳ 等待 eventStorage 初始化... (${currentRetry + 1}/${maxRetries})`);
            // ⚡ 優化：減少重試間隔從 100ms 到 50ms
            setTimeout(() => waitForEventStorage(callback, maxRetries, currentRetry + 1), 50);
        } else {
            console.warn('⚠️ eventStorage 初始化超時，跳過相關初始化');
            callback();
        }
    }

    // 其他初始化可以並行進行
    waitForEventStorage(() => {
        // ✅ 最先重新初始化區域事件的監控時間
        if (window.eventStorage && typeof window.eventStorage.reinitializeAreaEvents === 'function') {
            window.eventStorage.reinitializeAreaEvents();
        }

        // 清理任務列表中的範例任務卡片，準備生成真實任務
        clearExampleMissions();

        // ⚡ 優化：減少延遲從 500ms 到 200ms
        // 為已存在的船舶事件生成任務卡片（等待軌跡點生成完成）
        setTimeout(() => {
            generateMissionsForExistingVessels();
        }, 200);

        // 初始化區域事件選擇器並自動選中 area-001
        // 需要等待 SeaDotManager 初始化完成
        const initAreaEventSelector = (retryCount = 0, maxRetries = 15) => {
            console.log(`🔍 [init] 檢查 SeaDotManager 狀態 (嘗試 ${retryCount + 1}/${maxRetries})`);

            // 檢查 SeaDotManager 是否已初始化並有數據
            const seaDotReady = window.seaDotManager &&
                               window.seaDotManager.seaDots &&
                               window.seaDotManager.seaDots.size > 0;

            if (seaDotReady) {
                console.log(`✅ [init] SeaDotManager 已準備好，共 ${window.seaDotManager.seaDots.size} 個監測點`);

                initializeAreaEventSelector();

                const selector = document.getElementById('areaEventSelector');
                const areaEvent = eventStorage.getEvent('area-001');
                if (areaEvent && selector) {
                    selector.value = 'area-001';

                    // ⚡ 優化：立即渲染，不需要延遲
                    onAreaEventChange('area-001');
                    console.log('✅ 已自動選中 area-001');
                }
            } else if (retryCount < maxRetries) {
                console.log(`⏳ [init] SeaDotManager 尚未準備好，200ms 後重試...`);
                // ⚡ 優化：減少重試間隔從 500ms 到 200ms
                setTimeout(() => initAreaEventSelector(retryCount + 1, maxRetries), 200);
            } else {
                console.warn(`⚠️ [init] SeaDotManager 初始化超時，仍然嘗試載入區域事件`);
                initializeAreaEventSelector();
            }
        };

        // ⚡ 優化：減少初始延遲從 1500ms 到 500ms
        setTimeout(() => initAreaEventSelector(), 500);

        // 模擬實時任務進度更新
        setInterval(() => {
            const progressBars = document.querySelectorAll('.mission-card .progress-fill');
            progressBars.forEach(bar => {
                const currentWidth = parseFloat(bar.style.width) || 0;
                if (currentWidth < 100 && (bar.closest('.mission-card').querySelector('.mission-status').textContent === '執行任務' || bar.closest('.mission-card').querySelector('.mission-status').textContent === '抵達')) {
                    const newWidth = Math.min(100, currentWidth + Math.random() * 5);
                    bar.style.width = newWidth + '%';

                    const progressText = bar.parentElement.nextElementSibling;
                    progressText.textContent = `進度: ${Math.round(newWidth)}%`;
                }
            });
        }, 5000);

        // 模擬實時狀態更新
        setInterval(() => {
            const timestamp = new Date().toLocaleTimeString('zh-TW', { hour12: false });
            const overlayInfo = document.querySelector('.overlay-info');
            if (overlayInfo && overlayInfo.textContent.includes('最後更新')) {
                const currentText = overlayInfo.innerHTML;
                overlayInfo.innerHTML = currentText.replace(/最後更新: \d{2}:\d{2}:\d{2}/, `最後更新: ${timestamp}`);
            }
        }, 30000);

        // 初始化時間軸為空白狀態
        console.log('🕰️ 初始化時間軸為空白狀態...');
        restoreGlobalTimeline();

        // TODO: 移除舊版威脅警示系統
        // // 初始化威脅警示系統
        // if (window.threatAlertManager) {
        //     window.threatAlertManager.startMonitoring();
        //     console.log('✅ 威脅警示系統已啟動');
        // } else {
        //     console.warn('⚠️ ThreatAlertManager 未初始化');
        // }
    }); // 結束 waitForEventStorage 回調
}); // 結束 DOMContentLoaded 事件處理器

// 縮放重置功能
function resetMapZoom() {
    if (mainMap) {
        // 步驟 1: 清除調查範圍顯示
        clearInvestigationRange();
        
        // 步驟 2: 移除所有高威脅信號點的呼吸特效（保留威脅狀態屬性）
        // ⚠️ 重要：必須在 restoreHiddenSignalPoints 之前執行
        // 因為 restoreHiddenSignalPoints 會重新創建標記，如果 isHighThreat 還是 true 會重新添加呼吸特效
        if (window.seaDotManager && typeof window.seaDotManager.removeAllHighThreatBreathingEffects === 'function') {
            const removedCount = window.seaDotManager.removeAllHighThreatBreathingEffects();
            console.log(`🔄 步驟2: 已移除 ${removedCount} 個高威脅信號點的呼吸特效（威脅狀態已保留）`);
        }

        // 步驟 3: 清除歷史軌跡
        if (window.historyTrackManager && typeof window.historyTrackManager.clearHistoryTrack === 'function') {
            window.historyTrackManager.clearHistoryTrack();
            console.log('🗑️ 步驟3: 已清除歷史軌跡');
        }
        
        // 步驟 4: 恢復被隱藏的 RF 信號點
        // 使用 setTimeout 確保 isHighThreat 標記已經被完全清除
        setTimeout(() => {
            if (typeof restoreHiddenSignalPoints === 'function') {
                const result = restoreHiddenSignalPoints();
                if (result && result.restored > 0) {
                    console.log(`✅ 步驟4: 已恢復 ${result.restored} 個 RF 信號點`);
                }
            }
        }, 100); // 延遲 100ms 確保狀態更新完成

        // 步驟 5: 重置事件選擇狀態，確保下次點擊事件卡時會重新渲染
        previousEventId = null;

        // 步驟 6: 回復到預設的台灣中心座標和縮放層級
        const defaultCenter = [23.8, 121.0];
        const defaultZoom = 7;

        // 平滑動畫回復到預設視圖
        mainMap.setView(defaultCenter, defaultZoom, {
            animate: true,
            duration: 1.5,
            easeLinearity: 0.25
        });

        console.log('🎯 地圖已重置回預設模式');

        // 步驟 7: 顯示地圖調整訊息
        showMapAdjustmentMessage('地圖已重置回預設模式');
    }
}



// 切换到船隻追踪模式
function switchToTrackingMode(vesselId) {
    timelineMode = 'vessel';
    currentTrackingVessel = vesselId;

    // 改变布局
    const missionSection = document.querySelector('.mission-section');
    if (missionSection) {
        missionSection.classList.add('tracking-mode');
    }

    // 更新任務列表標題
    const timelineHeader = document.querySelector('.mission-right .mission-header');
    if (timelineHeader) {
        timelineHeader.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between;">
                <div class="mission-title">🚢 ${vesselId.toUpperCase()} 任務列表</div>
            </div>
            <div class="mission-filter">所有任務</div>
        `;
    }

    // 生成船隻任务卡片
    renderVesselTasks(vesselId);
}

// 切换回全局模式
function switchToGlobalMode() {
    timelineMode = 'global';
    currentTrackingVessel = null;

    // 恢复布局
    const missionSection = document.querySelector('.mission-section');
    if (missionSection) {
        missionSection.classList.remove('tracking-mode');
    }

    // 恢复时间轴标题
    const timelineHeader = document.querySelector('.mission-right .mission-header');
    if (timelineHeader) {
        timelineHeader.innerHTML = `
            <div class="mission-title">🕰️ 时间轴</div>
            <div class="mission-filter">今日 | 本週 | 所有</div>
        `;
    }

    // 恢复原有时间轴
    restoreGlobalTimeline();
}

// Helper function to get all missions for a specific vessel
function getMissionsForVessel(vesselId) {
    if (!window.missionTrackManager || !vesselId) {
        return [];
    }

    // 獲取所有任務
    const allMissions = Array.from(window.missionTrackManager.missions.values());

    // 篩選出屬於該船舶的所有任務
    // 條件：任務的 targetVesselId 等於 vesselId
    const missions = allMissions.filter(mission => mission.targetVesselId === vesselId);

    // 備用條件：如果 targetVesselId 不匹配，檢查 targetInfo 是否包含 vesselId
    // 這確保了向後兼容性
    const fallbackMissions = allMissions.filter(mission => 
        !mission.targetVesselId && mission.targetInfo && mission.targetInfo.includes(vesselId)
    );

    // 合併兩種篩選結果並去重
    const finalMissions = [...new Map([...missions, ...fallbackMissions].map(item => [item.missionId, item])).values()];

    // 🔴 修正：確保所有任務都有 actionName 和 actionIcon（向後兼容舊數據）
    const actionNameMap = {
        'uav': 'UAV 派遣',
        'satellite': '衛星重拍',
        'notify': '聯繫船隻',
        'track': '持續追蹤'
    };
    
    const actionIconMap = {
        'uav': '🚁',
        'UAV 派遣': '🚁',
        'satellite': '🛰️',
        '衛星重拍': '🛰️',
        'notify': '📞',
        '聯繫船隻': '📞',
        'track': '🎯',
        '持續追蹤': '🎯'
    };
    
    finalMissions.forEach(mission => {
        // 補充 actionName
        if (!mission.actionName && mission.type) {
            mission.actionName = mission.type;
        }
        if (!mission.actionName && mission.action) {
            mission.actionName = actionNameMap[mission.action] || mission.action;
        }
        
        // 補充 actionIcon
        if (!mission.actionIcon) {
            mission.actionIcon = actionIconMap[mission.actionName] || 
                                actionIconMap[mission.type] || 
                                actionIconMap[mission.action] || 
                                '❓';
        }
    });

    console.log(`✅ 為船舶 ${vesselId} 找到 ${finalMissions.length} 個任務`);
    return finalMissions;
}

// Renders task cards for a given vessel
function renderVesselTasks(vesselId) {
    const missions = getMissionsForVessel(vesselId);

    // 詳細調試：顯示底部任務列表數據
    console.log(`🔍 [底部列表調試] Vessel: ${vesselId}, 任務數量: ${missions.length}`);
    if (missions.length > 0) {
        console.log(`  任務列表:`, missions.map(m => `${m.missionId} (${m.actionName}, sourceTrackPointId: ${m.sourceTrackPointId})`));
    }

    const container = document.querySelector('.timeline-container');
    if (!container) return;

    // Clear existing content
    container.innerHTML = '';

    if (missions.length === 0) {
        container.innerHTML = `<div class="no-tasks-message">此船舶沒有任務</div>`;
        return;
    }

    missions.forEach(mission => {
        const card = document.createElement('div');
        card.className = 'task-card'; // Use the new CSS class
        card.setAttribute('data-mission-id', mission.missionId);

        const status = mission.status || 'unknown';
        
        // Capitalize first letter of status for display
        const statusText = status.charAt(0).toUpperCase() + status.slice(1);

        // 獲取任務關聯的軌跡點時間
        let timeDisplay = '';
        if (mission.sourceTrackPointId && window.missionTrackManager) {
            const trackPoint = window.missionTrackManager.trackPoints.get(mission.sourceTrackPointId);
            if (trackPoint && trackPoint.timestamp) {
                const pointTime = new Date(trackPoint.timestamp);
                if (!isNaN(pointTime.getTime())) {
                    timeDisplay = pointTime.toLocaleString('zh-TW', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: false 
                    });
                }
            }
        }

        card.innerHTML = `
            <div class="task-card-header">
                <span class="task-card-icon">${mission.actionIcon || '❓'}</span>
                <span class="task-card-title">${mission.actionName || mission.type || '未知任務'}</span>
            </div>
            <div class="task-card-body">
                <div class="task-card-status status-${status.toLowerCase()}">${statusText}</div>
                ${timeDisplay ? `<div class="task-card-time">⏰ ${timeDisplay}</div>` : ''}
            </div>
        `;

        // Add click event to show mission details
        card.addEventListener('click', () => showMissionDetails(mission.missionId));
        container.appendChild(card);
    });
}

// 顯示軌跡點詳細資訊
function showTrackPointDetails(point, taskStatus, vesselId) {
    // 創建彈出視窗
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'trackPointModal';

    // defensive: ensure point exists and derive a safe vessel id string
    const safePoint = point || {};
    const pointTime = new Date(safePoint.timestamp);
    const formattedTime = isNaN(pointTime.getTime()) ? '未知時間' : pointTime.toLocaleString('zh-TW');
    const hasTask = safePoint.hasTask || false;
    const vesselIdStr = (vesselId || getVesselIdString(safePoint) || 'UNKNOWN').toString().toUpperCase();

    // 首先檢查是否有相關的派遣任務（移到外面以便全局訪問）
    const pointId = getSafePointId(point);
    const linkedMissions = hasTask ? missionTrackManager.getLinkedMissions(pointId) : [];

    // 詳細調試：顯示軌跡點 popup 數據
    console.log(`🔍 [Popup 調試] 軌跡點: ${pointId}, Vessel: ${vesselIdStr}`);
    console.log(`  hasTask: ${hasTask}, linkedMissions 數量: ${linkedMissions.length}`);
    if (linkedMissions.length > 0) {
        console.log(`  任務列表:`, linkedMissions.map(m => `${m.missionId} (${m.actionName})`));
    }

    // 診斷：檢查為什麼軌跡點找不到任務
    if (hasTask && linkedMissions.length === 0) {
        const pointId = getSafePointId(point);
        console.warn('⚠️ Popup: 軌跡點沒有關聯任務');
        console.warn('   Point ID:', pointId);
        console.warn('   Point data:', safePoint);
        console.warn('   Vessel ID:', vesselIdStr);

        // 嘗試通過 targetVesselId 找任務（臨時診斷）
        if (typeof getMissionsForVessel !== 'undefined') {
            const vesselMissions = getMissionsForVessel(vesselIdStr);
            if (vesselMissions.length > 0) {
                console.warn('   但通過 targetVesselId 找到了任務:', vesselMissions.map(m => ({
                    id: m.missionId,
                    targetVesselId: m.targetVesselId,
                    sourceTrackPointId: m.sourceTrackPointId,
                    boundPointIds: m.boundPointIds
                })));
            }
        }
    }

    // 處理任務資訊變數（用於備用顯示）
    let taskType = '', taskDescription = '';
    let fallbackTaskStatus = '';
    if (hasTask && linkedMissions.length === 0) {
        // 沒有相關派遣任務時，使用隨機邏輯
        const random = Math.random();
        if (random > 0.8) {
            taskType = '衛星重拍';
            taskDescription = '獲取該位置的最新衛星影像';
        } else if (random > 0.6) {
            taskType = 'UAV派遣';
            taskDescription = '派遣無人機進行近距離偵察';
        } else if (random > 0.4) {
            taskType = '聯繫船隻';
            taskDescription = '嘗試與船隻建立通訊聯繫';
        } else {
            taskType = '持續追蹤';
            taskDescription = '執行船隻位置監控和行為分析';
        }
        fallbackTaskStatus = Math.random() > 0.7 ? '已完成' : '執行中';
    }

    modal.innerHTML = `
        <div class="modal-content mission-details-content">
            <div class="modal-header">
                <div class="modal-title">🚢 ${vesselIdStr} 軌跡點詳情</div>
                <button class="close-btn" onclick="closeTrackPointModal()">&times;</button>
            </div>

            ${linkedMissions.length > 0 ? `
                <div class="mission-basic-info">
                    <div class="mission-overview">
                        <div class="mission-status">
                            <span class="status-label">狀態：</span>
                            <span class="mission-status-badge ${linkedMissions[0].status === 'completed' ? 'status-completed' : linkedMissions[0].status === 'scheduled' ? 'status-scheduled' : 'status-dispatched'}">${linkedMissions[0].status}</span>
                        </div>

                        <div class="mission-target">
                            <span class="target-label">目標：</span>
                            <span class="target-value">${linkedMissions[0].target || 'N/A'}</span>
                        </div>

                        <div class="mission-progress">
                            <span class="progress-label">進度：</span>
                            <div class="progress-bar-container">
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: ${linkedMissions[0].progress || 0}%"></div>
                                </div>
                                <span class="progress-percentage">${linkedMissions[0].progress || 0}%</span>
                            </div>
                        </div>
                    </div>

                    <div class="mission-timing">
                        <div class="time-info">
                            <div class="time-item">
                                <span class="time-label">⏰ 建立時間：</span>
                                <span class="time-value">${linkedMissions[0].startTime ? new Date(linkedMissions[0].startTime).toLocaleString('zh-TW') : 'N/A'}</span>
                            </div>

                            ${linkedMissions[0].scheduledTime ? `
                                <div class="time-item">
                                    <span class="time-label">📅 預定執行：</span>
                                    <span class="time-value scheduled-time">${new Date(linkedMissions[0].scheduledTime).toLocaleString('zh-TW')}</span>
                                </div>
                            ` : ''}

                            <div class="time-item">
                                <span class="time-label">⏳ 預計完成：</span>
                                <span class="time-value">${linkedMissions[0].estimatedCompletion || '計算中'}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="mission-description">
                    <h4>📋 任務描述</h4>
                    <div class="description-content">
                        ${linkedMissions[0].description || '標準' + linkedMissions[0].type + '任務，監控目標' + (linkedMissions[0].target || '') + '的活動狀況。'}
                    </div>
                </div>
            ` : ''}

            <div class="track-point-details">
                <div class="location-info">
                    <h4>📍 位置資訊</h4>
                    <div class="detail-row">
                        <span>座標:</span>
                        <span>${point.lat.toFixed(6)}°N, ${point.lon.toFixed(6)}°E</span>
                    </div>
                    <div class="detail-row">
                        <span>時間:</span>
                        <span>${formattedTime}</span>
                    </div>
                    <div class="detail-row">
                        <span>航行狀態:</span>
                        <span>${hasTask ? '執行任務中' : '正常航行'}</span>
                    </div>
                    <div class="detail-row">
                        <span>🇹🇼 距台灣:</span>
                        <span>${calculateDistanceToTaiwan(point.lat, point.lon).toFixed(1)}km</span>
                    </div>
                    ${point.threatLevel ? `
                    <div class="detail-row">
                        <span>⚠️ 威脅等級:</span>
                        <span>${point.threatLevel.symbol} ${point.threatLevel.name}</span>
                    </div>
                    ` : ''}
                </div>

                ${point.speed ? `
                <div class="vessel-status-info">
                    <h4>🚢 船舶狀態</h4>
                    <div class="detail-row">
                        <span>航行速度:</span>
                        <span>${point.speed.toFixed(1)} 節</span>
                    </div>
                    ${point.course ? `
                    <div class="detail-row">
                        <span>航向:</span>
                        <span>${point.course.toFixed(0)}°</span>
                    </div>
                    ` : ''}
                    ${point.signalStrength ? `
                    <div class="detail-row">
                        <span>信號強度:</span>
                        <span>${point.signalStrength.toFixed(1)} dBm</span>
                    </div>
                    ` : ''}
                    ${point.deviationFromRoute ? `
                    <div class="detail-row">
                        <span>偏離航線:</span>
                        <span>${point.deviationFromRoute.toFixed(1)}km</span>
                    </div>
                    ` : ''}
                </div>
                ` : ''}

                ${!linkedMissions.length && hasTask ? `
                    <div class="task-info-section">
                        <h4>📋 任務資訊</h4>
                        <div class="task-detail-row">
                            <span>任務類型:</span>
                            <span>${taskType || '監控任務'}</span>
                        </div>
                        <div class="task-detail-row">
                            <span>狀態:</span>
                            <span class="task-status-${(fallbackTaskStatus || taskStatus) === '已完成' ? 'completed' : 'scheduled'}">${fallbackTaskStatus || taskStatus || '執行中'}</span>
                        </div>
                        <div class="task-detail-row">
                            <span>說明:</span>
                            <span>${taskDescription || '執行船舶追蹤和行為分析'}</span>
                        </div>
                    </div>
                ` : ''}

                ${!hasTask ? '<div class="no-task-info">📍 此位置點無特殊任務</div>' : ''}
            </div>

            <div class="modal-actions">
                <button class="btn btn-secondary" onclick="closeTrackPointModal()">關閉</button>
                ${linkedMissions.length > 0 ? `<button class="btn btn-primary" onclick="showMissionDetails('${linkedMissions[0].missionId}')">查看任務詳情</button>` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 關閉軌跡點詳情彈窗
function closeTrackPointModal() {
    const modal = document.getElementById('trackPointModal');
    if (modal) {
        modal.remove();
    }
}

// ==================== 時間軸多時間點功能 ====================

// 解析時間字串為 Date 物件（假設今天）
function parseTimeString(timeStr) {
    const today = new Date().toISOString().split('T')[0];
    return new Date(`${today} ${timeStr}`);
}

// 取得事件標題
function getEventTitle(event) {
    switch(event.type) {
        case 'vessel': return `🚢 ${event.id.toUpperCase()}`;
        case 'rf': return `📡 ${event.rfId || event.id.toUpperCase()}`;
        case 'area': return `🗺️ ${event.aoiName || event.id.toUpperCase()}`;
        default: return event.id.toUpperCase();
    }
}

// ==================== 時間軸多時間點功能結束 ====================

// 恢复全局时间轴（清空時間軸，因為預設不顯示）
function restoreGlobalTimeline() {
    const timelineContainer = document.querySelector('.timeline-container');
    if (!timelineContainer) return;

    // 清空時間軸，顯示提示訊息
    timelineContainer.innerHTML = `
        <div class="timeline-line"></div>
        <div class="timeline-item" style="position: absolute; left: 50%; transform: translateX(-50%); text-align: center; color: #64748b; font-size: 13px; white-space: nowrap;">
            點擊船舶事件以查看任務時間軸
        </div>
    `;
}

// 新增：添加时间轴事件（時間軸現在只在點擊船舶時顯示，此函數暫時保留但不執行渲染）
function addTimelineEvent(status, title, description, missionId) {
    // 時間軸已改為只顯示船舶任務，此函數保留以避免其他地方調用時出錯
    // 如果當前是船舶模式，由 generateVesselTimeline 處理顯示
    console.log('addTimelineEvent 已棄用，時間軸現由 generateVesselTimeline 管理');
}

// 获取当前选中事件的目标信息
function getTargetInfo() {
    const currentEvent = eventStorage.getEvent(window.currentEventId);
    if (!currentEvent) return 'N/A';

    switch (currentEvent.type) {
        case 'area':
            // 区域事件：使用区域名称
            return currentEvent.aoiName || '区域-N/A';
        case 'vessel':
            // 船舶事件：使用MMSI
            return currentEvent.mmsi || 'MMSI-N/A';
        default:
            return window.currentEventId.toUpperCase();
    }
}

// 高亮任务卡并同步高亮时间轴
function highlightMissionCard(missionId) {
    // 清除所有高亮
    document.querySelectorAll('.mission-card').forEach(card => {
        card.classList.remove('highlighted');
    });
    document.querySelectorAll('.timeline-item').forEach(item => {
        item.classList.remove('highlighted');
    });

    // 高亮选中的任务卡
    const missionCard = document.querySelector(`[data-mission-id="${missionId}"]`);
    if (missionCard) {
        missionCard.classList.add('highlighted');
        // 滚动到视野内
        missionCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }

    // 高亮对应时间轴项
    const timelineItem = document.querySelector(`.timeline-item[data-mission-id="${missionId}"]`);
    if (timelineItem) {
        timelineItem.classList.add('highlighted');
        // 滚动到视野内
        timelineItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

// 顯示已完成任務 (歷史軌跡點) - 包含威脅評估
function showCompletedTasksForPoint(point, vesselId) {
    const completedTasks = getCompletedTasksForPoint(point, vesselId);
    const vesselEvent = eventStorage.getEvent(vesselId);
    const vesselHistory = vesselEvent && vesselEvent.trackPoints ? vesselEvent.trackPoints : [];

    if (typeof showTaskModalWithThreat === 'function') {
        showTaskModalWithThreat(point, vesselId, completedTasks, '已完成任務', 'completed', vesselHistory);
    } else {
        showTaskModal(point, vesselId, completedTasks, '已完成任務', 'completed');
    }
}

// 顯示已排程任務 (未來軌跡點) - 包含威脅評估
function showScheduledTasksForPoint(point, vesselId) {
    const scheduledTasks = getScheduledTasksForPoint(point, vesselId);
    const vesselEvent = eventStorage.getEvent(vesselId);
    const vesselHistory = vesselEvent && vesselEvent.trackPoints ? vesselEvent.trackPoints : [];

    if (typeof showTaskModalWithThreat === 'function') {
        showTaskModalWithThreat(point, vesselId, scheduledTasks, '已排程任務', 'scheduled', vesselHistory);
    } else {
        showTaskModal(point, vesselId, scheduledTasks, '已排程任務', 'scheduled');
    }
}

// 統一的任務模態框顯示（包含AIS訊號狀態）
function showTaskModal(point, vesselId, tasks, taskTypeTitle, taskStatus) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'trackPointTaskModal';

    const pointTime = new Date(point.timestamp);
    const formattedTime = pointTime.toLocaleString('zh-TW');

    // 檢查AIS訊號狀態
    const isAbnormal = checkSignalAbnormality(point);
    const aisStatus = isAbnormal ? '異常' : '正常';
    const aisStatusClass = isAbnormal ? 'ais-abnormal' : 'ais-normal';

    const tasksHtml = tasks.length > 0
        ? tasks.map(task => `
            <div class="task-item ${taskStatus}">
                <div class="task-header">
                    <span class="task-icon">${task.icon}</span>
                    <span class="task-type">${task.type}</span>
                    <span class="task-status-badge status-${taskStatus}">${taskStatus === 'completed' ? '已完成' : '已排程'}</span>
                </div>
                <div class="task-description">${task.description}</div>
                <div class="task-time">${taskStatus === 'completed' ? '完成時間' : '預計執行'}: ${task.time}</div>
            </div>
        `).join('')
        : `<div class="no-tasks">此軌跡點${taskStatus === 'completed' ? '尚無已完成' : '暫無已排程'}任務</div>`;

    modal.innerHTML = `
        <div class="modal-content task-modal">
            <div class="modal-header">
                <div class="modal-title">🚢 ${vesselId.toUpperCase()} - ${taskTypeTitle}</div>
                <button class="close-btn" onclick="closeTaskModal()">&times;</button>
            </div>

            <div class="point-info">
                <div class="point-location">📍 ${point.lat.toFixed(6)}°N, ${point.lon.toFixed(6)}°E</div>
                <div class="point-time">🕐 ${formattedTime}</div>
                <div class="ais-status">
                    <span class="ais-label">📡 AIS訊號狀態:</span>
                    <span class="ais-value ${aisStatusClass}">${aisStatus}</span>
                </div>
                ${isAbnormal ? `
                    <div class="signal-details">
                        <div class="signal-item">速度: ${point.speed ? point.speed.toFixed(1) : 'N/A'} 節</div>
                        <div class="signal-item">信號強度: ${point.signalStrength ? point.signalStrength.toFixed(1) : 'N/A'} dBm</div>
                        <div class="signal-item">航線偏離: ${point.deviationFromRoute ? point.deviationFromRoute.toFixed(1) : 'N/A'} 公里</div>
                    </div>
                ` : ''}
            </div>

            <div class="tasks-container">
                <h4>${taskTypeTitle}</h4>
                ${tasksHtml}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 關閉任務模態框
function closeTaskModal() {
    const modal = document.getElementById('trackPointTaskModal');
    if (modal) {
        modal.remove();
    }
}

// 檢查訊號異常狀態（全局函數版本）
function checkSignalAbnormality(trackPointData) {
    // 1. 檢查是否有異常的速度變化
    if (trackPointData.speed && (trackPointData.speed > 25 || trackPointData.speed < 0.5)) {
        return true;
    }

    // 2. 檢查是否偏離航線過遠
    if (trackPointData.deviationFromRoute && trackPointData.deviationFromRoute > 5) {
        return true;
    }

    // 3. 檢查AIS信號強度
    if (trackPointData.signalStrength && trackPointData.signalStrength < -80) {
        return true;
    }

    // 4. 檢查是否在禁航區域
    if (trackPointData.inRestrictedZone) {
        return true;
    }

    return false;
}

// 獲取軌跡點的已完成任務
function getCompletedTasksForPoint(point, vesselId) {
    const tasks = [];

    if (point.hasTask) {
        // 檢查是否有相關的派遣任務
        const linkedMissions = missionTrackManager.getLinkedMissions(getSafePointId(point));

        if (linkedMissions.length > 0) {
            // 顯示相關派遣任務的資訊
            linkedMissions.forEach(mission => {
                if (mission.status === '已完成') {
                    // 將派遣任務類型映射到四個固定選項
                    let taskIcon, taskType, taskDescription;

                    switch (mission.type) {
                        case 'UAV 派遣':
                            taskIcon = '🚁';
                            taskType = 'UAV派遣';
                            taskDescription = `已完成無人機監控 - 目標: ${mission.target}`;
                            break;
                        case '衛星重拍':
                            taskIcon = '🛰️';
                            taskType = '衛星重拍';
                            taskDescription = `已獲取衛星影像 - 目標: ${mission.target}`;
                            break;
                        case '持續追蹤':
                            taskIcon = '🎯';
                            taskType = '持續追蹤';
                            taskDescription = `已完成船隻監控 - 目標: ${mission.target}`;
                            break;
                        case '聯繫船隻':
                            taskIcon = '📞';
                            taskType = '聯繫船隻';
                            taskDescription = `已完成通訊嘗試 - 目標: ${mission.target}`;
                            break;
                        default:
                            taskIcon = '🎯';
                            taskType = '持續追蹤';
                            taskDescription = `已完成${mission.type} - 目標: ${mission.target}`;
                    }

                    tasks.push({
                        icon: taskIcon,
                        type: taskType,
                        description: taskDescription,
                        time: mission.completedTime ? new Date(mission.completedTime).toLocaleString('zh-TW') : new Date(mission.startTime).toLocaleString('zh-TW'),
                        missionId: mission.missionId
                    });
                }
            });
        }

        // 如果沒有相關派遣任務，則使用原有邏輯
        if (tasks.length === 0) {
            tasks.push({
                icon: '🎯',
                type: '持續追蹤',
                description: '已完成船隻位置監控和行為分析',
                time: new Date(point.timestamp).toLocaleString('zh-TW')
            });

            if (Math.random() > 0.7) {
                tasks.push({
                    icon: '🛰️',
                    type: '衛星重拍',
                    description: '已獲取該位置的最新衛星影像',
                    time: new Date(point.timestamp + 30 * 60 * 1000).toLocaleString('zh-TW')
                });
            }
        }
    }

    return tasks;
}

// 獲取軌跡點的已排程任務
function getScheduledTasksForPoint(point, vesselId) {
    const tasks = [];

    if (point.hasTask) {
        // 檢查是否有相關的派遣任務
        const linkedMissions = missionTrackManager.getLinkedMissions(getSafePointId(point));

        if (linkedMissions.length > 0) {
            // 顯示相關派遣任務的資訊
            linkedMissions.forEach(mission => {
                if (mission.status === '派遣' || mission.status === '執行任務') {
                    // 將派遣任務類型映射到四個固定選項
                    let taskIcon, taskType, taskDescription;

                    switch (mission.type) {
                        case 'UAV 派遣':
                            taskIcon = '🚁';
                            taskType = 'UAV派遣';
                            taskDescription = `預定無人機監控 - 目標: ${mission.target}`;
                            break;
                        case '衛星重拍':
                            taskIcon = '🛰️';
                            taskType = '衛星重拍';
                            taskDescription = `預定獲取衛星影像 - 目標: ${mission.target}`;
                            break;
                        case '持續追蹤':
                            taskIcon = '🎯';
                            taskType = '持續追蹤';
                            taskDescription = `預定監控船隻 - 目標: ${mission.target}`;
                            break;
                        case '聯繫船隻':
                            taskIcon = '📞';
                            taskType = '聯繫船隻';
                            taskDescription = `預定與船隻通訊 - 目標: ${mission.target}`;
                            break;
                        default:
                            taskIcon = '🎯';
                            taskType = '持續追蹤';
                            taskDescription = `預定執行${mission.type} - 目標: ${mission.target}`;
                    }

                    const statusText = mission.status === '派遣' ? '已排程' : '執行中';
                    tasks.push({
                        icon: taskIcon,
                        type: taskType,
                        description: `${statusText}: ${taskDescription}`,
                        time: mission.scheduledTime ? new Date(mission.scheduledTime).toLocaleString('zh-TW') : new Date(mission.startTime).toLocaleString('zh-TW'),
                        missionId: mission.missionId
                    });
                }
            });
        }

        // 如果沒有相關派遣任務，則使用原有邏輯
        if (tasks.length === 0) {
            tasks.push({
                icon: '🎯',
                type: '預定追蹤',
                description: '將在船隻抵達此位置時進行監控',
                time: new Date(point.timestamp).toLocaleString('zh-TW')
            });

            if (Math.random() > 0.6) {
                tasks.push({
                    icon: '🚁',
                    type: 'UAV派遣',
                    description: '派遣無人機進行近距離偵察',
                    time: new Date(point.timestamp + 60 * 60 * 1000).toLocaleString('zh-TW')
                });
            }
        }
    }

    return tasks;
}
// 顯示派遣任務詳情（包含相關軌跡點資訊）
function showMissionDetails(missionId) {
    console.log('Showing mission details for:', missionId);

    // 從統一管理器獲取任務資訊和相關軌跡點
    const mission = missionTrackManager.missions.get(missionId);
    const linkedTrackPoints = missionTrackManager.getLinkedTrackPoints(missionId);

    console.log('Mission data:', mission);
    console.log('Linked track points:', linkedTrackPoints);

    if (!mission) {
        console.warn('Mission not found:', missionId);
        alert('任務資訊不存在');
        return;
    }

    // 創建任務詳情模態框
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.display = 'block';
    modal.id = 'missionDetailsModal';

    const formattedStartTime = new Date(mission.startTime).toLocaleString('zh-TW');
    const formattedScheduledTime = mission.scheduledTime ? new Date(mission.scheduledTime).toLocaleString('zh-TW') : null;

    // 判斷任務狀態和顯示顏色
    const statusClass = mission.status === '已完成' ? 'status-completed' :
        mission.status === '執行任務' ? 'status-executing' :
            mission.status === '派遣' ? 'status-dispatched' : 'status-scheduled';

    // 生成相關軌跡點的HTML
    const trackPointsHtml = linkedTrackPoints.length > 0
        ? linkedTrackPoints.map(point => {
            const pointTime = new Date(point.timestamp).toLocaleString('zh-TW');
            const pointType = point.type === 'History' ? '歷史' : point.type === 'Future' ? '預測' : '當前';
            const threatLevel = point.threatLevel ? `${point.threatLevel.symbol} ${point.threatLevel.name}` : '未評估';
            const distance = point.lat && point.lon ? calculateDistanceToTaiwan(point.lat, point.lon).toFixed(1) : 'N/A';

            return `
                <div class="linked-track-point" onclick="highlightTrackPoint('${point.pointId}')">
                    <div class="track-point-header">
                        <span class="track-point-type">${pointType}點</span>
                        <span class="track-point-time">${pointTime}</span>
                    </div>
                    <div class="track-point-location">
                        📍 ${point.lat ? point.lat.toFixed(6) : 'N/A'}°N, ${point.lon ? point.lon.toFixed(6) : 'N/A'}°E
                    </div>
                    <div class="track-point-threat">
                        ⚠️ 威脅等級: ${threatLevel} | 🇹🇼 距台灣: ${distance}km
                    </div>
                </div>
            `;
        }).join('')
        : '<div class="no-track-points">此任務暫無關聯的軌跡點</div>';

    modal.innerHTML = `
        <div class="modal-content mission-details-content">
            <div class="modal-header">
                <div class="modal-title">🚢 ${mission.type} - ${missionId}</div>
                <button class="close-btn" onclick="closeMissionDetailsModal()">&times;</button>
            </div>

            <div class="mission-basic-info">
                <div class="mission-overview">
                    <div class="mission-status">
                        <span class="status-label">狀態：</span>
                        <span class="mission-status-badge ${statusClass}">${mission.status}</span>
                    </div>

                    <div class="mission-target">
                        <span class="target-label">目標：</span>
                        <span class="target-value">${mission.target || 'N/A'}</span>
                    </div>

                    <div class="mission-progress">
                        <span class="progress-label">進度：</span>
                        <div class="progress-bar-container">
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${mission.progress || 0}%"></div>
                            </div>
                            <span class="progress-percentage">${mission.progress || 0}%</span>
                        </div>
                    </div>
                </div>

                <div class="mission-timing">
                    <div class="time-info">
                        <div class="time-item">
                            <span class="time-label">⏰ 建立時間：</span>
                            <span class="time-value">${formattedStartTime}</span>
                        </div>

                        ${formattedScheduledTime ? `
                            <div class="time-item">
                                <span class="time-label">📅 預定執行：</span>
                                <span class="time-value scheduled-time">${formattedScheduledTime}</span>
                            </div>
                        ` : ''}

                        <div class="time-item">
                            <span class="time-label">⏳ 預計完成：</span>
                            <span class="time-value">${mission.estimatedCompletion || '計算中'}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mission-description">
                <h4>📋 任務描述</h4>
                <div class="description-content">
                    ${mission.description || '標準' + mission.type + '任務，監控目標' + (mission.target || '') + '的活動狀況。'}
                </div>
            </div>

            ${mission.type === '衛星重拍' && linkedTrackPoints.length > 0 && linkedTrackPoints.some(point => point.type !== 'Future') ? `
            <div class="satellite-image-section">
                <h4>🛰️ 衛星影像</h4>
                <div class="satellite-image-container">
                    <img src="images/image1.png"
                         alt="衛星影像"
                         style="max-width: 100%; height: auto; border-radius: 6px; border: 1px solid #e5e7eb;" />
                </div>
            </div>
            ` : ''}

            <div class="linked-track-points-section">
                <h4>🎯 相關軌跡點 (${linkedTrackPoints.length})</h4>
                <div class="track-points-container">
                    ${trackPointsHtml}
                </div>
            </div>

            <div class="mission-actions">
                <button class="btn btn-secondary" onclick="closeMissionDetailsModal()">關閉</button>
                ${mission.status !== '已完成' ? '<button class="btn btn-primary" onclick="updateMissionStatus(\'' + missionId + '\')">更新狀態</button>' : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// 關閉任務詳情模態框
function closeMissionDetailsModal() {
    const modal = document.getElementById('missionDetailsModal');
    if (modal) {
        modal.remove();
    }
}

// 高亮軌跡點（當從任務詳情點擊軌跡點時）
function highlightTrackPoint(pointId) {
    console.log('Highlighting track point:', pointId);

    // 在地圖上高亮對應的軌跡點
    if (window.mainMap && window.vesselMarkers) {
        Object.keys(vesselMarkers).forEach(vesselId => {
            const vesselData = vesselMarkers[vesselId];
            if (vesselData.trackPoints) {
                vesselData.trackPoints.forEach(point => {
                    if (point.pointId === pointId && point.marker) {
                        // 暫時放大標記以示高亮
                        const originalIcon = point.marker.getIcon();
                        point.marker.setIcon(L.divIcon({
                            ...originalIcon.options,
                            html: originalIcon.options.html.replace('font-size: 16px', 'font-size: 24px'),
                            className: originalIcon.options.className + ' highlighted-track-point'
                        }));

                        // 3秒後恢復原狀
                        setTimeout(() => {
                            if (point.marker) {
                                point.marker.setIcon(originalIcon);
                            }
                        }, 3000);

                        // 地圖移動到該點
                        mainMap.setView([point.lat, point.lon], Math.max(mainMap.getZoom(), 10));
                    }
                });
            }
        });
    }
}

// 更新任務狀態
function updateMissionStatus(missionId) {
    const mission = missionTrackManager.missions.get(missionId);
    if (mission) {
        // 簡單的狀態循環邏輯
        const statusCycle = ['派遣', '執行任務', '已完成'];
        const currentIndex = statusCycle.indexOf(mission.status);
        const nextIndex = (currentIndex + 1) % statusCycle.length;

        mission.status = statusCycle[nextIndex];
        mission.progress = mission.status === '已完成' ? 100 :
            mission.status === '執行任務' ? Math.min(90, (mission.progress || 0) + 30) :
                mission.progress || 15;

        console.log(`Updated mission ${missionId} status to: ${mission.status}, progress: ${mission.progress}%`);

        // 刷新任務詳情顯示
        closeMissionDetailsModal();
        showMissionDetails(missionId);

        // 更新任務卡片顯示
        updateMissionCardDisplay(missionId, mission);
    }
}

// 更新任務卡片顯示
function updateMissionCardDisplay(missionId, mission) {
    const missionCard = document.querySelector(`[data-mission-id="${missionId}"]`);
    if (missionCard) {
        const statusBadge = missionCard.querySelector('.mission-status');
        const progressFill = missionCard.querySelector('.progress-fill');
        const progressText = missionCard.querySelector('.progress-text');

        if (statusBadge) {
            statusBadge.textContent = mission.status;
            statusBadge.className = `mission-status ${mission.status === '已完成' ? 'status-completed' :
                mission.status === '執行任務' ? 'status-executing' :
                    mission.status === '派遣' ? 'status-dispatched' : 'status-scheduled'}`;
        }

        if (progressFill) {
            progressFill.style.width = `${mission.progress}%`;
        }

        if (progressText) {
            progressText.textContent = mission.status === '已完成' ? '已完成 | 任務結束' :
                `進度: ${mission.progress}% | ${mission.estimatedCompletion || '計算中'}`;
        }
    }
}

// === 決策建議收合展開功能 ===
function toggleDecisionRecommendation() {
    const content = document.getElementById('decision-recommendation-content');
    const icon = document.getElementById('decision-collapse-icon');

    if (!content || !icon) {
        console.warn('決策建議收合元素未找到');
        return;
    }

    if (content.classList.contains('collapsed')) {
        // 展開
        content.classList.remove('collapsed');
        content.classList.add('expanded');
        icon.textContent = '▲';
    } else {
        // 收合
        content.classList.remove('expanded');
        content.classList.add('collapsed');
        icon.textContent = '▼';
    }
}

// 保障性：在 DOMContentLoaded 時再次嘗試 attach（避免載入順序造成的 race）
document.addEventListener('DOMContentLoaded', () => {
    if (window.__attachSeaDotManager && !window.seaDotManager) {
        const ok = window.__attachSeaDotManager();
        if (ok) console.log('SeaDotManager attached on DOMContentLoaded fallback');
    }

    // 🆕 為預設的 area-001 事件啟動定期更新機制
    if (window.areaEventUpdateManager) {
        // 延遲啟動以確保所有資料都已載入
        setTimeout(() => {
            console.log('🔄 為預設事件 area-001 啟動定期威脅分數更新');
            window.areaEventUpdateManager.startEventUpdates('area-001');
        }, 3000); // 延遲3秒確保地圖和數據完全初始化
    }
});

// === 清除地圖上除歷史軌跡點外的所有信號點功能 ===

// 全域變數用於儲存被清除的信號點資料
window.hiddenSignalPoints = {
    seaDots: new Map(),           // 儲存被清除的 SeaDotManager 點
    vesselMarkers: {},            // 儲存被清除的船舶標記
    investigationRange: null,     // 儲存被清除的調查範圍
    temporaryMarkers: [],         // 儲存被清除的臨時標記
    clearTime: null,              // 清除時間戳
    isCleared: false              // 是否有被清除的點
};

// 為了向後兼容，創建一個本地別名
const hiddenSignalPoints = window.hiddenSignalPoints;

/**
 * 安全檢查地圖實例並獲取有效的地圖對象
 * @returns {Object|null} 有效的地圖實例或null
 */
function getValidMapInstance() {
    // 首先檢查全局的 mainMap 變量
    if (typeof mainMap !== 'undefined' && mainMap && typeof mainMap.hasLayer === 'function') {
        return mainMap;
    }
    // 檢查 window.mainMap
    if (window.mainMap && typeof window.mainMap.hasLayer === 'function') {
        return window.mainMap;
    }
    // 都沒有找到有效的地圖實例
    return null;
}