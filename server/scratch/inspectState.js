// READ-ONLY inspection. Does not write anything.
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const toNum = (v) => Number(v || 0);

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db("hardware_store");

        const sales = db.collection("salesInvoiceList");
        const purchases = db.collection("purchaseInvoiceList");

        const salesCount = await sales.countDocuments();
        const simSales = await sales.countDocuments({ simulated: true });
        const realSales = salesCount - simSales;

        // Total grand total + by month (date is "dd.MM.yyyy" string)
        const all = await sales.find({}, { projection: { date: 1, grandTotal: 1, finalPayAmount: 1, dueAmount: 1, simulated: 1 } }).toArray();
        let totalGrand = 0, totalCash = 0, totalDue = 0;
        const byMonth = {}; // "MM.yyyy" -> {count, grand}
        for (const s of all) {
            totalGrand += toNum(s.grandTotal);
            totalCash += toNum(s.finalPayAmount);
            totalDue += toNum(s.dueAmount);
            const mk = typeof s.date === "string" ? s.date.slice(3) : "??";
            if (!byMonth[mk]) byMonth[mk] = { count: 0, grand: 0 };
            byMonth[mk].count++;
            byMonth[mk].grand += toNum(s.grandTotal);
        }

        console.log("=== SALES INVOICES ===");
        console.log("Total invoices:", salesCount, "| simulated:", simSales, "| real:", realSales);
        console.log("SUM grandTotal:", totalGrand.toLocaleString("en-IN"), "BDT");
        console.log("  (in crore:", (totalGrand / 10000000).toFixed(3), ")");
        console.log("SUM cash(finalPay):", totalCash.toLocaleString("en-IN"));
        console.log("SUM due:", totalDue.toLocaleString("en-IN"));

        console.log("\n=== SALES BY MONTH (MM.yyyy) ===");
        const keys = Object.keys(byMonth).sort((a, b) => {
            const [ma, ya] = a.split("."); const [mb, yb] = b.split(".");
            return (ya - yb) || (ma - mb);
        });
        for (const k of keys) {
            console.log(`${k}: ${byMonth[k].count} inv | ${byMonth[k].grand.toLocaleString("en-IN")} BDT`);
        }

        // Purchases
        const purchaseCount = await purchases.countDocuments();
        const simPurch = await purchases.countDocuments({ simulated: true });
        const pAll = await purchases.find({}, { projection: { grandTotal: 1 } }).toArray();
        const pTotal = pAll.reduce((a, p) => a + toNum(p.grandTotal), 0);
        console.log("\n=== PURCHASES ===");
        console.log("Total:", purchaseCount, "| simulated:", simPurch, "| SUM grandTotal:", pTotal.toLocaleString("en-IN"));

        // Balances
        const mb = await db.collection("mainBalanceList").findOne();
        const cdb = await db.collection("customerDueBalanceList").findOne();
        const sdb = await db.collection("supplierDueBalanceList").findOne();
        const pb = await db.collection("profitList").findOne();
        const cb = await db.collection("costingBalanceList").findOne();
        console.log("\n=== BALANCES ===");
        console.log("mainBalance:", toNum(mb?.mainBalance).toLocaleString("en-IN"));
        console.log("customerDueBalance:", toNum(cdb?.customerDueBalance).toLocaleString("en-IN"));
        console.log("supplierDueBalance:", toNum(sdb?.supplierDueBalance).toLocaleString("en-IN"));
        console.log("profitBalance:", toNum(pb?.profitBalance).toLocaleString("en-IN"));
        console.log("costingBalance:", toNum(cb?.costingBalance).toLocaleString("en-IN"));

        // Daily summary totals
        const ds = await db.collection("dailySummaryList").find({}).toArray();
        const dsSales = ds.reduce((a, d) => a + toNum(d.totalSales), 0);
        const dsProfit = ds.reduce((a, d) => a + toNum(d.totalProfit), 0);
        const dsCost = ds.reduce((a, d) => a + toNum(d.totalCost), 0);
        console.log("\n=== DAILY SUMMARY (", ds.length, "days ) ===");
        console.log("SUM totalSales:", dsSales.toLocaleString("en-IN"), "| SUM totalProfit:", dsProfit.toLocaleString("en-IN"), "| SUM totalCost:", dsCost.toLocaleString("en-IN"));

        // Counts of supporting collections
        console.log("\n=== COUNTS ===");
        for (const c of ["customerList", "supplierList", "stockList", "customerDueList", "supplierDueList", "transactionList", "autoPilotSettings", "autoPilotDailyState"]) {
            console.log(c + ":", await db.collection(c).countDocuments());
        }

        // autoPilotSettings content
        const aps = await db.collection("autoPilotSettings").findOne();
        console.log("\n=== autoPilotSettings ===");
        console.log(JSON.stringify(aps, null, 2));
    } catch (e) {
        console.error("ERROR:", e);
    } finally {
        await client.close();
    }
}
run();
