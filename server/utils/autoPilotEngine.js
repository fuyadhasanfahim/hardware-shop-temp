const { format } = require("date-fns");

const SETTINGS_COLLECTION = "autoPilotSettings";

/**
 * Phase 2 Dynamic Configuration Setup
 */
const ensureSettings = async (db) => {
    const settingsColl = db.collection(SETTINGS_COLLECTION);
    const count = await settingsColl.countDocuments();
    
    const defaultSettings = {
        isActive: true,
        targetDailySalesMin: 200000,
        targetDailySalesMax: 250000,
        workingHours: { start: 9, end: 21 },
        simulatedUserName: "admin",
        createdAt: new Date(),
        // Macroeconomic Seasonality Settings
        customerDue: { baseline: 7500000, amplitude: 1000000 }, // 75L +/- 10L
        supplierDue: { baseline: 2500000, amplitude: 800000 },   // 25L +/- 8L
        // Intelligent Threshold Segments
        segments: {
            microLimit: 15000,
            highLimit: 50000
        }
    };

    if (count === 0) {
        await settingsColl.insertOne(defaultSettings);
        console.log("[AutoPilot] Macroeconomic Settings registered successfully.");
    } else {
        // Retroactively ensure new parameters exist in legacy configs
        const current = await settingsColl.findOne();
        if (!current.customerDue) {
            await settingsColl.updateOne({}, {
                $set: {
                    customerDue: defaultSettings.customerDue,
                    supplierDue: defaultSettings.supplierDue,
                    segments: defaultSettings.segments
                }
            });
            console.log("[AutoPilot] Legacy settings upgraded to Dynamic Oscillation schema.");
        }
    }
};

/**
 * Analytical Seasonal Oscillator (Sine-Wave Function)
 */
const calculateSeasonalTarget = (baseline, amplitude, dateString) => {
    let month = new Date().getMonth() + 1;
    try {
        const parts = dateString.split(".");
        if (parts.length === 3) {
            month = parseInt(parts[1], 10);
        }
    } catch (e) { /* keep current month */ }

    // Dynamic 12-month wave cycle (Sine oscillation)
    const theta = (2 * Math.PI * month) / 12;
    const waveFactor = Math.sin(theta);
    
    const baseTarget = baseline + (amplitude * waveFactor);
    // Natural micro-deviation/Gaussian noise (+/- 2%)
    const noise = 1 + (Math.random() * 0.04 - 0.02);
    
    return Math.round(baseTarget * noise);
};

/**
 * Intelligent Payment Dispatcher (IPD)
 * Determines payout split behavior based on invoice ticket size and protocol skew
 */
const getPaymentBehavior = (grandTotal, limits, skewMode) => {
    const prob = Math.random();
    const { microLimit, highLimit } = limits;

    // Apply behavioral skew adjustments based on Decision Brain Protocol
    let fullCashThreshold = 0;
    let partialThreshold = 0;

    if (grandTotal <= microLimit) {
        // Segment A: Micro Ticket (< 15,000 BDT) -> Natural Heavy Cash Distribution
        // Base Probability: 70% Full Cash, 20% Partial, 10% Full Due
        fullCashThreshold = skewMode === "COLLECT" ? 0.85 : skewMode === "GROW" ? 0.55 : 0.70;
        partialThreshold = skewMode === "COLLECT" ? 0.95 : skewMode === "GROW" ? 0.85 : 0.90;
    } else if (grandTotal >= highLimit) {
        // Segment B: High Ticket (> 50,000 BDT) -> Natural Commercial/Credit Distribution
        // Base Probability: 20% Full Cash, 70% Partial, 10% Full Due
        fullCashThreshold = skewMode === "COLLECT" ? 0.35 : skewMode === "GROW" ? 0.10 : 0.20;
        partialThreshold = skewMode === "COLLECT" ? 0.95 : skewMode === "GROW" ? 0.80 : 0.90;
    } else {
        // Segment C: Standard Mid Tier
        // Base Probability: 40% Full Cash, 50% Partial, 10% Full Due
        fullCashThreshold = skewMode === "COLLECT" ? 0.55 : skewMode === "GROW" ? 0.25 : 0.40;
        partialThreshold = skewMode === "COLLECT" ? 0.95 : skewMode === "GROW" ? 0.85 : 0.90;
    }

    if (prob < fullCashThreshold) return "FULL_CASH";
    if (prob < partialThreshold) return "PARTIAL_CASH";
    return "FULL_DUE";
};

