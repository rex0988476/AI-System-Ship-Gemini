const trackingEventQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string', description: 'MMSI 編號' }
  }
};

const trackingEventSchema = {
  body: trackingEventQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        mmsi: { type: 'string' },
        createAt: { type: 'string', format: 'date-time' }
      }
    }
  }
};

module.exports = { trackingEventSchema };
