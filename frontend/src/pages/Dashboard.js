import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getUsageSummary, getUsage, getAlerts, getForecasts,
  getZipAverages, getAdminStats, getWeatherForecast, getBills,
} from '../services/api';

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [zipAverages, setZipAverages] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [weather, setWeather] = useState(null);
  const [unpaidBills, setUnpaidBills] = useState([]);
  const [monthlyTrend, setMonthlyTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const zip = user?.customer?.zip_code;
    if (zip && !weather) {
      getWeatherForecast(zip).then((r) => setWeather(r.data)).catch(() => {});
    }
  }, [user?.customer?.zip_code]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (user?.role === 'customer') {
        const [summaryRes, usageRes, alertsRes, forecastsRes, zipRes, billsRes] = await Promise.all([
          getUsageSummary().catch(() => ({ data: { summary: null } })),
          getUsage().catch(() => ({ data: { usage: [] } })),
          getAlerts({ status: 'new' }).catch(() => ({ data: { alerts: [] } })),
          getForecasts().catch(() => ({ data: { forecasts: [] } })),
          getZipAverages().catch(() => ({ data: { zip_code: null, averages: [] } })),
          getBills().catch(() => ({ data: { bills: [] } })),
        ]);

        setSummary(summaryRes.data.summary);
        setAlerts(alertsRes.data.alerts || []);
        setForecasts(forecastsRes.data.forecasts?.slice(0, 5) || []);
        if (zipRes.data.zip_code) setZipAverages(zipRes.data);

        const unpaid = (billsRes.data.bills || []).filter(
          b => b.status === 'pending' || b.status === 'overdue'
        );
        setUnpaidBills(unpaid);

        // Build monthly usage trend from daily records
        const usageData = usageRes.data.usage || [];
        const monthMap = {};
        usageData.forEach(u => {
          const key = `${u.year}-${String(u.month).padStart(2, '0')}`;
          if (!monthMap[key]) monthMap[key] = { year: u.year, month: u.month, total: 0 };
          monthMap[key].total += parseFloat(u.daily_usage_ccf);
        });
        const trend = Object.values(monthMap)
          .sort((a, b) => a.year - b.year || a.month - b.month)
          .slice(-8);
        setMonthlyTrend(trend);
      } else {
        setSummary(null);
        setAlerts([]);
        setForecasts([]);
        const statsRes = await getAdminStats().catch(() => ({ data: {} }));
        setAdminStats(statsRes.data);
      }
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading your dashboard…</p>
    </div>
  );

  // ── Admin/Billing Dashboard ────────────────────────────────────────────────
  if (user?.role === 'admin' || user?.role === 'billing') {
    return (
      <div>
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Admin Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">System overview and quick actions</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="card bg-gradient-to-br from-hydro-spark-blue to-hydro-deep-aqua text-white">
            <h3 className="text-lg font-semibold mb-2">Total Records</h3>
            <p className="text-3xl font-bold">
              {adminStats?.record_count != null ? adminStats.record_count.toLocaleString() : '—'}
            </p>
            <p className="text-sm mt-2">Water usage records imported</p>
          </div>
          <div className="card bg-gradient-to-br from-hydro-green to-green-600 text-white">
            <h3 className="text-lg font-semibold mb-2">Total Accounts</h3>
            <p className="text-3xl font-bold">
              {adminStats?.customer_count != null ? adminStats.customer_count.toLocaleString() : '—'}
            </p>
            <p className="text-sm mt-2">Unique location accounts</p>
          </div>
          <div className="card bg-gradient-to-br from-teal-500 to-teal-600 text-white">
            <h3 className="text-lg font-semibold mb-2">Unique Customers</h3>
            <p className="text-3xl font-bold">
              {adminStats?.unique_customer_names != null ? adminStats.unique_customer_names.toLocaleString() : '—'}
            </p>
            <p className="text-sm mt-2">Distinct customer names</p>
          </div>
          <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
            <h3 className="text-lg font-semibold mb-2">Date Range</h3>
            <p className="text-xl font-bold">
              {adminStats?.min_year && adminStats?.max_year
                ? `${adminStats.min_year} – ${adminStats.max_year}` : '—'}
            </p>
            <p className="text-sm mt-2">
              {adminStats?.min_year && adminStats?.max_year
                ? `${adminStats.max_year - adminStats.min_year + 1} years of data`
                : 'Years of data'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card">
            <h2 className="text-xl font-bold text-hydro-deep-aqua mb-4">Quick Actions</h2>
            <div className="space-y-3">
              <button className="w-full btn-primary text-left px-4 py-3" onClick={() => window.location.href = '/admin'}>
                📊 Manage Users
              </button>
              <button className="w-full btn-primary text-left px-4 py-3" onClick={() => window.location.href = '/admin'}>
                🚨 Run Anomaly Detection
              </button>
              <button className="w-full btn-primary text-left px-4 py-3" onClick={() => window.location.href = '/admin'}>
                💰 Generate Bills
              </button>
            </div>
          </div>
          <div className="card">
            <h2 className="text-xl font-bold text-hydro-deep-aqua mb-4">System Status</h2>
            <div className="space-y-3">
              <div className="flex justify-between items-center p-3 bg-green-50 rounded">
                <span className="font-semibold">Database</span>
                <span className="text-green-600">✓ Connected</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded">
                <span className="font-semibold">API</span>
                <span className="text-green-600">✓ Running</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-green-50 rounded">
                <span className="font-semibold">ML Models</span>
                <span className="text-green-600">✓ Ready</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Customer Dashboard ─────────────────────────────────────────────────────
  const waterStatus = user?.customer?.water_status;
  const customerType = user?.customer?.customer_type;
  const ratePerCcf = summary?.rate_per_ccf || 5.72;
  const totalCcf = summary?.total_usage_ccf || 0;
  const avgDailyCcf = summary?.average_daily_ccf || 0;
  const estimatedCost = summary?.estimated_cost ?? (totalCcf * ratePerCcf);

  // Neighborhood comparison — match user's type only
  const myZipStat = zipAverages?.averages?.find(a => a.customer_type === customerType);
  const neighborAvgCcf = myZipStat?.avg_monthly_usage_ccf || 0;
  const neighborAvgBill = myZipStat?.avg_monthly_bill || 0;
  const neighborCount = myZipStat?.customer_count || 0;

  // Comparison % vs neighbors (positive = using more)
  const comparisonPct = neighborAvgCcf > 0
    ? Math.round(((totalCcf - neighborAvgCcf) / neighborAvgCcf) * 100)
    : null;

  // Bar chart helpers
  const trendMax = monthlyTrend.length > 0 ? Math.max(...monthlyTrend.map(m => m.total)) : 1;
  const latestMonth = monthlyTrend[monthlyTrend.length - 1];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>
          {user?.customer?.customer_name
            ? `Welcome, ${user.customer.customer_name.split(' ')[0]}`
            : 'Dashboard'}
        </h1>
        {customerType && (
          <p className="text-sm text-gray-400 mt-1">{customerType} account</p>
        )}
      </div>

      {/* ── Service status banners ── */}
      {waterStatus === 'shutoff' && (
        <div className="mb-6 rounded-xl border-2 border-red-400 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🚫</span>
            <div>
              <p className="text-lg font-bold text-red-700">Water Service Suspended</p>
              <p className="text-sm text-red-600 mt-1">
                Your water service has been shut off due to an outstanding balance.
                Please pay your overdue bills and contact us to restore service.
              </p>
              <a href="/pay" className="inline-block mt-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
                View & Pay Bills
              </a>
            </div>
          </div>
        </div>
      )}

      {waterStatus === 'pending_shutoff' && (
        <div className="mb-6 rounded-xl border-2 border-yellow-400 bg-yellow-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl">⚠️</span>
            <div>
              <p className="text-lg font-bold text-yellow-800">Water Shutoff Notice</p>
              <p className="text-sm text-yellow-700 mt-1">
                Your account has an overdue balance. If payment is not received, your water service
                will be shut off. Please pay your outstanding bills as soon as possible.
              </p>
              <a href="/pay" className="inline-block mt-3 text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded">
                View & Pay Bills
              </a>
            </div>
          </div>
        </div>
      )}

      {unpaidBills.length > 0 && (() => {
        const overdue = unpaidBills.filter(b => b.status === 'overdue');
        const pending = unpaidBills.filter(b => b.status === 'pending');
        const totalOwed = unpaidBills.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
        const isOverdue = overdue.length > 0;
        return (
          <div className={`mb-6 rounded-xl border-2 p-5 ${isOverdue ? 'border-red-400 bg-red-50' : 'border-yellow-400 bg-yellow-50'}`}>
            <div className="flex items-start gap-3">
              <span className="text-3xl">{isOverdue ? '🧾' : '📬'}</span>
              <div className="flex-1">
                <p className={`text-lg font-bold ${isOverdue ? 'text-red-700' : 'text-yellow-800'}`}>
                  {isOverdue
                    ? `You have ${overdue.length} overdue bill${overdue.length > 1 ? 's' : ''}`
                    : `You have ${pending.length} bill${pending.length > 1 ? 's' : ''} due`}
                </p>
                <p className={`text-sm mt-1 ${isOverdue ? 'text-red-600' : 'text-yellow-700'}`}>
                  Total outstanding: <strong>${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}</strong>
                  {overdue.length > 0 && pending.length > 0 && (
                    <span className="ml-2 text-xs">({overdue.length} overdue · {pending.length} pending)</span>
                  )}
                </p>
                <a
                  href="/pay"
                  className={`inline-block mt-3 text-sm font-semibold text-white px-4 py-2 rounded ${isOverdue ? 'bg-red-600 hover:bg-red-700' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                >
                  View & Pay Bills →
                </a>
              </div>
            </div>
          </div>
        );
      })()}

      {error && (
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {/* ── Stat cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Usage card */}
        <div className="card" style={{ borderLeft: '4px solid #0A4C78' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Usage — Last 30 Days</p>
          <p className="text-3xl font-bold text-hydro-deep-aqua">{totalCcf.toFixed(1)} <span className="text-lg font-semibold">CCF</span></p>
          <p className="text-sm text-gray-500 mt-1">≈ {Math.round(totalCcf * 748).toLocaleString()} gallons</p>
          {estimatedCost > 0 && (
            <p className="text-sm font-semibold text-gray-700 mt-0.5">
              Est. ${estimatedCost.toFixed(2)} this period
            </p>
          )}
        </div>

        {/* Daily average card */}
        <div className="card" style={{ borderLeft: '4px solid #22c55e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Daily Average</p>
          <p className="text-3xl font-bold text-green-700">{avgDailyCcf.toFixed(2)} <span className="text-lg font-semibold">CCF</span></p>
          <p className="text-sm text-gray-500 mt-1">≈ {Math.round(avgDailyCcf * 748)} gallons/day</p>
          <p className="text-sm text-gray-400 mt-0.5">
            ≈ ${(avgDailyCcf * ratePerCcf).toFixed(2)}/day at ${ratePerCcf.toFixed(2)}/CCF
          </p>
        </div>

        {/* Billing status card */}
        {(() => {
          const overdue = unpaidBills.filter(b => b.status === 'overdue');
          const pending = unpaidBills.filter(b => b.status === 'pending');
          const totalOwed = unpaidBills.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
          const nextDue = [...unpaidBills].sort((a, b) => new Date(a.due_date) - new Date(b.due_date))[0];
          const hasOverdue = overdue.length > 0;
          const hasPending = pending.length > 0;
          const accent = hasOverdue ? '#ef4444' : hasPending ? '#f59e0b' : '#22c55e';
          return (
            <div className="card" style={{ borderLeft: `4px solid ${accent}` }}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Billing Status</p>
              {unpaidBills.length === 0 ? (
                <>
                  <p className="text-3xl font-bold text-green-600">All Paid</p>
                  <p className="text-sm text-gray-400 mt-1">No outstanding balance</p>
                </>
              ) : (
                <>
                  <p className={`text-3xl font-bold ${hasOverdue ? 'text-red-600' : 'text-yellow-600'}`}>
                    ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {unpaidBills.length} unpaid bill{unpaidBills.length > 1 ? 's' : ''}
                    {hasOverdue && <span className="text-red-500 ml-1">· {overdue.length} overdue</span>}
                  </p>
                  {nextDue && (
                    <p className="text-xs text-gray-400 mt-0.5">Next due: {nextDue.due_date}</p>
                  )}
                </>
              )}
              <a href="/pay" className="text-xs text-hydro-spark-blue underline mt-1 block">View bills →</a>
            </div>
          );
        })()}
      </div>

      {/* ── Monthly usage trend bar chart ── */}
      {monthlyTrend.length > 1 && (
        <div className="card mb-6">
          <div className="flex justify-between items-start mb-4">
            <div>
              <h2 className="text-xl font-bold text-hydro-deep-aqua">Your Usage Over Time</h2>
              <p className="text-sm text-gray-400 mt-0.5">Monthly water consumption in CCF (hundred cubic feet)</p>
            </div>
            <a href="/usage" className="text-xs text-hydro-spark-blue underline mt-1">Full history →</a>
          </div>

          <div className="flex items-end gap-2" style={{ height: '120px' }}>
            {monthlyTrend.map((m, i) => {
              const isLatest = i === monthlyTrend.length - 1;
              const pct = trendMax > 0 ? (m.total / trendMax) * 100 : 0;
              return (
                <div key={`${m.year}-${m.month}`} className="flex-1 flex flex-col items-center justify-end h-full gap-1">
                  <span className="text-xs font-semibold text-gray-600"
                    style={{ fontSize: '10px', opacity: isLatest ? 1 : 0.6 }}>
                    {m.total.toFixed(1)}
                  </span>
                  <div
                    style={{
                      height: `${Math.max(pct, 4)}%`,
                      background: isLatest ? '#0A4C78' : 'rgba(10,76,120,0.25)',
                      borderRadius: '4px 4px 0 0',
                      width: '100%',
                      transition: 'height 0.3s ease',
                    }}
                  />
                </div>
              );
            })}
          </div>

          {/* X-axis labels */}
          <div className="flex gap-2 mt-1">
            {monthlyTrend.map((m, i) => {
              const isLatest = i === monthlyTrend.length - 1;
              return (
                <div key={`lbl-${m.year}-${m.month}`} className="flex-1 text-center">
                  <span className="text-xs text-gray-400" style={{ opacity: isLatest ? 1 : 0.6, fontSize: '10px' }}>
                    {MONTH_NAMES[m.month]}
                  </span>
                </div>
              );
            })}
          </div>

          {latestMonth && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex gap-4 text-sm text-gray-500 flex-wrap">
              <span>
                <span className="font-semibold text-hydro-deep-aqua">{MONTH_NAMES[latestMonth.month]} {latestMonth.year}</span>
                {' '}(most recent): {latestMonth.total.toFixed(1)} CCF
                {' '}≈ {Math.round(latestMonth.total * 748).toLocaleString()} gallons
              </span>
              {summary?.rate_per_ccf && (
                <span>Est. <strong>${(latestMonth.total * summary.rate_per_ccf).toFixed(2)}</strong></span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Neighborhood comparison (reworked) ── */}
      {myZipStat && neighborAvgCcf > 0 && (
        <div className="card mb-6">
          <h2 className="text-xl font-bold text-hydro-deep-aqua mb-1">How You Compare to Your Neighborhood</h2>
          <p className="text-sm text-gray-400 mb-4">
            {customerType} customers in ZIP code <strong>{zipAverages.zip_code}</strong>
            {neighborCount > 1 && ` · ${neighborCount} accounts`}
          </p>

          {/* Comparison bars */}
          <div className="space-y-4 mb-4">
            {/* Your usage bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-semibold text-hydro-deep-aqua">Your usage (30 days)</span>
                <span className="font-bold text-hydro-deep-aqua">{totalCcf.toFixed(1)} CCF</span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((totalCcf / Math.max(totalCcf, neighborAvgCcf)) * 100, 100)}%`,
                    background: '#0A4C78',
                  }}
                />
              </div>
            </div>

            {/* Neighbor avg bar */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600">Neighborhood average</span>
                <span className="font-semibold text-gray-600">{neighborAvgCcf.toFixed(1)} CCF</span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min((neighborAvgCcf / Math.max(totalCcf, neighborAvgCcf)) * 100, 100)}%`,
                    background: 'rgba(10,76,120,0.3)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Plain-English verdict */}
          {comparisonPct !== null && (
            <div className={`rounded-lg px-4 py-3 text-sm font-medium ${
              comparisonPct <= -10
                ? 'bg-green-50 text-green-800 border border-green-200'
                : comparisonPct >= 20
                ? 'bg-red-50 text-red-800 border border-red-200'
                : 'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              {comparisonPct <= -10
                ? `You use ${Math.abs(comparisonPct)}% less than similar customers in your area. Great work!`
                : comparisonPct >= 20
                ? `You use ${comparisonPct}% more than similar customers in your area. Consider checking for leaks or reducing usage.`
                : `Your usage is in line with similar customers in your area (within ${Math.abs(comparisonPct)}%).`}
              {neighborAvgBill > 0 && (
                <span className="block mt-1 text-xs opacity-70">
                  Neighborhood avg bill: ${neighborAvgBill.toFixed(2)}/month
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Weather Widget ── */}
      {weather && weather.days && weather.days.length > 0 && (() => {
        const today = weather.days[0];
        const colorMap = {
          red: 'from-red-500 to-red-600',
          orange: 'from-orange-500 to-orange-600',
          teal: 'from-teal-500 to-teal-600',
          blue: 'from-blue-500 to-blue-600',
          green: 'from-green-500 to-green-600',
        };
        const next5 = weather.days.slice(1, 6);
        return (
          <div className="card mb-6 border-2 border-hydro-sky-blue">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xl">🌤️</span>
              <h2 className="text-lg font-bold text-hydro-deep-aqua">Live Weather Outlook</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Open-Meteo</span>
              <span className="text-xs text-gray-400 ml-auto">📍 {weather.location} ({weather.zip_code})</span>
            </div>
            <div className="flex flex-wrap gap-4 items-start">
              <div className={`rounded-xl bg-gradient-to-br ${colorMap[today.water_impact_color] || 'from-gray-500 to-gray-600'} text-white p-4 min-w-40`}>
                <p className="text-xs font-semibold opacity-80 mb-1">Today</p>
                <p className="text-4xl font-bold">{today.max_temp_f !== null ? `${today.max_temp_f}°` : '—'}</p>
                <p className="text-sm opacity-90">Low {today.min_temp_f !== null ? `${today.min_temp_f}°F` : '—'}</p>
                <p className="text-sm opacity-90 mt-0.5">Rain: {today.precipitation_mm > 0 ? `${today.precipitation_mm}mm` : 'None'}</p>
                <div className="mt-2 bg-white bg-opacity-20 rounded px-2 py-0.5 text-xs font-bold text-center">
                  Usage: {today.water_impact}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-700 mb-1">Water Usage Impact Today</p>
                <p className="text-sm text-gray-600 mb-3">{today.water_impact_desc}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {next5.map((day) => {
                    const d = new Date(day.date + 'T12:00:00');
                    const badgeMap = {
                      red: 'bg-red-100 text-red-700',
                      orange: 'bg-orange-100 text-orange-700',
                      teal: 'bg-teal-100 text-teal-700',
                      blue: 'bg-blue-100 text-blue-700',
                      green: 'bg-green-100 text-green-700',
                    };
                    return (
                      <div key={day.date} className="text-center flex-shrink-0 w-16">
                        <p className="text-xs text-gray-500">{d.toLocaleDateString('en-US', { weekday: 'short' })}</p>
                        <p className="text-sm font-semibold">{day.max_temp_f !== null ? `${day.max_temp_f}°` : '—'}</p>
                        <p className="text-xs text-gray-400">{day.precipitation_mm > 0 ? `${day.precipitation_mm}mm` : '☀'}</p>
                        <span className={`text-xs px-1 py-0.5 rounded font-medium ${badgeMap[day.water_impact_color]}`}>
                          {day.water_impact === 'Below Normal' ? 'Low' : day.water_impact === 'Very High' ? 'V.High' : day.water_impact}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-2">
                  Full 14-day outlook on the <a href="/forecasts" className="underline text-hydro-spark-blue">Forecasts page</a>.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Alerts + Forecasts ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-bold text-hydro-deep-aqua mb-4">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-gray-500 text-sm">No active alerts — your usage looks normal.</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="p-3 bg-red-50 border-l-4 border-red-500 rounded">
                  <div className="flex justify-between">
                    <span className="font-semibold text-red-700 capitalize">{alert.alert_type}</span>
                    <span className="text-sm text-gray-600">{alert.alert_date}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    {parseFloat(alert.usage_ccf).toFixed(2)} CCF used
                    {alert.deviation_percentage != null && ` — ${Math.round(alert.deviation_percentage)}% above expected`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <h2 className="text-xl font-bold text-hydro-deep-aqua mb-4">Upcoming Forecast</h2>
          {forecasts.length === 0 ? (
            <div>
              <p className="text-gray-500 text-sm mb-4">No forecasts available yet.</p>
              <button className="btn-primary" onClick={() => window.location.href = '/forecasts'}>
                Generate Forecast
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {forecasts.slice(0, 3).map(forecast => (
                <div key={forecast.id} className="p-3 bg-hydro-sky-blue rounded">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-hydro-deep-aqua text-sm">{forecast.forecast_date}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {parseFloat(forecast.predicted_usage_ccf).toFixed(2)} CCF
                        {' '}≈ {Math.round(parseFloat(forecast.predicted_usage_ccf) * 748).toLocaleString()} gal
                      </p>
                    </div>
                    <p className="text-base font-bold text-hydro-deep-aqua">
                      ${parseFloat(forecast.predicted_amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ))}
              <a href="/forecasts" className="block text-center text-xs text-hydro-spark-blue underline pt-1">
                See full forecast →
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