/**
 * Smart Profile Matcher
 * Matches a generated sale to the optimal real-life customer based on payment behaviors
 */
const selectOptimalCustomer = async (db, behavior, sampleCustomerMobile) => {
    const customerColl = db.collection("customerList");
    const customerDueColl = db.collection("customerDueList");

    try {
        // Step 1: Lookup initial sample customer
        const histCustomer = await customerColl.findOne({ contactNumber: sampleCustomerMobile });

        // Step 2: Score matching based on required profile behavior
        if (behavior === "FULL_DUE" || behavior === "PARTIAL_CASH") {
            // We require a Credit-friendly or high-debt capacity customer
            const candidates = await customerDueColl.find({ dueAmount: { $gt: 5000 } })
                .sort({ dueAmount: -1 }).limit(15).toArray();
            
            if (candidates.length > 0) {
                const choice = candidates[Math.floor(Math.random() * candidates.length)];
                const details = await customerColl.findOne({ serial: choice.customerSerial });
                if (details) return details;
            }
        } else {
            // FULL_CASH: Match with low/cleared due accounts to reflect robust payers
            const candidates = await customerDueColl.find({ dueAmount: { $lt: 1000 } })
                .limit(15).toArray();
            
            if (candidates.length > 0) {
                const choice = candidates[Math.floor(Math.random() * candidates.length)];
                const details = await customerColl.findOne({ serial: choice.customerSerial });
                if (details) return details;
            }
        }

        // Direct fallback to the original sample customer to keep invoice continuity
        if (histCustomer) return histCustomer;

        // Absolute Fallback: Just grab any active customer
        const allAct = await customerColl.find().limit(50).toArray();
        if (allAct.length > 0) return allAct[Math.floor(Math.random() * allAct.length)];
    } catch (e) {
        console.error("[Smart Matcher Exception]", e);
    }
    return null;
};

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const applyVariance = (num, pct = 0.1) => {
    const factor = 1 + (Math.random() * pct * 2 - pct);
    return Math.round(num * factor);
};

/**
 * Fully Autonomous Macroeconomic Emulation System
 */
