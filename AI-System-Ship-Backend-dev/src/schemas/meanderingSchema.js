const meanderingQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string', description: 'MMSI 編號' }
  }
};

const meanderingSchema = {
  body: meanderingQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        mmsi: { type: 'string' },
        riskScore: { type: 'number' },
        analysisPeriod: {
          type: 'object',
          properties: {
            start: { type: 'string' },
            end: { type: 'string' }
          }
        },
        meanderingCount: { type: 'number' },
        totalMeanderingDuration: { type: 'number' },
        totalMeanderingScore: { type: 'number' },
        f_crit: { type: 'number' },
        segmentsDetails: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              startTime: { type: 'string' },
              endTime: { type: 'string' },
              startCoord: { 
                type: 'array',
                items: { type: 'number' }
              },
              endCoord: { 
                type: 'array',
                items: { type: 'number' }
              },
              durationMinutes: { type: 'number' },
              pointCount: { type: 'number' },
              sumDeltaC: { type: 'number' },
              sumS: { type: 'number' },
              boundingBoxArea: { type: 'number' },
              coreScore: { type: 'number' },
              riskScore: { type: 'number' }
            }
          }
        },
        message: { type: 'string' }
      }
    }
  }
};

module.exports = { meanderingSchema };
