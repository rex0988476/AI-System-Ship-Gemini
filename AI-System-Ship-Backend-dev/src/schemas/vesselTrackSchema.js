/* 定義前端傳入的資料格式 */
const vesselTrackQuery = {
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
const vesselTrackSchema = {
  querystring: vesselTrackQuery,
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          coord: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
          timestamp: { type: 'string', format: 'date-time' },
          sog: { type: 'number' },
          cog: { type: 'number' },
          heading: { type: 'number' },
          navStatus: { type: 'number' }
        },
        required: ['coord', 'timestamp']
      }

    }
  }
};

module.exports = { vesselTrackSchema };