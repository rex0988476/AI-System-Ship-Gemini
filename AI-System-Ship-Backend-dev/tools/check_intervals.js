const fs = require('fs');

const TOLERANCE_SECONDS = 30; // 容忍差異 +/- 秒
const EXPECTED_SECONDS = 6 * 60; // 6 分鐘 = 360 秒

try {
  const fileContent = fs.readFileSync('tracks_data.js', 'utf8');
  const jsonStr = fileContent.replace(/^\s*const\s+tracksData\s*=\s*/, '').replace(/;\s*$/s, '');
  const tracksData = JSON.parse(jsonStr);

  const summary = {};

  Object.keys(tracksData).forEach(mmsi => {
    const track = tracksData[mmsi];
    if (!track || track.length < 2) {
      summary[mmsi] = {
        intervals: 0,
        ok: 0,
        percent: 0,
        anomalies: []
      };
      return;
    }

    const anomalies = [];
    let okCount = 0;

    // 假設 track[0] 是最新 -> track[i] 與 track[i+1]
    for (let i = 0; i < track.length - 1; i++) {
      const tNew = new Date(track[i].time).getTime();
      const tOld = new Date(track[i + 1].time).getTime();
      const diffSec = (tNew - tOld) / 1000;

      const within = Math.abs(diffSec - EXPECTED_SECONDS) <= TOLERANCE_SECONDS;
      if (within) okCount++;
      else {
        anomalies.push({
          indexNew: i,
          timeNew: track[i].time,
          indexOld: i + 1,
          timeOld: track[i + 1].time,
          diffSeconds: diffSec
        });
      }
    }

    const total = track.length - 1;
    summary[mmsi] = {
      intervals: total,
      ok: okCount,
      percent: total > 0 ? (okCount / total * 100).toFixed(2) : '0.00',
      anomalies
    };
  });

  // Print concise report
  console.log('MMSI\tIntervals\tOK\t%OK\tAnomalies');
  console.log('---------------------------------------------------------------');
  Object.keys(summary).forEach(mmsi => {
    const s = summary[mmsi];
    console.log(`${mmsi}\t${s.intervals}\t${s.ok}\t${s.percent}%\t${s.anomalies.length}`);
  });

  // 詳細列出有 anomalies 的船
  console.log('\nDetailed anomalies (showing up to 20 per vessel):');
  Object.keys(summary).forEach(mmsi => {
    const s = summary[mmsi];
    if (s.anomalies.length > 0) {
      console.log(`\n--- MMSI: ${mmsi} (${s.anomalies.length} anomalies) ---`);
      s.anomalies.slice(0, 20).forEach(a => {
        console.log(`IndexNew=${a.indexNew} TimeNew=${a.timeNew} | IndexOld=${a.indexOld} TimeOld=${a.timeOld} | diffSec=${a.diffSeconds}`);
      });
    }
  });

  // 儲存報表
  const out = { generatedAt: new Date().toISOString(), toleranceSeconds: TOLERANCE_SECONDS, expectedSeconds: EXPECTED_SECONDS, summary };
  fs.writeFileSync('intervals_report.json', JSON.stringify(out, null, 2));
  console.log('\nReport written to intervals_report.json');

} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
