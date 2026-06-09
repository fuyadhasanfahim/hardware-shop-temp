const { generatePDF } = require('../utils/pdfGenerator');
const { generateExcelTable } = require('../utils/excelGenerator');
const { resolvePeriod, dateMatchStages } = require('../utils/periodFilter');
const { format } = require('date-fns');

// ---------------------------------------------------------------------------
// Formatting & rendering helpers
// ---------------------------------------------------------------------------

// Chrome's printToPDF fails on extremely large documents (tens of thousands of
// rows => hundreds of pages). We cap the rows rendered in the PDF and surface a
// note; totals/summary still reflect the FULL dataset, and Excel carries every
// row uncapped.
const MAX_PDF_ROWS = 2500;

const CURRENCY = '৳'; // Bangladeshi Taka sign

const formatMoney = (value) =>
    `${CURRENCY} ${Number(value || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

const formatNumber = (value) => Number(value || 0).toLocaleString('en-US');

const escapeHtml = (value) =>
    String(value ?? '-')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

// A column descriptor drives rendering, totals and Excel formatting.
// type: 'text' | 'money' | 'number'.
const col = (label, type = 'text') => ({ label, type });
const isNumericCol = (c) => c.type === 'money' || c.type === 'number';

const formatCell = (value, type) => {
    if (type === 'money') return formatMoney(value);
    if (type === 'number') return formatNumber(value);
    return escapeHtml(value);
};

// Sum every numeric column across the rows -> array aligned to columns.
const computeColumnTotals = (columns, rows) =>
    columns.map((c, idx) =>
        isNumericCol(c)
            ? rows.reduce((acc, row) => acc + (Number(row[idx]) || 0), 0)
            : null,
    );

// Build the totals row used by both the PDF footer and the Excel sheet.
const buildTotalsRow = (columns, totals) =>
    columns.map((c, idx) => {
        if (idx === 0) return 'TOTAL';
        return totals[idx] === null ? '' : totals[idx];
    });

const setupReportRoutes = (app, database) => {
    const salesInvoiceCollections = database.collection('salesInvoiceList');
    const stockCollections = database.collection('stockList');
    const customerDueCollections = database.collection('customerDueList');
    const supplierDueCollections = database.collection('supplierDueList');

    const renderSummaryCards = (cards) => {
        if (!cards || !cards.length) return '';
        const items = cards
            .map(
                (card) => `
                    <div class="card">
                        <div class="card-label">${escapeHtml(card.label)}</div>
                        <div class="card-value">${card.value}</div>
                    </div>`,
            )
            .join('');
        return `<div class="cards">${items}</div>`;
    };

    const generateReportHtml = (
        title,
        periodLabel,
        columns,
        rows,
        cards,
        options = {},
    ) => {
        const { totals = null, note = null } = options;

        const thead = columns
            .map(
                (c) =>
                    `<th class="${isNumericCol(c) ? 'num' : ''}">${escapeHtml(c.label)}</th>`,
            )
            .join('');

        const tbody = rows.length
            ? rows
                  .map(
                      (row) =>
                          `<tr>${columns
                              .map(
                                  (c, idx) =>
                                      `<td class="${isNumericCol(c) ? 'num' : ''}">${formatCell(row[idx], c.type)}</td>`,
                              )
                              .join('')}</tr>`,
                  )
                  .join('')
            : `<tr><td class="empty" colspan="${columns.length}">No records found for the selected period.</td></tr>`;

        // Totals reflect the full dataset (passed in) so they stay accurate even
        // when the visible rows are capped.
        const effectiveTotals = totals || computeColumnTotals(columns, rows);
        const hasTotals =
            rows.length > 0 && effectiveTotals.some((t) => t !== null);
        const noteBanner = note
            ? `<div class="note">${escapeHtml(note)}</div>`
            : '';
        const tfoot = hasTotals
            ? `<tfoot><tr>${columns
                  .map((c, idx) => {
                      if (idx === 0) return `<td class="total-label">TOTAL</td>`;
                      if (effectiveTotals[idx] === null) return `<td></td>`;
                      return `<td class="num total-value">${formatCell(effectiveTotals[idx], c.type)}</td>`;
                  })
                  .join('')}</tr></tfoot>`
            : '';

        return `<!DOCTYPE html>
