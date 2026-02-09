const { loiteringSchema } = require('../schemas/loiteringSchema');
const calculateLoiteringScore = require('../utils/loiteringAlgorithm');

async function loiteringRoutes(fastify) {
  /* GET route */
  fastify.get('/loitering', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          mmsi: { type: 'string' }
        },
        required: ['mmsi']
      }
    }
  }, async (request, reply) => {
    const { mmsi } = request.query;

    // 連線到儲存結果的資料庫
    const db_threat = fastify.mongo.client.db('threatAlg_data_test');
    const col_threat = db_threat.collection('loitering');

    // 查詢該 MMSI 的紀錄
    const result = await col_threat.findOne(
      { mmsi: mmsi },
      { sort: { createdAt: -1 } }
    );

    return reply.send(result);
  });

  fastify.post('/loitering', { schema: loiteringSchema }, async (request, reply) => {
    const { mmsi } = request.body;

    // 設定預設參數
    const speedThreshold = 2.0;
    const radiusThreshold = 0.5;
    const t0 = 10;
    const t1 = 60;

    const db_ais = fastify.mongo.client.db('ais_data_test');
    const col_ais = db_ais.collection('Taiwan');

    // 為了計算 T_loiter，我們需要往回查一段時間的資料
    // T1 是滿分門檻 (例如 60 分鐘)，我們至少要查到這麼久以前
    // 為了保險起見，我們查 T1 * 2 的時間，或者固定查過去 3 小時
    // 假設 T1 預設 60 分鐘，查 3 小時應該足夠涵蓋大部分情況
    const lookBackHours = 3;
    const now = new Date(); // 實務上應該用資料庫最新時間，但這裡假設是即時系統或以當前時間為準
    // 如果資料庫是歷史資料，這裡可能要先查該船的最新時間，再往回推

    // 先查該船的最新一筆資料時間，以確保我們有基準點
    const latestDoc = await col_ais.findOne(
      { 'properties.MMSI': mmsi },
      { sort: { 'properties.Record_Time': -1 }, projection: { 'properties.Record_Time': 1 } }
    );

    if (!latestDoc) {
      return reply.status(404).send({ error: "Vessel not found" });
    }

    const latestTime = new Date(latestDoc.properties.Record_Time);
    const startTime = new Date(latestTime.getTime() - lookBackHours * 60 * 60 * 1000);

    // 撈取歷史軌跡
    const historyPoints = await col_ais.find({
      'properties.MMSI': mmsi,
      'properties.Record_Time': {
        $gte: startTime,
        $lte: latestTime
      }
    })
      .sort({ 'properties.Record_Time': -1 }) // 倒序排列 (最新 -> 最舊)
      .toArray();

    // 執行演算法
    const result = calculateLoiteringScore(historyPoints, {
      speedThreshold,
      radiusThreshold,
      t0,
      t1
    });

    // 補上 mmsi
    result.mmsi = mmsi;

    // 寫入 threatAlg_data_test 資料庫
    const db_threat = fastify.mongo.client.db('threatAlg_data_test');
    const col_threat = db_threat.collection('loitering');

    // 加上時間戳記
    result.createdAt = new Date();

    await col_threat.insertOne(result);

    return reply.send({ success: true, message: "Threat analysis saved to database" });
  });
}

module.exports = loiteringRoutes;
