/**
 * Balanced demo backfill generator (Jan 2025 -> 10 Jun 2026).
 *
 * Builds a natural "growth" sales curve totalling ~8 crore for the period,
 * then generates matching purchases, due collections, supplier payments and
 * expenses so cash / dues / profit all stay realistic and consistent.
 *
 * Two-pass, in-memory, bulk-written. Every generated document is tagged with
 *   backfillBatch: BATCH_TAG   (+ simulated:true, macroRouted:true)
 * so it can be identified or removed later.
 *
 * SAFETY: defaults to DRY_RUN (prints projection, writes nothing).
 *   Dry run :  node scratch/generateBackfill.js
 *   Execute :  node scratch/generateBackfill.js --write
 */
const { MongoClient } = require("mongodb");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const WRITE = process.argv.includes("--write");
const BATCH_TAG = "growth-8cr-2026-06-10";
const USER = "admin";
const L = 100000; // 1 lakh

// ---- Target monthly TOTAL sales (lakh). Each FULL year ~7.75 cr; partial
//      years (2024 Sep-Dec, 2026 Jan-Jun) kept on the same ~65L/month pace.
//      Natural month-to-month variation; every month >= existing real sales.
const TARGETS = {
    // 2024 (business start, Sep-Dec) -> on-pace ~2.62 cr
    "09.2024": 60, "10.2024": 68, "11.2024": 63, "12.2024": 71,
    // 2025 (full year) -> ~7.79 cr
    "01.2025": 58, "02.2025": 60, "03.2025": 66, "04.2025": 64,
    "05.2025": 57, "06.2025": 70, "07.2025": 63, "08.2025": 55,
    "09.2025": 67, "10.2025": 69, "11.2025": 72, "12.2025": 78,
    // 2026 (Jan - 10 Jun, on-pace) -> ~3.52 cr so far (tracking ~8 cr/yr)
    "01.2026": 62, "02.2026": 66, "03.2026": 68, "04.2026": 64,
    "05.2026": 70, "06.2026": 22,
};
const PARTIAL_LAST_DAY = { "06.2026": 10 }; // Jun 2026 only through the 10th

// ---- End-state targets (BDT) for dependent ledgers ----
const CD_TARGET = 75 * L;    // customer due displayed sum (~settings baseline)
const SD_TARGET = 40 * L;    // supplier due displayed sum
const EXP_TARGET = 44 * L;   // total expenses over period (~2L/month, realistic)
const PURCHASE_RATIO = 0.90; // purchase value as fraction of added sales
// Resulting cash (mainBalance) is computed as the plug and reported.

const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const pad = (n) => String(n).padStart(2, "0");
const round2 = (n) => Math.round(n * 100) / 100;
const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
const fmtL = (n) => (n / L).toFixed(2) + "L";

