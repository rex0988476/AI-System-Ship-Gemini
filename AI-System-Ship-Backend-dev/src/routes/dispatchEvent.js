const { dispatchEventSchema } = require('../schemas/dispatchEventSchema');

async function dispatchEventRoutes(fastify) {
  /* GET route */
  fastify.get('/dispatchEvent', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          mmsi: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { mmsi } = request.query;

    // connect to MongoDB
    const db_general = fastify.mongo.client.db('general_test');
    const col_dispatch_event = db_general.collection('dispatch_event');

    if (!mmsi) {
      const results = await col_dispatch_event.find({})
        .sort({ dispatchTime: -1 })
        .toArray();
      return reply.send(results);
    }

    // query Doc by mmsi & dispatched time
    const result = await col_dispatch_event.findOne(
      { mmsi: mmsi },
      { sort: { dispatchTime: -1 } }
    );

    return reply.send(result);
  });




  /* POST route */
  fastify.post('/dispatchEvent', { schema: dispatchEventSchema }, async (request, reply) => {
    const { mmsi, imageDir, excuteTime, action, dispatchLat, dispatchLon, excuteLat, excuteLon, status } = request.body;

    const result = {
      mmsi: mmsi,
      imageDir: imageDir || './',
      dispatchTime: new Date(),
      excuteTime: excuteTime || new Date(),
      action: action || 'null',
      dispatchCoord: [dispatchLat, dispatchLon] || [,],
      excuteCoord: [excuteLat, excuteLon] || [,],
      status: status || 'null'
    };

    const db_general = fastify.mongo.client.db('general_test');
    const col_dispatch_event = db_general.collection('dispatch_event');
    await col_dispatch_event.insertOne(result);

    return reply.send({ success: true, message: "Dispatch event saved", data: result });
  });




  /* DELETE route */
  fastify.delete('/dispatchEvent', {
    schema: {
      body: {
        type: 'object',
        required: ['mmsi', 'dispatchTime'],
        properties: {
          mmsi: { type: 'string' },
          dispatchTime: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { mmsi, dispatchTime } = request.body;

    const db_general = fastify.mongo.client.db('general_test');
    const col_dispatch_event = db_general.collection('dispatch_event');

    // convert createAt into BSON format Date
    const queryDate = new Date(dispatchTime);

    if (isNaN(queryDate.getTime())) {
      return reply.status(400).send({ error: "Invalid date format" });
    }

    const result = await col_dispatch_event.deleteOne({
      mmsi: mmsi,
      dispatchTime: queryDate
    });

    if (result.deletedCount === 0) {
      return reply.status(404).send({
        success: false,
        message: "Document not found or already deleted"
      });
    }

    return reply.send({
      success: true,
      message: "Deleted successfully",
      deletedCount: result.deletedCount
    });
  });
}

module.exports = dispatchEventRoutes;
