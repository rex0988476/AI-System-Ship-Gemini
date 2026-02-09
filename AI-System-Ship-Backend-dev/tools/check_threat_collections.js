const { MongoClient } = require('mongodb');

// Use direct connection string
const URI = 'mongodb://dbUser:dbUserPwd@ac-vfi0ivb-shard-00-00.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-01.mrvbbti.mongodb.net:27017,ac-vfi0ivb-shard-00-02.mrvbbti.mongodb.net:27017/?ssl=true&authSource=admin&appName=GCP';
const DB_NAME = 'threatAlg_data_test';
const COLLECTIONS = ['aisSwitch', 'loitering', 'meandering', 'speedDrop'];

async function run() {
    const client = new MongoClient(URI);

    try {
        await client.connect();
        console.log("Connected to MongoDB");

        const db = client.db(DB_NAME);

        console.log(`Checking database: ${DB_NAME}`);

        for (const colName of COLLECTIONS) {
            const collection = db.collection(colName);
            const count = await collection.countDocuments();
            console.log(`\n=== Collection: '${colName}' (${count} docs) ===`);
            
            if (count > 0) {
                // Print all documents
                const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
                docs.forEach((doc, index) => {
                    console.log(`\n-- Document ${index + 1} --`);
                    console.log(JSON.stringify(doc, null, 2));
                });
            }
        }

    } catch (err) {
        console.error("Error:", err);
    } finally {
        await client.close();
        console.log("Connection closed");
    }
}

run();
