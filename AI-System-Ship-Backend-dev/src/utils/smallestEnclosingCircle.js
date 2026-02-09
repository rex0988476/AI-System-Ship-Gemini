const { getDistanceFromLatLonInKm } = require('./geoUtils');

/**
 * 計算兩點之間的距離 (回傳公里)
 */
function dist(p1, p2) {
    return getDistanceFromLatLonInKm(p1.lat, p1.lon, p2.lat, p2.lon);
}

/**
 * 檢查點 p 是否在圓 {center, r} 內 (包含邊界)
 * 考慮浮點數誤差，使用一個很小的 epsilon
 */
function isInCircle(p, c) {
    return dist(p, c.center) <= c.r + 1e-6;
}

/**
 * 根據邊界點計算圓
 * 1個點: 該點為圓心, 半徑0
 * 2個點: 兩點連線為直徑
 * 3個點: 三角形的外接圓
 */
function getCircle(boundary) {
    if (boundary.length === 0) {
        return { center: { lat: 0, lon: 0 }, r: 0 };
    } else if (boundary.length === 1) {
        return { center: boundary[0], r: 0 };
    } else if (boundary.length === 2) {
        const p1 = boundary[0];
        const p2 = boundary[1];
        const center = {
            lat: (p1.lat + p2.lat) / 2,
            lon: (p1.lon + p2.lon) / 2
        };
        return { center, r: dist(p1, p2) / 2 };
    } else {
        // 3 點外接圓
        // 為了簡化計算，先將 Lat/Lon 視為平面座標 (近似解，對於小範圍蛇行足夠精確)
        // 若範圍極大(跨越數百公里)，需用球面幾何，但蛇行通常是局部行為。
        // 使用平面幾何公式計算外心:
        const p1 = boundary[0];
        const p2 = boundary[1];
        const p3 = boundary[2];

        const x1 = p1.lon, y1 = p1.lat;
        const x2 = p2.lon, y2 = p2.lat;
        const x3 = p3.lon, y3 = p3.lat;

        const D = 2 * (x1 * (y2 - y3) + x2 * (y3 - y1) + x3 * (y1 - y2));
        
        // 避免三點共線導致 D 為 0
        if (Math.abs(D) < 1e-9) {
            // 退化成以最長邊為直徑的圓
            const d12 = dist(p1, p2);
            const d23 = dist(p2, p3);
            const d31 = dist(p3, p1);
            if (d12 >= d23 && d12 >= d31) return getCircle([p1, p2]);
            if (d23 >= d12 && d23 >= d31) return getCircle([p2, p3]);
            return getCircle([p3, p1]);
        }

        const centerX = ((x1**2 + y1**2) * (y2 - y3) + (x2**2 + y2**2) * (y3 - y1) + (x3**2 + y3**2) * (y1 - y2)) / D;
        const centerY = ((x1**2 + y1**2) * (x3 - x2) + (x2**2 + y2**2) * (x1 - x3) + (x3**2 + y3**2) * (x2 - x1)) / D;

        const center = { lat: centerY, lon: centerX };
        return { center, r: dist(center, p1) };
    }
}

/**
 * Welzl's algorithm 遞迴實作
 */
function welzl(points, boundary) {
    if (points.length === 0 || boundary.length === 3) {
        return getCircle(boundary);
    }

    // 隨機選一個點 (在此實作中直接取最後一個並移除，模擬隨機性)
    // 為了保持傳入數據不被修改，使用副本或索引是主要方法，簡單起見這裡用 pop
    const p = points[points.length - 1];
    const remainingPoints = points.slice(0, points.length - 1);

    let c = welzl(remainingPoints, boundary); // 嘗試不用 p 構成圓

    if (isInCircle(p, c)) {
        return c; // p 已經在圓內
    }

    // p 必須在邊界上
    return welzl(remainingPoints, [...boundary, p]);
}

/**
 * 對外公開的函式
 * @param {Array} coordinates - [{lat, lon}, ...]
 */
function makeSmallestEnclosingCircle(coordinates) {
    if (!coordinates || coordinates.length === 0) return null;
    
    // 複製一份以免修改原陣列，並隨機打亂以確保 O(n) 期望值
    const points = [...coordinates].sort(() => Math.random() - 0.5);
    
    // 不會遞迴過深， stack overflow 風險低
    const circle = welzl(points, []);
    
    // 結果通常需要包含 radius (km) 和 center {lat, lon}
    return {
        center: {
            lat: parseFloat(circle.center.lat.toFixed(6)),
            lon: parseFloat(circle.center.lon.toFixed(6))
        },
        radius: parseFloat(circle.r.toFixed(4)) // 公里
    };
}

module.exports = makeSmallestEnclosingCircle;
