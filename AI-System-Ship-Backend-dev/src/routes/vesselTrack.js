const { vesselTrackSchema } = require('../schemas/vesselTrackSchema');

async function vesselTrackRoutes(fastify) {
  fastify.get('/vesselTrack', { schema: vesselTrackSchema }, async (request, reply) => {
    const { mmsi } = request.query;
    const key = mmsi;

    const db_ais = fastify.mongo.client.db('ais_data_test');
    const col_ais = db_ais.collection('Taiwan');

    const vesselTrack = await col_ais
      .find({ 'properties.MMSI': key })
      .sort({ 'properties.Record_Time': -1 })
      .toArray();

    // 如果 AIS 資料不存在
    if (vesselTrack.length === 0) {
      return reply.status(404).send({ error: "Vessel not found in AIS database" });
    }

    // 合併成一個response
    const result = vesselTrack.map(coordPoint => ({
      coord: [
        coordPoint.properties.Latitude,
        coordPoint.properties.Longitude
      ],
      timestamp: new Date(coordPoint.properties.Record_Time).toISOString(),
      sog: coordPoint.properties.SOG,
      cog: coordPoint.properties.COG,
      heading: coordPoint.properties.True_Heading,
      navStatus: coordPoint.properties.Navigational_Status
    }));

    return reply.send(result);
  });
}


module.exports = vesselTrackRoutes;