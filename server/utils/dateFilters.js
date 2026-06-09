const { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, setISOWeekYear, setISOWeek, startOfISOWeek, endOfISOWeek, isValid } = require('date-fns');

const getDateFilter = (filterType, dateValue, startDateValue, endDateValue, dateField = 'date', dateFormat = '%d.%m.%Y') => {
    let start = null;
    let end = null;

    if (!filterType || filterType === 'all') return {};

    switch (filterType) {
        case 'daily':
            if (dateValue && isValid(new Date(dateValue))) {
                start = startOfDay(new Date(dateValue));
                end = endOfDay(new Date(dateValue));
            }
            break;
        case 'weekly':
            if (dateValue && typeof dateValue === 'string' && dateValue.includes('W')) {
                const [yStr, wStr] = dateValue.split('-W');
                const y = parseInt(yStr, 10);
                const w = parseInt(wStr, 10);
                if (!isNaN(y) && !isNaN(w)) {
                    let d = new Date();
                    d = setISOWeekYear(d, y);
                    d = setISOWeek(d, w);
                    start = startOfISOWeek(d);
                    end = endOfISOWeek(d);
                }
            }
            break;
        case 'monthly':
            if (dateValue && isValid(new Date(dateValue))) {
                start = startOfMonth(new Date(dateValue));
                end = endOfMonth(new Date(dateValue));
            }
            break;
        case 'yearly':
            if (dateValue && isValid(new Date(dateValue.toString()))) {
                start = startOfYear(new Date(dateValue.toString()));
                end = endOfYear(new Date(dateValue.toString()));
            }
            break;
        case 'range':
            if (startDateValue && endDateValue && isValid(new Date(startDateValue)) && isValid(new Date(endDateValue))) {
                start = startOfDay(new Date(startDateValue));
                end = endOfDay(new Date(endDateValue));
            }
            break;
        default:
            break;
    }

    if (start && end) {
        return {
            $expr: {
                $and: [
                    { $gte: [{ $dateFromString: { dateString: `$${dateField}`, format: dateFormat, onError: null, onNull: null } }, start] },
                    { $lte: [{ $dateFromString: { dateString: `$${dateField}`, format: dateFormat, onError: null, onNull: null } }, end] }
                ]
            }
        };
    }

    return {};
};

module.exports = {
    getDateFilter
};
