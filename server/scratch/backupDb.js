// Full backup of both databases to local EJSON files (restorable).
// READ-ONLY against the DB. Writes JSON files locally under scratch/backups/<timestamp>/.
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const DBS = ["hardware_store", "debtMaintain"];

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const root = path.join(__dirname, "backups", stamp);

    try {
        await client.connect();
        for (const dbName of DBS) {
            const db = client.db(dbName);
            const cols = await db.listCollections().toArray();
            const outDir = path.join(root, dbName);
            fs.mkdirSync(outDir, { recursive: true });
            console.log(`\n[DB ${dbName}] ${cols.length} collections`);
            for (const c of cols) {
                const name = c.name;
                const docs = await db.collection(name).find({}).toArray();
                const file = path.join(outDir, `${name}.json`);
                fs.writeFileSync(file, EJSON.stringify(docs, null, 0));
                console.log(`  ${name}: ${docs.length} docs -> ${file}`);
            }
        }
        console.log(`\n✅ Backup complete at: ${root}`);
    } catch (e) {
        console.error("BACKUP ERROR:", e);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}
run();
