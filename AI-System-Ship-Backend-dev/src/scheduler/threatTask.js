const calculateAisSwitchScore = require('../utils/aisSwitchAlgorithm');
const calculateLoiteringScore = require('../utils/loiteringAlgorithm');
const calculateMeanderingScore = require('../utils/meanderingAlgorithm');
const calculateSpeedDropScore = require('../utils/speedDropAlgorithm');

async function runAisSwitch(mmsi, latestTime, col_ais, db_threat, smugglingAreas) {
    const t = 24 * 60; // 1440 minutes
    const p_free = 0.05;
    const p_full = 0.3;
    
    // Default fallback if DB is empty or not passed, though scheduler should pass it
    const activeAreas = (smugglingAreas && smugglingAreas.length > 0) ? smugglingAreas : [
        { lat: 22.678203, lon: 119.612823, radius: 40 },
        { lat: 25.1, lon: 121.7, radius: 15 }
    ];

    const startTime = new Date(latestTime.getTime() - t * 60 * 1000);

    const historyPoints = await col_ais.find({
        'properties.MMSI': mmsi,
        'properties.Record_Time': { $gte: startTime, $lte: latestTime }
    }).sort({ 'properties.Record_Time': -1 }).toArray();

    const result = calculateAisSwitchScore(historyPoints, {
        smugglingAreas: activeAreas, t, p_free, p_full
    });

    result.mmsi = mmsi;
    result.createdAt = new Date();

    await db_threat.collection('aisSwitch').insertOne(result);
}

async function runLoitering(mmsi, latestTime, col_ais, db_threat) {
    const speedThreshold = 3.0;
    const radiusThreshold = 0.5;
    const t0 = 10;
    const t1 = 60;
    const lookBackHours = 3;

    const startTime = new Date(latestTime.getTime() - lookBackHours * 60 * 60 * 1000);

    const historyPoints = await col_ais.find({
        'properties.MMSI': mmsi,
        'properties.Record_Time': { $gte: startTime, $lte: latestTime }
    }).sort({ 'properties.Record_Time': -1 }).toArray();

    const result = calculateLoiteringScore(historyPoints, {
        speedThreshold, radiusThreshold, t0, t1
    });

    result.mmsi = mmsi;
    result.createdAt = new Date();

    await db_threat.collection('loitering').insertOne(result);
}

async function runMeandering(mmsi, latestTime, col_ais, db_threat) {
    const t = 60;
    const s_crit = 2.0;
    const f_crit = 500;
    const f_trigger = 50;

    const startTime = new Date(latestTime.getTime() - t * 60 * 1000);

    const historyPoints = await col_ais.find({
        'properties.MMSI': mmsi,
        'properties.Record_Time': { $gte: startTime, $lte: latestTime }
    }).sort({ 'properties.Record_Time': -1 }).toArray();

    const result = calculateMeanderingScore(historyPoints, {
        t, s_crit, f_crit, f_trigger
    });

    result.mmsi = mmsi;
    result.createdAt = new Date();

    await db_threat.collection('meandering').insertOne(result);
}

async function runSpeedDrop(mmsi, latestTime, col_ais, db_threat) {
    const t = 60;
    const a_free = 0.005;
    const a_full = 0.03;

    // Fetch extra buffer for acceleration calculation
    const startTime = new Date(latestTime.getTime() - (t + 30) * 60 * 1000);

    const historyPoints = await col_ais.find({
        'properties.MMSI': mmsi,
        'properties.Record_Time': { $gte: startTime, $lte: latestTime }
    }).sort({ 'properties.Record_Time': -1 }).toArray();

    const result = calculateSpeedDropScore(historyPoints, {
        t, a_free, a_full
    });

    result.mmsi = mmsi;
    result.createdAt = new Date();

    await db_threat.collection('speedDrop').insertOne(result);
}

async function runAllThreatAlgorithms(mongo) {
    console.log(`[${new Date().toISOString()}] Starting scheduled threat analysis...`);
    
    const db_ais = mongo.client.db('ais_data_test');
    const col_ais = db_ais.collection('Taiwan');
    const db_threat = mongo.client.db('threatAlg_data_test');

    try {
        // Fetch smuggling areas dynamically
        const smugglingAreas = await db_threat.collection('smugglingAreas').find({}).toArray();

        // Get all unique MMSIs
        const mmsis = await col_ais.distinct('properties.MMSI');
        console.log(`Found ${mmsis.length} vessels to analyze.`);

        for (const mmsi of mmsis) {
            // Ensure MMSI is string
            const mmsiStr = String(mmsi);

            // Fetch latest doc to determine time window for this vessel
            const latestDoc = await col_ais.findOne(
                { 'properties.MMSI': mmsiStr },
                { sort: { 'properties.Record_Time': -1 }, projection: { 'properties.Record_Time': 1 } }
            );

            if (!latestDoc) {
                console.log(`No data found for MMSI ${mmsiStr}, skipping.`);
                continue;
            }

            const latestTime = new Date(latestDoc.properties.Record_Time);

            // Run all algorithms sequentially for this vessel
            await runAisSwitch(mmsiStr, latestTime, col_ais, db_threat, smugglingAreas);
            await runLoitering(mmsiStr, latestTime, col_ais, db_threat);
            await runMeandering(mmsiStr, latestTime, col_ais, db_threat);
            await runSpeedDrop(mmsiStr, latestTime, col_ais, db_threat);
        }
        console.log(`[${new Date().toISOString()}] Scheduled threat analysis completed.`);
    } catch (err) {
        console.error("Error in threat analysis scheduler:", err);
    }
}

function startThreatScheduler(app) {
    // Run immediately on start (optional, but good for testing)
    // Using setTimeout to ensure DB connection is fully ready if called immediately after app.ready()
    setTimeout(() => {
        runAllThreatAlgorithms(app.mongo);
    }, 5000);

    // Schedule every 12 minutes
    const interval = 12 * 60 * 1000;
    setInterval(() => {
        runAllThreatAlgorithms(app.mongo);
    }, interval);
    
    console.log(`Threat analysis scheduler started. Interval: ${interval}ms`);
}

module.exports = startThreatScheduler;
