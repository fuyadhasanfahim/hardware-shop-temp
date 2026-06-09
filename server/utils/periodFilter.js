// Shared period/date-range resolution used by reports and analytics.
//
// Stored dates are 'dd.MM.yyyy' strings, so range boundaries are built in UTC
// and matched in MongoDB with $dateFromString (also UTC) — timezone-safe no
// matter where the server runs.

const MONTHS = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const labelUTC = (d) =>
    `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;

const dayStart = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
const dayEnd = (y, m, d) => new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));

// ISO-8601 week -> { start (Monday 00:00), end (Sunday 23:59:59.999) } in UTC.
const isoWeekRange = (year, week) => {
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const jan4DowMon0 = (jan4.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - jan4DowMon0);

    const start = new Date(week1Monday);
    start.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCDate(start.getUTCDate() + 6);
    end.setUTCHours(23, 59, 59, 999);

    return { start, end };
};

/**
 * @returns {{ range: {start:Date,end:Date}|null, label: string }}
 */
const resolvePeriod = (filterType, dateValue, startDateValue, endDateValue) => {
    const nums = (value) => (value ? value.split('-').map(Number) : []);

    let range = null;
    switch (filterType) {
        case 'daily': {
            const [y, m, d] = nums(dateValue); // "YYYY-MM-DD"
            if (y && m && d) range = { start: dayStart(y, m, d), end: dayEnd(y, m, d) };
            break;
        }
        case 'weekly': {
            // <input type="week"> => "YYYY-Www"
            const match = /^(\d{4})-W(\d{1,2})$/.exec(String(dateValue || ''));
            if (match) {
                const y = Number(match[1]);
                const w = Number(match[2]);
                if (y && w >= 1 && w <= 53) range = isoWeekRange(y, w);
            }
            break;
        }
        case 'monthly': {
            const [y, m] = nums(dateValue); // "YYYY-MM"
            if (y && m) {
                range = {
                    start: dayStart(y, m, 1),
                    end: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)), // last day of month
                };
            }
            break;
        }
        case 'yearly': {
            const y = parseInt(dateValue, 10);
            if (y) range = { start: dayStart(y, 1, 1), end: dayEnd(y, 12, 31) };
            break;
        }
        case 'range': {
            const [sy, sm, sd] = nums(startDateValue);
            const [ey, em, ed] = nums(endDateValue);
            if (sy && sm && sd && ey && em && ed) {
                range = { start: dayStart(sy, sm, sd), end: dayEnd(ey, em, ed) };
            }
            break;
        }
        default:
            break;
    }

    const label = range
        ? `${labelUTC(range.start)} – ${labelUTC(range.end)}`
        : 'All Time';
    return { range, label };
};

/**
 * Aggregation stages that filter a 'dd.MM.yyyy' string-date field by range.
 * Returns [] when there is no range (i.e. "all time").
 */
const dateMatchStages = (range, field = 'date') => {
    if (!range) return [];
    return [
        {
            $addFields: {
                _periodDate: {
                    $dateFromString: {
                        dateString: `$${field}`,
                        format: '%d.%m.%Y',
                        onError: null,
                        onNull: null,
                    },
                },
            },
        },
        { $match: { _periodDate: { $gte: range.start, $lte: range.end } } },
    ];
};

module.exports = { resolvePeriod, dateMatchStages };