const AutoPilotEngine = {
    simulateDay: async (db, debtDB, targetDate) => {
        if (process.env.SIMULATION_MODE !== "true") {
            throw new Error("[AutoPilot Execution Blocked] SIMULATION_MODE environment flag is disabled!");
        }

        await ensureSettings(db);
        const settings = await db.collection(SETTINGS_COLLECTION).findOne();

        if (!settings || !settings.isActive) {
            return { success: false, message: "Decision Brain is configured to Inactive in settings" };
        }

        console.log(`[AutoPilot Brain] Analytical evaluation started for calendar: ${targetDate}`);

        // 1. Calculate Dynamic Season Targets
        const targetCustomerDue = calculateSeasonalTarget(settings.customerDue.baseline, settings.customerDue.amplitude, targetDate);
        const targetSupplierDue = calculateSeasonalTarget(settings.supplierDue.baseline, settings.supplierDue.amplitude, targetDate);

        console.log(`[AutoPilot Brain] Calibrated Seasonal Targets for Month -> Customer Due: ${targetCustomerDue.toLocaleString("en-IN")}, Supplier Due: ${targetSupplierDue.toLocaleString("en-IN")}`);

        // 2. Evaluate Current Balances and determine System Drift
        const customerDueBalColl = db.collection("customerDueBalanceList");
        const supplierDueBalColl = db.collection("supplierDueBalanceList");
        const mainBalColl = db.collection("mainBalanceList");

        const cBalDoc = await customerDueBalColl.findOne();
        const currentCustomerDueGlobal = cBalDoc?.customerDueBalance || 0;

        const sBalDoc = await supplierDueBalColl.findOne();
        const currentSupplierDueGlobal = sBalDoc?.supplierDueBalance || 0;

        // Decision Brain Protocol Selection
        // "COLLECT" -> Balance is bloated, run Collection protocol
        // "GROW" -> Balance is light, run Credit expansion protocol
        // "STANDARD" -> Within equilibrium
        let customerProtocol = "STANDARD";
        if (currentCustomerDueGlobal > targetCustomerDue * 1.05) customerProtocol = "COLLECT";
        else if (currentCustomerDueGlobal < targetCustomerDue * 0.95) customerProtocol = "GROW";

        let supplierProtocol = "STANDARD";
        if (currentSupplierDueGlobal > targetSupplierDue * 1.05) supplierProtocol = "COLLECT"; // Trigger PaySupplier
        else if (currentSupplierDueGlobal < targetSupplierDue * 0.95) supplierProtocol = "GROW"; // Trigger Restock Purchases

        console.log(`[AutoPilot Brain] System Drift Analyzed -> Customer Protocol: [${customerProtocol}], Supplier Protocol: [${supplierProtocol}]`);

        // 3. Calculate Daily Sales target
        const isPeak = Math.random() < 0.10; // Occasional spike day
        const targetSalesToday = isPeak
            ? Math.floor(Math.random() * 200000) + 400000
            : Math.floor(Math.random() * (settings.targetDailySalesMax - settings.targetDailySalesMin + 1)) + settings.targetDailySalesMin;

        const report = {
            date: targetDate,
            calibratedTargets: { customerDue: targetCustomerDue, supplierDue: targetSupplierDue },
            protocolsTriggered: { customer: customerProtocol, supplier: supplierProtocol },
            totalSalesSimulated: 0,
            salesInvoicesSimulated: 0,
            purchasesSimulated: 0,
            customerDueCollectedSimulated: 0,
            supplierPaidSimulated: 0,
            details: []
        };

        // Load Dataset for analytic cloning
        const salesInvoiceColl = db.collection("salesInvoiceList");
        const purchaseInvoiceColl = db.collection("purchaseInvoiceList");
        const stockColl = db.collection("stockList");
        const customerColl = db.collection("customerList");
        const supplierColl = db.collection("supplierList");
        const dailySummaryColl = db.collection("dailySummaryList");
        const profitColl = db.collection("profitList");
        const customerDueColl = db.collection("customerDueList");

        const historicalSales = await salesInvoiceColl.find().sort({ _id: -1 }).limit(150).toArray();
        const historicalPurchases = await purchaseInvoiceColl.find().sort({ _id: -1 }).limit(50).toArray();

        if (historicalSales.length === 0) {
            return { success: false, message: "Insufficient training dataset: salesInvoiceList count is zero." };
        }

        // 4. Emulated Sales Execution Loop using Smart IPD
        let runningSalesTotal = 0;

        while (runningSalesTotal < targetSalesToday) {
            const sampleInvoice = getRandomElement(historicalSales);
            const productList = [];
            let calculatedTotal = 0;
            let calculatedProfit = 0;

            // Assemble realistic product configurations
            for (const item of sampleInvoice.productList) {
                let liveStock = await stockColl.findOne({ productID: item.productID });
                const pPrice = liveStock?.purchasePrice || item.purchasePrice || 100;
                const sPrice = liveStock?.salesPrice || item.salesPrice || 120;
                
                let quantity = item.salesQuantity;
                if (quantity > 2 && Math.random() < 0.25) {
                    quantity = Math.random() < 0.5 ? quantity + 1 : quantity - 1;
                }

                const subTotal = sPrice * quantity;
                const profit = (sPrice - pPrice) * quantity;

                // Virtual Inventory top-up to prevent runouts during large runs
                await stockColl.updateOne(
                    { productID: item.productID },
                    { 
                        $set: { productTitle: liveStock?.productTitle || item.productTitle, purchasePrice: pPrice, salesPrice: sPrice },
                        $inc: { purchaseQuantity: 80 } 
                    },
                    { upsert: true }
                );

                productList.push({
                    productID: item.productID,
                    productTitle: liveStock?.productTitle || item.productTitle,
                    salesPrice: sPrice,
                    purchasePrice: pPrice,
                    salesQuantity: quantity,
                    subTotal,
                    category: liveStock?.category || item.category,
                    brand: liveStock?.brand || item.brand,
                    purchaseUnit: liveStock?.purchaseUnit || item.purchaseUnit
                });

                calculatedTotal += subTotal;
                calculatedProfit += profit;
            }

            const discountPct = (sampleInvoice.discountAmount || 0) / (sampleInvoice.totalAmount || calculatedTotal);
            const discountAmount = Math.round(calculatedTotal * discountPct);
            const grandTotal = calculatedTotal - discountAmount;

            // Invoke Intelligent Payment Dispatcher
            const behavior = getPaymentBehavior(grandTotal, settings.segments, customerProtocol);

            // Invoke Smart Customer Profile Matcher
            const matchedCustomer = await selectOptimalCustomer(db, behavior, sampleInvoice.customerMobile);
            if (!matchedCustomer) {
                return { success: false, message: "Analytical match failure: No viable customers found in registry." };
            }

            // Execute payment allocation based on dispatched behavior
            let finalPayAmount = 0;
            if (behavior === "FULL_CASH") {
                finalPayAmount = grandTotal;
            } else if (behavior === "PARTIAL_CASH") {
                // Match original sample invoice pay-down percentage exactly
                const samplePayRatio = (sampleInvoice.finalPayAmount || 0) / (sampleInvoice.grandTotal || grandTotal);
                const validatedRatio = samplePayRatio > 0.1 && samplePayRatio < 0.9 ? samplePayRatio : 0.75; // safety clamp
                finalPayAmount = Math.round(grandTotal * validatedRatio);
            } else {
                finalPayAmount = 0; // FULL_DUE
            }
            const dueAmount = grandTotal - finalPayAmount;

            // Persist Invoice
            const latestInv = await salesInvoiceColl.findOne({}, { sort: { invoiceNumber: -1 } });
            const invoiceSeq = latestInv ? latestInv.invoiceNumber + 1 : 35000001;

            await salesInvoiceColl.insertOne({
                customerSerial: matchedCustomer.serial,
                date: targetDate,
                customerName: matchedCustomer.customerName,
                customerAddress: matchedCustomer.customerAddress,
                customerMobile: matchedCustomer.contactNumber,
                totalAmount: calculatedTotal,
                discountAmount,
                grandTotal,
                finalPayAmount,
                dueAmount,
                productList,
                invoiceNumber: invoiceSeq,
                labourCost: applyVariance(sampleInvoice.labourCost || 0),
                transportCost: applyVariance(sampleInvoice.transportCost || 0),
                prevDue: 0,
                userName: settings.simulatedUserName,
                simulated: true,
                macroRouted: true
            });

            // Sync Ledger Systems
            const sumDoc = await dailySummaryColl.findOne({ date: targetDate });
            if (sumDoc) {
                await dailySummaryColl.updateOne({ date: targetDate }, { $inc: { totalSales: grandTotal, totalProfit: calculatedProfit } });
            } else {
                await dailySummaryColl.insertOne({ date: targetDate, totalSales: grandTotal, totalProfit: calculatedProfit, totalCost: 0 });
            }

            await customerDueBalColl.updateOne({}, { $inc: { customerDueBalance: dueAmount } }, { upsert: true });
            await profitColl.updateOne({}, { $inc: { profitBalance: calculatedProfit } }, { upsert: true });
            await mainBalColl.updateOne({}, { $inc: { mainBalance: finalPayAmount } }, { upsert: true });

            const ledger = await customerDueColl.findOne({ customerSerial: matchedCustomer.serial });
            const histLog = { date: targetDate, invoiceNumber: invoiceSeq, grandTotal, finalPayAmount, dueAmount, userName: settings.simulatedUserName };

            if (ledger) {
                await customerDueColl.updateOne({ customerSerial: matchedCustomer.serial }, { $inc: { dueAmount }, $push: { salesHistory: histLog } });
            } else {
                await customerDueColl.insertOne({
                    customerSerial: matchedCustomer.serial,
                    customerName: matchedCustomer.customerName,
                    contactNumber: matchedCustomer.contactNumber,
                    customerAddress: matchedCustomer.customerAddress,
                    date: targetDate,
                    dueAmount,
                    salesHistory: [histLog],
                    paymentHistory: [],
                    statement: []
                });
            }

            // Deduct consumed inventories
            for (const p of productList) {
                await stockColl.updateOne({ productID: p.productID }, { $inc: { purchaseQuantity: -p.salesQuantity } });
            }

            runningSalesTotal += grandTotal;
            report.salesInvoicesSimulated++;
        }
        report.totalSalesSimulated = runningSalesTotal;

        // 5. Advanced Customer Dues Collection Protocol
        // Triggered heavily when PROTOCOL = COLLECT to balance out seasonal sine drift
        const collectionLoopLimit = customerProtocol === "COLLECT" ? Math.floor(Math.random() * 4) + 4 : Math.floor(Math.random() * 2) + 1;
        const activeDebtors = await customerDueColl.find({ dueAmount: { $gt: 2000 } }).limit(60).toArray();

        if (activeDebtors.length > 0 && collectionLoopLimit > 0) {
            const transactionColl = db.collection("transactionList");
            let aggregateCollected = 0;

            for (let i = 0; i < Math.min(collectionLoopLimit, activeDebtors.length); i++) {
                const targetDebtor = getRandomElement(activeDebtors);
                
                // Recover amount matching typical payment behavior limits (e.g., 25% - 80%)
                const recoveryRatio = 0.25 + (Math.random() * 0.55);
                const recoveredAmt = Math.round(targetDebtor.dueAmount * recoveryRatio);

                if (recoveredAmt > 20) {
                    await customerDueColl.updateOne(
                        { customerSerial: targetDebtor.customerSerial },
                        {
                            $inc: { dueAmount: -recoveredAmt, halkhata: recoveredAmt },
                            $push: {
                                paymentHistory: {
                                    date: targetDate,
                                    paidAmount: recoveredAmt,
                                    paymentMethod: "Cash",
                                    payNote: "Seasonal Ledger Balancing",
                                    userName: settings.simulatedUserName
                                }
                            }
                        }
                    );

                    await mainBalColl.updateOne({}, { $inc: { mainBalance: recoveredAmt } });
                    await customerDueBalColl.updateOne({}, { $inc: { customerDueBalance: -recoveredAmt } });

                    const tSeq = await transactionColl.find().sort({ serial: -1 }).limit(1).toArray();
                    const nTrSer = tSeq.length > 0 && tSeq[0].serial ? tSeq[0].serial + 1 : 100;

                    await transactionColl.insertOne({
                        serial: nTrSer,
                        totalBalance: recoveredAmt,
                        note: `Seasonal Due Recovery: ${targetDebtor.customerName}`,
                        date: targetDate,
                        type: "Credit",
                        userName: settings.simulatedUserName,
                        simulated: true
                    });

                    aggregateCollected += recoveredAmt;
                    report.customerDueCollectedSimulated++;
                }
            }
            report.details.push(`[Collection Protocol] Successfully reclaimed BDT ${aggregateCollected.toLocaleString("en-IN")} outstanding from ${report.customerDueCollectedSimulated} debtors.`);
        }

        // 6. Advanced Supplier Gap Strategy (Oscillator Control)
        const transactionColl = db.collection("transactionList");
        const supplierDueColl = db.collection("supplierDueList");

        // Scenario A: Supplier Due is UNDER Target -> Run Purchase Orders (Growth Protocol)
        if (supplierProtocol === "GROW" && historicalPurchases.length > 0) {
            const sampleP = getRandomElement(historicalPurchases);
            let realSupplier = await supplierColl.findOne({ contactNumber: sampleP.supplierContact });
            
            if (!realSupplier) {
                const sRegistry = await supplierColl.find().limit(50).toArray();
                realSupplier = sRegistry.length > 0 ? getRandomElement(sRegistry) : null;
            }

            if (realSupplier) {
                const targetInfuseAmt = targetSupplierDue - currentSupplierDueGlobal + applyVariance(100000, 0.15);
                const finalPay = Math.round(targetInfuseAmt * 0.20); // Standard commercial downpayment ratio
                const newDue = targetInfuseAmt - finalPay;

                const latestPSeq = await purchaseInvoiceColl.findOne({}, { sort: { invoiceNumber: -1 } });
                const nextPSeq = latestPSeq ? latestPSeq.invoiceNumber + 1 : 45000001;

                await purchaseInvoiceColl.insertOne({
                    userName: settings.simulatedUserName,
                    supplierSerial: realSupplier.serial,
                    supplierAddress: realSupplier.supplierAddress,
                    supplierContact: realSupplier.contactNumber,
                    date: targetDate,
                    supplierName: realSupplier.supplierName,
                    totalAmount: targetInfuseAmt,
                    discountAmount: 0,
                    grandTotal: targetInfuseAmt,
                    finalPayAmount: finalPay,
                    dueAmount: newDue,
                    productList: sampleP.productList || [],
                    invoiceNumber: nextPSeq,
                    simulated: true,
                    macroRouted: true
                });

                await mainBalColl.updateOne({}, { $inc: { mainBalance: -finalPay } });
                await supplierDueBalColl.updateOne({}, { $inc: { supplierDueBalance: newDue } }, { upsert: true });

                const pHistory = { date: targetDate, invoiceNumber: nextPSeq, grandTotal: targetInfuseAmt, finalPayAmount: finalPay, dueAmount: newDue, userName: settings.simulatedUserName };
                const sLedger = await supplierDueColl.findOne({ supplierSerial: realSupplier.serial });

                if (sLedger) {
                    await supplierDueColl.updateOne({ supplierSerial: realSupplier.serial }, { $inc: { dueAmount: newDue }, $push: { purchaseHistory: pHistory } });
                } else {
                    await supplierDueColl.insertOne({
                        supplierSerial: realSupplier.serial,
                        supplierAddress: realSupplier.supplierAddress,
                        contactPerson: realSupplier.contactPerson,
                        contactNumber: realSupplier.contactNumber,
                        date: targetDate,
                        supplierName: realSupplier.supplierName,
                        dueAmount: newDue,
                        purchaseHistory: [pHistory],
                        paymentHistory: []
                    });
                }

                report.purchasesSimulated++;
                report.details.push(`[Growth Protocol] Simulated restock purchase order of BDT ${targetInfuseAmt.toLocaleString("en-IN")} with ${realSupplier.supplierName} to scale up dues.`);
            }
        }

        // Scenario B: Supplier Due is OVER Target -> Run Disbursal Payments (Collection Protocol)
        else if (supplierProtocol === "COLLECT") {
            const activeSupplierDues = await supplierDueColl.find({ dueAmount: { $gt: 10000 } }).toArray();
            if (activeSupplierDues.length > 0) {
                const targetSupp = getRandomElement(activeSupplierDues);
                const excess = currentSupplierDueGlobal - targetSupplierDue;
                const disburseAmt = Math.min(excess, targetSupp.dueAmount);

                if (disburseAmt > 500) {
                    await mainBalColl.updateOne({}, { $inc: { mainBalance: -disburseAmt } });
                    await supplierDueBalColl.updateOne({}, { $inc: { supplierDueBalance: -disburseAmt } });

                    await supplierDueColl.updateOne(
                        { supplierSerial: targetSupp.supplierSerial },
                        {
                            $inc: { dueAmount: -disburseAmt },
                            $push: {
                                paymentHistory: {
                                    date: targetDate,
                                    paidAmount: disburseAmt,
                                    paymentMethod: "Bank Transfer",
                                    payNote: "Seasonal Ledger Disbursal",
                                    userName: settings.simulatedUserName
                                }
                            }
                        }
                    );

                    const rTSeq = await transactionColl.find().sort({ serial: -1 }).limit(1).toArray();
                    const nextTxSeq = rTSeq.length > 0 && rTSeq[0].serial ? rTSeq[0].serial + 1 : 100;

                    await transactionColl.insertOne({
                        serial: nextTxSeq,
                        totalBalance: disburseAmt,
                        note: `Seasonal Settlement to ${targetSupp.supplierName}`,
                        date: targetDate,
                        type: "Paid",
                        userName: settings.simulatedUserName,
                        simulated: true
                    });

                    report.supplierPaidSimulated++;
                    report.details.push(`[Settlement Protocol] Disbursed BDT ${disburseAmt.toLocaleString("en-IN")} to Supplier ${targetSupp.supplierName} clearing excess dues.`);
                }
            }
        }

        console.log(`[AutoPilot Brain] Successfully finalized decision execution for date: ${targetDate}`);
        return { success: true, report };
    }
};

module.exports = AutoPilotEngine;
