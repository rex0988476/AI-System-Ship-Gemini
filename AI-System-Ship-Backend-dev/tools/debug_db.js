const { MongoClient } = require('mongodb');

// Use direct connection string
const URI = 'mongodb://dbUser:dbUserPwd@ac-vfi0ivb-shard-00-00.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-01.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-02.mrvbbti.mongodb.net:27017/?ssl=true&authSource=admin&appName=GCP';
const DB_NAME = 'ais_data_test';
const COLLECTION_NAME = 'Taiwan';

async function run() {
    const client = new MongoClient(URI);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(DB_NAME);
        const collection = db.collection(COLLECTION_NAME);

        console.log("Querying for MMSI 41200004 (String and Number)...");

        // Query for both string and number types
        const docs = await collection.find({
            $or: [
                { 'properties.MMSI': '41200004' },
                { 'properties.MMSI': 41200004 }
            ]
        })
        .sort({ 'properties.Record_Time': -1 })
        .limit(5) // Just check the top 5 latest
        .toArray();

        console.log(`Found ${docs.length} documents.`);
        
        docs.forEach((doc, index) => {
            const mmsi = doc.properties.MMSI;
            const time = doc.properties.Record_Time;
            console.log(`[${index}] Time: ${time} | MMSI Type: ${typeof mmsi} | MMSI Value: ${mmsi} | ID: ${doc._id}`);
        });

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
    }
}

run();
