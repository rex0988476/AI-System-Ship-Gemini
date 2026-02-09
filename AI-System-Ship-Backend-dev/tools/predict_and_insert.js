const { MongoClient } = require('mongodb');

// Bypass SRV lookup by using direct host
const URI = 'mongodb://dbUser:dbUserPwd@ac-vfi0ivb-shard-00-00.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-01.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-02.mrvbbti.mongodb.net:27017/?ssl=true&authSource=admin&appName=GCP';
const DB_NAME = 'ais_data_test';
const COLLECTION_NAME = 'Taiwan';
const MMSI = 41200004; // Try number first
// const MMSI = "41200004"; 
const TARGET_TIME_STR = "2025-11-04T20:35:00.000Z";

async function run() {
    const client = new MongoClient(URI);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        // 0. Cleanup existing data at target time (to allow re-run)
        // Also cleanup any data that might have been inserted with incorrect time format or something
        await collection.deleteMany({
            $or: [
                { 'properties.MMSI': MMSI },
                { 'properties.MMSI': String(MMSI) }
            ],
            'properties.Record_Time': TARGET_TIME_STR
        });
        
        // Also delete by Date object if it was inserted as Date object
        await collection.deleteMany({
            $or: [
                { 'properties.MMSI': MMSI },
                { 'properties.MMSI': String(MMSI) }
            ],
            'properties.Record_Time': new Date(TARGET_TIME_STR)
        });

        // 1. Get the last known point
        // Try finding with number
        let lastPoints = await collection
            .find({ 'properties.MMSI': MMSI })
            .sort({ 'properties.Record_Time': -1 })
            .limit(1)
            .toArray();

        // If not found, try string
        if (lastPoints.length === 0) {
             console.log("Not found with number, trying string MMSI...");
             lastPoints = await collection
                .find({ 'properties.MMSI': String(MMSI) })
                .sort({ 'properties.Record_Time': -1 })
                .limit(1)
                .toArray();
        }

        if (lastPoints.length === 0) {
            console.error("No data found for MMSI:", MMSI);
            // Debug: list one document to see structure
            const oneDoc = await collection.findOne({});
            console.log("Sample document:", JSON.stringify(oneDoc, null, 2));
            return;
        }

        const lastPoint = lastPoints[0];
        console.log("Last known point:", JSON.stringify(lastPoint, null, 2));

        const lastTime = new Date(lastPoint.properties.Record_Time);
        const targetTime = new Date(TARGET_TIME_STR);

        if (lastTime >= targetTime) {
            console.log("Data already exists or is newer than target time.");
            return;
        }

        // 2. Calculate prediction
        // Time difference in seconds
        const dt = (targetTime.getTime() - lastTime.getTime()) / 1000;
        
        const sog = lastPoint.properties.SOG || 0; // knots
        const cog = lastPoint.properties.COG || 0; // degrees

        // 1 knot = 0.514444 m/s
        const speedMs = sog * 0.514444;
        const distanceM = speedMs * dt;

        // Calculate displacement
        // Simple flat earth approximation for short distances is okay, 
        // but let's use a slightly better estimation.
        // Latitude: 1 deg ~= 111,000 meters
        // Longitude: 1 deg ~= 111,000 * cos(lat) meters
        
        const cogRad = (cog * Math.PI) / 180;
        const dLatM = distanceM * Math.cos(cogRad);
        const dLonM = distanceM * Math.sin(cogRad);

        const currentLat = lastPoint.properties.Latitude;
        const currentLon = lastPoint.properties.Longitude;

        const dLatDeg = dLatM / 111000;
        // Use average latitude for longitude conversion
        const avgLatRad = ((currentLat + (currentLat + dLatDeg)) / 2 * Math.PI) / 180;
        const dLonDeg = dLonM / (111000 * Math.cos(avgLatRad));

        const newLat = currentLat + dLatDeg;
        const newLon = currentLon + dLonDeg;

        // 3. Construct new document
        const newDocument = {
            type: "Feature",
            properties: {
                ...lastPoint.properties, // Copy all existing properties
                Record_Time: new Date(TARGET_TIME_STR), // Insert as Date object, not string!
                Latitude: parseFloat(newLat.toFixed(6)),
                Longitude: parseFloat(newLon.toFixed(6)),
                MMSI: String(MMSI) // Ensure MMSI is string
            },
            geometry: {
                type: "Point",
                coordinates: [
                    parseFloat(newLon.toFixed(6)),
                    parseFloat(newLat.toFixed(6))
                ]
            },
            geometry_name: "pos"
        };
        
        // Remove _id from properties if it exists (it shouldn't be there usually but just in case)
        delete newDocument.properties._id;
        // Remove top level _id to let MongoDB generate a new one
        delete newDocument._id;

        console.log("Predicted Document:", JSON.stringify(newDocument, null, 2));

        // 4. Insert
        const result = await collection.insertOne(newDocument);
        console.log(`Successfully inserted document with _id: ${result.insertedId}`);
        
        // Optional: Delete the previous incorrect insertion if we know the ID, 
        // but since I don't want to hardcode the ID I just saw, I will skip deletion 
        // or I can delete by query (MMSI + Time).
        
        // Let's clean up duplicates for this specific time just in case
        const deleteResult = await collection.deleteMany({
            'properties.MMSI': String(MMSI),
            'properties.Record_Time': TARGET_TIME_STR,
            _id: { $ne: result.insertedId } // Don't delete the one we just inserted
        });
        if (deleteResult.deletedCount > 0) {
            console.log(`Deleted ${deleteResult.deletedCount} duplicate/old documents.`);
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
        console.log("Connection closed");
    }
}

run();
