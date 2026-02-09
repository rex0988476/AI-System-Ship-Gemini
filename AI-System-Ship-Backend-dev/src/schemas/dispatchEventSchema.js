const dispatchEventQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: { type: 'string' },
    imageDir: { type: 'string' },
    dispatchTime: { type: 'string', format: 'date-time' },
    excuteTime: { type: 'string', format: 'date-time' },
    action: { type: 'string'},
    dispatchCoord: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2
    },
    excuteCoord: {
      type: 'array',
      items: { type: 'number' },
      minItems: 2,
      maxItems: 2
    },
    status: { type: 'string'}
  }
};

const dispatchEventSchema = {
  body: dispatchEventQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        mmsi: { type: 'string' },
        imageDir: { type: 'string' },
        dispatchTime: { type: 'string', format: 'date-time' },
        excuteTime: { type: 'string', format: 'date-time' },
        action: { type: 'string'},
        dispatchCoord: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
        excuteCoord: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
        status: { type: 'string'}
      }
    }
  }
};

module.exports = { dispatchEventSchema };
