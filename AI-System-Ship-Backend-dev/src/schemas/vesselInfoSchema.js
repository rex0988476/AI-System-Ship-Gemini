/* 定義前端傳入的資料格式 */
const vesselInfoQuery = {
  type: 'object',
  required: ['mmsi'],
  properties: {
    mmsi: {
      type: 'string',
      description: '海事移動服務標識'
    }
  }
};

/* 完整的 API Schema (包含輸入和輸出) */
const vesselInfoSchema = {
  querystring: vesselInfoQuery,
  response: {
    200: {
      type: 'object',
      properties: {
        vesselType: { type: 'number' },
        imoNum: { type: 'string' },
        navStatus: { type: 'string' },
        cog: { type: 'number' },
        sog: { type: 'number' },
        rfFreq: { type: 'string' },
        coord: {
          type: 'array',
          items: { type: 'number' },
          minItems: 2,
          maxItems: 2
        },
        accuracy: { type: 'string' },
        pulsesDuration: { type: 'string' },
        pulsesFreq: { type: 'string' },
        waveform: { type: 'string' }
      },
      required: [
        'vesselType',
        'imoNum',
        'navStatus',
        'cog',
        'sog',
        'rfFreq',
        'coord',
        'accuracy',
        'pulsesDuration',
        'pulsesFreq',
        'waveform'
      ]
    }
  }
};

module.exports = { vesselInfoSchema };