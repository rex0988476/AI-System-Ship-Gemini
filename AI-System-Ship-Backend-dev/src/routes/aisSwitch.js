const { aisSwitchSchema } = require('../schemas/aisSwitchSchema');
const calculateAisSwitchScore = require('../utils/aisSwitchAlgorithm');

async function aisSwitchRoutes(fastify) {
  /* GET route */
  fastify.get('/aisSwitch', {
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
    const col_threat = db_threat.collection('aisSwitch');

    // 查詢該 MMSI 的紀錄
    const result = await col_threat.findOne(
      { mmsi: mmsi },
      { sort: { createdAt: -1 } }
    );

    return reply.send(result);
  });

  fastify.post('/aisSwitch', { schema: aisSwitchSchema }, async (request, reply) => {
    let { mmsi } = request.body;
    // 確保mmsi和資料庫中一樣為string
    mmsi = String(mmsi);

    // 設定預設參數 (多個走私區域)
    const smugglingAreas = [
      { lat: 22.678203, lon: 119.612823, radius: 40 }, // 區域 1: 高雄外海
      { lat: 25.1, lon: 121.7, radius: 15 }  // 區域 2: 基隆外海
    ];

    const t = 24 * 60; // 關注的時間區間 (24小時 = 1440分鐘)
    const p_free = 0.05; // 容忍比例 (5%)
    const p_full = 0.3; // 滿分比例 (30%)

    const db_ais = fastify.mongo.client.db('ais_data_test');
    const col_ais = db_ais.collection('Taiwan');

    const latestDoc = await col_ais.findOne(
      { 'properties.MMSI': mmsi },
      { sort: { 'properties.Record_Time': -1 }, projection: { 'properties.Record_Time': 1 } }
    );

    if (!latestDoc) {
      return reply.status(404).send({ error: "Vessel not found" });
    }

    const latestTime = new Date(latestDoc.properties.Record_Time);
    const startTime = new Date(latestTime.getTime() - t * 60 * 1000);

    const historyPoints = await col_ais.find({
      'properties.MMSI': mmsi,
      'properties.Record_Time': {
        $gte: startTime,
        $lte: latestTime
      }
    })
      .sort({ 'properties.Record_Time': -1 }) // 倒序
      .toArray();

    const result = calculateAisSwitchScore(historyPoints, {
      smugglingAreas,
      t,
      p_free,
      p_full
    });

    result.mmsi = mmsi;

    // 寫入 threatAlg_data_test 資料庫
    const db_threat = fastify.mongo.client.db('threatAlg_data_test');
    const col_threat = db_threat.collection('aisSwitch');

    // 加上時間戳記
    result.createdAt = new Date();

    await col_threat.insertOne(result);

    return reply.send({ success: true, message: "Threat analysis saved to database" });
  });
}

module.exports = aisSwitchRoutes;
