const addSmugglingAreaSchema = {
  body: {
    type: 'object',
    required: ['lat', 'lon', 'radius'],
    properties: {
      name: { type: 'string', minLength: 1 },
      lat: { type: 'number', minimum: -90, maximum: 90 },
      lon: { type: 'number', minimum: -180, maximum: 180 },
      radius: { type: 'number', exclusiveMinimum: 0 }
    }
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        id: { type: 'string' },
        message: { type: 'string' }
      }
    },
    500: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' }
      }
    }
  }
};

module.exports = { addSmugglingAreaSchema };
