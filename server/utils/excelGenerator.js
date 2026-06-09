const XLSX = require('xlsx');

// Sheet names cannot exceed 31 chars or contain \ / ? * [ ] :
const safeSheetName = (name) =>
    (String(name || 'Report').replace(/[\\/?*[\]:]/g, '').trim().slice(0, 31)) ||
    'Report';

// Legacy helper kept for backward compatibility (array of objects).
const generateExcel = (data, sheetName = 'Sheet1') => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(sheetName));
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
};

/**
 * Build a worksheet from explicit columns + raw rows.
 *
 * Using aoa_to_sheet (array of arrays) instead of json_to_sheet guarantees the
 * exact column order and that every header (e.g. "Invoice No") is present, even
 * when some values are undefined — which is what made columns silently drop out.
 *
 * @param {Object}   opts
 * @param {string}   opts.title    Sheet name / report title.
 * @param {Array<{label:string,type?:'text'|'money'|'number'}>} opts.columns
 * @param {Array<Array<any>>} opts.rows  Raw values (numbers stay numbers).
 * @param {Array<any>=} opts.totals      Optional totals row aligned to columns.
 */
const generateExcelTable = ({ title = 'Report', columns, rows, totals }) => {
    const header = columns.map((c) => c.label);
    const aoa = [header, ...rows.map((r) => [...r])];
    if (totals && totals.length) aoa.push(totals);

    const worksheet = XLSX.utils.aoa_to_sheet(aoa);

    // Auto-fit column widths based on the longest value in each column.
    worksheet['!cols'] = columns.map((c, i) => {
        const widest = aoa.reduce((max, row) => {
            const len = String(row[i] ?? '').length;
            return len > max ? len : max;
        }, 0);
        return { wch: Math.min(Math.max(widest + 2, 10), 45) };
    });

    // Apply thousands-separator / decimal number formats to numeric columns.
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    columns.forEach((c, colIdx) => {
        if (c.type !== 'money' && c.type !== 'number') return;
        const fmt = c.type === 'money' ? '#,##0.00' : '#,##0';
        for (let r = 1; r <= range.e.r; r++) {
            const cell = worksheet[XLSX.utils.encode_cell({ r, c: colIdx })];
            if (cell && typeof cell.v === 'number') cell.z = fmt;
        }
    });

    // Freeze the header row so it stays visible while scrolling.
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(title));
    return XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
};

module.exports = {
    generateExcel,
    generateExcelTable,
};
