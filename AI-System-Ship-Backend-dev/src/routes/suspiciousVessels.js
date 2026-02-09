const { suspiciousVesselsSchema } = require('../schemas/suspiciousVesselsSchema');
const isDarkVessel = require('../utils/isDarkVessel');

async function suspiciousVesselsRoutes(fastify) {
  fastify.get('/suspiciousVessels', { schema: suspiciousVesselsSchema }, async (request, reply) => {

    const KM_PER_NM = 1.852;
    const EARTH_RADIUS_KM = 6371;
    const AIS_WINDOW_MS = 360000;           // AIS 對應窗口 (6分鐘)
    const LOOKBACK_WINDOW_MS = 6 * 3600000; // 查詢回推窗口 (6小時)

    const { lat, lon, radius } = request.query;
    if (!lat || !lon || !radius) {
      return reply.status(400).send({ error: 'lat, lon, radius are required' });
    }

    const center = [parseFloat(lon), parseFloat(lat)];
    const radian = radius * KM_PER_NM / EARTH_RADIUS_KM;

    const db_rf = fastify.mongo.client.db('RF_data_test');
    const db_ais = fastify.mongo.client.db('ais_data_test');
    const col_rf = db_rf.collection('correlation');
    const col_ais = db_ais.collection('Taiwan');

    // --- STEP 1: 取得資料庫中最新的有效時間 (Anchor Time) ---
    // 用於模擬「現在時間」，確保測試資料不會因為時間過久而被過濾掉
    const latestRecord = await col_rf.findOne(
      { 
        "properties.timestamp_utc": { $exists: true },
        "properties.cand_1_mmsi": { $nin: ["uncorrelated", null, ""] }
      }, 
      { 
        sort: { "properties.timestamp_utc": -1 }, 
        projection: { "properties.timestamp_utc": 1 } 
      }
    );

    if (!latestRecord) return reply.send([]);

    // 計算查詢起始時間 (String 格式)
    const latestTimeMs = new Date(latestRecord.properties.timestamp_utc).getTime();
    const lookBackTimeStr = new Date(latestTimeMs - LOOKBACK_WINDOW_MS).toISOString();
    // const lookBackTimeStr = new Date(Date.now() - LOOKBACK_WINDOW_MS.toISOString();

    // --- STEP 2: 執行主要的 Aggregation (含 Lookback 優化) ---
    const pipeline = [
      {
        $match: {
          "properties.timestamp_utc": { 
            $gte: lookBackTimeStr // 關鍵：確保傳入的是 ISO String
          },
          "properties.cand_1_mmsi": { $nin: ["uncorrelated", null, ""] }
        }
      },
      {
        $sort: { "properties.timestamp_utc": -1 }
      },
      {
        $group: {
          _id: "$properties.cand_1_mmsi",
          latestRecord: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$latestRecord" }
      },
      {
        $match: {
          geometry: {
            $geoWithin: {
              $centerSphere: [center, radian]
            }
          }
        }
      },
    ];

    const vessels = await col_rf.aggregate(pipeline).toArray();
    if (vessels.length === 0) return reply.send([]);

    // --- STEP 3: 準備並執行 AIS 關聯查詢 ---
    const mmsiList = vessels.map(v => v.properties.cand_1_mmsi);
    const mmsiQueryList = mmsiList.filter(m => m).map(String);

    // 計算這批船隻的時間範圍 (Min/Max)
    const timestamps = vessels.map(v => new Date(v.properties.timestamp_utc).getTime());
    const minTime = new Date(Math.min(...timestamps) - AIS_WINDOW_MS);
    const maxTime = new Date(Math.max(...timestamps) + AIS_WINDOW_MS);

    // 查詢 AIS
    const docs_ais = await col_ais
      .find({
        "properties.MMSI": { $in: mmsiQueryList },
        "properties.Record_Time": {
          $gte: minTime, // 注意：如果 AIS 集合的時間也是 String，這裡也需要轉 .toISOString()
          $lte: maxTime
        }
      })
      .project({
        "properties.MMSI": 1,
        "properties.Record_Time": 1,
      })
      .toArray();

    // --- STEP 4: 資料整合與格式化 ---
    const aisMap = new Map();
    for (const doc of docs_ais) {
      const m = String(doc.properties.MMSI);
      if (!aisMap.has(m)) aisMap.set(m, []);
      aisMap.get(m).push(doc);
    }

    const result = vessels.map(vessel => {
      const mmsiString = String(vessel.properties.cand_1_mmsi);
      const rfTimeMs = new Date(vessel.properties.timestamp_utc).getTime();

      return {
        mmsi: vessel.properties.cand_1_mmsi,
        threatScore: -1,
        aisFlag: !isDarkVessel(
          mmsiString,
          rfTimeMs,
          aisMap,
          AIS_WINDOW_MS
        ),
        coord: [
          vessel.geometry.coordinates[1], // lat
          vessel.geometry.coordinates[0]  // lon
        ]
      };
    });

    return reply.send(result);
  });
}

module.exports = suspiciousVesselsRoutes;