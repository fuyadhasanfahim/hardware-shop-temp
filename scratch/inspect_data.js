const { MongoClient } = require('mongodb');
require('dotenv').config({ path: './server/.env' });

async function checkData() {
    const uri = process.env.MONGO_URI;
    const client = new MongoClient(uri);

    try {
        await client.connect();
        const db = client.db('hardware_store');

        console.log('--- Sample Costs ---');
        const costs = await db.collection('transactionList').find({ type: 'Cost' }).limit(10).toArray();
        costs.forEach(c => console.log(`Note: ${c.note}, Amount: ${c.totalBalance}`));

        console.log('\n--- Sample Purchases ---');
        const purchases = await db.collection('purchaseInvoiceList').find().limit(10).toArray();
        purchases.forEach(p => console.log(`Supplier: ${p.supplierName}, GrandTotal: ${p.grandTotal}, ProductCount: ${p.productList?.length || 0}`));

    } finally {
        await client.close();
    }
}

checkData();
