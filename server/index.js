const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
require('dotenv').config();
const fs = require('fs');
const XLSX = require('xlsx');
const { format } = require('date-fns');
const { setupDailySummaryCron } = require('./utils/cronJobs');
const AutoPilotEngine = require('./utils/autoPilotEngine');

const app = express();
app.use(
    cors({
        origin: process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : [],
        credentials: true,
    }),
);

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(express.json());

const port = process.env.PORT || 9000;

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const moment = require('moment');
const sendSMS = require('./utils/sendSMS');

// Office
const uri = process.env.MONGO_URI;

if (!uri) {
    console.error(
        'Error: Mongo DB connection string is not defined in environment variables.',
    );
    process.exit(1);
}

const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    },
});

app.get('/', (req, res) => {
    res.send('Hello World!');
});

// Middleware to verify JWT
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).send({ message: 'Access forbidden' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).send({ message: 'No authorization' });
    }

    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(403)
                .send({ message: 'Forbidden: Invalid token' });
        }
        req.user = decoded;
        next();
    });
};

// JWT token generation
app.post('/jwt', (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).send({ message: 'Email is required' });
    }

    const token = jwt.sign({ email }, process.env.TOKEN_SECRET, {
        expiresIn: '24h',
    });
    res.send({ success: true, token });
});

// JWT token validation route
app.post('/validate-token', (req, res) => {
    // Extract token from 'Authorization' header OR from request body
    const token = req.headers.authorization?.split(' ')[1] || req.body?.token;

    if (!token) {
        return res
            .status(400)
            .send({ success: false, message: 'Forbidden access' });
    }

    // Verify the token
    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res
                .status(401)
                .send({ success: false, message: 'Invalid or expired token' });
        }

        // If token is valid, respond with the user data
        res.send({ success: true, user: decoded });
    });
});

app.post('/logOut', async (req, res) => {
    res.clearCookie('token', { maxAge: 0 }).send({ success: true });
});

// Daily SMS Summary logic removed (moved to utils/cronJobs.js)

// ************************************************************
const formatPhoneNumber = (number) => {
    if (number.startsWith('0')) {
        return '880' + number.slice(1);
    }
    return number;
};
// ***************************************************************

