const { addSmugglingAreaSchema } = require('../schemas/smugglingAreasSchema');

async function routes(fastify, options) {
    fastify.post('/smuggling-areas', { schema: addSmugglingAreaSchema }, async (request, reply) => {
        const { name, lat, lon, radius } = request.body;

        try {
            const db = fastify.mongo.client.db('threatAlg_data_test');
            const collection = db.collection('smugglingAreas');

            const doc = {
                name: name || `Area_${Date.now()}`,
                lat,
                lon,
                radius,
                createdAt: new Date()
            };

            const result = await collection.insertOne(doc);

            reply.code(201).send({
                success: true,
                id: result.insertedId.toString(),
                message: 'Smuggling area added successfully'
            });
        } catch (err) {
            fastify.log.error(err);
            reply.code(500).send({ success: false, message: 'Internal Server Error' });
        }
    });
}

module.exports = routes;
