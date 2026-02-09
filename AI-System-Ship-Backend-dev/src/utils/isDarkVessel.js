function getRecordTime(record) {
  const raw = record.properties.Record_Time;
  // 優先處理 MongoDB $date 格式，否則視為 ISO 字串
  const timeStr = (raw && raw.$date) ? raw.$date : raw;
  return new Date(timeStr).getTime();
}

function isDarkVessel(mmsi, rfTime, aisMap, windowMs) {
  const list = aisMap.get(mmsi);

  if (!list || list.length === 0) {
    return true;
  }

  // 目標：找到第一個時間 >= rfTime 的index
  let low = 0;
  let high = list.length;

  while (low < high) {
    const mid = (low + high) >>> 1;
    if (getRecordTime(list[mid]) < rfTime) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  let minDiff = Infinity;

  if (low < list.length) {
    const diff = Math.abs(getRecordTime(list[low]) - rfTime);
    minDiff = Math.min(minDiff, diff);
  }

  if (low > 0) {
    const diff = Math.abs(getRecordTime(list[low - 1]) - rfTime);
    minDiff = Math.min(minDiff, diff);
  }

  return !(minDiff <= windowMs);
}

module.exports = isDarkVessel;