<html>
    <head>
        <meta charset="utf-8" />
        <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

            * { box-sizing: border-box; }
            body {
                font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
                color: #1f2937;
                font-size: 11px;
                margin: 0;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }

            .header {
                display: flex;
                justify-content: space-between;
                align-items: flex-start;
                border-bottom: 3px solid #16a34a;
                padding-bottom: 12px;
                margin-bottom: 16px;
            }
            .brand { font-size: 18px; font-weight: 700; color: #16a34a; }
            .brand small { display: block; font-size: 10px; font-weight: 500; color: #6b7280; }
            .report-title { text-align: right; }
            .report-title h1 { font-size: 16px; font-weight: 700; margin: 0; color: #111827; }
            .report-title .meta { font-size: 10px; color: #6b7280; margin-top: 4px; }
            .report-title .period { font-weight: 600; color: #16a34a; }

            .cards { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
            .card {
                flex: 1;
                min-width: 120px;
                border: 1px solid #e5e7eb;
                border-left: 4px solid #16a34a;
                border-radius: 6px;
                padding: 10px 12px;
                background: #f0fdf4;
            }
            .card-label { font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #6b7280; font-weight: 600; }
            .card-value { font-size: 14px; font-weight: 700; color: #111827; margin-top: 4px; }

            .note {
                background: #fffbeb;
                border: 1px solid #fde68a;
                border-left: 4px solid #f59e0b;
                color: #92400e;
                font-size: 10px;
                padding: 8px 12px;
                border-radius: 6px;
                margin-bottom: 12px;
            }

            table { width: 100%; border-collapse: collapse; }
            thead { display: table-header-group; }
            tr { page-break-inside: avoid; }
            th {
                background: #16a34a;
                color: #ffffff;
                font-weight: 600;
                font-size: 10px;
                text-transform: uppercase;
                letter-spacing: .03em;
                padding: 8px 10px;
                text-align: left;
            }
            td { padding: 7px 10px; border-bottom: 1px solid #e5e7eb; word-wrap: break-word; }
            tbody tr:nth-child(even) { background: #f9fafb; }
            .num { text-align: right; white-space: nowrap; }
            .empty { text-align: center; color: #9ca3af; padding: 24px; font-style: italic; }

            tfoot td {
                border-top: 2px solid #16a34a;
                border-bottom: none;
                font-weight: 700;
                font-size: 11px;
                background: #f0fdf4;
                padding: 9px 10px;
            }
            .total-label { color: #16a34a; }
            .total-value { color: #111827; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="brand">
                Hardware Shop
                <small>Inventory &amp; Sales Management</small>
            </div>
            <div class="report-title">
                <h1>${escapeHtml(title)}</h1>
                <div class="meta">Period: <span class="period">${escapeHtml(periodLabel)}</span></div>
                <div class="meta">Generated: ${format(new Date(), 'dd MMM yyyy, hh:mm a')}</div>
            </div>
        </div>
        ${renderSummaryCards(cards)}
        ${noteBanner}
        <table>
            <thead><tr>${thead}</tr></thead>
            <tbody>${tbody}</tbody>
            ${tfoot}
        </table>
    </body>
</html>`;
    };

    // -----------------------------------------------------------------------
    // Data builders (one per report type). Each returns { title, columns,
    // rows, cards }. Heavy fields (e.g. productList) are never fetched.
    // -----------------------------------------------------------------------

    const buildSalesReport = async (period) => {
        const pipeline = [...dateMatchStages(period.range)];

        // Project only the columns we render – this is the key win for mass
        // data, because each invoice's large productList stays in the DB.
        pipeline.push({
            $project: {
                _id: 0,
                invoiceNumber: 1,
                date: 1,
                customerName: 1,
                totalAmount: 1,
                discountAmount: 1,
                grandTotal: 1,
                finalPayAmount: 1,
                dueAmount: 1,
            },
        });
        pipeline.push({ $sort: { invoiceNumber: 1 } });

        const data = await salesInvoiceCollections.aggregate(pipeline).toArray();

        const columns = [
            col('Invoice No'),
            col('Date'),
            col('Customer'),
            col('Total', 'money'),
            col('Discount', 'money'),
            col('Net Amount', 'money'),
            col('Paid', 'money'),
            col('Due', 'money'),
        ];
        const rows = data.map((item) => [
            item.invoiceNumber ?? '-',
            item.date || '-',
            item.customerName || 'Walk-in',
            item.totalAmount || 0,
            item.discountAmount || 0,
            item.grandTotal || 0,
            item.finalPayAmount || 0,
            item.dueAmount || 0,
        ]);

        const sum = (key) =>
            data.reduce((acc, i) => acc + (Number(i[key]) || 0), 0);
        const cards = [
            { label: 'Invoices', value: formatNumber(data.length) },
            { label: 'Net Sales', value: formatMoney(sum('grandTotal')) },
            { label: 'Total Paid', value: formatMoney(sum('finalPayAmount')) },
            { label: 'Outstanding Due', value: formatMoney(sum('dueAmount')) },
        ];

        return { title: 'Sales Report', columns, rows, cards };
    };

    const buildStockReport = async () => {
        const data = await stockCollections
            .find(
                {},
                {
                    projection: {
                        _id: 0,
                        productID: 1,
                        productTitle: 1,
                        category: 1,
                        purchaseQuantity: 1,
                        salesPrice: 1,
                    },
                },
            )
            .toArray();

        const columns = [
            col('Product ID'),
            col('Product Name'),
            col('Category'),
            col('Quantity', 'number'),
            col('Unit Price', 'money'),
            col('Stock Value', 'money'),
        ];
        const rows = data.map((item) => {
            const qty = Number(item.purchaseQuantity) || 0;
            const price = Number(item.salesPrice) || 0;
            return [
                item.productID || '-',
                item.productTitle || '-',
                item.category || '-',
                qty,
                price,
                qty * price,
            ];
        });

        const totalQty = rows.reduce((a, r) => a + r[3], 0);
        const totalValue = rows.reduce((a, r) => a + r[5], 0);
        const cards = [
            { label: 'Products', value: formatNumber(data.length) },
            { label: 'Total Quantity', value: formatNumber(totalQty) },
            { label: 'Total Stock Value', value: formatMoney(totalValue) },
        ];

        return { title: 'Current Stock Report', columns, rows, cards };
    };

    const buildLedgerReport = async (collection, nameField, title, cardNoun) => {
        const data = await collection
            .find(
                {},
                {
                    projection: {
                        _id: 0,
                        [nameField]: 1,
                        contactNumber: 1,
                        dueAmount: 1,
                    },
                },
            )
            .toArray();

        const columns = [col('Name'), col('Contact'), col('Due Amount', 'money')];
        const rows = data.map((item) => [
            item[nameField] || '-',
            item.contactNumber || '-',
            item.dueAmount || 0,
        ]);

        const totalDue = data.reduce((a, i) => a + (Number(i.dueAmount) || 0), 0);
        const cards = [
            { label: cardNoun, value: formatNumber(data.length) },
            {
                label: title.includes('Customer')
                    ? 'Total Receivable'
                    : 'Total Payable',
                value: formatMoney(totalDue),
            },
        ];

        // Use a friendlier first-column header per ledger.
        columns[0] = col(
            title.includes('Customer') ? 'Customer Name' : 'Supplier Name',
        );

        return { title, columns, rows, cards };
    };

    app.post('/api/reports/generate', async (req, res) => {
        try {
            const {
                reportType,
                format: outputFormat,
                filterType,
                dateValue,
                startDateValue,
                endDateValue,
            } = req.body;

            const period = resolvePeriod(
                filterType,
                dateValue,
                startDateValue,
                endDateValue,
            );

            let report;
            if (reportType === 'sales') {
                report = await buildSalesReport(period);
            } else if (reportType === 'stock') {
                report = await buildStockReport();
            } else if (reportType === 'customer-ledger') {
                report = await buildLedgerReport(
                    customerDueCollections,
                    'customerName',
                    'Customer Ledger Report',
                    'Customers',
                );
            } else if (reportType === 'supplier-ledger') {
                report = await buildLedgerReport(
                    supplierDueCollections,
                    'supplierName',
                    'Supplier Ledger Report',
                    'Suppliers',
                );
            } else {
                return res.status(400).json({ error: 'Invalid report type' });
            }

            const { title, columns, rows, cards } = report;

            if (outputFormat === 'pdf') {
                // Totals are computed over every matching row so they remain
                // correct even when the table itself is capped for the PDF.
                const totals = computeColumnTotals(columns, rows);

                let displayRows = rows;
                let note = null;
                if (rows.length > MAX_PDF_ROWS) {
                    displayRows = rows.slice(0, MAX_PDF_ROWS);
                    note = `Showing the first ${formatNumber(MAX_PDF_ROWS)} of ${formatNumber(rows.length)} records. Totals below cover all records. Narrow the date filter or download the Excel report for the complete list.`;
                }

                const html = generateReportHtml(
                    title,
                    period.label,
                    columns,
                    displayRows,
                    cards,
                    { totals, note },
                );
                const pdfBuffer = await generatePDF(html);
                res.setHeader('Content-Type', 'application/pdf');
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename=${reportType}-report.pdf`,
                );
                res.send(pdfBuffer);
            } else if (outputFormat === 'xlsx') {
                const totals = computeColumnTotals(columns, rows);
                const totalsRow =
                    rows.length && totals.some((t) => t !== null)
                        ? buildTotalsRow(columns, totals)
                        : null;

                const finalBuffer = generateExcelTable({
                    title,
                    columns,
                    rows,
                    totals: totalsRow,
                });
                res.setHeader(
                    'Content-Type',
                    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                );
                res.setHeader(
                    'Content-Disposition',
                    `attachment; filename=${reportType}-report.xlsx`,
                );
                res.send(finalBuffer);
            } else {
                res.status(400).json({ error: 'Invalid format' });
            }
        } catch (error) {
            console.error('Error generating report:', error);
            res.status(500).json({ error: error.message });
        }
    });
};

module.exports = { setupReportRoutes };
