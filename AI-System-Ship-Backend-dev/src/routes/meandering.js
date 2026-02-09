const { meanderingSchema } = require('../schemas/meanderingSchema');
const calculateMeanderingScore = require('../utils/meanderingAlgorithm');

async function meanderingRoutes(fastify) {
  /* GET route */
  fastify.get('/meandering', {
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
    const col_threat = db_threat.collection('meandering');

    // 查詢該 MMSI 的紀錄
    const result = await col_threat.findOne(
      { mmsi: mmsi },
      { sort: { createdAt: -1 } }
    );

    return reply.send(result);
  });

  fastify.post('/meandering', { schema: meanderingSchema }, async (request, reply) => {
    const { mmsi } = request.body;

    // 設定預設參數
    const t = 60; // 關注的時間區間 (分鐘)
    const s_crit = 2.0; // 速度門檻 (節) - 低於此速度不算在航行
    const f_crit = 500; // 臨界游蕩分數 (需根據實際數據調整，這裡先設一個經驗值)
    const f_trigger = 50; // 異常觸發分數 (低於此分數視為正常航行波動，不計入蛇行)
    // F(c) 會很大，因為 SumDeltaC 可能幾百幾千，SumS 也可能幾百，B 可能很小 (0.x)
    // 例如: SumDeltaC=360, SumS=100, B=1 => F(c) = 36000 / 180 = 200
    // 如果 B=0.1 => F(c) = 2000
    // 所以 F_crit 設 500~1000 可能合理

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

    const result = calculateMeanderingScore(historyPoints, {
      t,
      s_crit,
      f_crit,
      f_trigger
    });

    result.mmsi = mmsi;

    // 寫入 threatAlg_data_test 資料庫
    const db_threat = fastify.mongo.client.db('threatAlg_data_test');
    const col_threat = db_threat.collection('meandering');

    // 加上時間戳記
    result.createdAt = new Date();

    await col_threat.insertOne(result);

    return reply.send({ success: true, message: "Threat analysis saved to database" });
  });
}

module.exports = meanderingRoutes;
