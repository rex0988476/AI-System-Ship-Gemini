/**
 * Tab manager
 */
(function(window) {
    'use strict';

    const createTabManager = (options = {}) => {
        const {
            tabs,
            panels,
            defaultTab = "region",
            onBeforeChange,
            onAfterChange,
        } = options;

        let activeTab = defaultTab;

        const activateTab = (tabName) => {
            if (!tabName) return;
            if (typeof onBeforeChange === "function") {
                onBeforeChange(activeTab, tabName);
            }
            activeTab = tabName;
            tabs?.forEach((tab) => {
                tab.classList.toggle("active", tab.dataset.tab === tabName);
            });
            panels?.forEach((panel) => {
                const panelTab = panel.dataset.panel.split("-").pop();
                panel.classList.toggle("active", panelTab === tabName);
            });
            if (typeof onAfterChange === "function") {
                onAfterChange(tabName);
            }
        };

        const init = () => {
            tabs?.forEach((tab) => {
                tab.addEventListener("click", () => activateTab(tab.dataset.tab));
            });
            const initialTab = document.querySelector(".tab.active")?.dataset.tab || defaultTab;
            activateTab(initialTab);
        };

        const getActiveTab = () => activeTab;

        return {
            init,
            activateTab,
            getActiveTab,
        };
    };

    window.TabManager = { create: createTabManager };
})(window);
