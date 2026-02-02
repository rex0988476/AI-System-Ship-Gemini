// AreaEventUpdateManager - 區域監控事件定期更新管理器
(function(){
  /**
   * 區域監控事件定期更新管理器
   * 負責定期更新區域內所有信號點的威脅分數，並重新計算可疑船隻列表
   */
  class AreaEventUpdateManager {
    constructor() {
      this.updateInterval = 3 * 60 * 1000; // 3分鐘（毫秒）
      // this.updateInterval = 10 * 1000; // 10秒（毫秒）test
      this.activeTimers = new Map(); // 儲存每個事件的定時器 ID
      console.log('🔄 AreaEventUpdateManager 已初始化');
    }

    /**
     * 為區域監控事件啟動定期更新
     * @param {string} eventId - 事件ID
     */
    startEventUpdates(eventId) {
      // 檢查事件是否存在且為區域監控事件
      if (!window.eventStorage) {
        console.error('❌ EventStorage 未初始化');
        return;
      }

      const eventData = window.eventStorage.getEvent(eventId);
      if (!eventData) {
        console.error(`❌ 找不到事件: ${eventId}`);
        return;
      }

      if (eventData.type !== 'area') {
        console.warn(`⚠️ 事件 ${eventId} 不是區域監控事件，跳過`);
        return;
      }

      // 如果該事件已有定時器在運行，先清除
      if (this.activeTimers.has(eventId)) {
        console.log(`🔄 事件 ${eventId} 已有更新定時器運行，先清除舊定時器`);
        this.stopEventUpdates(eventId);
      }

      console.log(`✅ 開始為事件 ${eventId} 啟動定期更新`);

      // 設定定時器
      const timerId = setInterval(() => {
        this.updateAreaEventThreats(eventId);
      }, this.updateInterval);

      // 儲存定時器 ID
      this.activeTimers.set(eventId, timerId);

      // 立即執行一次更新（可選，根據需求決定）
      // this.updateAreaEventThreats(eventId);
    }

    /**
     * 停止區域監控事件的定期更新
     * @param {string} eventId - 事件ID
     */
    stopEventUpdates(eventId) {
      const timerId = this.activeTimers.get(eventId);
      if (timerId) {
        clearInterval(timerId);
        this.activeTimers.delete(eventId);
        console.log(`🛑 停止事件 ${eventId} 的定期更新`);
      } else {
        console.warn(`⚠️ 事件 ${eventId} 沒有運行中的更新定時器`);
      }
    }

    /**
     * 停止所有區域監控事件的定期更新
     */
    stopAllEventUpdates() {
      console.log(`🛑 停止所有事件的定期更新 (共 ${this.activeTimers.size} 個)`);
      this.activeTimers.forEach((timerId, eventId) => {
        clearInterval(timerId);
        console.log(`  - 已停止事件 ${eventId}`);
      });
      this.activeTimers.clear();
    }

    /**
     * 更新區域監控事件的威脅分數和可疑船隻列表
     * @param {string} eventId - 事件ID
     */
    async updateAreaEventThreats(eventId) {
      console.log(`\n🔄 ========== 開始更新事件 ${eventId} 的威脅分數 ==========`);
      console.log(`⏰ 更新時間: ${new Date().toLocaleString('zh-TW')}`);

      try {
        // 1. 獲取事件資料
        const eventData = window.eventStorage.getEvent(eventId);
        if (!eventData) {
          console.error(`❌ 找不到事件: ${eventId}`);
          return;
        }

        if (eventData.type !== 'area') {
          console.warn(`⚠️ 事件 ${eventId} 不是區域監控事件`);
          return;
        }

        // 2. 重新獲取區域內的 RF 信號（無 AIS）
        console.log(`📡 重新查詢區域內的 RF 信號...`);
        const rfSignalsInfo = window.AreaEventManager.getRFSignalsWithoutAIS(eventData);

        if (!rfSignalsInfo || !rfSignalsInfo.rfSignalsWithoutAIS) {
          console.warn(`⚠️ 無法獲取事件 ${eventId} 的 RF 信號資料`);
          return;
        }

        console.log(`📊 找到 ${rfSignalsInfo.rfSignalsWithoutAIS.length} 個 RF 信號點`);

        // 3. 更新每個 RF 信號的威脅分數（模擬變化）
        const updatedRFSignals = rfSignalsInfo.rfSignalsWithoutAIS.map((signal, index) => {
          const oldThreatScore = signal.threatScore || 0;
          
          // 模擬威脅分數的變化 (±10分的隨機變動)
          const change = Math.floor(Math.random() * 21) - 10; // -10 到 +10
          let newThreatScore = oldThreatScore + change;
          
          // 確保分數在合理範圍內
          newThreatScore = Math.max(40, Math.min(95, newThreatScore));

          const changeSymbol = change > 0 ? '↑' : (change < 0 ? '↓' : '→');
          console.log(`  ${index + 1}. RF: ${signal.rfId} - 威脅分數: ${oldThreatScore} ${changeSymbol} ${newThreatScore} (${change >= 0 ? '+' : ''}${change})`);

          return {
            ...signal,
            threatScore: newThreatScore,
            lastUpdated: new Date().toISOString()
          };
        });

        // 4. 重新生成可疑船隻候選資料
        console.log(`\n🚢 重新生成可疑船隻候選資料...`);
        const updatedCandidatesData = updatedRFSignals.map((signal, index) => {
          // 重新生成可疑船隻資訊（使用更新後的威脅分數）
          const candidateData = {
            rfId: signal.rfId,
            frequency: signal.frequency,
            strength: signal.strength,
            index: index,
            aisStatus: signal.aisStatus,
            threatScore: signal.threatScore,
            sourceSeaDot: signal.sourceSeaDot
          };

          // 生成新的可疑船隻資訊
          const suspiciousVessel = window.AreaEventManager.generateSuspiciousVesselCandidate(candidateData);
          candidateData.suspiciousVessel = suspiciousVessel;

          return candidateData;
        });

        // 5. 過濾出高威脅船隻（威脅分數 > 80）
        const highThreatVessels = updatedCandidatesData.filter(candidate => {
          const threatScore = candidate.suspiciousVessel?.threatScore || 0;
          return threatScore > 80;
        });

        // 排序（威脅分數由高到低）
        highThreatVessels.sort((a, b) => {
          const scoreA = a.suspiciousVessel?.threatScore || 0;
          const scoreB = b.suspiciousVessel?.threatScore || 0;
          return scoreB - scoreA;
        });

        console.log(`\n📊 更新結果統計:`);
        console.log(`   總候選數: ${updatedCandidatesData.length}`);
        console.log(`   高威脅船隻 (>80): ${highThreatVessels.length}`);
        if (highThreatVessels.length > 0) {
          console.log(`   威脅分數範圍: ${highThreatVessels[highThreatVessels.length - 1].suspiciousVessel?.threatScore} ~ ${highThreatVessels[0].suspiciousVessel?.threatScore}`);
          console.log(`   高威脅船隻列表:`);
          highThreatVessels.forEach((vessel, idx) => {
            console.log(`     ${idx + 1}. MMSI: ${vessel.suspiciousVessel.vesselMmsi}, 威脅分數: ${vessel.suspiciousVessel.threatScore}, 類型: ${vessel.suspiciousVessel.vesselType}`);
          });
        }

        // 6. 更新事件資料到 eventStorage
        const updateData = {
          suspiciousVesselCandidates: updatedCandidatesData.map(c => c.rfId),
          suspiciousVesselCandidatesData: updatedCandidatesData,
          lastThreatUpdate: new Date().toLocaleString('zh-TW'),
          highThreatCount: highThreatVessels.length
        };

        window.eventStorage.updateEvent(eventId, updateData);
        console.log(`💾 已更新事件 ${eventId} 的資料到 eventStorage`);

        // 7. 更新地圖上的RF信號點（更新威脅分數和標記樣式）
        console.log(`🗺️ 開始更新地圖上的RF信號點...`);
        this.updateMapRFSignals(eventId, updatedRFSignals);

        // 8. 如果該事件正在顯示，先更新詳情面板，然後再發送通知
        if (eventId === window.currentEventId) {
          console.log(`🔄 更新詳情面板顯示...`);
          
          // 立即更新詳情面板
          window.updateDetailsPanel(eventId);
          
          // 等待詳情面板更新完成後再發送通知
          setTimeout(() => {
            if (highThreatVessels.length > 0) {
              console.log(`📬 詳情面板已更新，準備發送通知...`);
              this.showUpdateNotification(eventId, highThreatVessels.length);
            }
          }, 300); // 給予 300ms 讓詳情面板完成渲染
        } else {
          // 9. 如果事件未顯示，直接觸發通知（如果有高威脅船隻）
          if (highThreatVessels.length > 0) {
            this.showUpdateNotification(eventId, highThreatVessels.length);
          }
        }

        console.log(`✅ ========== 事件 ${eventId} 威脅分數更新完成 ==========\n`);

      } catch (error) {
        console.error(`❌ 更新事件 ${eventId} 的威脅分數時發生錯誤:`, error);
      }
    }

    /**
     * 更新地圖上的RF信號點標記（威脅分數和樣式）
     * @param {string} eventId - 事件ID
     * @param {Array} updatedRFSignals - 更新後的RF信號資料陣列
     */
    updateMapRFSignals(eventId, updatedRFSignals) {
      if (!window.seaDotManager) {
        console.warn('⚠️ SeaDotManager 未初始化，無法更新地圖標記');
        return;
      }

      let updatedCount = 0;
      let highThreatCount = 0;

      updatedRFSignals.forEach(signal => {
        const rfId = signal.rfId;
        
        // 從 seaDotManager 中查找對應的信號點
        const dot = window.seaDotManager.getDotByRFId(rfId);
        
        if (dot) {
          // 更新威脅分數
          const oldThreatScore = dot.threatScore || 0;
          dot.threatScore = signal.threatScore;
          dot.lastUpdated = signal.lastUpdated;
          
          // 判斷是否為高威脅信號點
          const isHighThreat = signal.threatScore > 80;
          const wasHighThreat = oldThreatScore > 80;
          
          // 更新高威脅標記
          if (isHighThreat) {
            dot.isHighThreat = true;
            highThreatCount++;
            
            // 如果之前不是高威脅，現在變成高威脅，更新顏色為紅色
            if (!wasHighThreat) {
              dot.dotColor = '#ef4444';
              dot.backgroundColor = '#ef4444';
              console.log(`🚨 RF信號 ${rfId} 威脅分數升高: ${oldThreatScore} → ${signal.threatScore} (變為高威脅)`);
            } else {
              console.log(`🔴 RF信號 ${rfId} 威脅分數變化: ${oldThreatScore} → ${signal.threatScore} (維持高威脅)`);
            }
          } else {
            // 如果之前是高威脅，現在降低，恢復原始顏色
            if (wasHighThreat) {
              dot.isHighThreat = false;
              dot.dotColor = '#1eb0f9ff';  // 恢復淺藍色
              dot.backgroundColor = '#1eb0f9ff';
              console.log(`📉 RF信號 ${rfId} 威脅分數降低: ${oldThreatScore} → ${signal.threatScore} (不再是高威脅)`);
            } else {
              console.log(`🔵 RF信號 ${rfId} 威脅分數變化: ${oldThreatScore} → ${signal.threatScore} (維持低威脅)`);
            }
          }
          
          // 更新地圖上的標記樣式
          if (dot.marker && window.mainMap) {
            window.seaDotManager.updateDotMarkerColor(dot);
            updatedCount++;
          }
        } else {
          console.warn(`⚠️ 找不到 RF 信號點: ${rfId}`);
        }
      });

      console.log(`✅ 已更新 ${updatedCount} 個地圖標記點 (其中 ${highThreatCount} 個高威脅信號點)`);
      
      // 如果有高威脅信號點，重新應用呼吸特效
      // ⚠️ 暫時停用呼吸特效
      // if (highThreatCount > 0 && window.seaDotManager && window.seaDotManager.applyHighThreatBreathingEffect) {
      //   const eventData = window.eventStorage.getEvent(eventId);
      //   if (eventData) {
      //     setTimeout(() => {
      //       window.seaDotManager.applyHighThreatBreathingEffect(eventData);
      //       console.log(`✨ 已重新應用高威脅信號點的呼吸特效`);
      //     }, 100);
      //   }
      // }
    }

    /**
     * 顯示更新通知（頁面內滑入通知）
     * @param {string} eventId - 事件ID
     * @param {number} highThreatCount - 高威脅船隻數量
     */
    showUpdateNotification(eventId, highThreatCount) {
      this.createInPageNotification(eventId, highThreatCount);
    }

    /**
     * 創建頁面內通知（從右上角滑入）
     * @param {string} eventId - 事件ID
     * @param {number} highThreatCount - 高威脅船隻數量
     */
    createInPageNotification(eventId, highThreatCount) {
      // 創建通知元素
      const notification = document.createElement('div');
      notification.className = 'threat-notification area-event-notification';
      notification.style.top = '20px'; // 基礎位置
      
      // 檢查是否已有其他通知，如果有則調整位置
      const existingNotifications = document.querySelectorAll('.threat-notification');
      if (existingNotifications.length > 0) {
        const offset = existingNotifications.length * 100; // 每個通知高度約 80px + 間距 20px
        notification.style.top = `${20 + offset}px`;
      }
      
      notification.innerHTML = `
        <div class="notification-icon">�</div>
        <div class="notification-content">
          <div class="notification-title">${eventId.toUpperCase()} 威脅更新</div>
          <div class="notification-text">偵測到 ${highThreatCount} 艘高威脅船隻 (威脅分數 > 80)</div>
        </div>
        <div class="notification-close">×</div>
      `;
      
      // 點擊通知主體時切換到該事件
      const notificationContent = notification.querySelector('.notification-content');
      notificationContent.style.cursor = 'pointer';
      notificationContent.onclick = () => {
        if (window.updateDetailsPanel) {
          window.updateDetailsPanel(eventId);
        }
        // 立即移除通知
        this.removeNotification(notification);
      };
      
      // 點擊關閉按鈕
      const closeBtn = notification.querySelector('.notification-close');
      closeBtn.onclick = (e) => {
        e.stopPropagation(); // 防止觸發通知的點擊事件
        this.removeNotification(notification);
      };
      
      // 添加到頁面
      document.body.appendChild(notification);
      
      // 7秒後自動移除（區域更新通知可以顯示久一點）
      setTimeout(() => {
        this.removeNotification(notification);
      }, 7000);
      
      console.log(`📬 已顯示事件 ${eventId} 的威脅更新通知`);
    }
    
    /**
     * 移除通知（帶淡出動畫）
     * @param {HTMLElement} notification - 通知元素
     */
    removeNotification(notification) {
      if (!notification || !notification.parentNode) return;
      
      // 添加淡出動畫
      notification.classList.add('fade-out');
      
      // 動畫結束後移除元素
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 300); // 與 CSS 動畫時間一致
    }

    /**
     * 獲取所有運行中的更新事件
     * @returns {Array} 運行中的事件ID列表
     */
    getActiveEvents() {
      return Array.from(this.activeTimers.keys());
    }

    /**
     * 獲取運行狀態資訊
     * @returns {Object} 狀態資訊
     */
    getStatus() {
      return {
        updateInterval: this.updateInterval,
        activeEventCount: this.activeTimers.size,
        activeEvents: this.getActiveEvents()
      };
    }
  }

  // 創建全域實例
  window.AreaEventUpdateManager = AreaEventUpdateManager;
  window.areaEventUpdateManager = new AreaEventUpdateManager();

  console.log('✅ AreaEventUpdateManager 已載入並初始化');
})();
