import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUsage, getUsageSummary, getTopCustomers, getAdminCharges } from '../services/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Cell
} from 'recharts';

function getDateParams(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - parseInt(days));
  return {
    start_date: start.toISOString().split('T')[0],
    end_date: end.toISOString().split('T')[0],
  };
}

function getMonthlyBreakdown(usageArr) {
  const map = {};
  for (const u of usageArr) {
    const key = u.usage_date.slice(0, 7);
    map[key] = (map[key] || 0) + parseFloat(u.daily_usage_ccf || 0);
  }
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total: parseFloat(total.toFixed(2)) }));
}

function UsageTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-gray-200 rounded shadow p-2 text-xs">
        <p className="font-semibold">{d.fullDate || d.fullName || d.date || d.name}</p>
        <p className="text-hydro-deep-aqua">{payload[0].value.toLocaleString()} CCF</p>
        {d.type && <p className="text-gray-500">{d.type}</p>}
      </div>
    );
  }
  return null;
}

function CustomerDetail({ customer, dateRange, onClear }) {
  const [usage, setUsage] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

  useEffect(() => {
    setLoadingDetail(true);
    getUsage({ ...getDateParams(dateRange), customer_id: customer.customer_id })
      .then(res => setUsage(res.data.usage || []))
      .catch(() => setUsage([]))
      .finally(() => setLoadingDetail(false));
  }, [customer.customer_id, dateRange]);

  const totalUsage = usage.reduce((s, u) => s + parseFloat(u.daily_usage_ccf || 0), 0);
  const avgDaily = usage.length > 0 ? totalUsage / usage.length : 0;
  const peakRecord = usage.reduce(
    (max, u) => parseFloat(u.daily_usage_ccf) > parseFloat(max?.daily_usage_ccf || 0) ? u : max,
    null
  );

  const dailyChart = useMemo(() => {
    if (!usage.length) return [];
    const map = {};
    for (const u of usage) {
      map[u.usage_date] = (map[u.usage_date] || 0) + parseFloat(u.daily_usage_ccf || 0);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({
        date: date.slice(5),
        fullDate: date,
        usage: parseFloat(val.toFixed(2)),
        color: val > avgDaily * 1.3 ? '#ef4444' : val > avgDaily ? '#f59e0b' : '#0ea5e9',
      }));
  }, [usage, avgDaily]);

  const monthly = getMonthlyBreakdown(usage);

  if (loadingDetail) return <div className="text-center py-8 text-gray-500">Loading customer data...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="font-semibold text-hydro-deep-aqua text-lg">{customer.customer_name}</span>
        {customer.email && <span className="text-gray-500 text-sm">{customer.email}</span>}
        {customer.customer_type && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-hydro-sky-blue text-hydro-deep-aqua font-medium">
            {customer.customer_type}
          </span>
        )}
        <button onClick={onClear} className="ml-auto text-xs text-red-500 hover:underline">
          Clear
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="p-4 bg-hydro-sky-blue rounded">
          <p className="text-xs text-gray-600">Total Usage</p>
          <p className="text-xl font-bold text-hydro-deep-aqua">{totalUsage.toFixed(2)}</p>
          <p className="text-xs text-gray-400">CCF</p>
        </div>
        <div className="p-4 bg-hydro-sky-blue rounded">
          <p className="text-xs text-gray-600">Daily Average</p>
          <p className="text-xl font-bold text-hydro-deep-aqua">{avgDaily.toFixed(2)}</p>
          <p className="text-xs text-gray-400">CCF/day</p>
        </div>
        <div className="p-4 bg-hydro-sky-blue rounded">
          <p className="text-xs text-gray-600">Peak Day</p>
          <p className="text-xl font-bold text-hydro-deep-aqua">
            {peakRecord ? parseFloat(peakRecord.daily_usage_ccf).toFixed(2) : '—'}
          </p>
          <p className="text-xs text-gray-400">{peakRecord?.usage_date || 'No data'}</p>
        </div>
        <div className="p-4 bg-hydro-sky-blue rounded">
          <p className="text-xs text-gray-600">Records</p>
          <p className="text-xl font-bold text-hydro-deep-aqua">{usage.length}</p>
          <p className="text-xs text-gray-400">days of data</p>
        </div>
      </div>

      {dailyChart.length > 0 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Daily Usage</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyChart} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={Math.max(0, Math.floor(dailyChart.length / 12) - 1)} />
              <YAxis tick={{ fontSize: 10 }} unit=" CCF" width={65} />
              <Tooltip content={<UsageTooltip />} />
              <Bar dataKey="usage" radius={[2, 2, 0, 0]}>
                {dailyChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-4 text-xs text-gray-500 mt-2">
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500 mr-1" />Normal</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 mr-1" />Above average</span>
            <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 mr-1" />30%+ above average</span>
          </div>
        </div>
      )}

      {monthly.length > 1 && (
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Monthly Breakdown</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left">
                <th className="px-4 py-2 text-gray-600">Month</th>
                <th className="px-4 py-2 text-gray-600 text-right">Total Usage (CCF)</th>
              </tr>
            </thead>
            <tbody>
              {monthly.map(({ month, total }) => (
                <tr key={month} className="border-t">
                  <td className="px-4 py-1.5">{month}</td>
                  <td className="px-4 py-1.5 text-right font-semibold">{total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h3 className="text-sm font-semibold text-gray-700 mb-2">Daily Records</h3>
      {usage.length === 0 ? (
        <p className="text-gray-500 text-sm">No records found for this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-gray-600">Date</th>
                <th className="px-4 py-2 text-left text-gray-600">Usage (CCF)</th>
                <th className="px-4 py-2 text-left text-gray-600">vs Average</th>
                <th className="px-4 py-2 text-left text-gray-600">Type</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {usage.slice(0, 100).map(r => {
                const val = parseFloat(r.daily_usage_ccf);
                const diff = avgDaily > 0 ? ((val - avgDaily) / avgDaily * 100) : 0;
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5">{r.usage_date}</td>
                    <td className="px-4 py-1.5 font-semibold">{val.toFixed(2)}</td>
                    <td className="px-4 py-1.5">
                      <span className={`text-xs font-semibold ${diff > 30 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                        {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
                      </span>
                    </td>
                    <td className="px-4 py-1.5">
                      {r.is_estimated
                        ? <span className="text-yellow-600 text-xs">Estimated</span>
                        : <span className="text-green-600 text-xs">Actual</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {usage.length > 100 && (
            <p className="text-xs text-gray-400 text-center mt-2">
              Showing first 100 of {usage.length} records
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Usage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'billing';

  const [dateRange, setDateRange] = useState('30');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Admin state
  const [topCustomers, setTopCustomers] = useState([]);
  const [allCustomers, setAllCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customerSearch, setCustomerSearch] = useState('');

  // Customer state
  const [myUsage, setMyUsage] = useState([]);
  const [mySummary, setMySummary] = useState(null);

  useEffect(() => {
    if (isAdmin) {
      loadAdminData();
    } else {
      loadCustomerData();
    }
  }, [dateRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getDateParams(dateRange);
      const [topRes, customersRes] = await Promise.all([
        getTopCustomers(params),
        getAdminCharges(),
      ]);
      setTopCustomers(topRes.data.top_customers || []);
      setAllCustomers(customersRes.data.customers || []);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  const loadCustomerData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getDateParams(dateRange);
      const [usageRes, summaryRes] = await Promise.all([
        getUsage(params),
        getUsageSummary(params).catch(() => null),
      ]);
      setMyUsage(usageRes.data.usage || []);
      if (summaryRes) setMySummary(summaryRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load usage data');
    } finally {
      setLoading(false);
    }
  };

  const filteredCustomers = useMemo(() => {
    if (!customerSearch) return [];
    const q = customerSearch.toLowerCase();
    return allCustomers
      .filter(c =>
        (c.customer_name || '').toLowerCase().includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }, [customerSearch, allCustomers]);

  const topChartData = useMemo(() =>
    topCustomers.slice(0, 15).map(c => ({
      name: c.customer_name.length > 22 ? c.customer_name.slice(0, 20) + '…' : c.customer_name,
      fullName: c.customer_name,
      usage: parseFloat(c.total_usage_ccf.toFixed(2)),
      type: c.customer_type,
    })),
    [topCustomers]
  );

  const myDailyChart = useMemo(() => {
    if (!myUsage.length) return [];
    const avg = myUsage.reduce((s, u) => s + parseFloat(u.daily_usage_ccf), 0) / myUsage.length;
    const map = {};
    for (const u of myUsage) {
      map[u.usage_date] = (map[u.usage_date] || 0) + parseFloat(u.daily_usage_ccf || 0);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, val]) => ({
        date: date.slice(5),
        fullDate: date,
        usage: parseFloat(val.toFixed(2)),
        color: val > avg * 1.3 ? '#ef4444' : val > avg ? '#f59e0b' : '#0ea5e9',
      }));
  }, [myUsage]);

  const myTotalUsage = myUsage.reduce((s, u) => s + parseFloat(u.daily_usage_ccf || 0), 0);
  const myAvgDaily = myUsage.length > 0 ? myTotalUsage / myUsage.length : 0;
  const myPeakRecord = myUsage.reduce(
    (max, u) => parseFloat(u.daily_usage_ccf) > parseFloat(max?.daily_usage_ccf || 0) ? u : max,
    null
  );
  const myMonthly = getMonthlyBreakdown(myUsage);

  if (loading) return <div className="text-center py-10">Loading usage data...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua">
          {isAdmin ? 'Usage Overview' : 'My Water Usage'}
        </h1>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="input-field w-48"
        >
          <option value="7">Last 7 Days</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="365">Last Year</option>
        </select>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {isAdmin ? (
        <>
          {/* Top customers horizontal bar chart */}
          <div className="card mb-6">
            <h2 className="text-xl font-semibold mb-4">Top 15 Customers by Usage</h2>
            {topChartData.length === 0 ? (
              <p className="text-gray-500">No usage data found for this period.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(300, topChartData.length * 30)}>
                <BarChart
                  data={topChartData}
                  layout="vertical"
                  margin={{ left: 10, right: 50, top: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => v.toLocaleString()} unit=" CCF" />
                  <YAxis type="category" dataKey="name" width={155} tick={{ fontSize: 11 }} />
                  <Tooltip content={<UsageTooltip />} />
                  <Bar dataKey="usage" fill="#004b87" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Customer detail lookup */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-1">Customer Usage Detail</h2>
            <p className="text-sm text-gray-500 mb-4">
              Search any customer to view their daily usage, trends, and breakdown
            </p>

            <div className="relative mb-6 max-w-sm">
              <input
                type="text"
                placeholder="Search by name or email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="input-field w-full"
              />
              {filteredCustomers.length > 0 && (
                <ul className="absolute z-10 w-full bg-white border border-gray-200 rounded shadow-lg mt-1 max-h-52 overflow-auto">
                  {filteredCustomers.map(c => (
                    <li
                      key={c.customer_id}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                      className="px-4 py-2 hover:bg-hydro-sky-blue cursor-pointer text-sm"
                    >
                      <span className="font-medium">{c.customer_name}</span>
                      {c.email && <span className="text-gray-400 ml-2 text-xs">{c.email}</span>}
                      {c.customer_type && <span className="text-gray-300 ml-2 text-xs">{c.customer_type}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {selectedCustomer ? (
              <CustomerDetail
                customer={selectedCustomer}
                dateRange={dateRange}
                onClear={() => setSelectedCustomer(null)}
              />
            ) : (
              <div className="py-12 text-center text-gray-400">
                Search above to view a customer's detailed usage
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          {/* Customer summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Total Usage</p>
              <p className="text-2xl font-bold text-hydro-deep-aqua">{myTotalUsage.toFixed(2)}</p>
              <p className="text-xs text-gray-400">CCF</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Daily Average</p>
              <p className="text-2xl font-bold text-hydro-deep-aqua">{myAvgDaily.toFixed(2)}</p>
              <p className="text-xs text-gray-400">CCF/day</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Peak Day</p>
              <p className="text-2xl font-bold text-hydro-deep-aqua">
                {myPeakRecord ? parseFloat(myPeakRecord.daily_usage_ccf).toFixed(2) : '—'}
              </p>
              <p className="text-xs text-gray-400">{myPeakRecord?.usage_date || 'No data'}</p>
            </div>
            <div className="card">
              <p className="text-xs text-gray-500 mb-1">Estimated Cost</p>
              <p className="text-2xl font-bold text-hydro-deep-aqua">
                {mySummary?.summary?.estimated_cost != null
                  ? `$${parseFloat(mySummary.summary.estimated_cost).toFixed(2)}`
                  : '—'}
              </p>
              {mySummary?.summary?.rate_per_ccf != null && (
                <p className="text-xs text-gray-400">
                  @ ${parseFloat(mySummary.summary.rate_per_ccf).toFixed(2)}/CCF
                </p>
              )}
            </div>
          </div>

          {/* Daily usage chart */}
          <div className="card mb-6">
            <h2 className="text-xl font-semibold mb-4">Daily Usage</h2>
            {myDailyChart.length === 0 ? (
              <p className="text-gray-500">No data for this period.</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={myDailyChart} margin={{ left: 0, right: 10, top: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10 }}
                      interval={Math.max(0, Math.floor(myDailyChart.length / 12) - 1)}
                    />
                    <YAxis tick={{ fontSize: 10 }} unit=" CCF" width={65} />
                    <Tooltip content={<UsageTooltip />} />
                    <Bar dataKey="usage" radius={[2, 2, 0, 0]}>
                      {myDailyChart.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="flex gap-4 text-xs text-gray-500 mt-2">
                  <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-sky-500 mr-1" />Normal</span>
                  <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-400 mr-1" />Above average</span>
                  <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500 mr-1" />30%+ above average</span>
                </div>
              </>
            )}
          </div>

          {/* Monthly breakdown */}
          {myMonthly.length > 0 && (
            <div className="card mb-6">
              <h2 className="text-xl font-semibold mb-4">Monthly Breakdown</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-2 text-gray-600">Month</th>
                    <th className="px-4 py-2 text-gray-600 text-right">Usage (CCF)</th>
                    {mySummary?.summary?.rate_per_ccf != null && (
                      <th className="px-4 py-2 text-gray-600 text-right">Est. Cost</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {myMonthly.map(({ month, total }) => (
                    <tr key={month} className="border-t">
                      <td className="px-4 py-2">{month}</td>
                      <td className="px-4 py-2 text-right font-semibold">{total.toLocaleString()}</td>
                      {mySummary?.summary?.rate_per_ccf != null && (
                        <td className="px-4 py-2 text-right text-hydro-deep-aqua font-semibold">
                          ${(total * parseFloat(mySummary.summary.rate_per_ccf)).toFixed(2)}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Detail records */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Usage Records</h2>
            {myUsage.length === 0 ? (
              <p className="text-gray-500">No usage data found for this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-gray-600">Date</th>
                      <th className="px-4 py-2 text-left text-gray-600">Usage (CCF)</th>
                      <th className="px-4 py-2 text-left text-gray-600">vs Average</th>
                      <th className="px-4 py-2 text-left text-gray-600">Type</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {myUsage.slice(0, 100).map(record => {
                      const val = parseFloat(record.daily_usage_ccf);
                      const diff = myAvgDaily > 0 ? ((val - myAvgDaily) / myAvgDaily * 100) : 0;
                      return (
                        <tr key={record.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">{record.usage_date}</td>
                          <td className="px-4 py-2 font-semibold">{val.toFixed(2)}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs font-semibold ${diff > 30 ? 'text-red-600' : diff > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                              {diff >= 0 ? '+' : ''}{diff.toFixed(0)}%
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            {record.is_estimated
                              ? <span className="text-yellow-600 text-xs">Estimated</span>
                              : <span className="text-green-600 text-xs">Actual</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {myUsage.length > 100 && (
                  <p className="text-xs text-gray-400 text-center mt-2">
                    Showing first 100 of {myUsage.length} records
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default Usage;
