const { resolvePeriod, dateMatchStages } = require('../utils/periodFilter');

const setupAnalyticsRoutes = (app, database) => {
    const salesInvoiceCollections = database.collection('salesInvoiceList');
    const stockCollections = database.collection('stockList');
    const customerDueCollections = database.collection('customerDueList');
    const supplierDueCollections = database.collection('supplierDueList');

    // Safely convert a (possibly string) field to a number inside the pipeline.
    const num = (field) => ({
        $convert: { input: field, to: 'double', onError: 0, onNull: 0 },
    });

    // Sum a single field across a collection, entirely on the DB server.
    const sumField = async (collection, field, matchStages = []) => {
        const pipeline = [...matchStages];
        pipeline.push({ $group: { _id: null, total: { $sum: num(`$${field}`) } } });

        const [doc] = await collection.aggregate(pipeline).toArray();
        return doc?.total || 0;
    };

    app.get('/api/analytics/summary', async (req, res) => {
        try {
            const { filterType, dateValue, startDateValue, endDateValue } = req.query;
            const period = resolvePeriod(filterType, dateValue, startDateValue, endDateValue);

            // All four sums are computed in the database (no documents are
            // streamed to Node), and run in parallel. This turns a multi-second,
            // multi-megabyte fetch into a few millisecond aggregation.
            const stockValuePromise = stockCollections
                .aggregate([
                    {
                        $group: {
                            _id: null,
                            total: {
                                $sum: {
                                    $multiply: [
                                        num('$purchaseQuantity'),
                                        num('$purchasePrice'),
                                    ],
                                },
                            },
                        },
                    },
                ])
                .toArray()
                .then((r) => r[0]?.total || 0);

            const [
                totalSalesAmount,
                totalStockValue,
                totalCustomerDues,
                totalSupplierDues,
            ] = await Promise.all([
                sumField(salesInvoiceCollections, 'grandTotal', dateMatchStages(period.range)),
                stockValuePromise,
                sumField(customerDueCollections, 'dueAmount'),
                sumField(supplierDueCollections, 'dueAmount'),
            ]);

            res.json({
                totalSalesAmount,
                totalStockValue,
                totalCustomerDues,
                totalSupplierDues,
            });
        } catch (error) {
            console.error('Error fetching analytics summary:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    });
};

module.exports = { setupAnalyticsRoutes };
