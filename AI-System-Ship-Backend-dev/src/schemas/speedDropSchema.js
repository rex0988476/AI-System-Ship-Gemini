const speedDropQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string', description: 'MMSI 編號' }
  }
};

const speedDropSchema = {
  body: speedDropQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        mmsi: { type: 'string' },
        riskScore: { type: 'number' },
        timeWindow: {
          type: 'object',
          properties: {
            startTime: { type: 'string' },
            endTime: { type: 'string' }
          }
        },
        dropCount: { type: 'number' },
        totalDropAcceleration: { type: 'number' },
        thresholds: {
          type: 'object',
          properties: {
            a_free: { type: 'number' },
            a_full: { type: 'number' }
          }
        },
        dropEvents: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              location: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lon: { type: 'number' }
                }
              },
              time: { type: 'string' },
              acceleration: { type: 'number' },
              score: { type: 'number' }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  }
};

module.exports = { speedDropSchema };
