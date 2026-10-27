// Restore both databases from an EJSON backup folder.
// Usage: node scratch/restoreDb.js <backupFolderName>
//   e.g. node scratch/restoreDb.js 2026-06-10T15-07-19-786Z
// DESTRUCTIVE: drops each collection and reinserts the backed-up docs.
const { MongoClient } = require("mongodb");
const { EJSON } = require("bson");
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

async function run() {
    const folder = process.argv[2];
    if (!folder) {
        console.error("Provide backup folder name. e.g. node scratch/restoreDb.js 2026-06-10T15-07-19-786Z");
        process.exit(1);
    }
    const root = path.join(__dirname, "backups", folder);
    if (!fs.existsSync(root)) {
        console.error("Backup folder not found:", root);
        process.exit(1);
    }

    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const dbDirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
        for (const d of dbDirs) {
            const dbName = d.name;
            const db = client.db(dbName);
            const files = fs.readdirSync(path.join(root, dbName)).filter((f) => f.endsWith(".json"));
            console.log(`\n[DB ${dbName}] restoring ${files.length} collections`);
            for (const f of files) {
                const name = f.replace(/\.json$/, "");
                const raw = fs.readFileSync(path.join(root, dbName, f), "utf8");
                const docs = EJSON.parse(raw);
                const coll = db.collection(name);
                await coll.deleteMany({});
                if (docs.length > 0) await coll.insertMany(docs, { ordered: false });
                console.log(`  ${name}: ${docs.length} docs restored`);
            }
        }
        console.log("\n✅ Restore complete.");
    } catch (e) {
        console.error("RESTORE ERROR:", e);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}
run();
