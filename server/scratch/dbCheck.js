const { MongoClient } = require("mongodb");
require("dotenv").config({ path: "../.env" });

async function run() {
    const client = new MongoClient(process.env.MONGO_URI);
    try {
        await client.connect();
        const db = client.db("hardware_store");
        
        const salesCount = await db.collection("salesInvoiceList").countDocuments();
        const purchaseCount = await db.collection("purchaseInvoiceList").countDocuments();
        const customerCount = await db.collection("customerList").countDocuments();
        const supplierCount = await db.collection("supplierList").countDocuments();
        const stockCount = await db.collection("stockList").countDocuments();
        
        console.log("COUNTS:");
        console.log({ salesCount, purchaseCount, customerCount, supplierCount, stockCount });
        
        if (salesCount > 0) {
            const sampleSale = await db.collection("salesInvoiceList").findOne();
            console.log("\nSAMPLE SALE:", JSON.stringify(sampleSale, null, 2));
        }
        
        if (stockCount > 0) {
            const sampleStock = await db.collection("stockList").findOne();
            console.log("\nSAMPLE STOCK:", JSON.stringify(sampleStock, null, 2));
        }
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}
run();
