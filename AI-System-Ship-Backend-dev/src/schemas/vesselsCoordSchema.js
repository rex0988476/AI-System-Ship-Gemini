/* 定義前端傳入的資料格式 */
const vesselsCoordQuery = {
  type: 'object',
  required: ['lat', 'lon', 'radius'],
  properties: {
    lat: {
      type: 'number',
      description: '區域中心緯度'
    },
    lon: {
      type: 'number',
      description: '區域中心經度'
    },
    radius: {
      type: 'number',
      description: '區域半徑(海哩)'
    }
  }
};

/* 完整的 API Schema (包含輸入和輸出) */
const vesselsCoordSchema = {
  querystring: vesselsCoordQuery,
  response: {
    200: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          mmsi: { type: 'string' },
          coord: {
            type: 'array',
            items: { type: 'number' },
            minItems: 2,
            maxItems: 2
          },
        },
        required: ['mmsi', 'coord']
      }

    }
  }
};

module.exports = { vesselsCoordSchema };