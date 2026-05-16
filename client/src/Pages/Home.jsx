import sales from "../assets/images/sales.png";
import purchase from "../assets/images/purchase.png";
import customer from "../assets/images/customer.png";
import invoice from "../assets/images/invoice.png";
import add_product from "../assets/images/add_product.png";
import stock_report from "../assets/images/stock_report.png";
import sales_report from "../assets/images/sales_report.png";
import purchase_report from "../assets/images/purchase_report.png";
import balance from "../assets/images/balance.png";
import logout from "../assets/images/logout.png";
import { Link } from "react-router-dom";
import { useContext, useEffect, useMemo, useState } from "react";
import { ContextData } from "../Provider";
import useAxiosSecure from "../Components/hooks/useAxiosSecure";
import { toast } from "react-toastify";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import moment from "moment";

const moneyFormatter = new Intl.NumberFormat("en-BD", {
  maximumFractionDigits: 0,
});

const formatMoney = (value) => `BDT ${moneyFormatter.format(Number(value || 0))}`;

const CustomChartTooltip = ({ active, label, payload }) => {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-md border bg-white px-4 py-3 shadow-lg">
      <p className="mb-2 font-semibold text-gray-800">
        {moment(label).format("DD MMM YYYY")}
      </p>
      <div className="space-y-1">
        {payload.map((item) => (
          <div
            key={item.dataKey}
            className="flex items-center justify-between gap-8 text-sm"
          >
            <span className="flex items-center gap-2 text-gray-600">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
            <span className="font-semibold text-gray-900">
              {formatMoney(item.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Home = () => {
  const axiosSecure = useAxiosSecure();
  const {
    mainBalance,
    logOut,
    reFetch,
    setMainBalance,
    user,
    setStock,
    setCount,
  } = useContext(ContextData);

  const [supplierDue, setSupplierDue] = useState([]);
  const [customerDue, setCustomerDue] = useState([]);
  const [totalStock, setTotalStock] = useState(0);
  const [summary, setSummary] = useState(null);
  const [chartData, setChartData] = useState([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartError, setChartError] = useState("");

  const mBalance = mainBalance[0]?.mainBalance;
  const parseBalance = parseFloat(mBalance || 0);
  const currentBalance = parseFloat(parseBalance).toLocaleString(undefined, {
    minimumFractionDigits: 2,
  });
  const monthlyTotals = useMemo(
    () =>
      chartData.reduce(
        (totals, day) => ({
          totalSale: totals.totalSale + Number(day.totalSale || 0),
          cashOnPurchase:
            totals.cashOnPurchase + Number(day.cashOnPurchase || 0),
          costing: totals.costing + Number(day.costing || 0),
        }),
        { totalSale: 0, cashOnPurchase: 0, costing: 0 }
      ),
    [chartData]
  );

  const hasChartData = useMemo(
    () =>
      chartData.some(
        (day) =>
          Number(day.totalSale || 0) ||
          Number(day.cashOnPurchase || 0) ||
          Number(day.costing || 0)
      ),
    [chartData]
  );

  // get summary data
  useEffect(() => {
    axiosSecure
      .get("/getSummary")
      .then((res) => {
        setSummary(res.data);
      })
      .catch((err) => {
        console.error("Error fetching summary:", err);
      });
  }, [reFetch]);

  // get chart data
  useEffect(() => {
    if (!user?.email) return;
    const currentMonth = moment().format("YYYY-MM");
    setChartLoading(true);
    setChartError("");
    axiosSecure
      .get("/getSalesReportSummary", {
        params: {
          userEmail: user?.email,
          month: currentMonth,
        },
      })
      .then((res) => {
        const normalizedData = Array.isArray(res.data)
          ? res.data.map((day) => ({
              date: day.date,
              totalSale: Number(day.totalSale || 0),
              cashOnPurchase: Number(day.cashOnPurchase || 0),
              costing: Number(day.costing || 0),
            }))
          : [];

        setChartData(normalizedData);
      })
      .catch((err) => {
        console.error("Error fetching chart data:", err);
        setChartError("Unable to load monthly chart data.");
        setChartData([]);
      })
      .finally(() => {
        setChartLoading(false);
      });
  }, [axiosSecure, reFetch, user?.email]);


  useEffect(() => {
    axiosSecure
      .get("/supplierTotalDueBalance", {
        params: {
          userEmail: user?.email,
        },
      })
      .then((res) => {
        setSupplierDue(res.data);
      })
      .catch((err) => {
        toast.error(err);
      });
  }, [reFetch, user]);

  useEffect(() => {
    axiosSecure
      .get("/customerTotalDueBalance", {
        params: {
          userEmail: user?.email,
        },
      })
      .then((res) => {
        setCustomerDue(res.data);
      })
      .catch((err) => {
        toast.error(err);
      });
  }, [reFetch, user]);

  // ............... get main balance
  useEffect(() => {
    axiosSecure
      .get("/mainBalance", {
        params: {
          userEmail: user?.email,
        },
      })
      .then((res) => {
        setMainBalance(res.data);
      });
  }, [reFetch, user]);

  // ......................
  // get stock balance
  useEffect(() => {
    axiosSecure
      .get(`/stockBalance`, {
        params: {
          userEmail: user?.email,
          page: 1,
          size: 20,
          search: "",
        },
      })
      .then((res) => {
        setStock(res.data.result);
        setCount(res.data.count);
        setTotalStock(res.data.totalStock); // Set total stock from response
      })
      .catch((err) => {
        toast.error(err);
      });
  }, [reFetch, user]);

  return (
    <div className="p-2">
      <div className="flex justify-between gap-2">
        <div className="w-full bg">
          <div className="flex flex-col gap-3 justify-center border px-3 py-6 shadow-lg text-center rounded-md bg-green-600 text-white">
            <h2 className="text-xl font-bold">BDT {currentBalance}</h2>
            <p>CURRENT BALANCE</p>
          </div>
        </div>
        <div className="w-full bg">
          <div className="flex flex-col gap-3 justify-center border px-3 py-6 shadow-lg text-center rounded-md bg-green-600 text-white">
            <h2 className="text-xl font-bold">
              {parseFloat(totalStock || 0).toFixed(2)}
            </h2>
            <p>CURRENT STOCK</p>
          </div>
        </div>
        <div className="w-full bg">
          <div className="flex flex-col gap-3 justify-center border px-3 py-6 shadow-lg text-center rounded-md bg-yellow-500 text-white">
            <h2 className="text-xl font-bold">
              BDT:{" "}
              {parseFloat(customerDue[0]?.customerDueBalance || 0).toFixed(2)}
            </h2>
            <p>CUSTOMER DUE</p>
          </div>
        </div>
        <div className="w-full bg">
          <div className="flex flex-col gap-3 justify-center border px-3 py-6 shadow-lg text-center rounded-md bg-red-500 text-white">
            <h2 className="text-xl font-bold">
              BDT:{" "}
              {parseFloat(supplierDue[0]?.supplierDueBalance || 0).toFixed(2)}
            </h2>
            <p>SUPPLIER DUE</p>
          </div>
        </div>
      </div>

      {/* TODAY'S SUMMARY Section */}
      <div className="mt-8 bg-white p-5 rounded-lg shadow-md border">
        <h2 className="text-center text-3xl font-bold text-gray-800 uppercase mb-8">
          TODAY'S SUMMARY ({moment().format("DD.MM.YYYY")})
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Sales Summary Card */}
          <div className="border rounded-md p-5 shadow-sm bg-gray-50">
            <h3 className="text-center text-xl font-bold border-b pb-2 mb-4 uppercase underline decoration-orange-300 underline-offset-4">
              SALES SUMMARY
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Total Sales:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.saleSummary?.totalSales || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Cash on Sale:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.saleSummary?.totalCashSales || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Total Due on Sales:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.saleSummary?.totalDue || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Due Collections on Sales:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.saleSummary?.totalCollectedDueFromSales || "0.00"}
                </span>
              </div>
            </div>
          </div>

          {/* Purchase Summary Card */}
          <div className="border rounded-md p-5 shadow-sm bg-gray-50">
            <h3 className="text-center text-xl font-bold border-b pb-2 mb-4 uppercase underline decoration-orange-300 underline-offset-4">
              PURCHASE SUMMARY
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Total Purchase:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.purchaseSummary?.totalPurchase || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Cash on Purchase:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.purchaseSummary?.totalCashPurchase || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Total Due on Purchase:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.purchaseSummary?.totalPurchaseDue || "0.00"}
                </span>
              </div>
              <div className="flex justify-between border-b border-orange-200 pb-1">
                <span className="font-semibold text-sm md:text-base">Due Given on Purchase:</span>
                <span className="font-bold text-sm md:text-base">
                  {summary?.purchaseSummary?.totalCollectedDueFromPurchases ||
                    "0.00"}
                </span>
              </div>
            </div>
          </div>

          {/* Total Expense Card */}
          <div className="border rounded-md p-5 shadow-sm bg-gray-50 flex flex-col justify-center items-center">
            <h3 className="text-center text-xl font-bold border-b w-full pb-2 mb-8 uppercase">
              TOTAL EXPENSE
            </h3>
            <div className="text-5xl font-bold text-red-500">
              {summary?.expenseSummary?.todaysCost || "0.00"}
            </div>
          </div>
        </div>
      </div>

      {/* Chart Section */}
      <div className="mt-8 bg-white p-5 rounded-lg shadow-md border">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-gray-500">
              {moment().format("MMMM YYYY")}
            </p>
            <h2 className="text-xl font-bold uppercase text-gray-900">
              Monthly Performance
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-md border border-green-100 bg-green-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase text-green-700">
                Sales
              </p>
              <p className="text-sm font-bold text-green-900">
                {formatMoney(monthlyTotals.totalSale)}
              </p>
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase text-amber-700">
                Purchase
              </p>
              <p className="text-sm font-bold text-amber-900">
                {formatMoney(monthlyTotals.cashOnPurchase)}
              </p>
            </div>
            <div className="rounded-md border border-red-100 bg-red-50 px-4 py-2">
              <p className="text-xs font-semibold uppercase text-red-700">
                Expense
              </p>
              <p className="text-sm font-bold text-red-900">
                {formatMoney(monthlyTotals.costing)}
              </p>
            </div>
          </div>
        </div>

        <div className="h-[360px] w-full sm:h-[420px]">
          {chartLoading ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm font-medium text-gray-500">
              Loading chart...
            </div>
          ) : chartError ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm font-medium text-red-500">
              {chartError}
            </div>
          ) : !hasChartData ? (
            <div className="flex h-full items-center justify-center rounded-md border border-dashed text-sm font-medium text-gray-500">
              No monthly transaction data found.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                barGap={4}
                barCategoryGap="22%"
                margin={{
                  top: 12,
                  right: 12,
                  left: 8,
                  bottom: 8,
                }}
              >
                <CartesianGrid stroke="#e5e7eb" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  minTickGap={12}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={(tick) => moment(tick).format("DD")}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  width={72}
                  tick={{ fill: "#6b7280", fontSize: 12 }}
                  tickFormatter={(value) =>
                    moneyFormatter.format(Number(value || 0))
                  }
                />
                <Tooltip cursor={{ fill: "#f3f4f6" }} content={<CustomChartTooltip />} />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ paddingTop: 12, fontSize: 13 }}
                />
                <ReferenceLine y={0} stroke="#d1d5db" />
                <Bar
                  dataKey="totalSale"
                  name="Total Sales"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="cashOnPurchase"
                  name="Total Purchase"
                  fill="#f59e0b"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
                <Bar
                  dataKey="costing"
                  name="Total Expense"
                  fill="#ef4444"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={22}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* dashboard cards */}
      <div className="grid grid-cols-5 gap-5 mt-12">
        <Link to="/sales">
          <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 hover:bg-gray-50 transition-colors">
            <img src={sales} alt="sales" className="w-[60%]" />
            <p className="text-center">Sales</p>
          </div>
        </Link>

        <Link to="purchase">
          <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
            <img src={purchase} alt="Purchase" className="w-[60%]" />
            <p className="text-center">Purchase</p>
          </div>
        </Link>

        <Link to="/customer">
          <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
            <img src={customer} alt="Customer" className="w-[60%]" />
            <p className="text-center">Customer</p>
          </div>
        </Link>

        <Link to="">
          <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
            <img src={invoice} alt="Invoice" className="w-[60%]" />
            <p className="text-center">Invoice</p>
          </div>
        </Link>
        <Link to="product">
          <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
            <img src={add_product} alt="Product" className="w-[60%]" />
            <p className="text-center">Product</p>
          </div>
        </Link>

        <Link to='currentStock' className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
          <img src={stock_report} alt="Stock Report" className="w-[60%]" />
          <p className="text-center">Stock Report</p>
        </Link>
        <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
          <img src={sales_report} alt="Sales Report" className="w-[60%]" />
          <p className="text-center">Sales Report</p>
        </div>
        <div className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
          <img
            src={purchase_report}
            alt="Purchase Report"
            className="w-[60%]"
          />
          <p className="text-center">Purchase Report</p>
        </div>
        <Link to='/balance' className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
          <img src={balance} alt="Balance" className="w-[60%]" />
          <p className="text-center">Balance</p>
        </Link>
        <div onClick={()=> logOut()} className="flex flex-col items-center py-3 px-7 rounded-lg shadow border gap-5 cursor-pointer hover:bg-gray-50 transition-colors">
          <img src={logout} alt="Purchase Report" className="w-[60%]" />
          <p className="text-center">Logout</p>
        </div>
      </div>
    </div>
  );
};

export default Home;
