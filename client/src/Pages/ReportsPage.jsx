import React, { useState } from 'react';
import { toast } from 'react-toastify';
import DateFilterOptions from '../Components/DateFilterOptions';
import { FaFilePdf, FaFileExcel } from 'react-icons/fa';
import useAxiosSecure from "../Components/hooks/useAxiosSecure";

const ReportsPage = () => {
    const axiosSecure = useAxiosSecure();
    const [reportType, setReportType] = useState('sales');
    const [filterType, setFilterType] = useState('all');
    const [dateValue, setDateValue] = useState('');
    const [startDateValue, setStartDateValue] = useState('');
    const [endDateValue, setEndDateValue] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const handleDownload = async (format) => {
        setIsGenerating(true);
        try {
            const response = await axiosSecure.post(
                '/api/reports/generate',
                {
                    reportType,
                    format,
                    filterType,
                    dateValue,
                    startDateValue,
                    endDateValue,
                },
                {
                    responseType: 'blob', // Important for receiving binary data
                },
            );

            // Create a blob from the response
            const blob = new Blob([response.data], {
                type:
                    format === 'pdf'
                        ? 'application/pdf'
                        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${reportType}-report.${format}`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            toast.success(
                `${format.toUpperCase()} report generated successfully!`,
            );
        } catch (error) {
            console.error('Error generating report:', error);
            toast.error('Failed to generate report.');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">
                    Generate Reports
                </h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">
                        Select Report Type
                    </h2>
                    <select
                        className="select select-bordered w-full max-w-xs focus:outline-none"
                        value={reportType}
                        onChange={(e) => setReportType(e.target.value)}
                    >
                        <option value="sales">Sales Invoice Report</option>
                        <option value="stock">Current Stock Report</option>
                        <option value="customer-ledger">Customer Ledger</option>
                        <option value="supplier-ledger">Supplier Ledger</option>
                    </select>
                </div>

                <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100">
                    <h2 className="text-xl font-semibold mb-4 text-gray-700">
                        Filter by Date
                    </h2>
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

            <div className="bg-white p-6 rounded-lg shadow-md border border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-center">
                <button
                    className="btn bg-red-500 hover:bg-red-600 text-white flex items-center gap-2"
                    onClick={() => handleDownload('pdf')}
                    disabled={isGenerating}
                >
                    <FaFilePdf />
                    {isGenerating ? 'Generating...' : 'Download PDF'}
                </button>

                <button
                    className="btn bg-green-500 hover:bg-green-600 text-white flex items-center gap-2"
                    onClick={() => handleDownload('xlsx')}
                    disabled={isGenerating}
                >
                    <FaFileExcel />
                    {isGenerating ? 'Generating...' : 'Download Excel'}
                </button>
            </div>
        </div>
    );
};

export default ReportsPage;
