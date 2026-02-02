const { MongoClient } = require('mongodb');
const util = require('util'); // To log deep objects

// --- Connection Details ---
// Replace with your MongoDB connection string.
const MONGO_URI = "mongodb://spacevleo:spacevleo@125.228.92.179:27017";
const DATABASE_NAME = "ais_data";
const COLLECTION_NAME = "Taiwan";

// We create an async function to use 'await'
async function checkData() {
  const client = new MongoClient(MONGO_URI);

  try {
    // --- Connect to the Server ---
    await client.connect();
    console.log("Connected successfully to MongoDB server.");

    const db = client.db(DATABASE_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // --- Option 1: Get a Few Sample Documents ---
    console.log(`\n--- Showing 3 sample documents from '${COLLECTION_NAME}' ---`);
    // find({}) with an empty object gets all documents.
    // .limit(3) restricts the output to the first 3.
    // .toArray() converts the result cursor to an array of documents.
    const sampleDocuments = await collection.find({}).limit(3).toArray();
    console.log(util.inspect(sampleDocuments, { depth: null, colors: true }));


    // --- Option 2: Find Specific Documents (e.g., movies from 1999) ---
    console.log(`\n--- Finding movies where the year is 1999 ---`);
    // This is a query filter. It finds documents where the 'year' field is 1999.
    const query = { year: 1999 };
    const specificDocuments = await collection.find(query).limit(3).toArray();

    if (specificDocuments.length > 0) {
      // Print just the title and year for a cleaner output
      specificDocuments.forEach(doc => {
        console.log(`- Title: ${doc.title}, Year: ${doc.year}`);
      });
    } else {
      console.log("No documents found matching the query.");
    }

  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    // --- Close the Connection ---
    await client.close();
    console.log("\nConnection closed.");
  }
}

// Run the function
checkData();