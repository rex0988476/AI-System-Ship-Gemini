const { vesselsCoordSchema } = require('../schemas/vesselsCoordSchema');

async function vesselsCoordRoutes(fastify) {
  fastify.get('/vesselsCoord', { schema: vesselsCoordSchema }, async (request, reply) => {

    const KM_PER_NM = 1.852;
    const EARTH_RADIUS_KM = 6371;

    const { lat, lon, radius } = request.query;
    if (!lat || !lon || !radius) {
      return reply.status(400).send({ error: 'lat, lon, radius are required' });
    }

    const center = [parseFloat(lon), parseFloat(lat)];
    const radian = radius * KM_PER_NM / EARTH_RADIUS_KM;

    const db_rf = fastify.mongo.client.db('RF_data_test');
    const col_rf = db_rf.collection('correlation');

    const pipeline = [
      {
        $match: {
          "properties.cand_1_mmsi": { $ne: "uncorrelated" },
          geometry: {
            $geoWithin: {
              $centerSphere: [center, radian]
            }
          }
        }
      },
      { $sort: { "properties.timestamp_utc": -1 } },
      {
        $group: {
          _id: "$properties.cand_1_mmsi",
          latestRecord: { $first: "$$ROOT" }
        }
      },
      { $replaceRoot: { newRoot: "$latestRecord" } }
    ];

    const vessels = await col_rf.aggregate(pipeline).toArray();
    if (vessels.length === 0) return [];

    const result = vessels.map(vessel => ({
      mmsi: vessel.properties.cand_1_mmsi,
      coord: [
        vessel.geometry.coordinates[1], // lat
        vessel.geometry.coordinates[0] // lon
      ]
    }));

    return reply.send(result);
  });
}

module.exports = vesselsCoordRoutes;
