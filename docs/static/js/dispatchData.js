 (function () {
    /* Dispatch data structure example:
        id: "dispatch-001",
        shipId: "mmsi-12345678",
        action: "衛星拍攝",
        dispatchTime: "16:30Z",
        schedule: "17:00Z",
        status: "進行中",
        slot: "left-dispatch"
    */ 
    window.DISPATCH_DATA = [];

    const DISPATCH_EVENT = 'dispatchData:updated';

    function notifyDispatchUpdate(data) {
        window.dispatchEvent(new CustomEvent(DISPATCH_EVENT, { detail: data }));
    }

    // Fetch dispatch missions from backend API
    function loadDispatchData() {
        // TODO: Select dispatched missions that are in the area
        return fetch('http://localhost:5001/api/dispatch')
            .then(res => res.json())
            .then(data => {
                window.DISPATCH_DATA = data;
                renderDispatchList();
                notifyDispatchUpdate(data);
                return data;
            })
            .catch(err => {
                console.error('Failed to fetch dispatch missions:', err);
                throw err;
            });
    }

    // 新增派遣任務並同步到後端資料庫
    function addDispatchMission(mission) {
        // 先送到後端
        return fetch('http://localhost:5001/api/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mission)
        })
        .then(res => res.json())
        .then(result => {
            if (result.success) {
                // 新增成功後重新載入資料
                loadDispatchData();
                console.log('Dispatch mission added:', mission);
            } else {
                console.error('Failed to add dispatch mission:', result);
            }
        })
        .catch(err => {
            console.error('Error adding dispatch mission:', err);
            throw err;
        });
    }
    
    function renderDispatchList() {
        const list = document.getElementById('dispatch-list');
        if (!list) return;
        list.innerHTML = window.DISPATCH_DATA.map(mission =>
            `<div>
                <b>${mission.id}</b> | ${mission.ship_id || mission.shipId} | ${mission.action_label || mission.action} | ${mission.dispatch_time || mission.dispatchTime} | ${mission.status}
            </div>`
        ).join('');
    }  

    // Render and load when click dispatch tab
    // 頁面載入時自動渲染
    // renderDispatchList();
    // 自動載入一次
    // loadDispatchData();

    // 你可以根據需求暴露函式給其他 JS 呼叫
    window.loadDispatchData = loadDispatchData;
    window.addDispatchMission = addDispatchMission;
    window.renderDispatchList = renderDispatchList;
})();
