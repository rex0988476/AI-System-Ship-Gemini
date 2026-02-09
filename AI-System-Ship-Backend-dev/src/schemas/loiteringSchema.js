const loiteringQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string', description: 'MMSI 編號' }
  }
};

const loiteringSchema = {
  body: loiteringQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        mmsi: { type: 'string' },
        riskScore: { type: 'number' },
        startTime: { type: 'string' },
        loiterTimeMinutes: { type: 'number' },
        thresholds: {
          type: 'object',
          properties: {
            t1: { type: 'number' }
          }
        },
        loiterArea: {
          type: 'object',
          properties: {
            center: {
              type: 'object',
              properties: {
                lat: { type: 'number' },
                lon: { type: 'number' }
              }
            },
            radius: { type: 'number' }
          }
        },
        message: { type: 'string' }
      }
    }
  }
};

module.exports = { loiteringSchema };
