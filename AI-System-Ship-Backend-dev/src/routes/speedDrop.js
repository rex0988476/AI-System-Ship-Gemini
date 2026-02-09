const { speedDropSchema } = require('../schemas/speedDropSchema');
const calculateSpeedDropScore = require('../utils/speedDropAlgorithm');

async function speedDropRoutes(fastify) {
  /* GET route */
  fastify.get('/speedDrop', {
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
    const col_threat = db_threat.collection('speedDrop');

    // 查詢該 MMSI 的紀錄
    const result = await col_threat.findOne(
      { mmsi: mmsi },
      { sort: { createdAt: -1 } }
    );

    return reply.send(result);
  });

  fastify.post('/speedDrop', { schema: speedDropSchema }, async (request, reply) => {
    const { mmsi } = request.body;

    // 設定預設參數
    const t = 60; // 關注的時間區間 (分鐘)
    // 針對 6 分鐘一筆資料的調整:
    // a_free: 0.005 節/秒 => 6分鐘約減速 1.8 節
    // a_full: 0.03 節/秒  => 6分鐘約減速 10.8 節
    const a_free = 0.005;
    const a_full = 0.03;

    const db_ais = fastify.mongo.client.db('ais_data_test');
    const col_ais = db_ais.collection('Taiwan');

    // 為了計算，我們需要撈取過去 t 分鐘內的資料
    // 但為了確保能計算到 t 分鐘邊界處的加速度，我們多撈一點點 (例如 t + 10 分鐘)
    // 這裡同樣假設以該船最新資料時間為準

    const latestDoc = await col_ais.findOne(
      { 'properties.MMSI': mmsi },
      { sort: { 'properties.Record_Time': -1 }, projection: { 'properties.Record_Time': 1 } }
    );

    if (!latestDoc) {
      return reply.status(404).send({ error: "Vessel not found" });
    }

    const latestTime = new Date(latestDoc.properties.Record_Time);
    // 撈取範圍: [Latest - t, Latest]
    // 為了計算最舊那個點的加速度，我們需要它更前面的一個點，所以多抓 30 分鐘緩衝
    const startTime = new Date(latestTime.getTime() - (t + 30) * 60 * 1000);

    const historyPoints = await col_ais.find({
      'properties.MMSI': mmsi,
      'properties.Record_Time': {
        $gte: startTime,
        $lte: latestTime
      }
    })
      .sort({ 'properties.Record_Time': -1 }) // 倒序 (最新 -> 最舊)
      .toArray();

    const result = calculateSpeedDropScore(historyPoints, {
      t,
      a_free,
      a_full
    });

    result.mmsi = mmsi;

    // 寫入 threatAlg_data_test 資料庫
    const db_threat = fastify.mongo.client.db('threatAlg_data_test');
    const col_threat = db_threat.collection('speedDrop');

    // 加上時間戳記
    result.createdAt = new Date();

    await col_threat.insertOne(result);

    return reply.send({ success: true, message: "Threat analysis saved to database" });
  });
}

module.exports = speedDropRoutes;
