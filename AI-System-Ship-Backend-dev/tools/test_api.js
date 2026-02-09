const http = require('http');

// 設定測試參數
const PORT = 3000;
const HOST = '140.115.53.51';
const MMSI_LIST = [41200000, 41200001, 41200002, 41200003, 41200004];

const endpoints = [
  '/api/v1/loitering',
  '/api/v1/speedDrop',
  '/api/v1/aisSwitch',
  '/api/v1/meandering',
  '/api/v1/suspiciousVessels' // Added suspiciousVessels (GET)
];

function testEndpoint(path, mmsi) {
  const isGet = path.includes('suspiciousVessels');
  const method = isGet ? 'GET' : 'POST';
  
  // For GET request, append query params if needed, but suspiciousVessels usually returns a list or takes params.
  // Let's check suspiciousVessels route definition. 
  // Usually suspiciousVessels returns a list of all suspicious vessels, so it might not need MMSI in body/query for the list.
  // But if we want to check specific algorithms for a ship, the POST ones are correct.
  
  // Let's stick to the POST endpoints for specific MMSI checks first.
  // If path is suspiciousVessels, we might just call it once.
  
  if (path.includes('suspiciousVessels')) {
      // Skip per-MMSI loop for this one, handle separately or just ignore for now to keep logic simple
      return; 
  }

  const data = JSON.stringify({
    mmsi: mmsi
  });

  const options = {
    hostname: HOST,
    port: PORT,
    path: path,
    method: method,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };

  const req = http.request(options, (res) => {
    let responseBody = '';

    res.on('data', (chunk) => {
      responseBody += chunk;
    });

    res.on('end', () => {
      console.log(`\n[MMSI: ${mmsi} | Testing ${path}]`);
      console.log(`Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(responseBody);
        // Simplify output to just show the score/result
        console.log('Response:', JSON.stringify(json, null, 2));
      } catch (e) {
        console.log('Response:', responseBody);
      }
    });
  });

  req.on('error', (error) => {
    console.error(`\n[MMSI: ${mmsi} | Testing ${path}] Error: ${error.message}`);
  });

  req.write(data);
  req.end();
}

console.log(`開始測試 API (MMSI List: ${MMSI_LIST.join(', ')})...`);
console.log(`請確保後端伺服器已在 http://${HOST}:${PORT} 啟動`);

let delay = 0;
MMSI_LIST.forEach((mmsi) => {
    endpoints.forEach((endpoint) => {
        if (endpoint.includes('suspiciousVessels')) return;
        
        setTimeout(() => {
            testEndpoint(endpoint, mmsi);
        }, delay);
        delay += 500;
    });
});
