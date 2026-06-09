import React from 'react';

const DateFilterOptions = ({ 
    filterType, setFilterType, 
    dateValue, setDateValue, 
    startDateValue, setStartDateValue, 
    endDateValue, setEndDateValue 
}) => {
    return (
        <div className="flex flex-wrap items-center gap-3">
            <select 
                className="select select-bordered focus:outline-none bg-white shadow-sm"
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
            >
                <option value="all">All Time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="range">Custom Range</option>
            </select>

            {filterType === 'daily' && (
                <input 
                    type="date" 
                    className="input input-bordered focus:outline-none bg-white shadow-sm" 
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                />
            )}

            {filterType === 'weekly' && (
                <input 
                    type="week" 
                    className="input input-bordered focus:outline-none bg-white shadow-sm" 
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                />
            )}

            {filterType === 'monthly' && (
                <input 
                    type="month" 
                    className="input input-bordered focus:outline-none bg-white shadow-sm" 
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                />
            )}

            {filterType === 'yearly' && (
                <input 
                    type="number" 
                    placeholder="YYYY"
                    min="2000"
                    max="2100"
                    className="input input-bordered focus:outline-none bg-white shadow-sm w-32" 
                    value={dateValue}
                    onChange={(e) => setDateValue(e.target.value)}
                />
            )}

            {filterType === 'range' && (
                <div className="flex items-center gap-2">
                    <input 
                        type="date" 
                        className="input input-bordered focus:outline-none bg-white shadow-sm" 
                        value={startDateValue}
                        onChange={(e) => setStartDateValue(e.target.value)}
                    />
                    <span className="text-gray-500 font-medium px-1">to</span>
                    <input 
                        type="date" 
                        className="input input-bordered focus:outline-none bg-white shadow-sm" 
                        value={endDateValue}
                        onChange={(e) => setEndDateValue(e.target.value)}
                    />
                </div>
            )}
        </div>
    );
};

export default DateFilterOptions;
