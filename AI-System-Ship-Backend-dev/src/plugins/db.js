const fastifyPlugin = require('fastify-plugin');
const fastifyMongo = require('@fastify/mongodb');

async function dbConnector(fastify, options) {

  const url = process.env.MONGO_URL || 'mongodb+srv://dbUser:dbUserPwd@gcp.mrvbbti.mongodb.net/appName=GCP';

  fastify.register(fastifyMongo, {
    url: url
  });

  console.log(`🔌 MongoDB 連線設定完成 (URL: ${url})`);
}

module.exports = fastifyPlugin(dbConnector);