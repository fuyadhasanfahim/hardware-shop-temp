import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip as RechartsTooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell
} from 'recharts';
import { HiOutlineCurrencyBangladeshi, HiOutlineCube, HiOutlineUserGroup, HiOutlineTruck } from 'react-icons/hi';
import useAxiosSecure from '../Components/hooks/useAxiosSecure';
import DateFilterOptions from '../Components/DateFilterOptions';

const DUES_COLORS = ['#ea580c', '#e11d48']; // Orange for customer, Rose for supplier

const AnalyticsDashboard = () => {
    const axiosSecure = useAxiosSecure();
    const [summaryData, setSummaryData] = useState({
        totalSalesAmount: 0,
        totalStockValue: 0,
        totalCustomerDues: 0,
        totalSupplierDues: 0,
    });
    const [isLoading, setIsLoading] = useState(true);

    const [filterType, setFilterType] = useState('all');
    const [dateValue, setDateValue] = useState('');
    const [startDateValue, setStartDateValue] = useState('');
    const [endDateValue, setEndDateValue] = useState('');

    useEffect(() => {
        let shouldFetch = true;

        if (filterType === 'range' && (!startDateValue || !endDateValue)) {
            shouldFetch = false;
        } else if (filterType !== 'all' && filterType !== 'range' && !dateValue) {
            shouldFetch = false;
        }

        if (shouldFetch) {
            fetchSummaryData();
        }
    }, [filterType, dateValue, startDateValue, endDateValue]);

    const fetchSummaryData = async () => {
        setIsLoading(true);
        try {
            const params = {
                filterType,
                dateValue,
                startDateValue,
                endDateValue,
            };
            const response = await axiosSecure.get('/api/analytics/summary', { params });
            setSummaryData(response.data);
        } catch (error) {
            console.error('Error fetching analytics:', error);
            toast.error('Failed to load analytics data');
        } finally {
            setIsLoading(false);
        }
    };

    const stats = [
        {
            title: 'Total Sales',
            value: summaryData.totalSalesAmount,
            icon: HiOutlineCurrencyBangladeshi,
            color: 'text-emerald-600',
            bg: 'bg-emerald-50',
            ring: 'ring-emerald-100',
        },
        {
            title: 'Stock Value',
            value: summaryData.totalStockValue,
            icon: HiOutlineCube,
            color: 'text-blue-600',
            bg: 'bg-blue-50',
            ring: 'ring-blue-100',
        },
        {
            title: 'Customer Dues',
            value: summaryData.totalCustomerDues,
            icon: HiOutlineUserGroup,
            color: 'text-orange-600',
            bg: 'bg-orange-50',
            ring: 'ring-orange-100',
        },
        {
            title: 'Supplier Dues',
            value: summaryData.totalSupplierDues,
            icon: HiOutlineTruck,
            color: 'text-rose-600',
            bg: 'bg-rose-50',
            ring: 'ring-rose-100',
        },
    ];

    const barData = [
        { name: 'Total Sales', amount: summaryData.totalSalesAmount, fill: '#10b981' }, // Emerald 500
        { name: 'Stock Value', amount: summaryData.totalStockValue, fill: '#3b82f6' }, // Blue 500
    ];

    const pieData = [
        { name: 'Customer Dues', value: summaryData.totalCustomerDues },
        { name: 'Supplier Dues', value: summaryData.totalSupplierDues },
    ];

    const formatYAxis = (val) => {
        if (val >= 1000000) return `৳${(val / 1000000).toFixed(1)}M`;
        if (val >= 1000) return `৳${(val / 1000).toFixed(0)}k`;
        return `৳${val}`;
    };

    return (
        <div className="p-6 md:p-10 bg-slate-50 min-h-screen font-sans">
            <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">Analytics</h1>
                    <p className="text-slate-500 mt-1">Monitor your business health and financial metrics.</p>
                </div>
                <div className="flex flex-wrap items-center gap-3 bg-white p-2.5 rounded-2xl shadow-sm border border-slate-200/60">
                    <DateFilterOptions
                        filterType={filterType}
                        setFilterType={setFilterType}
                        dateValue={dateValue}
                        setDateValue={setDateValue}
                        startDateValue={startDateValue}
                        setStartDateValue={setStartDateValue}
                        endDateValue={endDateValue}
                        setEndDateValue={setEndDateValue}
                    />
                </div>
            </div>

            {isLoading ? (
                <div className="flex justify-center items-center h-64">
                    <span className="loading loading-spinner loading-lg text-emerald-500"></span>
                </div>
            ) : (
                <div className="max-w-7xl mx-auto space-y-8">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        {stats.map((stat, idx) => (
                            <div key={idx} className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 group">
                                <div className="flex items-center justify-between mb-6">
                                    <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color} ring-4 ${stat.ring} group-hover:scale-110 transition-transform duration-300`}>
                                        <stat.icon className="w-7 h-7" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-slate-500 text-sm font-semibold mb-1 uppercase tracking-wider">{stat.title}</p>
                                    <h3 className="text-3xl font-bold text-slate-800 tracking-tight">
                                        <span className="text-slate-400 mr-1 font-medium">৳</span>
                                        {stat.value.toLocaleString()}
                                    </h3>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart Section */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Main Bar Chart */}
                        <div className="lg:col-span-2 bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100">
                            <div className="mb-8">
                                <h2 className="text-2xl font-bold text-slate-800">Financial Overview</h2>
                                <p className="text-sm text-slate-500 mt-1">Comparing Sales vs Stock Value</p>
                            </div>
                            <div className="h-80 w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis 
                                            dataKey="name" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#64748b', fontSize: 13, fontWeight: 500 }} 
                                            dy={10} 
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#64748b', fontSize: 13 }} 
                                            tickFormatter={formatYAxis} 
                                        />
                                        <RechartsTooltip 
                                            cursor={{ fill: '#f8fafc' }}
                                            contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                            formatter={(value) => [`৳${value.toLocaleString()}`, 'Amount']}
                                        />
                                        <Bar dataKey="amount" radius={[8, 8, 8, 8]} maxBarSize={60}>
                                            {barData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.fill} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Pie Chart for Dues */}
                        <div className="bg-white rounded-[2rem] p-8 shadow-sm border border-slate-100 flex flex-col">
                            <div className="mb-2">
                                <h2 className="text-2xl font-bold text-slate-800">Dues Composition</h2>
                                <p className="text-sm text-slate-500 mt-1">Customer vs Supplier Outstanding</p>
                            </div>
                            
                            <div className="flex-1 min-h-[250px] relative flex items-center justify-center">
                                {summaryData.totalCustomerDues === 0 && summaryData.totalSupplierDues === 0 ? (
                                    <div className="text-slate-400 font-medium">No Dues Recorded</div>
                                ) : (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={pieData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={70}
                                                outerRadius={100}
                                                paddingAngle={5}
                                                dataKey="value"
                                                stroke="none"
                                                cornerRadius={8}
                                            >
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={DUES_COLORS[index % DUES_COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <RechartsTooltip 
                                                contentStyle={{ borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                                                formatter={(value) => [`৳${value.toLocaleString()}`, 'Due Amount']}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                )}
                            </div>
                            
                            {/* Custom Legend */}
                            {summaryData.totalCustomerDues > 0 || summaryData.totalSupplierDues > 0 ? (
                                <div className="flex justify-center gap-6 mt-2">
                                    {pieData.map((entry, index) => (
                                        <div key={entry.name} className="flex items-center gap-2">
                                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: DUES_COLORS[index] }}></div>
                                            <span className="text-sm text-slate-600 font-medium">{entry.name}</span>
                                        </div>
                                    ))}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AnalyticsDashboard;
