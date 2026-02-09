const { MongoClient } = require('mongodb');
const calculateAisSwitchScore = require('./src/utils/aisSwitchAlgorithm');
const calculateLoiteringScore = require('./src/utils/loiteringAlgorithm');
const calculateMeanderingScore = require('./src/utils/meanderingAlgorithm');
const calculateSpeedDropScore = require('./src/utils/speedDropAlgorithm');

// Use direct connection string
const URI = 'mongodb://dbUser:dbUserPwd@ac-vfi0ivb-shard-00-00.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-01.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-02.mrvbbti.mongodb.net:27017/?ssl=true&authSource=admin&appName=GCP';

async function manualRun() {
    const client = new MongoClient(URI);
    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db_ais = client.db('ais_data_test');
        const col_ais = db_ais.collection('Taiwan');
        const db_threat = client.db('threatAlg_data_test');

        // Only process the new vessels
        const targetMMSIs = ['41200005', '41200006', '41200007'];

        console.log(`Starting manual analysis for: ${targetMMSIs.join(', ')}`);

        for (const mmsi of targetMMSIs) {
            console.log(`\nAnalyzing Vessel ${mmsi}...`);

            // 1. Get Latest Time
            const latestDoc = await col_ais.findOne(
                { 'properties.MMSI': mmsi },
                { sort: { 'properties.Record_Time': -1 }, projection: { 'properties.Record_Time': 1 } }
            );

            if (!latestDoc) {
                console.log("No AIS data found.");
                continue;
            }

            const latestTime = latestDoc.properties.Record_Time; // This is now a Date object!
            console.log(`Latest data point: ${latestTime.toISOString()}`);

            const t = 24 * 60; // 1440 minutes lookback
            const startTime = new Date(latestTime.getTime() - t * 60 * 1000);

            // 2. Fetch History Points
            const historyPoints = await col_ais.find({
                'properties.MMSI': mmsi,
                'properties.Record_Time': { $gte: startTime, $lte: latestTime }
            }).sort({ 'properties.Record_Time': -1 }).toArray();

            console.log(`Loaded ${historyPoints.length} history points.`);

            if (historyPoints.length === 0) continue;

            // 3. AIS Switch (Using same params as scheduler)
            const smugglingAreas = [
                { lat: 22.678203, lon: 119.612823, radius: 40 },
                { lat: 25.1, lon: 121.7, radius: 15 }
            ];
            const switchRes = calculateAisSwitchScore(historyPoints, {
                smugglingAreas, t, p_free: 0.05, p_full: 0.3
            });
            switchRes.mmsi = mmsi;
            switchRes.createdAt = new Date();
            await db_threat.collection('aisSwitch').insertOne(switchRes);
            console.log(`  AIS Switch Score: ${switchRes.riskScore}`);


            // 4. Loitering
            const loiterRes = calculateLoiteringScore(historyPoints, {
                speedThreshold: 3.0,
                radiusThreshold: 0.5,
                t0: 10,
                t1: 60
            });
            loiterRes.mmsi = mmsi;
            loiterRes.createdAt = new Date();
            await db_threat.collection('loitering').insertOne(loiterRes);
            console.log(`  Loitering Detected: ${loiterRes.isLoitering} (Score: ${loiterRes.riskScore})`);


            // 5. Meandering
            const meanderRes = calculateMeanderingScore(historyPoints, {
                 t: 60,
                 s_crit: 2.0,
                 f_crit: 500,
                 f_trigger: 50
            });
            meanderRes.mmsi = mmsi;
            meanderRes.createdAt = new Date();
            await db_threat.collection('meandering').insertOne(meanderRes);
            console.log(`  Meandering Score: ${meanderRes.riskScore}`);


            // 6. Speed Drop
            // Valid params according to speedDropAlgorithm.js and threatTask.js
            const speedRes = calculateSpeedDropScore(historyPoints, {
                t: 60,          // 60 minutes lookback
                a_free: 0.005,  // Threshold for score > 0
                a_full: 0.03    // Threshold for score = 1
            });
            speedRes.mmsi = mmsi;
            speedRes.createdAt = new Date();
            await db_threat.collection('speedDrop').insertOne(speedRes);
            console.log(`  Speed Drop Score: ${speedRes.riskScore}`);
        }

        console.log("\nManual analysis completed successfully.");

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

manualRun();