async function run() {
    try {
        const database = client.db('hardware_store');
        const debtDB = client.db('debtMaintain');
        // *********************************************************************************************
        const borrowerCollections = debtDB.collection('borrowerList');
        const lenderCollections = debtDB.collection('lenderList');

        const totalDebtBalanceCollections =
            debtDB.collection('currentBalanceList');
        const totalLendBalanceCollections =
            debtDB.collection('lenderBalanceList');

        const allDebtTransactions = debtDB.collection('transactionList');
        const allLendTransactions = debtDB.collection('lenderTransactionList');

        // **********************************************************************************************

        const categoryCollections = database.collection('categoryList');
        const brandCollections = database.collection('brandList');
        const unitCollections = database.collection('unitList');
        const productCollections = database.collection('productList');
        const supplierCollections = database.collection('supplierList');
        const transactionCollections = database.collection('transactionList');
        const mainBalanceCollections = database.collection('mainBalanceList');
        const costingBalanceCollections =
            database.collection('costingBalanceList');
        const tempPurchaseProductCollections = database.collection(
            'tempPurchaseProductList',
        );
        const tempSalesProductCollections = database.collection(
            'tempSalesProductList',
        );
        const tempQuotationProductCollections = database.collection(
            'tempQuotationProductList',
        );
        const stockCollections = database.collection('stockList');
        const purchaseInvoiceCollections = database.collection(
            'purchaseInvoiceList',
        );
        const salesInvoiceCollections = database.collection('salesInvoiceList');
        const quotationCollections = database.collection('quotationList');
        const customerCollections = database.collection('customerList');
        const supplierDueCollections = database.collection('supplierDueList');
        const customerDueCollections = database.collection('customerDueList');
        const profitCollections = database.collection('profitList');
        const supplierDueBalanceCollections = database.collection(
            'supplierDueBalanceList',
        );
        const customerDueBalanceCollections = database.collection(
            'customerDueBalanceList',
        );
        const returnSalesCollections = database.collection('returnSalesList');
        const returnPurchaseCollections =
            database.collection('returnPurchaseList');
        const dailySummaryCollections = database.collection('dailySummaryList');

        // ****************************************************************************
        // const result = await customerDueCollections.find(
        //   {
        //     dueAmount: { $gt: 200 },
        //     status: { $exists: false }
        //   },
        //   {
        //     projection: { _id: 0, contactNumber: 1 }
        //   }
        // ).toArray();

        // const contactNumbers = result
        //   .map(doc => `88${doc.contactNumber}`)
        //   .join(",");

        // fs.writeFileSync("contactNumbers.txt", contactNumbers);

        // console.log("✅ contactNumbers.txt has been saved successfully.");

        // ****************************************************************************
        // jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.TOKEN_SECRET, {
                expiresIn: '24h',
            });
            res.send({ success: true, token }); // Send the token in the response
        });

        // Initialize Cron Job
        setupDailySummaryCron(database, debtDB);

        app.post('/logOut', async (req, res) => {
            res.clearCookie('token', { maxAge: 0 }).send({ success: true });
        });

        // --- Auto-Pilot Engine Integration ---

        // Scheduled periodic simulator running every 30 minutes during business hours
        if (process.env.SIMULATION_MODE === 'true') {
            const cron = require('node-cron');
            cron.schedule('*/30 9-21 * * *', async () => {
                try {
                    const targetDate = format(new Date(), 'dd.MM.yyyy');
                    await AutoPilotEngine.processIncrementalStep(
                        database,
                        debtDB,
                        targetDate,
                    );
                } catch (error) {
                    console.error('[Cron AutoPilot Incremental Error]', error);
                }
            });
        }

        // Trigger manual simulation for testing/backfilling
        app.get('/api/simulate-day', async (req, res) => {
            if (process.env.SIMULATION_MODE !== 'true') {
                return res
                    .status(403)
                    .json({
                        success: false,
                        message: 'Simulation is disabled on this server.',
                    });
            }
            try {
                const targetDate =
                    req.query.date || format(new Date(), 'dd.MM.yyyy');
                const result = await AutoPilotEngine.simulateDay(
                    database,
                    debtDB,
                    targetDate,
                );
                res.json(result);
            } catch (error) {
                console.error('[API Simulation Error]', error);
                res.status(500).json({ success: false, error: error.message });
            }
        });

        // Get current simulation settings
        app.get('/api/simulate-settings', async (req, res) => {
            try {
                const settings = await database
                    .collection('autoPilotSettings')
                    .findOne();
                res.json(settings);
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // Update simulation parameters dynamically
        app.post('/api/simulate-settings', async (req, res) => {
            try {
                const {
                    isActive,
                    targetDailySalesMin,
                    targetDailySalesMax,
                    targetSupplierDueAvg,
                    targetSupplierDueVariance,
                } = req.body;
                const updateObj = {};
                if (isActive !== undefined) updateObj.isActive = isActive;
                if (targetDailySalesMin !== undefined)
                    updateObj.targetDailySalesMin = Number(targetDailySalesMin);
                if (targetDailySalesMax !== undefined)
                    updateObj.targetDailySalesMax = Number(targetDailySalesMax);
                if (targetSupplierDueAvg !== undefined)
                    updateObj.targetSupplierDueAvg =
                        Number(targetSupplierDueAvg);
                if (targetSupplierDueVariance !== undefined)
                    updateObj.targetSupplierDueVariance = Number(
                        targetSupplierDueVariance,
                    );

                await database
                    .collection('autoPilotSettings')
                    .updateOne({}, { $set: updateObj }, { upsert: true });
                res.json({
                    success: true,
                    message: 'Settings updated successfully',
                });
            } catch (error) {
                res.status(500).json({ error: error.message });
            }
        });

        // -------------------------------------

        // add product.............................................................
        app.post('/addProducts', async (req, res) => {
            const { product, categoryName, brandName, unitName } = req.body;
            const productName = product;

            const findCategory = await categoryCollections.findOne({
                category: categoryName,
            });
            const categoryCode = findCategory.categoryCode;

            // Find the latest product for the given category
            const latestProduct = await productCollections.findOne(
                { categoryName },
                { sort: { productCode: -1 } },
            );

            let productCode;
            if (latestProduct) {
                // Extract the numeric part of the product code and increment it
                const numericPart =
                    parseInt(latestProduct.productCode.toString().slice(-5)) +
                    1;
                productCode = parseInt(
                    `${categoryCode}${numericPart.toString().padStart(5, '0')}`,
                );
            } else {
                // If no product exists for the category, start with 1
                productCode = parseInt(`${categoryCode}00001`);
            }

            const isExist = await productCollections.findOne({ productName });
            if (isExist) {
                res.json('Product already exists');
            } else {
                const result = await productCollections.insertOne({
                    productName,
                    categoryName,
                    brandName,
                    unitName,
                    productCode,
                });
                res.send(result);
            }
        });

        // New sale product (filtered collection for input)
        // New sale product (full collection for input)
        app.get('/newSaleProducts', async (req, res) => {
            try {
                const products = await productCollections
                    .find()
                    .sort({ _id: -1 })
                    .toArray();
                res.send({ products });
            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).send(
                    'An error occurred while fetching products.',
                );
            }
        });

        // New purchase product (full collection for input)
        app.get('/newPurchaseProducts', async (req, res) => {
            try {
                const products = await productCollections
                    .find()
                    .sort({ _id: -1 })
                    .toArray();
                res.send({ products });
            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).send(
                    'An error occurred while fetching products.',
                );
            }
        });

        // show products
        app.get('/products', async (req, res) => {
            const page = parseInt(req.query.page) || 1;
            const size = parseInt(req.query.size) || 20;
            const search = req.query.search || '';
            const disablePagination = req.query.disablePagination === 'true';

            // Numeric search logic remains unchanged
            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            // Search query remains unchanged
            const query = search
                ? {
                      $or: [
                          { productName: { $regex: new RegExp(search, 'i') } },
                          { categoryName: { $regex: new RegExp(search, 'i') } },
                          { brandName: { $regex: new RegExp(search, 'i') } },
                          { unitName: { $regex: new RegExp(search, 'i') } },
                          ...(numericSearch !== null
                              ? [{ productCode: numericSearch }]
                              : []),
                      ],
                  }
                : {};

            try {
                let products;
                if (disablePagination) {
                    // Return all products if pagination is disabled
                    products = await productCollections
                        .find(query)
                        .sort({ _id: -1 })
                        .toArray();
                } else {
                    // Return paginated products
                    products = await productCollections
                        .find(query)
                        .skip((page - 1) * size)
                        .limit(size)
                        .sort({ _id: -1 })
                        .toArray();
                }

                // Get the total count of matching products
                const count = await productCollections.countDocuments(query);

                res.send({ products, count });
            } catch (error) {
                console.error('Error fetching products:', error);
                res.status(500).send(
                    'An error occurred while fetching products.',
                );
            }
        });

        // update product
        app.put('/updateProduct/:id', async (req, res) => {
            const id = req.params.id;
            const {
                updateProductName,
                updateCategory,
                updateBrand,
                updateUnit,
            } = req.body;
            const checkProduct = updateProductName;

            // const isExist = await productCollections.findOne({productName: checkProduct});
            //   if(isExist) {
            //     res.json('Product already exists');
            //     return;
            //   }

            // update product code if category changed
            const findCategory = await categoryCollections.findOne({
                category: updateCategory,
            });
            const categoryCode = findCategory.categoryCode;

            // Check if the category has changed
            const existingProduct = await productCollections.findOne({
                _id: new ObjectId(id),
            });
            const categoryChanged =
                existingProduct.categoryName !== updateCategory;

            // Find the latest product for the given category
            const latestProduct = await productCollections.findOne(
                { updateCategory },
                { sort: { productCode: -1 } },
            );

            let productCode;
            if (categoryChanged) {
                // If the category has changed, start the product code serially for the new category
                const latestProduct = await productCollections.findOne(
                    { categoryName: updateCategory },
                    { sort: { productCode: -1 } },
                );
                if (latestProduct) {
                    const numericPart =
                        parseInt(
                            latestProduct.productCode.toString().slice(-5),
                        ) + 1;
                    productCode = parseInt(
                        `${categoryCode}${numericPart.toString().padStart(5, '0')}`,
                    );
                } else {
                    productCode = parseInt(`${categoryCode}00001`);
                }
            } else {
                // If the category hasn't changed, retain the existing product code
                productCode = existingProduct.productCode;
            }
            //
            const filter = { _id: new ObjectId(id) };
            const updateInfo = {
                $set: {
                    productName: updateProductName,
                    categoryName: updateCategory,
                    brandName: updateBrand,
                    unitName: updateUnit,
                    productCode: productCode,
                },
            };
            const filterInStock = { productID: existingProduct.productCode };
            if (filterInStock) {
                const updateStockInfo = {
                    $set: {
                        productTitle: updateProductName,
                        category: updateCategory,
                        brand: updateBrand,
                        purchaseUnit: updateUnit,
                        productID: productCode,
                    },
                };
                await stockCollections.updateOne(
                    filterInStock,
                    updateStockInfo,
                );
            }

            const result = await productCollections.updateOne(
                filter,
                updateInfo,
            );
            res.send(result);
        });

        // delete product
        app.delete('/delete/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await productCollections.deleteOne(query);
            res.send(result);
        });

        // add category collection
        app.post('/addCategory', async (req, res) => {
            const { categoryValue, categoryCodeValue } = req.body;
            const categoryInfo = {
                category: categoryValue,
                categoryCode: categoryCodeValue,
            };

            // check if category and category code is already exists
            const isExist = await categoryCollections.findOne({
                category: categoryValue,
            });
            let isCategoryCode = await categoryCollections.findOne({
                categoryCode: categoryCodeValue,
            });

            if (isExist) {
                res.json('Category already exists');
            } else if (isCategoryCode) {
                res.json(`Category code used for ${isCategoryCode.category}`);
            } else {
                const result =
                    await categoryCollections.insertOne(categoryInfo);
                res.send(result);
            }
        });
        // show category collection
        app.get('/categories', async (req, res) => {
            const result = await categoryCollections.find().toArray();
            res.send(result);
        });

        // add brand collection
        app.post('/brands/:brand', async (req, res) => {
            const brandName = { brand: req.params.brand };
            const isExist = await brandCollections.findOne(brandName);
            if (isExist) {
                res.json('Brand already exists');
            } else {
                const result = await brandCollections.insertOne(brandName);
                res.send(result);
            }
        });

        // show brand collections
        app.get('/brands', async (req, res) => {
            const result = await brandCollections.find().toArray();
            res.send(result);
        });

        // add unit collection
        app.post('/units/:unit', async (req, res) => {
            const unitName = { unit: req.params.unit };
            const isExist = await unitCollections.findOne(unitName);
            if (isExist) {
                res.json('Brand already exists');
            } else {
                const result = await unitCollections.insertOne(unitName);
                res.send(result);
            }
        });

        // show unit collections
        app.get('/units', async (req, res) => {
            const result = await unitCollections.find().toArray();
            res.send(result);
        });

        // add supplier.....................................
        app.post('/addSupplier', async (req, res) => {
            const supplierInfo = req.body;
            const { contactNumber } = supplierInfo;
            const isSupplierExist = await supplierCollections.findOne({
                contactNumber,
            });

            //add supplier list with serial
            const recentSupplier = await supplierCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (recentSupplier.length > 0 && recentSupplier[0].serial) {
                nextSerial = recentSupplier[0].serial + 1;
            }
            const newSupplierInfo = { ...supplierInfo, serial: nextSerial };

            if (isSupplierExist) {
                res.json('Supplier already exists with the mobile number');
            } else {
                const result =
                    await supplierCollections.insertOne(newSupplierInfo);
                res.send(result);
            }
        });

        // show supplier
        app.get('/suppliers', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';
            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { supplierName: { $regex: new RegExp(search, 'i') } },
                          {
                              serial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              contactPerson: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              supplierAddress: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                      ],
                  }
                : {};

            const result = await supplierCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await supplierCollections.countDocuments(query);
            res.send({ result, count });
        });

        // update supplier
        app.put('/updateSupplier/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const {
                supplierName,
                contactPerson,
                contactNumber,
                supplierAddress,
            } = req.body;

            // Check if contactNumber already exists, excluding the current supplier
            const isSupplierExist = await supplierCollections.findOne({
                contactNumber,
                _id: { $ne: new ObjectId(id) }, // Exclude the current supplier by its id
            });

            if (isSupplierExist) {
                res.json('Supplier already exists with the mobile number');
                return; // Exit early if supplier exists with the same contact number
            }

            const updateInfo = {
                $set: {
                    supplierName,
                    contactPerson,
                    contactNumber,
                    supplierAddress,
                },
            };

            const supplier = await supplierCollections.findOne(filter);
            const supplierInLedger = await supplierDueCollections.findOne({
                supplierSerial: supplier.serial,
            });
            const updateInLedger = {
                $set: {
                    supplierName,
                    contactPerson,
                    contactNumber,
                    supplierAddress,
                },
            };

            // Update supplier information in both collections
            const result = await supplierCollections.updateOne(
                filter,
                updateInfo,
            );
            await supplierDueCollections.updateOne(
                supplierInLedger,
                updateInLedger,
            );
            res.send(result);
        });

        // delete supplier
        app.delete('/deleteSupplier/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await supplierCollections.deleteOne(query);
            res.send(result);
        });

        // add total balance
        app.post('/addBalance', async (req, res) => {
            const { note, date, type, userName } = req.body;
            const parseAmount = parseFloat(req.body.confirmAmount);
            const newBalance = parseFloat(parseAmount.toFixed(2));

            const existingBalanceDoc = await mainBalanceCollections.findOne();
            if (existingBalanceDoc) {
                // Update existing document by adding newBalance to mainBalance
                const updatedMainBalance =
                    existingBalanceDoc.mainBalance + newBalance;
                await mainBalanceCollections.updateOne(
                    {},
                    { $set: { mainBalance: updatedMainBalance } },
                );
            } else {
                // Insert new document with newBalance as mainBalance
                await mainBalanceCollections.insertOne({
                    mainBalance: newBalance,
                });
            }

            //add transaction list with serial
            const recentSerialTransaction = await transactionCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (
                recentSerialTransaction.length > 0 &&
                recentSerialTransaction[0].serial
            ) {
                nextSerial = recentSerialTransaction[0].serial + 1;
            }

            const result = await transactionCollections.insertOne({
                serial: nextSerial,
                totalBalance: newBalance,
                note,
                date,
                type,
                userName,
            });

            res.send(result);
        });

        // costing balance****************************************************************
        app.post('/costingBalance', async (req, res) => {
            const { note, date, type, userName } = req.body;
            const parseAmount = parseFloat(req.body.confirmCostAmount);
            const newCostingBalance = parseFloat(parseAmount.toFixed(2));

            // find balance to update/deduct
            const existingBalance = await mainBalanceCollections.findOne({});
            if (existingBalance.mainBalance >= newCostingBalance) {
                await mainBalanceCollections.updateOne(
                    {},
                    {
                        $inc: { mainBalance: -newCostingBalance },
                    },
                );
            } else {
                return res.json('Insufficient balance');
            }

            const existingCostingBalanceDoc =
                await costingBalanceCollections.findOne();
            if (existingCostingBalanceDoc) {
                // Update existing cost document by adding newCosting to costingBalance
                const updatedCostingBalance =
                    existingCostingBalanceDoc.costingBalance +
                    newCostingBalance;
                await costingBalanceCollections.updateOne(
                    {},
                    {
                        $set: {
                            costingBalance: updatedCostingBalance,
                        },
                    },
                );
            } else {
                // Insert new document with newCostingBalance as costingBalance
                await costingBalanceCollections.insertOne({
                    costingBalance: newCostingBalance,
                });
            }

            // ***** Insert in summary collection
            const isSummary = await dailySummaryCollections.findOne({
                date: date,
            });
            if (isSummary) {
                await dailySummaryCollections.updateOne(
                    { date },
                    {
                        $inc: {
                            totalCost: newCostingBalance,
                        },
                    },
                );
            } else {
                await dailySummaryCollections.insertOne({
                    date,
                    totalCost: newCostingBalance,
                    totalSales: 0,
                    totalProfit: 0,
                });
            }

            // *****

            //add transaction list with serial
            const recentSerialTransaction = await transactionCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (
                recentSerialTransaction.length > 0 &&
                recentSerialTransaction[0].serial
            ) {
                nextSerial = recentSerialTransaction[0].serial + 1;
            }

            const result = await transactionCollections.insertOne({
                serial: nextSerial,
                totalBalance: newCostingBalance,
                note,
                date,
                type,
                userName,
            });

            res.send(result);
        });
        // costing balance****************************************************************

        // show main balance only
        app.get('/mainBalance', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const result = await mainBalanceCollections.find().toArray();
            res.send(result);
        });

        // show costing balance only
        app.get('/costingBalance', async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const result = await costingBalanceCollections.find().toArray();
            res.send(result);
        });

        // show all transactions list............................................
        app.get('/allTransactions', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { note: { $regex: new RegExp(search, 'i') } },
                          {
                              serial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              totalBalance: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          { date: { $regex: new RegExp(search, 'i') } },
                          { type: { $regex: new RegExp(search, 'i') } },
                          { userName: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await transactionCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await transactionCollections.countDocuments(query);

            res.send({ result, count });
        });
        // show all transactions of costing list............................................
        app.get('/costingTransactions', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            // Add `type: "Cost"` directly to the query object
            const query = {
                type: 'Cost',
                ...(search
                    ? {
                          $or: [
                              { note: { $regex: new RegExp(search, 'i') } },
                              {
                                  serial: numericSearch
                                      ? numericSearch
                                      : { $exists: false },
                              },
                              {
                                  totalBalance: numericSearch
                                      ? numericSearch
                                      : { $exists: false },
                              },
                              { date: { $regex: new RegExp(search, 'i') } },
                              { type: { $regex: new RegExp(search, 'i') } },
                              { userName: { $regex: new RegExp(search, 'i') } },
                          ],
                      }
                    : {}),
            };

            try {
                const result = await transactionCollections
                    .find(query)
                    .skip((page - 1) * size)
                    .limit(size)
                    .sort({ _id: -1 })
                    .toArray();

                const count =
                    await transactionCollections.countDocuments(query);

                res.send({ result, count });
            } catch (error) {
                console.error('Error fetching costing transactions:', error);
                res.status(500).send(
                    'An error occurred while fetching costing transactions.',
                );
            }
        });

        // .....................................................................

        app.get('/transactionCount', async (req, res) => {
            const count = await transactionCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // .....................................................................................

        app.get('/stockCount', async (req, res) => {
            const count = await stockCollections.estimatedDocumentCount();
            res.send({ count });
        });
        // .....................................................................................
        app.get('/customerCount', async (req, res) => {
            const count = await customerCollections.estimatedDocumentCount();
            res.send({ count });
        });
        // .....................................................................................
        app.post('/getSalesPrice/:id', async (req, res) => {
            const product = req.params.id;
            const productID = parseInt(product);
            const findProduct = await stockCollections.findOne({ productID });
            if (findProduct) {
                res.send(findProduct);
            } else {
                res.json('Stock not available');
            }
        });
        // .....................................................................................

        //set temp sales product list
        app.post('/adTempSalesProductList', async (req, res) => {
            const {
                productID,
                productTitle,
                brand,
                salesQuantity,
                salesUnit,
                salesPrice,
                purchasePrice,
                category,
                userMail,
            } = req.body;

            const result = await tempSalesProductCollections.insertOne({
                productID,
                productTitle,
                brand,
                salesQuantity,
                salesUnit,
                salesPrice,
                purchasePrice,
                category,
                userMail,
            });
            res.send(result);
        });
        //set temp quotation product list
        app.post('/adTempQuotationProductList', async (req, res) => {
            const {
                productID,
                productTitle,
                brand,
                salesQuantity,
                salesUnit,
                salesPrice,
                purchasePrice,
                category,
                userMail,
            } = req.body;

            const result = await tempQuotationProductCollections.insertOne({
                productID,
                productTitle,
                brand,
                salesQuantity: parseFloat(salesQuantity),
                salesUnit,
                salesPrice: parseFloat(salesPrice),
                purchasePrice: parseFloat(purchasePrice),
                category,
                userMail,
            });
            res.send(result);
        });

        //get temp sales product list..........................................
        app.get('/tempSalesProductList/:userEmail', async (req, res) => {
            const userEmail = req.params.userEmail;
            const findByMail = await tempSalesProductCollections
                .find({ userMail: userEmail })
                .sort({ _id: -1 })
                .toArray();
            res.send(findByMail);
            // const result = await tempSalesProductCollections.find().toArray();
            // res.send(result);
        });

        //get temp quotation product list..........................................
        app.get('/tempQuotationProductList/:userEmail', async (req, res) => {
            const userEmail = req.params.userEmail;
            const result = await tempQuotationProductCollections
                .find({ userMail: userEmail })
                .toArray();
            res.send(result);
        });
        // .....................................................................................

        //set temp purchase product list
        app.post('/adTempPurchaseProductList', async (req, res) => {
            const {
                productID,
                productTitle,
                brand,
                purchaseQuantity,
                purchaseUnit,
                purchasePrice,
                salesPrice,
                storageLocation,
                reOrderQuantity,
                category,
                userMail,
            } = req.body;
            const parsePurchasePrice = parseFloat(purchasePrice).toFixed(2);
            const newParsePurchasePrice = parseFloat(parsePurchasePrice);

            const parsePurchaseQuantity =
                parseFloat(purchaseQuantity).toFixed(2);
            const newParsePurchaseQuantity = parseFloat(parsePurchaseQuantity);

            const parseSalesPrice = parseFloat(salesPrice).toFixed(2);
            const newParseSalesPrice = parseFloat(parseSalesPrice);

            const result = await tempPurchaseProductCollections.insertOne({
                productID,
                productTitle,
                brand,
                purchaseQuantity: newParsePurchaseQuantity,
                purchaseUnit,
                purchasePrice: newParsePurchasePrice,
                salesPrice: newParseSalesPrice,
                storageLocation,
                reOrderQuantity,
                category,
                userMail,
            });
            res.send(result);
        });

        //get temp purchase product list..........................................
        app.get('/tempPurchaseProductList/:userEmail', async (req, res) => {
            const userEmail = req.params.userEmail;
            const result = await tempPurchaseProductCollections
                .find({ userMail: userEmail })
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });

        // delete temp product from purchase
        app.delete('/deleteTempProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result =
                await tempPurchaseProductCollections.deleteOne(query);
            res.send(result);
        });

        // delete temp product from sales
        app.delete('/deleteSalesTempProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await tempSalesProductCollections.deleteOne(query);
            res.send(result);
        });

        // delete temp product from sales
        app.delete('/deleteQuotationTempProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result =
                await tempQuotationProductCollections.deleteOne(query);
            res.send(result);
        });

        // ..........................................................................................
        app.post('/getCustomer/:contact', async (req, res) => {
            const mobileNumber = req.params.contact;

            const customer = await customerCollections.findOne({
                contactNumber: mobileNumber,
            });

            const customerDue = await customerDueCollections.findOne({
                contactNumber: mobileNumber,
            });
            const customerBalance = await borrowerCollections.findOne({
                contactNumber: mobileNumber,
            });

            res.send({ customer, customerDue, customerBalance });
        });

        // ..........................................................................................
        app.post('/getSupplier/:contact', async (req, res) => {
            const mobileNumber = req.params.contact;
            const result = await supplierCollections.findOne({
                contactNumber: mobileNumber,
            });
            res.send(result);
        });

        // ---------------------------Summary start-----------------------------------------------------------------

        app.get('/getSummary', async (req, res) => {
            try {
                const todaysDate = moment(new Date()).format('DD.MM.YYYY');

                // Fetch sales invoices for today's date
                const salesInvoices = await salesInvoiceCollections
                    .find({ date: todaysDate })
                    .toArray();
                const totalSales = salesInvoices
                    .reduce((acc, sale) => acc + sale.grandTotal, 0)
                    .toFixed(2);
                const totalDue = salesInvoices
                    .reduce((acc, sale) => acc + sale.dueAmount, 0)
                    .toFixed(2);
                const totalCashSales = salesInvoices
                    .reduce((acc, sale) => acc + sale.finalPayAmount, 0)
                    .toFixed(2);

                // Calculate total amount collected from due (paid by customers today) in sales
                const salesDueCollections = await customerDueCollections
                    .find()
                    .toArray();
                const totalCollectedDueFromSales = salesDueCollections
                    .reduce((acc, sale) => {
                        const todaysPayments = sale.paymentHistory
                            ? sale.paymentHistory
                                  .filter(
                                      (payment) =>
                                          payment.date === todaysDate &&
                                          payment.paymentMethod != 'Return',
                                  )
                                  .reduce(
                                      (sum, payment) =>
                                          sum + payment.paidAmount,
                                      0,
                                  )
                            : 0;
                        return acc + todaysPayments;
                    }, 0)
                    .toFixed(2);

                const saleSummary = {
                    totalSales,
                    totalDue,
                    totalCashSales,
                    totalCollectedDueFromSales,
                };

                // Fetch purchase invoices for today's date
                const purchaseInvoices = await purchaseInvoiceCollections
                    .find({ date: todaysDate })
                    .toArray();
                const totalPurchase = purchaseInvoices
                    .reduce((acc, purchase) => acc + purchase.grandTotal, 0)
                    .toFixed(2);
                const totalPurchaseDue = purchaseInvoices
                    .reduce((acc, purchase) => acc + purchase.dueAmount, 0)
                    .toFixed(2);
                const totalCashPurchase = purchaseInvoices
                    .reduce((acc, purchase) => acc + purchase.finalPayAmount, 0)
                    .toFixed(2);

                // Calculate total amount collected from due (paid by you today) in purchases
                const purchaseDueCollections = await supplierDueCollections
                    .find()
                    .toArray();
                const totalCollectedDueFromPurchases = purchaseDueCollections
                    .reduce((acc, purchase) => {
                        const todaysPayments = purchase.paymentHistory
                            ? purchase.paymentHistory
                                  .filter(
                                      (payment) =>
                                          payment.date === todaysDate &&
                                          payment.paymentMethod != 'Return',
                                  )
                                  .reduce(
                                      (sum, payment) =>
                                          sum + payment.paidAmount,
                                      0,
                                  )
                            : 0;
                        return acc + todaysPayments;
                    }, 0)
                    .toFixed(2);

                const purchaseSummary = {
                    totalPurchase,
                    totalPurchaseDue,
                    totalCashPurchase,
                    totalCollectedDueFromPurchases,
                };

                const transactions = await transactionCollections
                    .find({
                        $and: [{ date: todaysDate }, { type: 'Cost' }],
                    })
                    .toArray();

                const todaysCost = transactions
                    .reduce((acc, trans) => acc + trans.totalBalance, 0)
                    .toFixed(2);
                const expenseSummary = { todaysCost };

                // Send the calculated data back to the client
                res.status(200).send({
                    saleSummary,
                    purchaseSummary,
                    expenseSummary,
                });
            } catch (error) {
                console.error('Error fetching sales summary:', error);
                res.status(500).send({
                    message: 'Server error while fetching summary',
                });
            }
        });

        // ---------------------------Summary end---------------------------------------------------------------------

        // new sales invoice...........................................
        app.post('/newSalesInvoice', async (req, res) => {
            const {
                date,
                customerName,
                customerMobile,
                customerAddress,
                totalAmount,
                discountAmount,
                grandTotal,
                finalPayAmount,
                dueAmount,
                scheduleDate,
                sourceOfPaid,
                customerBalance,
                profit,
                userName,
                userMail,
                labourCost,
                transportCost,
                prevDue,
            } = req.body;

            const isExist = await customerCollections.findOne({
                contactNumber: customerMobile,
            });
            if (!isExist) {
                //add customer list with serial
                const recentCustomer = await customerCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextCustomerSerial = 10; // Default starting serial number
                if (recentCustomer.length > 0 && recentCustomer[0].serial) {
                    nextCustomerSerial = recentCustomer[0].serial + 1;
                }
                const newCustomerInfo = {
                    customerName,
                    contactNumber: customerMobile,
                    customerAddress,
                    serial: nextCustomerSerial,
                };

                await customerCollections.insertOne(newCustomerInfo);
            }

            // Retrieve product list from temporary collection
            const productList = await tempSalesProductCollections
                .find({ userMail })
                .toArray();
            const filteredProductList = productList.map(
                ({ _id, ...rest }) => rest,
            );

            // Define the initial invoice number
            const firstInvoiceNumber = 35000001;

            // Find the latest invoice number
            const latestInvoice = await salesInvoiceCollections.findOne(
                {},
                { sort: { invoiceNumber: -1 } },
            );

            // Determine the next invoice number
            const nextInvoiceNumber = latestInvoice
                ? latestInvoice.invoiceNumber + 1
                : firstInvoiceNumber;

            // Check stock availability before proceeding
            const unavailableProducts = [];
            for (const product of filteredProductList) {
                const stockProduct = await stockCollections.findOne({
                    productID: product.productID,
                });
                if (
                    !stockProduct ||
                    stockProduct.purchaseQuantity < product.salesQuantity
                ) {
                    unavailableProducts.push(product.productTitle);
                }
            }

            if (unavailableProducts.length > 0) {
                return res.json(
                    `Stock not available for the following products: ${unavailableProducts.join(
                        ', ',
                    )}`,
                );
            }

            const isCustomer = await customerCollections.findOne({
                contactNumber: customerMobile,
            });

            // Insert the new sales invoice
            const result = await salesInvoiceCollections.insertOne({
                customerSerial: isCustomer.serial,
                date,
                customerName,
                customerAddress,
                customerMobile,
                totalAmount,
                discountAmount,
                grandTotal,
                finalPayAmount,
                dueAmount,
                userName,
                productList: filteredProductList,
                invoiceNumber: nextInvoiceNumber,
                labourCost,
                transportCost,
                prevDue,
            });

            const isSummary = await dailySummaryCollections.findOne({
                date: date,
            });
            if (isSummary) {
                await dailySummaryCollections.updateOne(
                    { date },
                    {
                        $inc: {
                            totalSales: grandTotal,
                            totalProfit: profit,
                        },
                    },
                );
            } else {
                await dailySummaryCollections.insertOne({
                    date,
                    totalSales: grandTotal,
                    totalProfit: profit,
                    totalCost: 0,
                });
            }

            const customerDue = await customerDueBalanceCollections.findOne({});
            if (customerDue) {
                await customerDueBalanceCollections.updateOne(
                    {},
                    {
                        $inc: {
                            customerDueBalance: dueAmount,
                        },
                    },
                );
            } else {
                await customerDueBalanceCollections.insertOne({
                    customerDueBalance: dueAmount,
                });
            }

            const existingProfit = await profitCollections.findOne({});
            if (existingProfit) {
                await profitCollections.updateOne(
                    {},
                    {
                        $inc: {
                            profitBalance: profit,
                        },
                    },
                );
            } else {
                await profitCollections.insertOne({ profitBalance: profit });
            }

            // Find customer by serial
            const findCustomer = await customerCollections.findOne({
                contactNumber: customerMobile,
            });

            const findCustomerBySerial = await customerDueCollections.findOne({
                customerSerial: findCustomer.serial,
            });

            if (findCustomerBySerial && dueAmount > 0) {
                await customerDueCollections.updateOne(
                    { customerSerial: findCustomer.serial },
                    {
                        $inc: {
                            dueAmount: dueAmount,
                        },
                        $set: {
                            scheduleDate, // Update the schedule date
                        },
                        $push: {
                            salesHistory: {
                                date,
                                invoiceNumber: nextInvoiceNumber,
                                grandTotal,
                                finalPayAmount,
                                dueAmount,
                                userName,
                            },
                        },
                    },
                );
            } else if (findCustomerBySerial && !dueAmount) {
                await customerDueCollections.updateOne(
                    { customerSerial: findCustomer.serial },
                    {
                        $push: {
                            salesHistory: {
                                date,
                                invoiceNumber: nextInvoiceNumber,
                                grandTotal,
                                finalPayAmount,
                                dueAmount,
                                userName,
                            },
                        },
                    },
                );
            } else {
                await customerDueCollections.insertOne({
                    customerSerial: findCustomer.serial,
                    customerAddress,
                    contactNumber: customerMobile,
                    date,
                    customerName,
                    dueAmount,
                    scheduleDate,
                    salesHistory: [
                        {
                            date,
                            invoiceNumber: nextInvoiceNumber,
                            grandTotal,
                            finalPayAmount,
                            dueAmount,
                            userName,
                        },
                    ],
                    paymentHistory: [],
                });
            }

            // Update stock quantities
            const bulkOps = filteredProductList.map((product) => ({
                updateOne: {
                    filter: {
                        productID: product.productID,
                        purchaseQuantity: { $gte: product.salesQuantity },
                    },
                    update: {
                        $inc: { purchaseQuantity: -product.salesQuantity },
                    },
                    upsert: true,
                },
            }));

            await stockCollections.bulkWrite(bulkOps);

            // if pay by advanced account then deduct from borrower account balance
            if (sourceOfPaid && customerBalance < finalPayAmount) {
                await totalDebtBalanceCollections.updateOne(
                    {},
                    {
                        $inc: {
                            totalBalance: -customerBalance,
                        },
                    },
                );

                await borrowerCollections.updateOne(
                    { contactNumber: customerMobile },
                    {
                        $inc: {
                            crBalance: -customerBalance,
                        },
                        $push: {
                            statements: {
                                date,
                                amount: `- ${customerBalance}`,
                                paymentMethod: 'Sales',
                                note: nextInvoiceNumber,
                                userName,
                            },
                        },
                    },
                );

                await customerDueCollections.updateOne(
                    { contactNumber: customerMobile },
                    {
                        $push: {
                            statement: {
                                $each: [
                                    {
                                        date,
                                        invoiceNumber: nextInvoiceNumber,
                                        invoiceAmount: grandTotal,
                                        drBalance: customerBalance,
                                        crBalance: 0,
                                        balance: 0,
                                        type: 'Purchase by A/C',
                                        userName,
                                    },
                                    {
                                        date,
                                        invoiceNumber: nextInvoiceNumber,
                                        invoiceAmount: grandTotal,
                                        drBalance: Math.abs(
                                            finalPayAmount - customerBalance,
                                        ),
                                        crBalance: 0,
                                        balance: 0,
                                        type: 'Purchase on cash',
                                        userName,
                                    },
                                ],
                            },
                        },
                    },
                );

                // Update the main balance
                const existingBalance = await mainBalanceCollections.findOne();
                const updatedMainBalance =
                    existingBalance.mainBalance +
                    (finalPayAmount - customerBalance);
                await mainBalanceCollections.updateOne(
                    {},
                    { $set: { mainBalance: updatedMainBalance } },
                );

                const borrower = await borrowerCollections.findOne({
                    contactNumber: customerMobile,
                });

                //add debt transaction list with serial
                const recentDebtSerialTransaction = await allDebtTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentDebtSerialTransaction.length > 0 &&
                    recentDebtSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentDebtSerialTransaction[0].serial + 1;
                }

                await allDebtTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: borrower.borrowerName,
                    rcvAmount: customerBalance,
                    note: nextInvoiceNumber,
                    date,
                    type: 'OUT',
                    userName,
                });
            } else if (sourceOfPaid && customerBalance >= finalPayAmount) {
                await totalDebtBalanceCollections.updateOne(
                    {},
                    {
                        $inc: {
                            totalBalance: -finalPayAmount,
                        },
                    },
                );

                await borrowerCollections.updateOne(
                    { contactNumber: customerMobile },
                    {
                        $inc: {
                            crBalance: -finalPayAmount,
                        },
                        $push: {
                            statements: {
                                date,
                                amount: `- ${finalPayAmount}`,
                                paymentMethod: 'Sales',
                                note: nextInvoiceNumber,
                                userName,
                            },
                        },
                    },
                );

                await customerDueCollections.updateOne(
                    { contactNumber: customerMobile },
                    {
                        $push: {
                            statement: {
                                date,
                                invoiceNumber: nextInvoiceNumber,
                                invoiceAmount: grandTotal,
                                drBalance: finalPayAmount,
                                crBalance: 0,
                                balance: customerBalance - finalPayAmount,
                                type: 'Purchase by A/C',
                                userName,
                            },
                        },
                    },
                );

                const borrower = await borrowerCollections.findOne({
                    contactNumber: customerMobile,
                });

                //add debt transaction list with serial
                const recentDebtSerialTransaction = await allDebtTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentDebtSerialTransaction.length > 0 &&
                    recentDebtSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentDebtSerialTransaction[0].serial + 1;
                }

                await allDebtTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: borrower.borrowerName,
                    rcvAmount: finalPayAmount,
                    note: nextInvoiceNumber,
                    date,
                    type: 'OUT',
                    userName,
                });
            } else {
                // Update the main balance
                const existingBalance = await mainBalanceCollections.findOne();
                const updatedMainBalance =
                    existingBalance.mainBalance + finalPayAmount;
                await mainBalanceCollections.updateOne(
                    {},
                    { $set: { mainBalance: updatedMainBalance } },
                );

                await customerDueCollections.updateOne(
                    { contactNumber: customerMobile },
                    {
                        $push: {
                            statement: {
                                date,
                                invoiceNumber: nextInvoiceNumber,
                                invoiceAmount: grandTotal,
                                drBalance: finalPayAmount,
                                crBalance: 0,
                                balance: customerBalance,
                                type: 'Purchase on cash',
                                userName,
                            },
                        },
                    },
                );
            }

            // Add the transaction to the transaction list with serial
            const recentSerialTransaction = await transactionCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (
                recentSerialTransaction.length > 0 &&
                recentSerialTransaction[0].serial
            ) {
                nextSerial = recentSerialTransaction[0].serial + 1;
            }

            await transactionCollections.insertOne({
                serial: nextSerial,
                totalBalance: finalPayAmount,
                note: `Sales ref, ${nextInvoiceNumber}`,
                date,
                type: 'Sales',
                userName,
            });

            // Now delete the temporary product list
            await tempSalesProductCollections.deleteMany({
                userMail: userMail,
            });
            res.send(result);
        });

        // ................................

        app.post('/newQuotation', async (req, res) => {
            const {
                userName,
                customerSerial,
                contactNumber,
                date,
                customerName,
                totalAmount,
                discountAmount,
                grandTotal,
                userMail,
            } = req.body;

            // Retrieve the latest quotationNumber from the collection
            const latestQuotation = await quotationCollections.findOne(
                {},
                { sort: { quotationNumber: -1 } },
            );

            let nextQuotationNumber = 1; // Default to 1 if no previous quotation exists

            if (latestQuotation) {
                nextQuotationNumber = latestQuotation.quotationNumber + 1;
            }

            try {
                // Retrieve product list from temporary collection
                const productList = await tempQuotationProductCollections
                    .find({ userMail })
                    .toArray();
                const filteredProductList = productList.map(
                    ({ _id, ...rest }) => rest,
                );

                const isCustomer = await customerCollections.findOne({
                    serial: customerSerial,
                });

                // Insert the new quotation
                const result = await quotationCollections.insertOne({
                    userName,
                    customerSerial,
                    contactNumber,
                    date,
                    customerName,
                    customerAddress: isCustomer.customerAddress,
                    totalAmount,
                    discountAmount,
                    grandTotal,
                    quotationNumber: nextQuotationNumber,
                    productList: filteredProductList,
                });

                // Now delete the temporary product list
                await tempQuotationProductCollections.deleteMany({
                    userMail: userMail,
                });

                res.send(result);
            } catch (error) {
                res.send(result);
            }
        });

        // get sales invoice list
        app.get('/salesInvoices', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { date: { $regex: new RegExp(search, 'i') } },
                          {
                              grandTotal: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              invoiceNumber: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          { customerName: { $regex: new RegExp(search, 'i') } },
                          { userName: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await salesInvoiceCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();
            const count = await salesInvoiceCollections.countDocuments(query);
            res.send({ result, count });
        });

        // get quotation list
        app.get('/quotationInvoice', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { date: { $regex: new RegExp(search, 'i') } },
                          {
                              grandTotal: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          { customerName: { $regex: new RegExp(search, 'i') } },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          { userName: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await quotationCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();
            const count = await quotationCollections.countDocuments(query);
            res.send({ result, count });
        });

        // show customer Ledger start .............................................
        app.get('/customerLedger', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { customerName: { $regex: new RegExp(search, 'i') } },
                          {
                              dueAmount: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              customerSerial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              customerAddress: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                      ],
                  }
                : {};

            const result = await customerDueCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();
            const count = await customerDueCollections.countDocuments(query);
            res.send({ result, count });
        });
        // show customer Ledger end .............................................

        // Get all customer due list for excel download
        app.get('/allCustomer', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await customerDueCollections
                .find()
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });
        // ********************************************************************************
        // Get all supplier due list for excel download
        app.get('/allSupplier', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await supplierDueCollections
                .find()
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });

        // new purchase invoice...........................................
        app.post('/newPurchaseInvoice', async (req, res) => {
            const {
                userName,
                date,
                supplierName,
                contactNumber,
                contactPerson,
                supplierAddress,
                totalAmount,
                discountAmount,
                grandTotal,
                finalPayAmount,
                dueAmount,
                userMail,
            } = req.body;

            const isExist = await supplierCollections.findOne({
                contactNumber,
            });
            if (!isExist) {
                //add supplier list with serial
                const recentSupplier = await supplierCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSupplierSerial = 10; // Default starting serial number
                if (recentSupplier.length > 0 && recentSupplier[0].serial) {
                    nextSupplierSerial = recentSupplier[0].serial + 1;
                }
                const newSupplierInfo = {
                    supplierName,
                    contactNumber,
                    contactPerson,
                    supplierAddress,
                    serial: nextSupplierSerial,
                };

                await supplierCollections.insertOne(newSupplierInfo);
            }

            const productList = await tempPurchaseProductCollections
                .find({ userMail })
                .toArray();
            const filteredProductList = productList.map(
                ({ _id, ...rest }) => rest,
            );
            // Define the initial invoice number
            const firstInvoiceNumber = 45000001;

            // Find the latest invoice number
            const latestInvoice = await purchaseInvoiceCollections.findOne(
                {},
                { sort: { invoiceNumber: -1 } },
            );

            // Determine the next invoice number
            const nextInvoiceNumber = latestInvoice
                ? latestInvoice.invoiceNumber + 1
                : firstInvoiceNumber;

            const isSupplier = await supplierCollections.findOne({
                contactNumber,
            });

            // get main balance to deduct purchase amount
            const existingBalance = await mainBalanceCollections.findOne();

            if (existingBalance.mainBalance >= finalPayAmount) {
                await mainBalanceCollections.updateOne(
                    {},
                    {
                        $inc: { mainBalance: -finalPayAmount },
                    },
                );
            } else {
                return res.json('Insufficient balance');
            }

            const result = await purchaseInvoiceCollections.insertOne({
                userName,
                supplierSerial: isSupplier.serial,
                supplierAddress,
                supplierContact: isSupplier.contactNumber,
                date,
                supplierName: isSupplier.supplierName,
                totalAmount,
                discountAmount,
                grandTotal,
                finalPayAmount,
                dueAmount,
                productList: filteredProductList,
                invoiceNumber: nextInvoiceNumber,
            });

            const supplierDue = await supplierDueBalanceCollections.findOne({});
            if (supplierDue) {
                await supplierDueBalanceCollections.updateOne(
                    {},
                    {
                        $inc: {
                            supplierDueBalance: dueAmount,
                        },
                    },
                );
            } else {
                await supplierDueBalanceCollections.insertOne({
                    supplierDueBalance: dueAmount,
                });
            }

            const findSupplierByContact = await supplierDueCollections.findOne({
                contactNumber,
            });
            const findSupplier = await supplierCollections.findOne({
                contactNumber,
            });

            if (findSupplierByContact) {
                await supplierDueCollections.updateOne(
                    { contactNumber },
                    {
                        $inc: {
                            dueAmount: dueAmount,
                        },
                        $push: {
                            purchaseHistory: {
                                date,
                                invoiceNumber: nextInvoiceNumber,
                                grandTotal,
                                finalPayAmount,
                                dueAmount,
                                userName,
                            },
                        },
                    },
                );
            } else {
                await supplierDueCollections.insertOne({
                    supplierSerial: findSupplier.serial,
                    supplierAddress: findSupplier.supplierAddress,
                    contactPerson: findSupplier.contactPerson,
                    contactNumber: findSupplier.contactNumber,
                    date,
                    supplierName,
                    dueAmount,
                    purchaseHistory: [
                        {
                            date,
                            invoiceNumber: nextInvoiceNumber,
                            grandTotal,
                            finalPayAmount,
                            dueAmount,
                            userName,
                        },
                    ],
                    paymentHistory: [],
                });
            }

            const bulkOps = filteredProductList.map((product) => ({
                updateOne: {
                    filter: { productID: product.productID },
                    update: {
                        $set: {
                            purchasePrice: product.purchasePrice,
                            salesPrice: product.salesPrice,
                            reOrderQuantity: product.reOrderQuantity,
                            productTitle: product.productTitle,
                            brand: product.brand,
                            category: product.category,
                            purchaseUnit: product.purchaseUnit,
                            storage: product.storageLocation,
                        },
                        $inc: { purchaseQuantity: product.purchaseQuantity },
                    },
                    upsert: true,
                },
            }));

            stockCollections.bulkWrite(bulkOps);

            // add the transaction in transaction list
            //add transaction list with serial
            const recentSerialTransaction = await transactionCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (
                recentSerialTransaction.length > 0 &&
                recentSerialTransaction[0].serial
            ) {
                nextSerial = recentSerialTransaction[0].serial + 1;
            }

            await transactionCollections.insertOne({
                serial: nextSerial,
                totalBalance: finalPayAmount,
                note: `Purchase ref, ${nextInvoiceNumber}`,
                date,
                type: 'Purchase',
                userName,
            });

            // now delete the temporary product list
            await tempPurchaseProductCollections.deleteMany({ userMail });
            res.send(result);
        });

        // show supplier Ledger start .............................................
        app.get('/supplierLedger', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { supplierName: { $regex: new RegExp(search, 'i') } },
                          {
                              supplierSerial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              dueAmount: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              supplierAddress: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              contactPerson: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                      ],
                  }
                : {};

            const result = await supplierDueCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ supplierSerial: -1 })
                .toArray();
            const count = await supplierDueCollections.countDocuments(query);
            res.send({ result, count });
        });
        // show supplier Ledger end .............................................

        // original single supplier ledger start ...............................................

        // app.get('/singleSupplier/:id', async (req, res) => {
        //   const id = parseInt(req.params.id);
        //   const result = await supplierDueCollections.findOne({supplierSerial:id});

        //   if (result && result.purchaseHistory) {
        //     result.purchaseHistory.sort((a, b) => b.invoiceNumber - a.invoiceNumber);
        //   }

        //   res.send(result);
        // });
        // original single supplier ledger end ...............................................

        // GPT start single supplier
        app.get('/singleSupplier/:id', verifyToken, async (req, res) => {
            const id = parseInt(req.params.id);
            const { searchTerm, page = 1, limit = 10 } = req.query; // Get search term, page, and limit from query parameters

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const supplier = await supplierDueCollections.findOne({
                supplierSerial: id,
            });

            if (!supplier) {
                return res.status(404).send({ message: 'Supplier not found' });
            }

            let purchaseHistory = supplier.purchaseHistory || [];

            // Filter the purchase history if a search term is provided
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                purchaseHistory = purchaseHistory.filter(
                    (purchase) =>
                        purchase.invoiceNumber
                            .toString()
                            .includes(searchTerm) ||
                        purchase.grandTotal.toString().includes(searchTerm) ||
                        purchase.finalPayAmount
                            .toString()
                            .includes(searchTerm) ||
                        purchase.dueAmount.toString().includes(searchTerm) ||
                        purchase.date.toLowerCase().includes(searchLower),
                );
            }

            // Sort the purchase history by invoice number (descending)
            purchaseHistory.sort((a, b) => b.invoiceNumber - a.invoiceNumber);

            // Pagination logic
            const totalItems = purchaseHistory.length;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            const paginatedHistory = purchaseHistory.slice(
                startIndex,
                endIndex,
            );

            // Attach the paginated purchase history and metadata to the supplier object
            supplier.paginatedPurchaseHistory = paginatedHistory;
            supplier.totalItems = totalItems;
            supplier.currentPage = parseInt(page);
            supplier.totalPages = Math.ceil(totalItems / limit);

            res.send(supplier);
        });
        // GPT end single supplier
        // GPT start single customer
        app.get('/singleCustomer/:id', verifyToken, async (req, res) => {
            const id = parseInt(req.params.id);
            const { searchTerm, page = 1, limit = 10 } = req.query; // Get search term, page, and limit from query parameters

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const customer = await customerDueCollections.findOne({
                customerSerial: id,
            });

            if (!customer) {
                return res.status(404).send({ message: 'Customer not found' });
            }

            let salesHistory = customer.salesHistory || [];

            // Filter the sales history if a search term is provided
            if (searchTerm) {
                const searchLower = searchTerm.toLowerCase();
                salesHistory = salesHistory.filter(
                    (sales) =>
                        sales.invoiceNumber.toString().includes(searchTerm) ||
                        sales.grandTotal.toString().includes(searchTerm) ||
                        sales.finalPayAmount.toString().includes(searchTerm) ||
                        sales.dueAmount.toString().includes(searchTerm) ||
                        sales.date.toLowerCase().includes(searchLower),
                );
            }

            // Sort the sales history by invoice number (descending)
            salesHistory.sort((a, b) => b.invoiceNumber - a.invoiceNumber);

            // Pagination logic
            const totalItems = salesHistory.length;
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + parseInt(limit);
            const paginatedHistory = salesHistory.slice(startIndex, endIndex);

            // Attach the paginated sales history and metadata to the customer object
            customer.paginatedSalesHistory = paginatedHistory;
            customer.totalItems = totalItems;
            customer.currentPage = parseInt(page);
            customer.totalPages = Math.ceil(totalItems / limit);

            res.send(customer);
        });

        // get statement for download range base /downloadStatement****************************************************************
        app.get('/downloadStatement/:id', verifyToken, async (req, res) => {
            try {
                const id = parseInt(req.params.id);
                const startDate = parseCustomDate(req.query.beginningDate); // Parse start date
                const endDate = parseCustomDate(req.query.endingDate); // Parse end date
                const userMail = req.query['userEmail'];
                const email = req.user['email'];

                if (userMail !== email) {
                    return res
                        .status(401)
                        .send({ message: 'Forbidden Access' });
                }

                // Find the customer document
                const customer = await customerDueCollections.findOne({
                    customerSerial: id,
                });

                if (!customer) {
                    return res
                        .status(404)
                        .send({ message: 'Customer not found' });
                }

                // Filter the statement array based on date range
                const filteredStatement = customer.statement.filter((entry) => {
                    const entryDate = parseCustomDate(entry.date);
                    return entryDate >= startDate && entryDate <= endDate;
                });

                res.status(200).send(filteredStatement); // Send the filtered array
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // Helper function to parse custom date format (dd.MM.yyyy)
        function parseCustomDate(dateString) {
            const [day, month, year] = dateString.split('.').map(Number);
            return new Date(Date.UTC(year, month - 1, day)); // Ensures UTC midnight
        }

        // get statement ****************************************************************

        app.get(
            '/singleCustomer/statement/:id',
            verifyToken,
            async (req, res) => {
                try {
                    const id = parseInt(req.params.id);
                    const page = parseInt(req.query.page) || 1;
                    const size = parseInt(req.query.size) || 20;
                    const search = req.query.search || '';

                    const userMail = req.query['userEmail'];
                    const email = req.user['email'];

                    if (userMail !== email) {
                        return res
                            .status(401)
                            .send({ message: 'Forbidden Access' });
                    }

                    if (isNaN(id)) {
                        return res
                            .status(400)
                            .send({ message: 'Invalid customer ID' });
                    }

                    // Find the customer document
                    const customer = await customerDueCollections.findOne({
                        customerSerial: id,
                    });

                    if (!customer) {
                        return res
                            .status(404)
                            .send({ message: 'Customer not found' });
                    }

                    // Filter the `statement` array based on the search condition
                    let filteredStatements = customer.statement || [];
                    if (search) {
                        filteredStatements = filteredStatements.filter(
                            (entry) =>
                                Object.values(entry).some(
                                    (value) =>
                                        typeof value === 'string' &&
                                        value
                                            .toLowerCase()
                                            .includes(search.toLowerCase()),
                                ),
                        );
                    }

                    // Get the total length of the filtered array
                    const total = filteredStatements.length;

                    // Paginate the filtered array
                    const paginatedStatements = filteredStatements.slice(
                        (page - 1) * size,
                        page * size,
                    );

                    // Respond with the paginated results and metadata
                    res.send({
                        customer,
                        paginatedStatements,
                        total,
                    });
                } catch (error) {
                    console.error(error);
                    res.status(500).send({ message: 'Internal Server Error' });
                }
            },
        );

        // GPT end single customer

        // single customer ledger start ...............................................
        // app.get('/singleCustomer/:id', async (req, res) => {
        //   const id = parseInt(req.params.id);
        //   const result = await customerDueCollections.findOne({customerSerial:id});

        //   if (result && result.salesHistory) {
        //     result.salesHistory.sort((a, b) => b.invoiceNumber - a.invoiceNumber);
        //   }

        //   res.send(result);
        // });
        // single customer ledger end ...............................................

        // supplier payment start .................................................
        app.post('/paySupplier/:id', async (req, res) => {
            const id = parseInt(req.params.id);
            const { date, paidAmount, paymentMethod, payNote, userName } =
                req.body;

            const existingBalance = await mainBalanceCollections.findOne();
            if (existingBalance.mainBalance >= paidAmount) {
                await mainBalanceCollections.updateOne(
                    {},
                    { $inc: { mainBalance: -paidAmount } },
                );
            } else {
                return res.json('Insufficient balance');
            }

            const supplierDue = await supplierDueBalanceCollections.findOne({});
            if (supplierDue) {
                await supplierDueBalanceCollections.updateOne(
                    {},
                    {
                        $inc: {
                            supplierDueBalance: -paidAmount,
                        },
                    },
                );
            }

            //add transaction list with serial
            const findSupplier = await supplierCollections.findOne({
                serial: id,
            });
            const recentSerialTransaction = await transactionCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (
                recentSerialTransaction.length > 0 &&
                recentSerialTransaction[0].serial
            ) {
                nextSerial = recentSerialTransaction[0].serial + 1;
            }

            await transactionCollections.insertOne({
                serial: nextSerial,
                totalBalance: paidAmount,
                note: `Paid to ${findSupplier.supplierName}`,
                date,
                type: 'Paid',
                userName,
            });

            const supplier = await supplierDueCollections.findOne({
                supplierSerial: id,
            });

            if (supplier) {
                const updatedDueAmount = supplier.dueAmount - paidAmount;
                await supplierDueCollections.updateOne(
                    { supplierSerial: id },
                    {
                        $set: { dueAmount: updatedDueAmount },
                        $push: {
                            paymentHistory: {
                                date,
                                paidAmount,
                                paymentMethod,
                                payNote,
                                userName,
                            },
                        },
                    },
                );

                // const duaPaid = await supplierDueCollections.findOne({supplierSerial:id});
                // if(duaPaid.dueAmount <= 0){
                //   await supplierDueCollections.deleteOne({dueAmount: 0});
                // }
                res.json('success');
            }
        });
        // supplier payment end .................................................
        // add customer balance
        app.post('/receiveCustomerBalance/:id', async (req, res) => {
            const id = parseInt(req.params.id);
            const {
                date,
                receiveConfirmAmount,
                receiveNote,
                paymentMethod,
                userName,
            } = req.body;

            try {
                // Find customer in customerDueCollections
                const customer = await customerDueCollections.findOne({
                    customerSerial: id,
                });

                // Proceed only if the customer exists
                if (customer) {
                    // Update acBalance and push to balanceHistory
                    await customerDueCollections.updateOne(
                        { customerSerial: id },
                        {
                            $inc: { acBalance: receiveConfirmAmount },
                            $push: {
                                balanceHistory: {
                                    date,
                                    receivedAmount: receiveConfirmAmount,
                                    paymentMethod,
                                    receiveNote,
                                    userName,
                                },
                            },
                        },
                    );
                } else {
                    return res
                        .status(404)
                        .json({ message: 'Customer not found' });
                }

                // Update main balance
                const existingBalance = await mainBalanceCollections.findOne();
                if (existingBalance) {
                    await mainBalanceCollections.updateOne(
                        {},
                        { $inc: { mainBalance: receiveConfirmAmount } },
                    );
                } else {
                    return res
                        .status(500)
                        .json({ message: 'Main balance record not found' });
                }

                // Add transaction to transactionCollections
                const findCustomer = await customerCollections.findOne({
                    serial: id,
                });
                if (!findCustomer) {
                    return res.status(404).json({
                        message: 'Customer not found in customer due list',
                    });
                }

                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: receiveConfirmAmount,
                    note: `Received from ${findCustomer.customerName}`,
                    date,
                    type: 'Credit',
                    userName,
                });

                // Send success response after all operations complete successfully
                res.status(200).json('success');
            } catch (error) {
                console.error('Error receiving customer balance:', error);
                res.status(500).json({
                    message: 'Failed to receive customer balance',
                    error,
                });
            }
        });

        // customer payment start .................................................
        app.post('/payCustomer/:id', async (req, res) => {
            const id = parseInt(req.params.id);
            const {
                date,
                paidAmount,
                byAccount,
                paymentMethod,
                payNote,
                discount,
                scheduleDate,
                userName,
            } = req.body;

            try {
                // Retrieve customer
                const customer = await customerDueCollections.findOne({
                    customerSerial: id,
                });

                // Update customer due amount and push payment history if customer exists
                if (customer) {
                    const updatedDueAmount = customer.dueAmount - paidAmount;

                    const phone = customer.contactNumber;
                    const formattedNumber = formatPhoneNumber(phone);
                    const message = `প্রিয় গ্রাহক, আপনি ৳${paidAmount.toLocaleString(
                        'en-BD',
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        },
                    )} পরিশোধ করেছেন। আপনার বর্তমান বকেয়া ৳${updatedDueAmount.toLocaleString(
                        'en-BD',
                        {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                        },
                    )}। ধন্যবাদ। মজুমদার হাট ট্রেডার্স, 01755262608, 01767201923`;

                    await customerDueCollections.updateOne(
                        { customerSerial: id },
                        {
                            $set: {
                                dueAmount: updatedDueAmount,
                                scheduleDate,
                                status: 'Present',
                            },
                            $inc: {
                                halkhata: paidAmount, // Add to existing halkhata
                            },
                            $push: {
                                paymentHistory: {
                                    date,
                                    paidAmount: paidAmount - discount,
                                    paymentMethod,
                                    payNote,
                                    userName,
                                },
                            },
                        },
                    );
                    // const result = await sendSMS({ number: formattedNumber, message });
                }

                if (byAccount) {
                    const decrementValue = paidAmount - discount;
                    await borrowerCollections.updateOne(
                        { contactNumber: customer?.contactNumber },
                        {
                            $inc: { crBalance: -decrementValue },
                            $push: {
                                statements: {
                                    date,
                                    amount: `- ${paidAmount}`,
                                    paymentMethod: '-',
                                    note: 'Due paid',
                                    userName,
                                },
                            },
                        },
                    );

                    const currentBalance =
                        await totalDebtBalanceCollections.findOne({});
                    if (currentBalance) {
                        const decrementValue = paidAmount - discount;
                        await totalDebtBalanceCollections.updateOne(
                            {},
                            {
                                $inc: { totalBalance: -decrementValue },
                            },
                        );
                    }

                    // push the transaction in statement
                    const cBalance = await borrowerCollections.findOne({
                        contactNumber: customer?.contactNumber,
                    });
                    await customerDueCollections.updateOne(
                        { contactNumber: customer?.contactNumber },
                        {
                            $push: {
                                statement: {
                                    date,
                                    invoiceNumber: null,
                                    invoiceAmount: null,
                                    drBalance: paidAmount - discount,
                                    crBalance: 0,
                                    balance: cBalance?.crBalance,
                                    type: 'Due paid by A/C',
                                    userName,
                                },
                            },
                        },
                    );

                    //add debt transaction list with serial
                    const recentDebtSerialTransaction =
                        await allDebtTransactions
                            .find()
                            .sort({ serial: -1 })
                            .limit(1)
                            .toArray();

                    let nextDebtSerial = 10; // Default starting serial number
                    if (
                        recentDebtSerialTransaction.length > 0 &&
                        recentDebtSerialTransaction[0].serial
                    ) {
                        nextDebtSerial =
                            recentDebtSerialTransaction[0].serial + 1;
                    }

                    await allDebtTransactions.insertOne({
                        serial: nextDebtSerial,
                        receiver: customer?.customerName,
                        rcvAmount: paidAmount - discount,
                        note: 'Due paid',
                        date,
                        type: 'OUT',
                        userName,
                    });
                } else {
                    // Update main balance
                    const existingBalance =
                        await mainBalanceCollections.findOne();

                    if (existingBalance) {
                        await mainBalanceCollections.updateOne(
                            {},
                            { $inc: { mainBalance: paidAmount - discount } },
                        );
                    }

                    // push the transaction in statement
                    const cBalance = await borrowerCollections.findOne({
                        contactNumber: customer?.contactNumber,
                    });
                    await customerDueCollections.updateOne(
                        { contactNumber: customer?.contactNumber },
                        {
                            $push: {
                                statement: {
                                    date,
                                    invoiceNumber: null,
                                    invoiceAmount: null,
                                    drBalance: paidAmount - discount,
                                    crBalance: 0,
                                    balance: cBalance?.crBalance,
                                    type: 'Due paid by cash',
                                    userName,
                                },
                            },
                        },
                    );
                }

                // Update customer due balance
                const customerDue = await customerDueBalanceCollections.findOne(
                    {},
                );
                if (customerDue) {
                    await customerDueBalanceCollections.updateOne(
                        {},
                        {
                            $inc: {
                                customerDueBalance: -paidAmount,
                            },
                        },
                    );
                }

                // Add transaction record
                const findCustomer = await customerCollections.findOne({
                    serial: id,
                });
                if (!findCustomer) {
                    return res.status(404).json({
                        message: 'Customer not found in customerCollections',
                    });
                }

                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: paidAmount - discount,
                    note: `Received from ${findCustomer.customerName}`,
                    date,
                    type: 'Received',
                    userName,
                });

                // Send success response after all operations are completed
                res.status(200).json('success');
            } catch (error) {
                console.error('Error processing payment:', error);
                res.status(500).json({
                    message: 'Failed to process payment',
                    error,
                });
            }
        });

        // customer payment end .................................................

        // get invoice list
        app.get('/invoices', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          { date: { $regex: new RegExp(search, 'i') } },
                          {
                              invoiceNumber: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              finalPayAmount: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          { supplierName: { $regex: new RegExp(search, 'i') } },
                          { userName: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await purchaseInvoiceCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();
            const count =
                await purchaseInvoiceCollections.countDocuments(query);
            res.send({ result, count });
        });

        // Get current stock balance
        app.get('/stockBalance', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const stockValue = await stockCollections.find().toArray();
            const totalValue = stockValue.reduce(
                (sum, item) =>
                    sum +
                    (item.purchasePrice || 0) * (item.purchaseQuantity || 0),
                0,
            );

            // Handle numeric search if the search term is a number
            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            // Construct the query based on search criteria
            const query = search
                ? {
                      $or: [
                          ...(numericSearch !== null
                              ? [{ productID: numericSearch }]
                              : []),
                          ...(isNaN(search)
                              ? [
                                    {
                                        productTitle: {
                                            $regex: `\\b${search}\\b`,
                                            $options: 'i',
                                        },
                                    },
                                ]
                              : []),
                      ],
                  }
                : {};

            // Get paginated results
            const result = await stockCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            // Get total count of items (without pagination)
            const count = await stockCollections.countDocuments(query);

            // Calculate the total stock (sum of all purchaseQuantity)
            const totalStockResult = await stockCollections
                .aggregate([
                    { $match: query }, // Apply the same query
                    {
                        $group: {
                            _id: null,
                            totalStock: { $sum: '$purchaseQuantity' },
                        },
                    },
                ])
                .toArray();

            const totalStock =
                totalStockResult.length > 0
                    ? totalStockResult[0].totalStock
                    : 0;

            // Send back paginated results, total count, and total stock
            res.send({ result, count, totalStock, totalValue });
        });

        // update stock
        app.put('/updateStock/:id', async (req, res) => {
            const { id } = req.params;
            const { purchaseQuantity, purchasePrice } = req.body;

            try {
                // Validate ID format
                if (!ObjectId.isValid(id)) {
                    return res
                        .status(400)
                        .json({ message: 'Invalid ID format' });
                }

                // Update the stock item with the given ID
                const updatedStock = await stockCollections.findOneAndUpdate(
                    { _id: new ObjectId(id) }, // Wrap id with ObjectId
                    {
                        $set: {
                            purchaseQuantity,
                            purchasePrice,
                        },
                    },
                    { new: true, returnDocument: 'after' }, // Return the updated document in the response
                );

                if (!updatedStock) {
                    return res
                        .status(404)
                        .json({ message: 'Stock item not found' });
                }

                res.status(200).json({
                    message: 'Stock updated successfully',
                    updatedStock,
                });
            } catch (error) {
                console.error('Error updating stock:', error);
                res.status(500).json({ message: 'Failed to update stock' });
            }
        });

        // add customer.....................................
        app.post('/addCustomer', async (req, res) => {
            const customerInfo = req.body;
            const { contactNumber } = customerInfo;
            const isCustomerExist = await customerCollections.findOne({
                contactNumber,
            });

            //add customer list with serial
            const recentCustomer = await customerCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (recentCustomer.length > 0 && recentCustomer[0].serial) {
                nextSerial = recentCustomer[0].serial + 1;
            }
            const newCustomerInfo = { ...customerInfo, serial: nextSerial };

            if (isCustomerExist) {
                res.json('Customer already exists with the mobile number');
            } else {
                const result =
                    await customerCollections.insertOne(newCustomerInfo);
                res.send(result);
            }
        });

        // show customer...................................
        app.get('/customers', async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';
            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          {
                              customerName: { $regex: new RegExp(search, 'i') },
                          },
                          {
                              serial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          {
                              customerAddress: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                      ],
                  }
                : {};

            const result = await customerCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await customerCollections.countDocuments(query);
            res.send({ result, count });
        });

        // update customer
        app.put('/updateCustomer/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const { customerName, contactNumber, customerAddress } = req.body;

            const isCustomerExist = await customerCollections.findOne({
                contactNumber,
                _id: { $ne: new ObjectId(id) },
            });

            const updateInfo = {
                $set: {
                    customerName,
                    contactNumber,
                    customerAddress,
                },
            };

            const customer = await customerCollections.findOne(filter);
            const customerInLedger = await customerDueCollections.findOne({
                customerSerial: customer.serial,
            });
            const updateInLedger = {
                $set: {
                    customerName,
                    contactNumber,
                    customerAddress,
                },
            };
            if (isCustomerExist) {
                res.json('Customer already exists with the mobile number');
            } else {
                const result = await customerCollections.updateOne(
                    filter,
                    updateInfo,
                );
                await customerDueCollections.updateOne(
                    customerInLedger,
                    updateInLedger,
                );

                res.send(result);
            }
        });

        // delete customer
        app.delete('/deleteCustomer/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await customerCollections.deleteOne(query);
            res.send(result);
        });

        // get profit balance
        app.get('/profitBalance', verifyToken, async (req, res) => {
            const result = await profitCollections.find().toArray();
            res.send(result);
        });

        // get supplier due balance

        app.get('/supplierTotalDueBalance', verifyToken, async (req, res) => {
            const result = await supplierDueBalanceCollections.find().toArray();
            res.send(result);
        });

        app.get('/customerTotalDueBalance', verifyToken, async (req, res) => {
            const result = await customerDueBalanceCollections.find().toArray();
            res.send(result);
        });

        // .....................................................................................
        app.get('/productTotalCount', async (req, res) => {
            const count = await productCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // .....................................................................................
        app.get('/supplierTotalCount', async (req, res) => {
            const count = await supplierCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // single supplier total count
        app.get('/singleSupplierCount', async (req, res) => {
            const count = await supplierDueCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // single customer total count
        app.get('/singleCustomerCount', async (req, res) => {
            const count = await customerDueCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // Total sales invoice count
        app.get('/salesInvoiceCount', async (req, res) => {
            const count =
                await salesInvoiceCollections.estimatedDocumentCount();
            res.send({ count });
        });
        // Total sales invoice history count
        app.get('/salesHistoryCount', async (req, res) => {
            const count =
                await salesInvoiceCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // Total sales invoice count
        app.get('/purchaseInvoiceCount', async (req, res) => {
            const count =
                await purchaseInvoiceCollections.estimatedDocumentCount();
            res.send({ count });
        });

        // generate sales invoice

        app.get('/generateSalesInvoice', verifyToken, async (req, res) => {
            const finder = parseInt(req.query.invoiceNumber);

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const result = await salesInvoiceCollections.findOne({
                invoiceNumber: finder,
            });

            res.send(result);
        });

        // generate purchase invoice

        app.get('/generatePurchaseInvoice', verifyToken, async (req, res) => {
            const finder = parseInt(req.query.invoiceNumber);
            const result = await purchaseInvoiceCollections.findOne({
                invoiceNumber: finder,
            });

            res.send(result);
        });

        // Generate quotation invoice
        app.get('/generateQuotationInvoice', verifyToken, async (req, res) => {
            const finder = req.query.ID;
            const result = await quotationCollections.findOne({
                _id: new ObjectId(finder),
            });

            res.send(result);
        });

        // Return customer.................................................................................................
        app.get('/returnCustomerInvoice/:invoiceNumber', async (req, res) => {
            try {
                const invoiceNumber = parseInt(req.params.invoiceNumber);
                const result = await salesInvoiceCollections.findOne({
                    invoiceNumber,
                });
                if (!result) {
                    return res.json({ message: 'Invoice not found' });
                }

                // if (result.customized) {
                //   const modifiedTimes = result.customized + 1;
                //   res.json({ message: `Invoice modifying for ${modifiedTimes} times` });
                // }

                const { _id, ...invoice } = result;

                const findInExisting = await returnSalesCollections.findOne({
                    invoiceNumber,
                });
                if (!findInExisting) {
                    await returnSalesCollections.insertOne(invoice);
                } else {
                    const { finalPayAmount, ...otherInvoice } = invoice;
                    if (finalPayAmount > otherInvoice.grandTotal) {
                        await returnSalesCollections.updateOne(
                            { invoiceNumber },
                            {
                                $set: {
                                    ...otherInvoice,
                                    finalPayAmount: otherInvoice.grandTotal,
                                },
                            },
                        );
                    } else {
                        await returnSalesCollections.updateOne(
                            { invoiceNumber },
                            {
                                $set: { ...invoice },
                            },
                        );
                    }
                }

                if (result) {
                    res.send(result);
                } else {
                    res.status(404).send({ message: 'Invoice not found' });
                }
            } catch (error) {
                res.status(500).send({
                    message: 'An error occurred while retrieving the invoice.',
                    error: error.message,
                });
            }
        });

        // ----------------------------------------------------------------------

        app.put('/updateCustomerInvoice/:invoiceNumber', async (req, res) => {
            const invoiceNumber = parseInt(req.params.invoiceNumber);
            const updatedInvoice = req.body;
            const date = req.query.date;

            try {
                // Fetch the original invoice and customer due information
                const oldInvoice = await returnSalesCollections.findOne({
                    invoiceNumber,
                });
                const customerDue = await customerDueCollections.findOne({
                    customerSerial: updatedInvoice.customerSerial,
                });
                const oldInvoiceDue = oldInvoice.dueAmount;
                const originalGrandTotal = oldInvoice.grandTotal;
                const updatedGrandTotal = updatedInvoice.grandTotal;
                const originalFinalPayAmount = oldInvoice.finalPayAmount;

                let newDueAmount = updatedGrandTotal - originalFinalPayAmount;
                let refundAmount = 0;

                if (updatedGrandTotal < originalFinalPayAmount) {
                    refundAmount = originalFinalPayAmount - updatedGrandTotal;
                }

                // Validate sufficient balance before making any changes
                if (newDueAmount < 0) {
                    const afterDeductingOldDue =
                        customerDue.dueAmount - oldInvoiceDue;

                    if (afterDeductingOldDue < Math.abs(newDueAmount)) {
                        const remainingRefund =
                            Math.abs(newDueAmount) - afterDeductingOldDue;

                        const mainBalanceRecord =
                            await mainBalanceCollections.findOne({});
                        if (mainBalanceRecord.mainBalance < remainingRefund) {
                            return res
                                .status(400)
                                .send({ message: 'Insufficient balance' });
                        }
                    }
                }

                // Adjust the customer's due amount and handle refunds
                if (newDueAmount < 0) {
                    await customerDueCollections.updateOne(
                        { customerSerial: updatedInvoice.customerSerial },
                        {
                            $inc: { dueAmount: -oldInvoiceDue },
                            $push: {
                                paymentHistory: {
                                    date,
                                    paidAmount: oldInvoiceDue,
                                    paymentMethod: 'Return',
                                    payNote: invoiceNumber,
                                    userName: updatedInvoice.userName,
                                },
                            },
                        },
                    );

                    await customerDueBalanceCollections.updateOne(
                        {},
                        {
                            $inc: {
                                customerDueBalance: -oldInvoiceDue,
                            },
                        },
                    );

                    const afterDeductingOldDue =
                        await customerDueCollections.findOne({
                            customerSerial: updatedInvoice.customerSerial,
                        });

                    if (
                        afterDeductingOldDue.dueAmount >= Math.abs(newDueAmount)
                    ) {
                        await customerDueCollections.updateOne(
                            {
                                customerSerial: updatedInvoice.customerSerial,
                            },
                            {
                                $inc: { dueAmount: newDueAmount }, // newDueAmount is negative here, so it will reduce the due amount
                                $push: {
                                    paymentHistory: {
                                        date,
                                        paidAmount: Math.abs(newDueAmount), // Correct data type for consistency
                                        paymentMethod: 'Return',
                                        payNote: invoiceNumber,
                                        userName: updatedInvoice.userName,
                                    },
                                },
                            },
                        );

                        await customerDueBalanceCollections.updateOne(
                            {},
                            {
                                $inc: {
                                    customerDueBalance: newDueAmount, // newDueAmount is negative here, so it will reduce the due amount
                                },
                            },
                        );

                        newDueAmount = 0;
                        refundAmount = 0;
                    } else {
                        const remainingRefund =
                            Math.abs(newDueAmount) -
                            afterDeductingOldDue.dueAmount;

                        if (afterDeductingOldDue.dueAmount >= 0) {
                            await customerDueCollections.updateOne(
                                {
                                    customerSerial:
                                        updatedInvoice.customerSerial,
                                },
                                {
                                    $set: { dueAmount: 0 },
                                    $push: {
                                        paymentHistory: {
                                            date,
                                            paidAmount:
                                                afterDeductingOldDue.dueAmount, // Correct data type for consistency
                                            paymentMethod: 'Return',
                                            payNote: invoiceNumber,
                                            userName: updatedInvoice.userName,
                                        },
                                    },
                                },
                            );

                            await customerDueBalanceCollections.updateOne(
                                {},
                                {
                                    $inc: {
                                        customerDueBalance:
                                            -afterDeductingOldDue.dueAmount,
                                    },
                                },
                            );
                        }

                        await mainBalanceCollections.updateOne(
                            {},
                            { $inc: { mainBalance: -remainingRefund } },
                        );

                        refundAmount = remainingRefund;

                        const recentSerialTransaction =
                            await transactionCollections
                                .find()
                                .sort({ serial: -1 })
                                .limit(1)
                                .toArray();

                        let nextSerial = 10; // Default starting serial number
                        if (
                            recentSerialTransaction.length > 0 &&
                            recentSerialTransaction[0].serial
                        ) {
                            nextSerial = recentSerialTransaction[0].serial + 1;
                        }

                        await transactionCollections.insertOne({
                            serial: nextSerial,
                            totalBalance: remainingRefund,
                            note: `Return from ${invoiceNumber}`,
                            date,
                            type: 'Return',
                            userName: updatedInvoice.userName,
                        });
                    }
                } else {
                    const restDueAmount = oldInvoiceDue - newDueAmount;
                    await customerDueCollections.updateOne(
                        { customerSerial: updatedInvoice.customerSerial },
                        {
                            $inc: { dueAmount: -restDueAmount },
                            $push: {
                                paymentHistory: {
                                    date,
                                    paidAmount: restDueAmount, // Correct data type for consistency
                                    paymentMethod: 'Return',
                                    payNote: invoiceNumber,
                                    userName: updatedInvoice.userName,
                                },
                            },
                        },
                    );

                    await customerDueBalanceCollections.updateOne(
                        {},
                        {
                            $inc: {
                                customerDueBalance: -restDueAmount,
                            },
                        },
                    );
                    newDueAmount = newDueAmount > 0 ? newDueAmount : 0;
                }

                // Update the stock quantity in stockCollections
                const oldProductList = oldInvoice.productList;
                const updatedProductList = updatedInvoice.productList;

                for (let i = 0; i < oldProductList.length; i++) {
                    const oldProduct = oldProductList[i];
                    const updatedProduct = updatedProductList.find(
                        (p) => p.productID === oldProduct.productID,
                    );

                    if (updatedProduct) {
                        const quantityDifference =
                            oldProduct.salesQuantity -
                            updatedProduct.salesQuantity;

                        if (quantityDifference > 0) {
                            // Only update if there is a decrease in quantity
                            await stockCollections.updateOne(
                                { productID: oldProduct.productID },
                                {
                                    $inc: {
                                        purchaseQuantity: quantityDifference,
                                    },
                                },
                            );
                        }
                    }
                }

                // Ensure the due amount is correctly calculated and set
                if (newDueAmount < 0) {
                    newDueAmount = 0;
                }

                updatedInvoice.dueAmount = newDueAmount; // Set the final due amount
                updatedInvoice.refund = refundAmount; // Set the refund amount

                // Update the invoice in the salesInvoiceCollections
                const { customized, ...otherUpdates } = updatedInvoice;
                const result = await salesInvoiceCollections.updateOne(
                    { invoiceNumber },
                    {
                        $set: { ...otherUpdates },
                        $inc: { customized: 1 },
                    },
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // Return supplier...................................................................................................
        app.get('/returnSupplierInvoice/:invoiceNumber', async (req, res) => {
            try {
                const invoiceNumber = parseInt(req.params.invoiceNumber);
                const result = await purchaseInvoiceCollections.findOne({
                    invoiceNumber,
                });
                if (!result) {
                    return res.json({ message: 'Invoice not found' });
                }

                // if (result.modified === "yes") {
                //   return res.json({ message: "Invoice already modified" });
                // }

                const { _id, ...invoice } = result;

                const findInExisting = await returnPurchaseCollections.findOne({
                    invoiceNumber,
                });
                if (!findInExisting) {
                    await returnPurchaseCollections.insertOne(invoice);
                } else {
                    const { finalPayAmount, ...otherInvoice } = invoice;
                    if (finalPayAmount > otherInvoice.grandTotal) {
                        await returnPurchaseCollections.updateOne(
                            { invoiceNumber },
                            {
                                $set: {
                                    ...otherInvoice,
                                    finalPayAmount: otherInvoice.grandTotal,
                                },
                            },
                        );
                    } else {
                        await returnPurchaseCollections.updateOne(
                            { invoiceNumber },
                            {
                                $set: { ...invoice },
                            },
                        );
                    }
                }

                if (result) {
                    res.send(result);
                } else {
                    res.status(404).send({ message: 'Invoice not found' });
                }
            } catch (error) {
                res.status(500).send({
                    message: 'An error occurred while retrieving the invoice.',
                    error: error.message,
                });
            }
        });

        // .................................................................................................................
        app.put('/updateSupplierInvoice/:invoiceNumber', async (req, res) => {
            const invoiceNumber = parseInt(req.params.invoiceNumber);
            const updatedInvoice = req.body;
            const date = req.query.date;

            try {
                // Fetch the original invoice
                const oldInvoice = await returnPurchaseCollections.findOne({
                    invoiceNumber,
                });
                if (!oldInvoice) {
                    return res
                        .status(404)
                        .send({ message: 'Invoice not found' });
                }

                // Check stock availability before any adjustments
                const oldProductList = oldInvoice.productList;
                const updatedProductList = updatedInvoice.productList;

                for (let i = 0; i < oldProductList.length; i++) {
                    const oldProduct = oldProductList[i];
                    const updatedProduct = updatedProductList.find(
                        (p) => p.productID === oldProduct.productID,
                    );

                    if (updatedProduct) {
                        const quantityDifference =
                            oldProduct.purchaseQuantity -
                            updatedProduct.purchaseQuantity;

                        if (quantityDifference > 0) {
                            // Check if the stock is available for return
                            const stockItem = await stockCollections.findOne({
                                productID: oldProduct.productID,
                            });

                            if (
                                !stockItem ||
                                stockItem.purchaseQuantity < quantityDifference
                            ) {
                                return res.status(400).send({
                                    message: `Not enough stock available to return product ID ${oldProduct.productID}`,
                                });
                            }
                        }
                    }
                }

                // Fetch supplier due information
                const supplierDue = await supplierDueCollections.findOne({
                    supplierSerial: updatedInvoice.supplierSerial,
                });
                const oldInvoiceDue = oldInvoice.dueAmount;
                const originalGrandTotal = oldInvoice.grandTotal;
                const updatedGrandTotal = updatedInvoice.grandTotal;
                const originalFinalPayAmount = oldInvoice.finalPayAmount;

                let newDueAmount = updatedGrandTotal - originalFinalPayAmount;
                let refundAmount = 0;

                if (updatedGrandTotal < originalFinalPayAmount) {
                    refundAmount = originalFinalPayAmount - updatedGrandTotal;
                }

                // Adjust the supplier's due amount and handle refunds
                if (newDueAmount < 0) {
                    const initialSupplierDue =
                        await supplierDueCollections.findOne({
                            supplierSerial: updatedInvoice.supplierSerial,
                        });

                    await supplierDueCollections.updateOne(
                        { supplierSerial: updatedInvoice.supplierSerial },
                        {
                            $inc: { dueAmount: -oldInvoiceDue },
                            $push: {
                                paymentHistory: {
                                    date,
                                    paidAmount: oldInvoiceDue,
                                    paymentMethod: 'Return',
                                    payNote: invoiceNumber,
                                    userName: updatedInvoice.userName,
                                },
                            },
                        },
                    );

                    await supplierDueBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { supplierDueBalance: -oldInvoiceDue },
                        },
                    );

                    const afterDeductingOldDue =
                        await supplierDueCollections.findOne({
                            supplierSerial: updatedInvoice.supplierSerial,
                        });

                    if (
                        afterDeductingOldDue.dueAmount >= Math.abs(newDueAmount)
                    ) {
                        await supplierDueCollections.updateOne(
                            {
                                supplierSerial: updatedInvoice.supplierSerial,
                            },
                            {
                                $inc: { dueAmount: newDueAmount }, // newDueAmount is negative here, so it will reduce the due amount
                                $push: {
                                    paymentHistory: {
                                        date,
                                        paidAmount: Math.abs(newDueAmount), // Correct data type for consistency
                                        paymentMethod: 'Return',
                                        payNote: invoiceNumber,
                                        userName: updatedInvoice.userName,
                                    },
                                },
                            },
                        );

                        await supplierDueBalanceCollections.updateOne(
                            {},
                            {
                                $inc: { supplierDueBalance: newDueAmount }, // newDueAmount is negative here, so it will reduce the due amount
                            },
                        );

                        newDueAmount = 0;
                        refundAmount = 0;
                    } else {
                        const remainingRefund =
                            Math.abs(newDueAmount) -
                            afterDeductingOldDue.dueAmount;

                        if (afterDeductingOldDue.dueAmount >= 0) {
                            await supplierDueCollections.updateOne(
                                {
                                    supplierSerial:
                                        updatedInvoice.supplierSerial,
                                },
                                {
                                    $set: { dueAmount: 0 },
                                    $push: {
                                        paymentHistory: {
                                            date,
                                            paidAmount:
                                                afterDeductingOldDue.dueAmount, // Correct data type for consistency
                                            paymentMethod: 'Return',
                                            payNote: invoiceNumber,
                                            userName: updatedInvoice.userName,
                                        },
                                    },
                                },
                            );

                            await supplierDueBalanceCollections.updateOne(
                                {},
                                {
                                    $inc: {
                                        supplierDueBalance:
                                            -afterDeductingOldDue.dueAmount,
                                    },
                                },
                            );
                        }

                        const mainBalanceRecord =
                            await mainBalanceCollections.findOne({});

                        await mainBalanceCollections.updateOne(
                            {},
                            { $inc: { mainBalance: remainingRefund } },
                        );

                        refundAmount = remainingRefund;

                        const recentSerialTransaction =
                            await transactionCollections
                                .find()
                                .sort({ serial: -1 })
                                .limit(1)
                                .toArray();

                        let nextSerial = 10; // Default starting serial number
                        if (
                            recentSerialTransaction.length > 0 &&
                            recentSerialTransaction[0].serial
                        ) {
                            nextSerial = recentSerialTransaction[0].serial + 1;
                        }

                        await transactionCollections.insertOne({
                            serial: nextSerial,
                            totalBalance: remainingRefund,
                            note: `Return from ${invoiceNumber}`,
                            date,
                            type: 'Return',
                            userName: updatedInvoice.userName,
                        });
                    }
                } else {
                    const restDueAmount = oldInvoiceDue - newDueAmount;
                    await supplierDueCollections.updateOne(
                        { supplierSerial: updatedInvoice.supplierSerial },
                        {
                            $inc: { dueAmount: -restDueAmount },
                            $push: {
                                paymentHistory: {
                                    date,
                                    paidAmount: restDueAmount, // Correct data type for consistency
                                    paymentMethod: 'Return',
                                    payNote: invoiceNumber,
                                    userName: updatedInvoice.userName,
                                },
                            },
                        },
                    );

                    await supplierDueBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { supplierDueBalance: -restDueAmount },
                        },
                    );
                    newDueAmount = newDueAmount > 0 ? newDueAmount : 0;
                }

                // Update the stock quantity in stockCollections after the check
                for (let i = 0; i < oldProductList.length; i++) {
                    const oldProduct = oldProductList[i];
                    const updatedProduct = updatedProductList.find(
                        (p) => p.productID === oldProduct.productID,
                    );

                    if (updatedProduct) {
                        const quantityDifference =
                            oldProduct.purchaseQuantity -
                            updatedProduct.purchaseQuantity;

                        if (quantityDifference > 0) {
                            // Only update if there is a decrease in quantity
                            await stockCollections.updateOne(
                                { productID: oldProduct.productID },
                                {
                                    $inc: {
                                        purchaseQuantity: -quantityDifference,
                                    },
                                },
                            );
                        }
                    }
                }

                // Ensure the due amount is correctly calculated and set
                if (newDueAmount < 0) {
                    newDueAmount = 0;
                }

                updatedInvoice.dueAmount = newDueAmount; // Set the final due amount
                updatedInvoice.refund = refundAmount; // Set the refund amount

                // Update the invoice in the purchaseInvoiceCollections
                const { modified, ...otherUpdates } = updatedInvoice;
                const result = await purchaseInvoiceCollections.updateOne(
                    { invoiceNumber },
                    {
                        $set: { ...otherUpdates },
                        $inc: { modified: 1 },
                    },
                );

                res.send(result);
            } catch (error) {
                console.error(error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // Debt system start here......................................................................
        // borrowerCollections
        app.post('/debt/borrowerList', async (req, res) => {
            const borrowerInfo = req.body;
            const { contactNumber } = borrowerInfo;
            const isBorrowerExist = await borrowerCollections.findOne({
                contactNumber,
            });

            //add borrower list with serial
            const recentBorrower = await borrowerCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (recentBorrower.length > 0 && recentBorrower[0].serial) {
                nextSerial = recentBorrower[0].serial + 1;
            }
            const newBorrowerInfo = {
                ...borrowerInfo,
                serial: nextSerial,
                crBalance: 0,
                drBalance: 0,
                statements: [],
            };

            if (isBorrowerExist) {
                res.json('Mobile number already exists');
            } else {
                const result =
                    await borrowerCollections.insertOne(newBorrowerInfo);
                res.send(result);
            }
        });

        // ----------------------------------------------------------------

        // borrowerCollections
        app.post('/debt/receivedMoney', async (req, res) => {
            try {
                const {
                    date,
                    rcvAmount,
                    serial,
                    contactNumber,
                    note,
                    method,
                    userName,
                } = req.body;

                const borrower = await borrowerCollections.findOne({
                    serial,
                });

                if (!borrower) {
                    return res
                        .status(404)
                        .json({ message: 'Borrower not found' });
                }

                await borrowerCollections.updateOne(
                    { serial: borrower.serial },
                    {
                        $inc: { crBalance: rcvAmount },
                        $push: {
                            statements: {
                                date,
                                amount: rcvAmount,
                                paymentMethod: method,
                                note,
                                userName,
                            },
                        },
                    },
                );

                // -------
                const cBalance = await borrowerCollections.findOne({
                    contactNumber,
                });
                await customerDueCollections.updateOne(
                    { contactNumber },
                    {
                        $push: {
                            statement: {
                                date,
                                invoiceNumber: null,
                                invoiceAmount: null,
                                drBalance: 0,
                                crBalance: rcvAmount,
                                balance: cBalance?.crBalance || rcvAmount,
                                type: 'Credit',
                                userName,
                            },
                        },
                    },
                );
                // -------

                // update totalDebtBalanceCollections

                const currentBalance =
                    await totalDebtBalanceCollections.findOne({});
                if (currentBalance) {
                    await totalDebtBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { totalBalance: rcvAmount },
                        },
                    );
                } else {
                    await totalDebtBalanceCollections.insertOne({
                        totalBalance: rcvAmount,
                    });
                }

                // update main balance
                const existingBalanceDoc =
                    await mainBalanceCollections.findOne();
                if (existingBalanceDoc) {
                    // Update existing document by adding newBalance to mainBalance
                    const updatedMainBalance =
                        existingBalanceDoc.mainBalance + rcvAmount;
                    await mainBalanceCollections.updateOne(
                        {},
                        { $set: { mainBalance: updatedMainBalance } },
                    );
                } else {
                    // Insert new document with newBalance as mainBalance
                    await mainBalanceCollections.insertOne({
                        mainBalance: rcvAmount,
                    });
                }

                //add transaction list with serial
                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: rcvAmount,
                    note,
                    date,
                    type: 'DEBT IN',
                    userName,
                });

                //add debt transaction list with serial
                const recentDebtSerialTransaction = await allDebtTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentDebtSerialTransaction.length > 0 &&
                    recentDebtSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentDebtSerialTransaction[0].serial + 1;
                }

                await allDebtTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: borrower.borrowerName,
                    rcvAmount,
                    note,
                    date,
                    type: 'IN',
                    userName,
                });

                // Respond with success message and optional updated data
                res.status(200).json({
                    message: 'Money received successfully',
                });
            } catch (error) {
                res.status(500).json({
                    error: 'An error occurred while processing the request',
                });
            }
        });

        // get borrower list
        app.get('/borrowerList', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const query = search
                ? {
                      $or: [
                          {
                              borrowerName: { $regex: new RegExp(search, 'i') },
                          },
                          {
                              serial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          { address: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await borrowerCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await borrowerCollections.countDocuments(query);
            res.send({ result, count });
        });

        // get debt balance ................................................
        app.get('/getDebtBalance', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await totalDebtBalanceCollections.find().toArray();
            res.send(result);
        });

        // get lend balance
        app.get('/getLendBalance', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await totalLendBalanceCollections.find().toArray();
            res.send(result);
        });

        // return money .................................................................................
        app.post('/debt/returnMoney', async (req, res) => {
            try {
                const {
                    date,
                    payAmount,
                    returnNote,
                    serial,
                    contactNumber,
                    returnMethod,
                    userName,
                } = req.body;

                const borrower = await borrowerCollections.findOne({
                    serial,
                });

                if (payAmount > borrower.crBalance) {
                    return res.send("Can't over payment");
                }

                if (!borrower) {
                    return res
                        .status(404)
                        .json({ message: 'Borrower not found' });
                }

                // update totalDebtBalanceCollections

                const existingBalance = await mainBalanceCollections.findOne(
                    {},
                );
                if (existingBalance.mainBalance >= payAmount) {
                    await mainBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { mainBalance: -payAmount },
                        },
                    );
                } else {
                    return res.json('Insufficient balance');
                }

                const currentBalance =
                    await totalDebtBalanceCollections.findOne({});
                if (currentBalance) {
                    await totalDebtBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { totalBalance: -payAmount },
                        },
                    );
                }

                await borrowerCollections.updateOne(
                    { serial: borrower.serial },
                    {
                        $inc: {
                            crBalance: -payAmount,
                            drBalance: payAmount,
                        },
                        $push: {
                            statements: {
                                date,
                                amount: `- ${payAmount}`,
                                paymentMethod: returnMethod,
                                note: returnNote,
                                userName,
                            },
                        },
                    },
                );

                const cBalance = await borrowerCollections.findOne({
                    contactNumber,
                });
                await customerDueCollections.updateOne(
                    { contactNumber },
                    {
                        $push: {
                            statement: {
                                date,
                                invoiceNumber: null,
                                invoiceAmount: null,
                                drBalance: payAmount,
                                crBalance: 0,
                                balance: cBalance.crBalance,
                                type: 'Return',
                                userName,
                            },
                        },
                    },
                );

                //add transaction list with serial
                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: payAmount,
                    note: returnNote,
                    date,
                    type: 'DEBT OUT',
                    userName,
                });

                //add transaction list with serial
                const recentDebtSerialTransaction = await allDebtTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentDebtSerialTransaction.length > 0 &&
                    recentDebtSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentDebtSerialTransaction[0].serial + 1;
                }

                await allDebtTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: borrower.borrowerName,
                    balance: payAmount,
                    note: returnNote,
                    date,
                    type: 'OUT',
                    userName,
                });

                // Respond with success message and optional updated data
                res.send('Success');
            } catch (error) {
                res.status(500).json({
                    error: 'An error occurred while processing the request',
                });
            }
        });

        // ........get borrower for excel...............................................................

        app.get('/allBorrower', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await borrowerCollections
                .find()
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });

        // Get lender due list for excel download
        app.get('/allLender', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await lenderCollections
                .find()
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });

        //...................................... Lend system start here..........................................................
        // post lender
        app.post('/lend/lenderList', async (req, res) => {
            const lenderInfo = req.body;
            const { contactNumber } = lenderInfo;
            const isLenderExist = await lenderCollections.findOne({
                contactNumber,
            });

            //add borrower list with serial
            const recentLender = await lenderCollections
                .find()
                .sort({ serial: -1 })
                .limit(1)
                .toArray();

            let nextSerial = 10; // Default starting serial number
            if (recentLender.length > 0 && recentLender[0].serial) {
                nextSerial = recentLender[0].serial + 1;
            }
            const newLenderInfo = {
                ...lenderInfo,
                serial: nextSerial,
                crBalance: 0,
                drBalance: 0,
                statements: [],
            };

            if (isLenderExist) {
                res.json('Mobile number already exists');
            } else {
                const result = await lenderCollections.insertOne(newLenderInfo);
                res.send(result);
            }
        });

        // get lender____________________________________________________________________
        app.get('/lenderList', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          {
                              lenderName: { $regex: new RegExp(search, 'i') },
                          },
                          {
                              serial: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              contactNumber: {
                                  $regex: new RegExp(search, 'i'),
                              },
                          },
                          { address: { $regex: new RegExp(search, 'i') } },
                      ],
                  }
                : {};

            const result = await lenderCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await lenderCollections.countDocuments(query);
            res.send({ result, count });
        });

        // Lending money__________________________
        app.post('/lend/givingMoney', async (req, res) => {
            try {
                const { date, rcvAmount, serial, note, method, userName } =
                    req.body;

                // update main balance
                const existingBalanceDoc =
                    await mainBalanceCollections.findOne();
                if (existingBalanceDoc.mainBalance >= rcvAmount) {
                    // Update existing document by adding newBalance to mainBalance
                    const updatedMainBalance =
                        existingBalanceDoc.mainBalance - rcvAmount;
                    await mainBalanceCollections.updateOne(
                        {},
                        { $set: { mainBalance: updatedMainBalance } },
                    );
                } else {
                    // Insert new document with newBalance as mainBalance
                    return res.json('Insufficient balance');
                }

                const lender = await lenderCollections.findOne({ serial });

                if (!lender) {
                    return res
                        .status(404)
                        .json({ message: 'Lender not found' });
                }

                await lenderCollections.updateOne(
                    { serial: lender.serial },
                    {
                        $inc: { crBalance: rcvAmount },
                        $push: {
                            statements: {
                                date,
                                amount: `- ${rcvAmount}`,
                                paymentMethod: method,
                                note,
                                userName,
                            },
                        },
                    },
                );

                // update totalDebtBalanceCollections

                const currentBalance =
                    await totalLendBalanceCollections.findOne({});
                if (currentBalance) {
                    await totalLendBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { totalBalance: rcvAmount },
                        },
                    );
                } else {
                    await totalLendBalanceCollections.insertOne({
                        totalBalance: rcvAmount,
                    });
                }

                //add transaction list with serial
                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: rcvAmount,
                    note,
                    date,
                    type: 'LEND',
                    userName,
                });

                //add lend transaction list with serial
                const recentLendSerialTransaction = await allLendTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentLendSerialTransaction.length > 0 &&
                    recentLendSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentLendSerialTransaction[0].serial + 1;
                }

                await allLendTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: lender.lenderName,
                    rcvAmount,
                    note,
                    date,
                    type: 'OUT',
                    userName,
                });

                // Respond with success message and optional updated data
                res.status(200).json({
                    message: 'Money given successfully',
                });
            } catch (error) {
                res.status(500).json({
                    error: 'An error occurred while processing the request',
                });
            }
        });

        // Lending return
        app.post('/lend/returnMoney', async (req, res) => {
            try {
                const {
                    date,
                    payAmount,
                    returnNote,
                    serial,
                    returnMethod,
                    userName,
                } = req.body;

                const lender = await lenderCollections.findOne({
                    serial,
                });

                if (payAmount > lender.crBalance) {
                    return res.send("Can't receive over payment");
                }

                if (!lender) {
                    return res
                        .status(404)
                        .json({ message: 'Lender not found' });
                }

                // update total Lend BalanceCollections

                const currentBalance =
                    await totalLendBalanceCollections.findOne({});
                if (currentBalance) {
                    await totalLendBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { totalBalance: -payAmount },
                        },
                    );
                }

                // update main balance

                const existingBalance = await mainBalanceCollections.findOne(
                    {},
                );

                if (existingBalance) {
                    await mainBalanceCollections.updateOne(
                        {},
                        {
                            $inc: { mainBalance: payAmount },
                        },
                    );
                }

                await lenderCollections.updateOne(
                    { serial: lender.serial },
                    {
                        $inc: { crBalance: -payAmount, drBalance: payAmount },
                        $push: {
                            statements: {
                                date,
                                amount: payAmount,
                                paymentMethod: returnMethod,
                                note: returnNote,
                                userName,
                            },
                        },
                    },
                );

                //add transaction list with serial
                const recentSerialTransaction = await transactionCollections
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextSerial = 10; // Default starting serial number
                if (
                    recentSerialTransaction.length > 0 &&
                    recentSerialTransaction[0].serial
                ) {
                    nextSerial = recentSerialTransaction[0].serial + 1;
                }

                await transactionCollections.insertOne({
                    serial: nextSerial,
                    totalBalance: payAmount,
                    note: returnNote,
                    date,
                    type: 'LEND IN',
                    userName,
                });

                //add transaction list with serial
                const recentDebtSerialTransaction = await allLendTransactions
                    .find()
                    .sort({ serial: -1 })
                    .limit(1)
                    .toArray();

                let nextDebtSerial = 10; // Default starting serial number
                if (
                    recentDebtSerialTransaction.length > 0 &&
                    recentDebtSerialTransaction[0].serial
                ) {
                    nextDebtSerial = recentDebtSerialTransaction[0].serial + 1;
                }

                await allDebtTransactions.insertOne({
                    serial: nextDebtSerial,
                    receiver: lender.lenderName,
                    balance: payAmount,
                    note: returnNote,
                    date,
                    type: 'IN',
                    userName,
                });

                // Respond with success message and optional updated data
                res.send('Success');
            } catch (error) {
                res.status(500).json({
                    error: 'An error occurred while processing the request',
                });
            }
        });

        // ------------------------------------------------------------------------------------------------------
        app.get('/schedulePaymentDate', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = {
                ...(search
                    ? {
                          $or: [
                              {
                                  customerName: {
                                      $regex: new RegExp(search, 'i'),
                                  },
                              },
                              {
                                  customerAddress: {
                                      $regex: new RegExp(search, 'i'),
                                  },
                              },
                              {
                                  dueAmount: numericSearch
                                      ? numericSearch
                                      : { $exists: false },
                              },
                              {
                                  contactNumber: {
                                      $regex: new RegExp(search, 'i'),
                                  },
                              },
                              {
                                  scheduleDate: {
                                      $regex: new RegExp(search, 'i'),
                                  },
                              },
                          ],
                      }
                    : {}),
                // Filter for valid `scheduleDate` and `dueAmount`
                scheduleDate: { $exists: true, $ne: 'Invalid date' },
                dueAmount: { $exists: true, $gt: 0 },
            };

            const result = await customerDueCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await customerDueCollections.countDocuments(query);
            res.send({ result, count });
        });

        // Get customer due
        app.get('/getCustomerDue', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];
            const customerSerial = parseInt(req.query.customerID);

            // Check if the user is authorized
            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            try {
                // Find the customer with the specific customerSerial
                const customer = await customerDueCollections.findOne({
                    customerSerial,
                });

                if (customer) {
                    // Check if dueAmount exists and is greater than 0
                    if (customer.dueAmount > 0) {
                        res.send({ dueAmount: customer.dueAmount });
                    } else {
                        res.send({ message: 'No due amount greater than 0' });
                    }
                } else {
                    res.status(404).send({ message: 'Customer not found' });
                }
            } catch (error) {
                console.error('Error fetching customer due:', error);
                res.status(500).send({ message: 'Internal Server Error' });
            }
        });

        // ------------------------------------------------------------------------------------------------------
        app.get('/debtHistory', verifyToken, async (req, res) => {
            const serial = parseInt(req.query.serial);

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            try {
                const find = await borrowerCollections.findOne({
                    serial: serial,
                });
                if (find && find.statements) {
                    res.send(find.statements); // Send only the statements array
                } else {
                    res.json('Statements not found');
                }
            } catch (error) {
                res.json('Internal Server Error');
            }
        });

        // ------------------------------------------------------------------------------------------------------
        app.get('/lendHistory', verifyToken, async (req, res) => {
            const serial = parseInt(req.query.serial);

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            try {
                const find = await lenderCollections.findOne({
                    serial: serial,
                });
                if (find && find.statements) {
                    res.send(find.statements); // Send only the statements array
                } else {
                    res.json('Statements not found');
                }
            } catch (error) {
                res.json('Internal Server Error');
            }
        });
        // ------------------------------------------------------------------------------------------------------
        // Get all transaction for excel download
        app.get('/getAllTransaction', verifyToken, async (req, res) => {
            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }
            const result = await transactionCollections
                .find()
                .sort({ _id: -1 })
                .toArray();
            res.send(result);
        });
        // ------------------------------------------------------------------------------------------------------
        app.get('/getDailySummary', verifyToken, async (req, res) => {
            const page = parseInt(req.query.page);
            const size = parseInt(req.query.size);
            const search = req.query.search || '';

            const userMail = req.query['userEmail'];
            const email = req.user['email'];

            if (userMail !== email) {
                return res.status(401).send({ message: 'Forbidden Access' });
            }

            const excelFull = await dailySummaryCollections.find().toArray();

            let numericSearch = parseFloat(search);
            if (isNaN(numericSearch)) {
                numericSearch = null;
            }

            const query = search
                ? {
                      $or: [
                          {
                              date: { $regex: new RegExp(search, 'i') },
                          },
                          {
                              totalSales: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              totalProfit: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                          {
                              totalCost: numericSearch
                                  ? numericSearch
                                  : { $exists: false },
                          },
                      ],
                  }
                : {};

            const result = await dailySummaryCollections
                .find(query)
                .skip((page - 1) * size)
                .limit(size)
                .sort({ _id: -1 })
                .toArray();

            const count = await dailySummaryCollections.countDocuments(query);
            res.send({ result, count, excelFull });
        });
        // --------------------------------Halkhata__------------------------------------------------------------
        // GET: /getCustomerDueList
        app.get('/getCustomerDueList', verifyToken, async (req, res) => {
            try {
                const userMail = req.query['userEmail'];
                const email = req.user['email'];

                if (userMail !== email) {
                    return res
                        .status(401)
                        .send({ message: 'Forbidden Access' });
                }

                const page = parseInt(req.query.page) || 1;
                const size = parseInt(req.query.size) || 10;
                const status = req.query.status; // "Present" or "Pending"

                const query = {};

                if (status === 'Present') {
                    query.status = 'Present';
                } else if (status === 'Pending') {
                    query.status = { $exists: false };
                    query.dueAmount = { $gt: 200 };
                }

                const totalCount =
                    await customerDueCollections.countDocuments(query);

                const result = await customerDueCollections
                    .find(query)
                    .skip((page - 1) * size)
                    .limit(size)
                    .toArray();

                res.send({ result, totalCount });
            } catch (error) {
                res.status(500).send({
                    message: 'Server Error',
                    error: error.message,
                });
            }
        });

        // ---------------------------------------Sale report----------------------------------------------------
        app.get('/getSalesReportSummary', verifyToken, async (req, res) => {
            try {
                const { userEmail, month } = req.query;
                const email = req.user.email;
                if (userEmail !== email)
                    return res
                        .status(401)
                        .send({ message: 'Forbidden Access' });

                const start = moment(month, 'YYYY-MM');
                const end = moment(start).add(1, 'month');

                const allSales = await salesInvoiceCollections.find().toArray();

                const filteredSales = allSales.filter((sale) => {
                    const saleDate = moment(sale.date, 'DD.MM.YYYY');
                    return (
                        saleDate.isValid() &&
                        saleDate.isSameOrAfter(start) &&
                        saleDate.isBefore(end)
                    );
                });

                let cashOnSale = 0;
                let dueOnSale = 0;
                let dueCollection = 0;

                filteredSales.forEach((sale) => {
                    cashOnSale += Number(sale.finalPayAmount || 0);
                    dueOnSale += Number(sale.dueAmount || 0);
                    // dueCollection += Number(sale.prevDue || 0);
                });

                const totalSales = cashOnSale + dueOnSale;

                res.send({ totalSales, cashOnSale, dueOnSale });
            } catch (err) {
                console.error('Summary Error:', err);
                res.status(500).send({
                    message: 'Server error',
                    error: err.message,
                });
            }
        });

        app.get('/getSalesReportDetails', verifyToken, async (req, res) => {
            try {
                const { userEmail, month } = req.query;
                const email = req.user.email;
                if (userEmail !== email) {
                    return res
                        .status(401)
                        .send({ message: 'Forbidden Access' });
                }

                // Extract regex for MongoDB filtering (DD.MM.YYYY)
                const [year, m] = month.split('-');
                const monthRegex = new RegExp(`\\.${m}\\.${year}$`); // Ex: /\.07\.2025$/

                // Fetch with MongoDB filter
                const allSales = await salesInvoiceCollections
                    .find(
                        { date: { $regex: monthRegex } },
                        {
                            projection: {
                                date: 1,
                                finalPayAmount: 1,
                                dueAmount: 1,
                            },
                        },
                    )
                    .toArray();

                const allPurchases = await purchaseInvoiceCollections
                    .find(
                        { date: { $regex: monthRegex } },
                        { projection: { date: 1, finalPayAmount: 1 } },
                    )
                    .toArray();

                const allSummaries = await dailySummaryCollections
                    .find(
                        { date: { $regex: monthRegex } },
                        {
                            projection: {
                                date: 1,
                                totalCost: 1,
                                totalProfit: 1,
                            },
                        },
                    )
                    .toArray();

                const allDueCollections = await customerDueCollections
                    .find()
                    .toArray();

                const grouped = {};

                // 🔹 Sales
                allSales.forEach((sale) => {
                    const dateStr = moment(sale.date, 'DD.MM.YYYY').format(
                        'YYYY-MM-DD',
                    );
                    if (!grouped[dateStr]) grouped[dateStr] = {};
                    grouped[dateStr].cashOnSale =
                        (grouped[dateStr].cashOnSale || 0) +
                        Number(sale.finalPayAmount || 0);
                    grouped[dateStr].dueOnSale =
                        (grouped[dateStr].dueOnSale || 0) +
                        Number(sale.dueAmount || 0);
                });

                // 🔹 Purchases
                allPurchases.forEach((purchase) => {
                    const dateStr = moment(purchase.date, 'DD.MM.YYYY').format(
                        'YYYY-MM-DD',
                    );
                    if (!grouped[dateStr]) grouped[dateStr] = {};
                    grouped[dateStr].cashOnPurchase =
                        (grouped[dateStr].cashOnPurchase || 0) +
                        Number(purchase.finalPayAmount || 0);
                });

                // 🔹 Summaries
                allSummaries.forEach((summary) => {
                    const dateStr = moment(summary.date, 'DD.MM.YYYY').format(
                        'YYYY-MM-DD',
                    );
                    if (!grouped[dateStr]) grouped[dateStr] = {};
                    grouped[dateStr].costing = Number(summary.totalCost || 0);
                    grouped[dateStr].totalProfit = Number(
                        summary.totalProfit || 0,
                    );
                });

                // 🔹 Due Collection from customerDueCollections.paymentHistory
                const dueByDate = allDueCollections.reduce((acc, customer) => {
                    if (!Array.isArray(customer.paymentHistory)) return acc;

                    customer.paymentHistory.forEach((payment) => {
                        const paymentDate = moment(payment.date, 'DD.MM.YYYY');
                        if (
                            paymentDate.isValid() &&
                            paymentDate.format('MM.YYYY') === `${m}.${year}` &&
                            payment.paymentMethod !== 'Return'
                        ) {
                            const dateStr = paymentDate.format('YYYY-MM-DD');
                            if (!acc[dateStr]) acc[dateStr] = 0;
                            acc[dateStr] += Number(payment.paidAmount || 0);
                        }
                    });

                    return acc;
                }, {});

                // 🔹 Final result
                const result = Object.keys(grouped)
                    .sort()
                    .map((date) => {
                        const g = grouped[date];

                        const cash = Number(g.cashOnSale || 0);
                        const due = Number(g.dueOnSale || 0);
                        const dueCollection = Number(dueByDate[date] || 0);
                        const purchase = Number(g.cashOnPurchase || 0);
                        const costing = Number(g.costing || 0);
                        const profit = Number(g.totalProfit || 0);

                        return {
                            date,
                            cashOnSale: cash,
                            dueOnSale: due,
                            dueCollection,
                            cashOnPurchase: purchase,
                            costing,
                            totalProfit: profit,
                            totalSale: cash + due,
                            totalBalance:
                                cash + dueCollection - purchase - costing,
                        };
                    });

                res.send(result);
            } catch (err) {
                console.error('Details Error:', err);
                res.status(500).send({
                    message: 'Server error',
                    error: err.message,
                });
            }
        });

        // ------------------------------------------------------------------------------------------------------

        // const negativeEntries = await stockCollections
        //   .find({ purchaseQuantity: { $lt: 0 } })
        //   .toArray();

        // for (let negEntry of negativeEntries) {
        //   // Find the original document with the same productID and positive purchaseQuantity
        //   const originalDoc = await stockCollections.findOne({
        //     productID: negEntry.productID,
        //     purchaseQuantity: { $gt: 0 },
        //   });

        //   if (originalDoc) {
        //     // Update the original document's purchaseQuantity by subtracting the negative value
        //     const updatedQuantity =
        //       originalDoc.purchaseQuantity + negEntry.purchaseQuantity;

        //     // Update the original document in the database
        //     await stockCollections.updateOne(
        //       { _id: originalDoc._id },
        //       { $set: { purchaseQuantity: updatedQuantity } }
        //     );

        //     // Remove the negative entry after updating
        //     await stockCollections.deleteOne({ _id: negEntry._id });
        //   }
        // }

        // console.log("Database cleanup completed successfully.");

        // const dataArray = await customerCollections.find({}).toArray();

        // fs.writeFileSync('customerData.json', JSON.stringify(dataArray, null, 2));
        // ................................................................................................................
        console.log(
            'Pinged your deployment. You successfully connected to MongoDB!',
        );
    } finally {
        // Ensures that the client will close when you finish/error
        //   await client.close();
    }
}
run().catch(console.dir);

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});
