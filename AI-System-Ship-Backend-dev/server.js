require('dotenv').config();

const build = require('./src/app');

// 從環境變數讀取設定，如果讀不到就使用預設值
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 3000;

// 2. 建立 App 實例 (開啟 Logger 紀錄請求)
const app = build({ 
  logger: {
    transport: {
      target: 'pino-pretty', // 讓終端機輸出的 Log 更好閱讀
      options: { colorize: true }
    }
  }
});

// 3. 定義啟動流程
const start = async () => {
  try {
    // 等待所有插件 (如 MongoDB 等) 載入完成
    await app.ready(); 

    // 印出目前所有的路由地圖，方便確認 API 網址
    console.log('\n--- 路由清單 ---');
    console.log(app.printRoutes({ commonPrefix: false , compact: true}));
    console.log('---------------');

    // --- 啟動威脅偵測排程 ---
    const startThreatScheduler = require('./src/scheduler/threatTask');
    startThreatScheduler(app);
    // -----------------------

    // 4. 開始監聽 (Listen)
    await app.listen({ 
      port: PORT, 
      host: HOST 
    });

    console.log(`
🚀 伺服器啟動成功！
📍 本機存取: http://localhost:${PORT}
🌍 外部存取: http://${HOST}:${PORT}
    `);

  } catch (err) {
    // 5. 錯誤處理
    app.log.error(err);
    process.exit(1);
  }
};

// 6. 執行啟動
start();
