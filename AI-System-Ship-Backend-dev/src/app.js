// cors: 解決跨網域連線問題的套件
const fastify = require('fastify');
const cors = require('@fastify/cors');

function build(opts = {}) {

  const app = fastify(opts);

  // origin: true 代表「來者不拒」，正式上線通常會限制網址。
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
  });
  app.register(require('./plugins/db'));

  app.register(require('./routes/vesselInfo'), { prefix: '/api/v1' });
  app.register(require('./routes/suspiciousVessels'), { prefix: 'api/v1' });
  app.register(require('./routes/vesselsCoord'), { prefix: 'api/v1' });
  app.register(require('./routes/vesselTrack'), { prefix: 'api/v1' });
  app.register(require('./routes/predictTraj'), { prefix: 'api/v1' });
  app.register(require('./routes/loitering'), { prefix: 'api/v1' });
  app.register(require('./routes/speedDrop'), { prefix: 'api/v1' });
  app.register(require('./routes/aisSwitch'), { prefix: 'api/v1' });
  app.register(require('./routes/meandering'), { prefix: 'api/v1' });
  app.register(require('./routes/trackingEvent'), { prefix: 'api/v1' });
  app.register(require('./routes/dispatchEvent'), { prefix: 'api/v1' });
  app.register(require('./routes/smugglingAreas'), { prefix: 'api/v1' });

  return app;
}

module.exports = build;
