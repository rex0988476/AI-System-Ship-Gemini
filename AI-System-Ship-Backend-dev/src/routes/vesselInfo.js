const { vesselInfoSchema } = require('../schemas/vesselInfoSchema');

async function vesselInfoRoutes(fastify) {
  fastify.get('/vesselInfo', { schema: vesselInfoSchema }, async (request, reply) => {
    const { mmsi } = request.query;
    const key = mmsi;

    const db_ais = fastify.mongo.client.db('ais_data_test');
    const db_rf = fastify.mongo.client.db('RF_data_test');

    const col_ais = db_ais.collection('Taiwan');
    const col_rf = db_rf.collection('correlation');

    // 兩個查詢同時執行，提升效能
    const [doc_ais, doc_rf] = await Promise.all([
      col_ais.findOne(
        { 'properties.MMSI': key },
        { sort: { 'properties.Record_Time': -1 } }
      ),
      col_rf.findOne(
        { 'properties.cand_1_mmsi': key },
        { sort: { 'properties.timestamp_utc': -1 } }
      )
    ]);

    /* 檢查AIS和RF是否都有資料 */
    if (!doc_ais) {
      return reply.status(404).send({ error: "Vessel not found in AIS database" });
    }

    if (!doc_rf) {
      return reply.status(404).send({ error: "Vessel not found in RF database" });
    }

    const result = {
      vesselType: doc_ais.properties.Ship_and_Cargo_Type,
      imoNum: doc_ais.properties.IMO_Number,
      navStatus: doc_ais.properties.Navigational_Status,
      cog: doc_ais.properties.COG,
      sog: doc_ais.properties.SOG,
      rfFreq: doc_rf.properties.RF_frequency_MHz,
      coord: [
        doc_rf.properties.latitude_deg,
        doc_rf.properties.longitude_deg
      ],
      accuracy: doc_rf.properties.accuracy_level,
      pulsesDuration: doc_rf.properties.pulses_duration_ns,
      pulsesFreq: doc_rf.properties.pulses_repetition_frequency_Hz,
      waveform: doc_rf.properties.waveform
    };

    return reply.send(result);
  });
}


module.exports = vesselInfoRoutes;