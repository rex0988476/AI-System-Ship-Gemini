const aisSwitchQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string', description: 'MMSI 編號' }
  }
};

const aisSwitchSchema = {
  body: aisSwitchQuery,
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
        totalNormalPoints: { type: 'number' },
        missingCountInArea: { type: 'number' },
        missingRatio: { type: 'number' },
        thresholds: {
          type: 'object',
          properties: {
            p_free: { type: 'number' },
            p_full: { type: 'number' }
          }
        },
        affectedAreas: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              center: {
                type: 'object',
                properties: {
                  lat: { type: 'number' },
                  lon: { type: 'number' }
                }
              },
              radius: { type: 'number' },
              earliestAnomalyTime: { type: 'string' },
              missingCount: { type: 'number' },
              missingRatio: { type: 'number' },
              totalMissingTimeMinutes: { type: 'number' }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  }
};

module.exports = { aisSwitchSchema };