async function main() {
    const client = new MongoClient(process.env.MONGO_URI);
    await client.connect();
    const db = client.db("hardware_store");

    // ---------- Load reference data once ----------
    const stockArr = await db.collection("stockList").find({}).toArray();
    const stockMap = new Map();
    for (const s of stockArr) stockMap.set(s.productID, s);

    const realSales = await db.collection("salesInvoiceList")
        .find({ simulated: { $ne: true } },
            { projection: { productList: 1, finalPayAmount: 1, grandTotal: 1, totalAmount: 1, discountAmount: 1, labourCost: 1, transportCost: 1 } })
        .limit(4000).toArray();
    const salesBaskets = realSales.filter(s => Array.isArray(s.productList) && s.productList.length > 0);

    const realPurch = await db.collection("purchaseInvoiceList")
        .find({}, { projection: { productList: 1 } }).limit(1000).toArray();
    const purchBaskets = realPurch.filter(p => Array.isArray(p.productList) && p.productList.length > 0);

    const custDueDocs = await db.collection("customerDueList")
        .find({}, { projection: { customerSerial: 1, customerName: 1, contactNumber: 1, customerAddress: 1, dueAmount: 1 } }).toArray();
    const suppDueDocs = await db.collection("supplierDueList")
        .find({}, { projection: { supplierSerial: 1, supplierName: 1, contactNumber: 1, supplierAddress: 1, contactPerson: 1, dueAmount: 1 } }).toArray();

    // In-memory mutable due tracking
    const custDue = new Map(); // serial -> {doc, due}
    for (const c of custDueDocs) custDue.set(c.customerSerial, { doc: c, due: Number(c.dueAmount || 0) });
    const suppDue = new Map();
    for (const s of suppDueDocs) suppDue.set(s.supplierSerial, { doc: s, due: Number(s.dueAmount || 0) });

    const CD0 = [...custDue.values()].reduce((a, x) => a + x.due, 0);
    const SD0 = [...suppDue.values()].reduce((a, x) => a + x.due, 0);
    const mainDoc = await db.collection("mainBalanceList").findOne();
    const M0 = Number(mainDoc?.mainBalance || 0);

    // Existing monthly sales totals (live)
    const allDates = await db.collection("salesInvoiceList").find({}, { projection: { date: 1, grandTotal: 1 } }).toArray();
    const existMonth = {};
    for (const d of allDates) {
        const mk = typeof d.date === "string" ? d.date.slice(3) : null;
        if (!mk) continue;
        existMonth[mk] = (existMonth[mk] || 0) + Number(d.grandTotal || 0);
    }

    // Counters
    const maxSalesInv = (await db.collection("salesInvoiceList").findOne({}, { sort: { invoiceNumber: -1 } }))?.invoiceNumber || 35000000;
    const maxPurchInv = (await db.collection("purchaseInvoiceList").findOne({}, { sort: { invoiceNumber: -1 } }))?.invoiceNumber || 45000000;
    const maxTxn = (await db.collection("transactionList").find().sort({ serial: -1 }).limit(1).toArray())[0]?.serial || 100;
    let salesInvNo = maxSalesInv;
    let purchInvNo = maxPurchInv;
    let txnNo = maxTxn;

    const segments = { microLimit: 15000, highLimit: 50000 };

    // ---------- Accumulators ----------
    const salesDocs = [];
    const dateAgg = {}; // "dd.MM.yyyy" -> {sales, profit, cost}
    const custLedger = new Map(); // serial -> {incDue, sales:[], pays:[]}
    const suppLedger = new Map(); // serial -> {incDue, purch:[], pays:[]}
    const stockDelta = new Map(); // productID -> qty delta
    let sumGrand = 0, sumCash = 0, sumDue = 0, sumProfit = 0;

    const addDateAgg = (date, k, v) => {
        if (!dateAgg[date]) dateAgg[date] = { sales: 0, profit: 0, cost: 0 };
        dateAgg[date][k] += v;
    };
    const cl = (serial) => {
        if (!custLedger.has(serial)) custLedger.set(serial, { incDue: 0, sales: [], pays: [] });
        return custLedger.get(serial);
    };
    const sl = (serial) => {
        if (!suppLedger.has(serial)) suppLedger.set(serial, { incDue: 0, purch: [], pays: [] });
        return suppLedger.get(serial);
    };

    // ---------- payment behaviour (mirrors engine STANDARD) ----------
    const behavior = (grandTotal) => {
        const p = Math.random();
        let fc, pt;
        if (grandTotal <= segments.microLimit) { fc = 0.70; pt = 0.90; }
        else if (grandTotal >= segments.highLimit) { fc = 0.20; pt = 0.90; }
        else { fc = 0.40; pt = 0.90; }
        if (p < fc) return "FULL_CASH";
        if (p < pt) return "PARTIAL_CASH";
        return "FULL_DUE";
    };

    const buildSaleInvoice = (date) => {
        const sample = pick(salesBaskets);
        const productList = [];
        let total = 0, profit = 0;
        for (const item of sample.productList) {
            const live = stockMap.get(item.productID);
            const pPrice = Number(live?.purchasePrice || item.purchasePrice || 100);
            const sPrice = Number(live?.salesPrice || item.salesPrice || 120);
            let qty = Number(item.salesQuantity || 1);
            if (qty > 2 && Math.random() < 0.25) qty += Math.random() < 0.5 ? 1 : -1;
            if (qty < 1) qty = 1;
            const subTotal = sPrice * qty;
            total += subTotal;
            profit += (sPrice - pPrice) * qty;
            productList.push({
                productID: item.productID,
                productTitle: live?.productTitle || item.productTitle,
                salesPrice: sPrice, purchasePrice: pPrice, salesQuantity: qty,
                subTotal, category: live?.category || item.category,
                brand: live?.brand || item.brand,
                purchaseUnit: live?.purchaseUnit || item.purchaseUnit,
            });
            stockDelta.set(item.productID, (stockDelta.get(item.productID) || 0) - qty);
        }
        const discPct = (sample.discountAmount || 0) / (sample.totalAmount || total || 1);
        const discountAmount = round2(total * discPct);
        const grandTotal = round2(total - discountAmount);

        const beh = behavior(grandTotal);
        let finalPay;
        if (beh === "FULL_CASH") finalPay = grandTotal;
        else if (beh === "PARTIAL_CASH") {
            let r = (sample.finalPayAmount || 0) / (sample.grandTotal || grandTotal || 1);
            if (!(r > 0.1 && r < 0.9)) r = 0.75;
            finalPay = round2(grandTotal * r);
        } else finalPay = 0;
        const dueAmount = round2(grandTotal - finalPay);

        // choose customer
        let chosen;
        const pool = [...custDue.values()];
        if (beh === "FULL_CASH") {
            const low = pool.filter(c => c.due < 1000);
            chosen = (low.length ? pick(low) : pick(pool));
        } else {
            const credit = pool.filter(c => c.due > 5000);
            chosen = (credit.length ? pick(credit) : pick(pool));
        }
        const c = chosen.doc;

        salesInvNo++;
        const inv = {
            customerSerial: c.customerSerial, date,
            customerName: c.customerName, customerAddress: c.customerAddress,
            customerMobile: c.contactNumber,
            totalAmount: round2(total), discountAmount, grandTotal, finalPayAmount: finalPay, dueAmount,
            productList, invoiceNumber: salesInvNo,
            labourCost: Math.round((sample.labourCost || 0) * rnd(0.9, 1.1)),
            transportCost: Math.round((sample.transportCost || 0) * rnd(0.9, 1.1)),
            prevDue: 0, userName: USER, simulated: true, macroRouted: true, backfillBatch: BATCH_TAG,
        };
        salesDocs.push(inv);
        sumGrand += grandTotal; sumCash += finalPay; sumDue += dueAmount; sumProfit += profit;
        addDateAgg(date, "sales", grandTotal); addDateAgg(date, "profit", profit);
        chosen.due += dueAmount;
        const led = cl(c.customerSerial);
        led.incDue += dueAmount;
        led.sales.push({ date, invoiceNumber: salesInvNo, grandTotal, finalPayAmount: finalPay, dueAmount, userName: USER });
        return grandTotal;
    };

    // ---------- PASS 1: sales across the growth curve ----------
    // Uses a single running cumulative target so per-day boundary overshoot
    // self-corrects and the period total lands on sum(topup) (~8 crore).
    const monthKeys = Object.keys(TARGETS);
    let cumTarget = 0, cumActual = 0;
    for (const mk of monthKeys) {
        const [mm, yyyy] = mk.split(".").map(Number);
        const lastDay = PARTIAL_LAST_DAY[mk] || daysInMonth(yyyy, mm);
        const target = TARGETS[mk] * L;
        const topup = Math.max(0, target - (existMonth[mk] || 0));
        if (topup <= 0) continue;

        // natural daily weights: clear low / medium / high / very-high days
        const weights = [];
        let wsum = 0;
        for (let d = 1; d <= lastDay; d++) {
            const dow = new Date(yyyy, mm - 1, d).getDay(); // 0 Sun .. 6 Sat
            let w = 1;
            if (dow === 5) w = 0.45;      // Friday (BD weekend) -> quiet
            else if (dow === 6) w = 0.8;  // Saturday
            const r = Math.random();
            if (r < 0.15) w *= rnd(0.4, 0.6);        // ~15% slow days
            else if (r < 0.78) w *= rnd(0.85, 1.15); // ~63% normal days
            else if (r < 0.95) w *= rnd(1.3, 1.7);   // ~17% busy days
            else w *= rnd(1.9, 2.6);                 // ~5% very busy days
            weights.push(w); wsum += w;
        }
        for (let d = 1; d <= lastDay; d++) {
            const date = `${pad(d)}.${pad(mm)}.${yyyy}`;
            cumTarget += topup * (weights[d - 1] / wsum);
            let guard = 0;
            while (cumActual < cumTarget && guard < 600) { cumActual += buildSaleInvoice(date); guard++; }
        }
    }

    // ---------- Derive dependent flow totals from ACTUAL sales ----------
    const Pv = PURCHASE_RATIO * sumGrand;            // purchase value
    // purchase split done per-invoice; estimate then measure
    // collections / payments / expenses solved after purchases measured

    // ---------- PASS 2a: purchases (per month, proportional to sales share) ----------
    const purchaseDocs = [];
    let sumCp = 0, sumDup = 0;
    const monthShare = {};
    for (const mk of monthKeys) monthShare[mk] = Math.max(0, (TARGETS[mk] * L) - (existMonth[mk] || 0));
    const shareTotal = Object.values(monthShare).reduce((a, b) => a + b, 0) || 1;

    // Pick a random date, weighted by each month's activity share.
    const pickWeightedDate = () => {
        let r = Math.random() * shareTotal;
        let mk = monthKeys[0];
        for (const k of monthKeys) { if (r < monthShare[k]) { mk = k; break; } r -= monthShare[k]; }
        const [mm, yyyy] = mk.split(".").map(Number);
        const last = PARTIAL_LAST_DAY[mk] || daysInMonth(yyyy, mm);
        return `${pad(Math.floor(rnd(1, last + 1)))}.${pad(mm)}.${yyyy}`;
    };

    const suppPool = [...suppDue.values()];
    for (const mk of monthKeys) {
        const [mm, yyyy] = mk.split(".").map(Number);
        const lastDay = PARTIAL_LAST_DAY[mk] || daysInMonth(yyyy, mm);
        let monthPv = Pv * (monthShare[mk] / shareTotal);
        if (monthPv <= 0) continue;
        const nEvents = Math.floor(rnd(5, 13));
        for (let i = 0; i < nEvents; i++) {
            let val = monthPv / nEvents * rnd(0.7, 1.3);
            if (i === nEvents - 1) val = Math.max(1000, monthPv); // soak remainder
            monthPv -= val;
            if (val < 500) continue;
            val = round2(val);
            const day = Math.floor(rnd(1, lastDay + 1));
            const date = `${pad(day)}.${pad(mm)}.${yyyy}`;
            const cashR = rnd(0.65, 0.85);
            const finalPay = round2(val * cashR);
            const due = round2(val - finalPay);
            const sup = pick(suppPool);
            const sd = sup.doc;
            const basket = pick(purchBaskets);
            purchInvNo++;
            purchaseDocs.push({
                userName: USER, supplierSerial: sd.supplierSerial, supplierAddress: sd.supplierAddress,
                supplierContact: sd.contactNumber, date, supplierName: sd.supplierName,
                totalAmount: val, discountAmount: 0, grandTotal: val, finalPayAmount: finalPay, dueAmount: due,
                productList: basket.productList || [], invoiceNumber: purchInvNo,
                simulated: true, macroRouted: true, backfillBatch: BATCH_TAG,
            });
            sumCp += finalPay; sumDup += due;
            sup.due += due;
            const led = sl(sd.supplierSerial);
            led.incDue += due;
            led.purch.push({ date, invoiceNumber: purchInvNo, grandTotal: val, finalPayAmount: finalPay, dueAmount: due, userName: USER });
            // restock inventory
            for (const it of (basket.productList || [])) {
                if (it.productID == null) continue;
                const q = Number(it.purchaseQuantity || it.salesQuantity || 0);
                if (q > 0) stockDelta.set(it.productID, (stockDelta.get(it.productID) || 0) + q);
            }
        }
    }

    // ---------- Solve collections / payments / expenses to hit end targets ----------
    const Col = CD0 + sumDue - CD_TARGET;        // customer collections (cash in)
    const Pay = SD0 + sumDup - SD_TARGET;        // supplier payments (cash out)
    const Exp = EXP_TARGET;                       // realistic fixed expense total
    // cash (mainBalance) is the resulting plug, reported below
    const MAIN_END = M0 + sumCash + Col - sumCp - Pay - Exp;

    // ---------- PASS 2b: collections (drive to exact Col) ----------
    const txnDocs = [];
    let colDone = 0;
    {
        let remaining = Math.max(0, Col);
        let guard = 0;
        while (remaining > 50 && guard < 200000) {
            guard++;
            const debtors = [...custDue.values()].filter(c => c.due > 500);
            if (!debtors.length) break;
            const t = pick(debtors);
            let amt = Math.min(remaining, t.due * rnd(0.3, 0.9));
            if (amt < 50) amt = Math.min(remaining, t.due);
            amt = round2(amt);
            if (amt < 1) continue;
            const date = pickWeightedDate();
            t.due -= amt; colDone += amt; remaining -= amt;
            const cled = cl(t.doc.customerSerial);
            cled.incDue -= amt; // reduce ledger dueAmount by collected amount
            cled.pays.push({ date, paidAmount: amt, paymentMethod: "Cash", payNote: "Due Collection", userName: USER });
            txnNo++;
            txnDocs.push({ serial: txnNo, totalBalance: amt, note: `Due Recovery: ${t.doc.customerName}`, date, type: "Credit", userName: USER, simulated: true, backfillBatch: BATCH_TAG });
        }
    }

    // ---------- PASS 2c: supplier payments (drive to exact Pay) ----------
    let payDone = 0;
    {
        let remaining = Math.max(0, Pay);
        let guard = 0;
        while (remaining > 50 && guard < 200000) {
            guard++;
            const owed = [...suppDue.values()].filter(s => s.due > 1000);
            if (!owed.length) break;
            const t = pick(owed);
            let amt = Math.min(remaining, t.due * rnd(0.3, 0.9));
            if (amt < 200) amt = Math.min(remaining, t.due);
            amt = round2(amt);
            if (amt < 1) continue;
            const date = pickWeightedDate();
            t.due -= amt; payDone += amt; remaining -= amt;
            const sled = sl(t.doc.supplierSerial);
            sled.incDue -= amt; // reduce ledger dueAmount by paid amount
            sled.pays.push({ date, paidAmount: amt, paymentMethod: "Bank Transfer", payNote: "Supplier Settlement", userName: USER });
            txnNo++;
            txnDocs.push({ serial: txnNo, totalBalance: amt, note: `Settlement to ${t.doc.supplierName}`, date, type: "Paid", userName: USER, simulated: true, backfillBatch: BATCH_TAG });
        }
    }

    // ---------- PASS 2d: expenses ----------
    let expDone = 0;
    const EXP_NOTES = ["Nasta", "Pan", "Staff Lunch", "Electricity Bill", "Water Bill", "Internet Bill", "Conveyance", "Labor Bill", "Stationary", "Cleaning Supplies", "Generator Fuel"];
    if (Exp > 0) {
        for (const mk of monthKeys) {
            const [mm, yyyy] = mk.split(".").map(Number);
            const lastDay = PARTIAL_LAST_DAY[mk] || daysInMonth(yyyy, mm);
            let monthExp = Exp * (monthShare[mk] / shareTotal);
            // one rent per month
            const events = [];
            events.push({ note: "Office Rent", amount: Math.round(25000 * rnd(0.97, 1.03)) });
            const nSmall = Math.floor(rnd(10, 22));
            for (let i = 0; i < nSmall; i++) events.push({ note: pick(EXP_NOTES), amount: 0 });
            let smallBudget = monthExp - events[0].amount;
            if (smallBudget < 0) smallBudget = monthExp * 0.5;
            for (let i = 1; i < events.length; i++) {
                let a = smallBudget / (events.length - 1) * rnd(0.5, 1.6);
                a = Math.round(a);
                if (a < 30) a = Math.round(rnd(50, 300));
                events[i].amount = a;
            }
            // scale to hit monthExp
            let raw = events.reduce((s, e) => s + e.amount, 0);
            const scale = raw > 0 ? monthExp / raw : 1;
            for (const e of events) {
                if (expDone >= Exp) break;
                let amt = Math.max(30, Math.round(e.amount * scale));
                amt = Math.min(amt, Exp - expDone);
                if (amt < 1) continue;
                const day = Math.floor(rnd(1, lastDay + 1));
                const date = `${pad(day)}.${pad(mm)}.${yyyy}`;
                expDone += amt;
                addDateAgg(date, "cost", amt);
                txnNo++;
                txnDocs.push({ serial: txnNo, totalBalance: amt, note: e.note, date, type: "Cost", userName: USER, simulated: true, backfillBatch: BATCH_TAG });
            }
        }
    }

    // ---------- Projection report ----------
    const endMain = M0 + sumCash + colDone - sumCp - payDone - expDone;
    const endCD = CD0 + sumDue - colDone;
    const endSD = SD0 + sumDup - payDone;

    console.log("================ BACKFILL PROJECTION ================");
    console.log("Mode:", WRITE ? "*** WRITE ***" : "DRY RUN (no writes)");
    console.log("Batch tag:", BATCH_TAG);
    console.log("\n--- SALES (added) ---");
    console.log("invoices:", salesDocs.length, "| grandTotal:", fmtL(sumGrand), "| cash:", fmtL(sumCash), "| due:", fmtL(sumDue), "| profit:", fmtL(sumProfit));
    // period total after
    const existPeriod = monthKeys.reduce((a, mk) => a + (existMonth[mk] || 0), 0);
    console.log("Period existing:", fmtL(existPeriod), "-> after:", ((existPeriod + sumGrand) / 10000000).toFixed(3), "crore");
    console.log("\n--- PURCHASES (added) ---");
    console.log("invoices:", purchaseDocs.length, "| value:", fmtL(sumCp + sumDup), "| cash:", fmtL(sumCp), "| due:", fmtL(sumDup));
    console.log("\n--- FLOWS (solved) ---");
    console.log("Collections:", fmtL(colDone), "(target", fmtL(Col) + ")");
    console.log("Supplier payments:", fmtL(payDone), "(target", fmtL(Pay) + ")");
    console.log("Expenses:", fmtL(expDone), "(target", fmtL(Exp) + ")");
    console.log("\n--- END BALANCES (projected) ---");
    console.log("mainBalance (cash, plug):", fmtL(M0), "->", fmtL(endMain));
    console.log("customerDue:", fmtL(CD0), "->", fmtL(endCD), "(target", fmtL(CD_TARGET) + ")");
    console.log("supplierDue:", fmtL(SD0), "->", fmtL(endSD), "(target", fmtL(SD_TARGET) + ")");
    console.log("txn docs:", txnDocs.length);

    // monthly resulting totals
    console.log("\n--- MONTHLY SALES AFTER ---");
    const afterMonth = { ...existMonth };
    for (const s of salesDocs) { const mk = s.date.slice(3); afterMonth[mk] = (afterMonth[mk] || 0) + s.grandTotal; }
    for (const mk of monthKeys) console.log(mk, "->", fmtL(afterMonth[mk] || 0), "(target", TARGETS[mk] + "L)");

    // PER-YEAR totals (the headline metric)
    console.log("\n--- PER-YEAR SALES AFTER ---");
    const byYear = {};
    for (const mk of Object.keys(afterMonth)) {
        const y = mk.slice(3);
        byYear[y] = (byYear[y] || 0) + afterMonth[mk];
    }
    for (const y of Object.keys(byYear).sort())
        console.log(y, "->", (byYear[y] / 10000000).toFixed(3), "crore");

    if (!WRITE) {
        console.log("\nDRY RUN complete. Re-run with --write to apply.");
        await client.close();
        return;
    }

    // ================= WRITE =================
    console.log("\nWriting...");
    const chunk = async (coll, docs, size = 2000) => {
        for (let i = 0; i < docs.length; i += size) {
            await db.collection(coll).insertMany(docs.slice(i, i + size), { ordered: false });
            process.stdout.write(`  ${coll}: ${Math.min(i + size, docs.length)}/${docs.length}\r`);
        }
        if (docs.length) console.log(`  ${coll}: ${docs.length} inserted`);
    };
    await chunk("salesInvoiceList", salesDocs);
    await chunk("purchaseInvoiceList", purchaseDocs);
    await chunk("transactionList", txnDocs);

    // dailySummary upserts
    const dsOps = Object.entries(dateAgg).map(([date, v]) => ({
        updateOne: {
            filter: { date },
            update: { $inc: { totalSales: round2(v.sales), totalProfit: round2(v.profit), totalCost: round2(v.cost) } },
            upsert: true,
        },
    }));
    for (let i = 0; i < dsOps.length; i += 500) await db.collection("dailySummaryList").bulkWrite(dsOps.slice(i, i + 500), { ordered: false });
    console.log("  dailySummaryList:", dsOps.length, "days");

    // customer ledger
    const clOps = [];
    for (const [serial, v] of custLedger) {
        const upd = { $inc: { dueAmount: round2(v.incDue) } };
        const push = {};
        if (v.sales.length) push.salesHistory = { $each: v.sales };
        if (v.pays.length) push.paymentHistory = { $each: v.pays };
        if (Object.keys(push).length) upd.$push = push;
        clOps.push({ updateOne: { filter: { customerSerial: serial }, update: upd } });
    }
    for (let i = 0; i < clOps.length; i += 500) await db.collection("customerDueList").bulkWrite(clOps.slice(i, i + 500), { ordered: false });
    console.log("  customerDueList:", clOps.length, "ledgers");

    // supplier ledger
    const slOps = [];
    for (const [serial, v] of suppLedger) {
        const upd = { $inc: { dueAmount: round2(v.incDue) } };
        const push = {};
        if (v.purch.length) push.purchaseHistory = { $each: v.purch };
        if (v.pays.length) push.paymentHistory = { $each: v.pays };
        if (Object.keys(push).length) upd.$push = push;
        slOps.push({ updateOne: { filter: { supplierSerial: serial }, update: upd } });
    }
    if (slOps.length) await db.collection("supplierDueList").bulkWrite(slOps, { ordered: false });
    console.log("  supplierDueList:", slOps.length, "ledgers");

    // stock deltas -> absolute $set (avoids $inc failing on null/non-numeric)
    const stOps = [];
    for (const [pid, delta] of stockDelta) {
        if (!stockMap.has(pid)) continue; // unknown product, skip
        const cur = Number(stockMap.get(pid)?.purchaseQuantity || 0);
        let newQty = cur + delta;
        if (newQty < 5) newQty = Math.round(rnd(20, 80)); // corrective restock to avoid negatives
        stOps.push({ updateOne: { filter: { productID: pid }, update: { $set: { purchaseQuantity: round2(newQty) } } } });
    }
    for (let i = 0; i < stOps.length; i += 500) await db.collection("stockList").bulkWrite(stOps.slice(i, i + 500), { ordered: false });
    console.log("  stockList:", stOps.length, "products");

    // global balances
    await db.collection("mainBalanceList").updateOne({}, { $inc: { mainBalance: round2(sumCash + colDone - sumCp - payDone - expDone) } }, { upsert: true });
    await db.collection("customerDueBalanceList").updateOne({}, { $inc: { customerDueBalance: round2(sumDue - colDone) } }, { upsert: true });
    await db.collection("supplierDueBalanceList").updateOne({}, { $inc: { supplierDueBalance: round2(sumDup - payDone) } }, { upsert: true });
    await db.collection("profitList").updateOne({}, { $inc: { profitBalance: round2(sumProfit) } }, { upsert: true });
    await db.collection("costingBalanceList").updateOne({}, { $inc: { costingBalance: round2(expDone) } }, { upsert: true });
    console.log("  global balances updated");

    console.log("\n✅ WRITE complete.");
    await client.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
