import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { getUsage, getUsageSummary, getTopCustomers, getAdminCharges, adminSearchBills, updateBill, getAlerts, downloadUsage } from '../services/api';
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

const BILL_STATUS_COLOR = {
  paid:    'bg-green-100 text-green-700',
  sent:    'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-700',
};

function CustomerDetail({ customer, dateRange, onClear, canEditBills, onEditBill, updatedBillId, updatedBill }) {
  const [usage, setUsage] = useState([]);
  const [loadingDetail, setLoadingDetail] = useState(true);

  // Bills state (only loaded for billing/admin)
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);

  useEffect(() => {
    setLoadingDetail(true);
    getUsage({ ...getDateParams(dateRange), customer_id: customer.customer_id })
      .then(res => setUsage(res.data.usage || []))
      .catch(() => setUsage([]))
      .finally(() => setLoadingDetail(false));
  }, [customer.customer_id, dateRange]);

  useEffect(() => {
    if (!canEditBills) return;
    setBillsLoading(true);
    adminSearchBills({ customer_id: customer.customer_id, per_page: 20 })
      .then(res => setBills(res.data.bills || []))
      .catch(() => setBills([]))
      .finally(() => setBillsLoading(false));
  }, [customer.customer_id, canEditBills]);

  // Apply updates pushed down from parent after a save
  useEffect(() => {
    if (updatedBillId && updatedBill) {
      setBills(prev => prev.map(b => b.id === updatedBillId ? { ...b, ...updatedBill } : b));
    }
  }, [updatedBillId, updatedBill]);

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

      {canEditBills && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Bills</h3>
          {billsLoading ? (
            <p className="text-sm text-gray-400">Loading bills…</p>
          ) : bills.length === 0 ? (
            <p className="text-sm text-gray-400">No bills found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-gray-600 font-semibold">Period</th>
                    <th className="px-3 py-2 text-left text-gray-600 font-semibold">Amount</th>
                    <th className="px-3 py-2 text-left text-gray-600 font-semibold">Due Date</th>
                    <th className="px-3 py-2 text-left text-gray-600 font-semibold">Status</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {bills.map(b => (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">{b.billing_period_start} → {b.billing_period_end}</td>
                      <td className="px-3 py-2 font-semibold text-hydro-deep-aqua">${parseFloat(b.total_amount).toFixed(2)}</td>
                      <td className="px-3 py-2">{b.due_date}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${BILL_STATUS_COLOR[b.status] || 'bg-gray-100 text-gray-600'}`}>
                          {b.status.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => onEditBill(b)}
                          className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
  const [anomalyAlerts, setAnomalyAlerts] = useState([]);
  const [anomalyExpanded, setAnomalyExpanded] = useState(false);

  // Top customers chart filters
  const [topTypeFilter, setTopTypeFilter] = useState('');        // '' | 'Residential' | 'Municipal' | 'Commercial'
  const [topLimit, setTopLimit] = useState(15);                  // 15 | 25 | 50 | 0 = all

  // Download modal state
  const [showDownload, setShowDownload] = useState(false);
  const [dlFrom, setDlFrom] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().split('T')[0];
  });
  const [dlTo, setDlTo] = useState(() => new Date().toISOString().split('T')[0]);
  const [dlCustomerId, setDlCustomerId] = useState('');
  const [dlLoading, setDlLoading] = useState(false);
  const [dlError, setDlError] = useState(null);

  // Edit bill modal state (lifted here so modal renders outside .card stacking context)
  const [editingBill, setEditingBill] = useState(null);
  const [editForm, setEditForm] = useState({ total_amount: '', status: '', due_date: '' });
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState(null);
  const [savedBill, setSavedBill] = useState(null); // { id, bill } to push back into CustomerDetail

  const openEditBill = (bill) => {
    setEditingBill(bill);
    setEditForm({
      total_amount: parseFloat(bill.total_amount).toFixed(2),
      status: bill.status,
      due_date: bill.due_date,
    });
    setBillError(null);
  };

  const handleEditSave = async () => {
    setBillSaving(true);
    setBillError(null);
    try {
      const res = await updateBill(editingBill.id, editForm);
      setSavedBill({ id: editingBill.id, bill: res.data.bill });
      setEditingBill(null);
    } catch (err) {
      setBillError(err.response?.data?.error || 'Failed to save');
    } finally {
      setBillSaving(false);
    }
  };

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

  const handleDownload = async () => {
    setDlLoading(true);
    setDlError(null);
    try {
      const params = { start_date: dlFrom, end_date: dlTo };
      if (isAdmin && dlCustomerId) params.customer_id = dlCustomerId;
      const res = await downloadUsage(params);
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      // Try to extract filename from Content-Disposition header
      const cd = res.headers['content-disposition'] || '';
      const match = cd.match(/filename="?([^"]+)"?/);
      a.download = match ? match[1] : `water_usage_${dlFrom}_${dlTo}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setShowDownload(false);
    } catch (err) {
      // Blob error responses need parsing
      if (err.response?.data instanceof Blob) {
        const text = await err.response.data.text();
        try { setDlError(JSON.parse(text).error); } catch { setDlError('Download failed'); }
      } else {
        setDlError(err.response?.data?.error || 'Download failed');
      }
    } finally {
      setDlLoading(false);
    }
  };

  const loadAdminData = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = getDateParams(dateRange);
      const [topRes, customersRes, alertsRes] = await Promise.all([
        getTopCustomers({ ...params, limit: 200 }),
        getAdminCharges(),
        getAlerts({ limit: 20 }).catch(() => ({ data: { alerts: [] } })),
      ]);
      setTopCustomers(topRes.data.top_customers || []);
      setAllCustomers(customersRes.data.customers || []);
      setAnomalyAlerts(alertsRes.data.alerts || []);
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

  const topChartData = useMemo(() => {
    let filtered = topTypeFilter
      ? topCustomers.filter(c => c.customer_type === topTypeFilter)
      : topCustomers;
    if (topLimit > 0) filtered = filtered.slice(0, topLimit);
    return filtered.map(c => ({
      name: c.customer_name.length > 22 ? c.customer_name.slice(0, 20) + '…' : c.customer_name,
      fullName: c.customer_name,
      usage: parseFloat(c.total_usage_ccf.toFixed(2)),
      type: c.customer_type,
    }));
  }, [topCustomers, topTypeFilter, topLimit]);

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

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading usage data…</p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua">
          {isAdmin ? 'Usage Overview' : 'My Water Usage'}
        </h1>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setShowDownload(true); setDlError(null); }}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download CSV
          </button>
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
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {isAdmin ? (
        <>
          {/* ── Unusual Activity Panel ── */}
          {anomalyAlerts.length > 0 ? (
            <div className="mb-6 rounded-xl border-2 border-red-300 bg-red-50 overflow-hidden">
              <button
                onClick={() => setAnomalyExpanded(e => !e)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="text-base font-bold text-red-700">
                      {anomalyAlerts.length} Unusual Activity Event{anomalyAlerts.length > 1 ? 's' : ''} Detected
                    </p>
                    <p className="text-sm text-red-600">
                      Customers with usage significantly above expected levels — review may be needed
                    </p>
                  </div>
                </div>
                <span className="text-red-400 text-lg font-bold ml-4">{anomalyExpanded ? '▲' : '▼'}</span>
              </button>
              {anomalyExpanded && (
                <div className="border-t border-red-200 px-5 pb-4">
                  <div className="space-y-2 mt-3">
                    {anomalyAlerts.slice(0, 10).map(a => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between bg-white rounded-lg px-4 py-2.5 border border-red-100 cursor-pointer hover:bg-red-50 transition"
                        onClick={() => {
                          const match = allCustomers.find(c => c.customer_name === a.customer_name);
                          if (match) { setSelectedCustomer(match); setAnomalyExpanded(false); }
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            a.alert_type === 'high_usage' ? 'bg-red-100 text-red-700'
                            : a.alert_type === 'anomaly' ? 'bg-orange-100 text-orange-700'
                            : 'bg-yellow-100 text-yellow-700'
                          } capitalize`}>{a.alert_type?.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-semibold text-gray-800">{a.customer_name || 'Unknown'}</span>
                          <span className="text-xs text-gray-400">{a.alert_date}</span>
                        </div>
                        <div className="flex items-center gap-3 text-right">
                          <span className="text-sm font-semibold text-red-600">
                            {parseFloat(a.usage_ccf || 0).toFixed(1)} CCF
                          </span>
                          {a.expected_usage_ccf != null && (() => {
                            const diff = parseFloat(a.usage_ccf) - parseFloat(a.expected_usage_ccf);
                            const pct = parseFloat(a.deviation_percentage);
                            const sign = diff >= 0 ? '+' : '';
                            return (
                              <span className="text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded leading-tight text-center">
                                <span className="block">{sign}{diff.toFixed(1)} CCF</span>
                                <span className="block font-normal opacity-80">{sign}{pct.toFixed(0)}%</span>
                              </span>
                            );
                          })()}
                          <span className="text-xs text-hydro-spark-blue">View →</span>
                        </div>
                      </div>
                    ))}
                    {anomalyAlerts.length > 10 && (
                      <p className="text-xs text-gray-400 text-center pt-1">
                        Showing 10 of {anomalyAlerts.length} — see <a href="/alerts" className="underline text-hydro-spark-blue">Alerts page</a> for full list
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
              <span className="text-green-600 text-lg">✓</span>
              <p className="text-sm font-medium text-green-700">No unusual activity detected in this period</p>
            </div>
          )}

          {/* Top customers horizontal bar chart */}
          <div className="card mb-6">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <h2 className="text-xl font-semibold">
                Top {topLimit === 0 ? 'All' : topLimit} Customers by Usage
                {topTypeFilter && <span className="text-base font-normal text-gray-400 ml-2">— {topTypeFilter}</span>}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {/* Type filter */}
                <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs">
                  {[['', 'All'], ['Residential', 'Residential'], ['Municipal', 'Municipal'], ['Commercial', 'Commercial']].map(([val, label]) => (
                    <button key={val} onClick={() => setTopTypeFilter(val)} className="px-2.5 py-1"
                      style={topTypeFilter === val
                        ? { background: '#0A4C78', color: '#fff' }
                        : { background: '#fff', color: '#374151' }}
                    >{label}</button>
                  ))}
                </div>
                {/* Count limit */}
                <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs">
                  {[[15, 'Top 15'], [25, 'Top 25'], [50, 'Top 50'], [0, 'All']].map(([val, label]) => (
                    <button key={val} onClick={() => setTopLimit(val)} className="px-2.5 py-1"
                      style={topLimit === val
                        ? { background: '#0A4C78', color: '#fff' }
                        : { background: '#fff', color: '#374151' }}
                    >{label}</button>
                  ))}
                </div>
              </div>
            </div>
            {topChartData.length === 0 ? (
              <p className="text-gray-500">No usage data found for this period{topTypeFilter ? ` (${topTypeFilter})` : ''}.</p>
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
                canEditBills={isAdmin}
                onEditBill={openEditBill}
                updatedBillId={savedBill?.id}
                updatedBill={savedBill?.bill}
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

          {/* ── Unusual Activity Callout ── */}
          {(() => {
            if (!myUsage.length) return null;
            const dayMap = {};
            for (const u of myUsage) {
              dayMap[u.usage_date] = (dayMap[u.usage_date] || 0) + parseFloat(u.daily_usage_ccf || 0);
            }
            const spikes = Object.entries(dayMap)
              .map(([date, val]) => ({ date, val }))
              .filter(({ val }) => myAvgDaily > 0 && val > myAvgDaily * 1.3)
              .sort((a, b) => b.val - a.val);
            if (spikes.length === 0) {
              return (
                <div className="mb-6 flex items-center gap-2 px-4 py-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-green-600 text-lg">✓</span>
                  <p className="text-sm font-medium text-green-700">No unusual activity in this period — your usage looks normal.</p>
                </div>
              );
            }
            const worst = spikes[0];
            const worstPct = Math.round(((worst.val - myAvgDaily) / myAvgDaily) * 100);
            const isSevere = spikes.some(s => s.val > myAvgDaily * 1.75);
            return (
              <div className={`mb-6 rounded-xl border-2 p-5 ${isSevere ? 'border-red-400 bg-red-50' : 'border-amber-400 bg-amber-50'}`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{isSevere ? '🚨' : '⚠️'}</span>
                  <div className="flex-1">
                    <p className={`text-base font-bold ${isSevere ? 'text-red-700' : 'text-amber-800'}`}>
                      {spikes.length} Day{spikes.length > 1 ? 's' : ''} of Unusual Activity Detected
                    </p>
                    <p className={`text-sm mt-1 ${isSevere ? 'text-red-600' : 'text-amber-700'}`}>
                      Highest spike: <strong>{worst.date}</strong> at {worst.val.toFixed(1)} CCF
                      — <strong>+{worstPct}% above your average</strong>.
                      {isSevere && ' This may indicate a leak or other issue.'}
                    </p>
                    {spikes.length > 1 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {spikes.slice(0, 5).map(({ date, val }) => {
                          const pct = Math.round(((val - myAvgDaily) / myAvgDaily) * 100);
                          return (
                            <span
                              key={date}
                              className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                                pct >= 75
                                  ? 'bg-red-100 text-red-700 border-red-200'
                                  : 'bg-amber-100 text-amber-700 border-amber-200'
                              }`}
                            >
                              {date} · +{pct}%
                            </span>
                          );
                        })}
                        {spikes.length > 5 && (
                          <span className="text-xs text-gray-500 self-center">+{spikes.length - 5} more (see chart below)</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

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

      {/* ── Download CSV Modal ── */}
      {showDownload && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!dlLoading) setShowDownload(false); }}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 rounded-xl bg-hydro-sky-blue">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-hydro-deep-aqua" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-hydro-deep-aqua">Download Usage Data</h3>
                <p className="text-xs text-gray-400">Day-by-day breakdown exported as CSV</p>
              </div>
            </div>

            {dlError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
                {dlError}
              </div>
            )}

            <div className="space-y-4">
              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">From</label>
                  <input
                    type="date"
                    value={dlFrom}
                    onChange={e => setDlFrom(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hydro-spark-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">To</label>
                  <input
                    type="date"
                    value={dlTo}
                    onChange={e => setDlTo(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hydro-spark-blue"
                  />
                </div>
              </div>

              {/* Quick presets */}
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick select</p>
                <div className="flex flex-wrap gap-2">
                  {[
                    { label: 'Last 30 days', days: 30 },
                    { label: 'Last 90 days', days: 90 },
                    { label: 'Last 6 months', days: 180 },
                    { label: 'Last year', days: 365 },
                    { label: 'Last 2 years', days: 730 },
                  ].map(({ label, days }) => (
                    <button
                      key={days}
                      onClick={() => {
                        const end = new Date();
                        const start = new Date();
                        start.setDate(start.getDate() - days);
                        setDlTo(end.toISOString().split('T')[0]);
                        setDlFrom(start.toISOString().split('T')[0]);
                      }}
                      className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-hydro-sky-blue hover:border-hydro-spark-blue transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin: optional customer filter */}
              {isAdmin && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                    Customer (optional — leave blank for all)
                  </label>
                  <select
                    value={dlCustomerId}
                    onChange={e => setDlCustomerId(e.target.value)}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-hydro-spark-blue"
                  >
                    <option value="">All customers</option>
                    {allCustomers.slice().sort((a, b) => a.customer_name.localeCompare(b.customer_name)).map(c => (
                      <option key={c.customer_id} value={c.customer_id}>{c.customer_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* What's included note */}
              <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-xs text-gray-500 space-y-1">
                <p className="font-semibold text-gray-600">Included in export:</p>
                <p>• Date, Usage (CCF &amp; gallons), Estimated cost</p>
                <p>• % vs daily average, Reading type (Actual / Estimated)</p>
                {isAdmin && <p>• Customer name, type, and location ID</p>}
                <p>• Summary totals at the end of the file</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowDownload(false)}
                disabled={dlLoading}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDownload}
                disabled={dlLoading || !dlFrom || !dlTo}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50"
                style={{ background: '#0A4C78' }}
              >
                {dlLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Preparing…</>
                ) : (
                  <><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg> Download CSV</>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {editingBill && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!billSaving) setEditingBill(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-1">Edit Bill</h3>
            <p className="text-sm text-gray-500 mb-5">
              {editingBill.customer_name} &bull; {editingBill.billing_period_start} to {editingBill.billing_period_end}
            </p>
            {billError && (
              <p className="text-red-600 text-sm mb-3">{billError}</p>
            )}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.total_amount}
                  onChange={e => setEditForm(f => ({ ...f, total_amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Due Date</label>
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingBill(null)}
                disabled={billSaving}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={billSaving}
                className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-semibold transition disabled:opacity-50"
                style={{ background: '#0A4C78' }}
              >
                {billSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default Usage;
