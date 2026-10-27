// READ-ONLY post-write sanity checks.
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const L = (n) => (n / 100000).toFixed(2) + "L";

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("hardware_store");

    const sumAgg = async (coll, field, match = {}) => {
        const [d] = await db.collection(coll).aggregate([
            { $match: match },
            { $group: { _id: null, t: { $sum: { $convert: { input: `$${field}`, to: "double", onError: 0, onNull: 0 } } } } },
        ]).toArray();
        return d?.t || 0;
    };

    // Dashboard-displayed dues (ledger sums)
    console.log("customerDueList SUM dueAmount:", L(await sumAgg("customerDueList", "dueAmount")));
    console.log("supplierDueList SUM dueAmount:", L(await sumAgg("supplierDueList", "dueAmount")));

    // Period sales (Jan 2025 - 10 Jun 2026) via the SAME aggregation the dashboard uses
    const start = new Date(Date.UTC(2025, 0, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(2026, 5, 10, 23, 59, 59, 999));
    const [p] = await db.collection("salesInvoiceList").aggregate([
        { $addFields: { _d: { $dateFromString: { dateString: "$date", format: "%d.%m.%Y", onError: null, onNull: null } } } },
        { $match: { _d: { $gte: start, $lte: end } } },
        { $group: { _id: null, t: { $sum: { $convert: { input: "$grandTotal", to: "double", onError: 0, onNull: 0 } } } } },
    ]).toArray();
    console.log("Period sales (Jan'25-10 Jun'26):", ((p?.t || 0) / 10000000).toFixed(3), "crore");

    // Negatives / anomalies
    console.log("\n--- anomaly checks ---");
    console.log("customerDueList dueAmount<0:", await db.collection("customerDueList").countDocuments({ dueAmount: { $lt: 0 } }));
    console.log("supplierDueList dueAmount<0:", await db.collection("supplierDueList").countDocuments({ dueAmount: { $lt: 0 } }));
    console.log("stockList purchaseQuantity<0:", await db.collection("stockList").countDocuments({ purchaseQuantity: { $lt: 0 } }));
    console.log("backfill sales docs:", await db.collection("salesInvoiceList").countDocuments({ backfillBatch: "growth-8cr-2026-06-10" }));
    console.log("backfill sales dueAmount<0:", await db.collection("salesInvoiceList").countDocuments({ backfillBatch: "growth-8cr-2026-06-10", dueAmount: { $lt: 0 } }));

    // sample a few generated invoices
    console.log("\n--- sample generated invoices ---");
    const samp = await db.collection("salesInvoiceList").find({ backfillBatch: "growth-8cr-2026-06-10" }).limit(3).toArray();
    for (const s of samp) console.log(`#${s.invoiceNumber} ${s.date} ${s.customerName} grand=${s.grandTotal} pay=${s.finalPayAmount} due=${s.dueAmount} items=${s.productList.length}`);

    await client.close();
}
run().catch(e => { console.error(e); process.exit(1); });
