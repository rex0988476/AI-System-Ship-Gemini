const { execFile } = require('child_process');
const path = require('path');

/*
print previous point
*/

async function predictTrajRoutes(fastify) {
  fastify.get('/predictTraj', async (request, reply) => {
    const { mmsi } = request.query;
    if (!mmsi) {
      return reply.status(400).send({ error: "Missing mmsi" });
    }

    const scriptPath = path.resolve(__dirname, '../../trajectoryPrediction/predict_traj.py');
    const env = { ...process.env, MMSI: String(mmsi) };

    const pythonPath = path.resolve(__dirname, '../../trajectoryPrediction/.venv/bin/python');
    const result = await new Promise((resolve, reject) => {
      execFile(pythonPath, [scriptPath], { env }, (err, stdout, stderr) => {
        if (err) {
          return reject({
            type: "exec",
            detail: stderr || String(err)
          });
        }

        // Expect a single line: "Prediction [lat, lon, speed, course]: [...]"
        const text = stdout.trim();
        try {
          const pred = JSON.parse(text);
          return resolve(pred);
        } catch (e) {
          return reject({
            type: "json",
            detail: text
          });
        }
      });
    });

    return reply.send({ mmsi, prediction: result });
  });
}

module.exports = predictTrajRoutes;
