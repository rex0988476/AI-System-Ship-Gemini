const { trackingEventSchema } = require('../schemas/trackingEventSchema');

async function trackingEventRoutes(fastify) {
  /* GET route */
  fastify.get('/trackingEvent', {
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
    const col_tracking_event = db_general.collection('tracking_event');

    if (!mmsi) {
      const results = await col_tracking_event.find({})
        .sort({ createAt: -1 })
        .toArray();
      return reply.send(results);
    }

    // query Doc by mmsi & created time
    const result = await col_tracking_event.findOne(
      { mmsi: mmsi },
      { sort: { createAt: -1 } }
    );

    return reply.send(result);
  });




  /* POST route */
  fastify.post('/trackingEvent', { schema: trackingEventSchema }, async (request, reply) => {
    const { mmsi } = request.body;

    const result = {
      mmsi: mmsi,
      createAt: new Date()
    };

    // connect to MongoDB
    const db_general = fastify.mongo.client.db('general_test');
    const col_tracking_event = db_general.collection('tracking_event');
    // add Doc to Col
    await col_tracking_event.insertOne(result);

    return reply.send({ success: true, message: "Tracking event saved", data: result });
  });




  /* DELETE route */
  fastify.delete('/trackingEvent', {
    schema: {
      body: {
        type: 'object',
        required: ['mmsi', 'createAt'],
        properties: {
          mmsi: { type: 'string' },
          createAt: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { mmsi, createAt } = request.body;

    const db_general = fastify.mongo.client.db('general_test');
    const col_tracking_event = db_general.collection('tracking_event');

    // convert createAt into BSON format Date
    const queryDate = new Date(createAt);
    //const queryDate = createAt;

    if (isNaN(queryDate.getTime())) {
      return reply.status(400).send({ error: "Invalid date format" });
    }

    const result = await col_tracking_event.deleteOne({
      mmsi: mmsi,
      createAt: queryDate
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

module.exports = trackingEventRoutes;
