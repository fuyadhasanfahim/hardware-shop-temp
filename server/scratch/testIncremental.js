require("dotenv").config({ path: "../.env" });
const { MongoClient } = require("mongodb");
const { format } = require("date-fns");
const AutoPilotEngine = require("../utils/autoPilotEngine");

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db("hardware_store"); 
        
        console.log("Connected successfully to MongoDB.");
        
        const targetDate = format(new Date(), "dd.MM.yyyy");
        
        console.log("--- Testing Incremental Step ---");
        const resultInc = await AutoPilotEngine.processIncrementalStep(db, db, targetDate);
        console.log("Incremental step result:", JSON.stringify(resultInc, null, 2));
        
        // Since it might skip due to working hours, let's manually force a run by mocking hours
        console.log("--- Testing Incremental Step (Mocking business hours) ---");
        const originalGetHours = Date.prototype.getHours;
        Date.prototype.getHours = function() { return 12; }; // Mocking 12 PM
        
        const resultIncMocked = await AutoPilotEngine.processIncrementalStep(db, db, targetDate);
        console.log("Mocked Incremental step result:", JSON.stringify(resultIncMocked, null, 2));
        
        // Restore original getHours
        Date.prototype.getHours = originalGetHours;
        
    } catch (err) {
        console.error("Test error:", err);
    } finally {
        await client.close();
        process.exit(0);
    }
}

run();
