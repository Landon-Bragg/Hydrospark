import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getUsageSummary, getAlerts, getForecasts, getZipAverages, getAdminStats, getWeatherForecast, getBills } from '../services/api';

const TYPE_COLORS = {
  Residential: 'bg-blue-50 border-blue-200 text-blue-800',
  Municipal: 'bg-green-50 border-green-200 text-green-800',
  Commercial: 'bg-purple-50 border-purple-200 text-purple-800',
};

function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [forecasts, setForecasts] = useState([]);
  const [zipAverages, setZipAverages] = useState(null); // { zip_code, averages: [] }
  const [adminStats, setAdminStats] = useState(null);
  const [weather, setWeather] = useState(null);
  const [unpaidBills, setUnpaidBills] = useState([]);
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

      // For customers, load their data
      if (user?.role === 'customer') {
        const [summaryRes, alertsRes, forecastsRes, zipRes, billsRes] = await Promise.all([
          getUsageSummary().catch(() => ({ data: { summary: null } })),
          getAlerts({ status: 'new' }).catch(() => ({ data: { alerts: [] } })),
          getForecasts().catch(() => ({ data: { forecasts: [] } })),
          getZipAverages().catch(() => ({ data: { zip_code: null, averages: [] } })),
          getBills().catch(() => ({ data: { bills: [] } })),
        ]);
        setSummary(summaryRes.data.summary);
        setAlerts(alertsRes.data.alerts || []);
        setForecasts(forecastsRes.data.forecasts?.slice(0, 5) || []);
        if (zipRes.data.zip_code) {
          setZipAverages(zipRes.data);
        }
        const unpaid = (billsRes.data.bills || []).filter(b => b.status === 'pending' || b.status === 'overdue');
        setUnpaidBills(unpaid);
      }
      // For admin/billing, load system stats
      else {
        setSummary(null);
        setAlerts([]);
        setForecasts([]);
        const statsRes = await getAdminStats().catch(() => ({ data: {} }));
        setAdminStats(statsRes.data);
      }
    } catch (err) {
      console.error('Failed to load dashboard data', err);
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

  // Admin Dashboard
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
                ? `${adminStats.min_year} – ${adminStats.max_year}`
                : '—'}
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

  // Customer Dashboard
  const waterStatus = user?.customer?.water_status;
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>
          {user?.customer?.customer_name ? `Welcome, ${user.customer.customer_name.split(' ')[0]}` : 'Dashboard'}
        </h1>
        {user?.customer?.customer_type && (
          <p className="text-sm text-gray-400 mt-1">{user.customer.customer_type} account</p>
        )}
      </div>

      {waterStatus === 'shutoff' && (
        <div className="mb-6 rounded-xl border-2 border-red-400 bg-red-50 p-5">
          <div className="flex items-start gap-3">
            <span className="text-3xl">🚫</span>
            <div>
              <p className="text-lg font-bold text-red-700">Water Service Suspended</p>
              <p className="text-sm text-red-600 mt-1">
                Your water service has been shut off due to an outstanding balance on your account.
                Please pay your overdue bills and contact us immediately to restore service.
              </p>
              <a href="/bills" className="inline-block mt-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 px-4 py-2 rounded">
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
                will be shut off. Please pay your outstanding bills as soon as possible to avoid interruption.
              </p>
              <a href="/bills" className="inline-block mt-3 text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 px-4 py-2 rounded">
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
                  Total outstanding balance: <strong>${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                  {overdue.length > 0 && pending.length > 0 && (
                    <span className="ml-2 text-xs">({overdue.length} overdue · {pending.length} pending)</span>
                  )}
                </p>
                {isOverdue && (
                  <p className="text-xs text-red-500 mt-1">
                    Accounts with unpaid overdue bills may be subject to service interruption.
                  </p>
                )}
                <a
                  href="/bills"
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
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="card bg-gradient-to-br from-hydro-spark-blue to-hydro-deep-aqua text-white">
          <h3 className="text-lg font-semibold mb-2">Total Usage (30 days)</h3>
          <p className="text-3xl font-bold">{summary?.total_usage_ccf?.toFixed(2) || '0.00'} CCF</p>
        </div>
        
        <div className="card bg-gradient-to-br from-hydro-green to-green-600 text-white">
          <h3 className="text-lg font-semibold mb-2">Average Daily</h3>
          <p className="text-3xl font-bold">{summary?.average_daily_ccf?.toFixed(2) || '0.00'} CCF</p>
        </div>
        
        <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
          <h3 className="text-lg font-semibold mb-2">Active Alerts</h3>
          <p className="text-3xl font-bold">{alerts.length}</p>
        </div>
      </div>

      {zipAverages && zipAverages.averages.length > 0 && (
        <div className="card mb-6">
          <h2 className="text-xl font-bold text-hydro-deep-aqua mb-1">
            Neighborhood Comparison
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            Average monthly water bill for customers in ZIP code <strong>{zipAverages.zip_code}</strong>, by account type.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {['Residential', 'Municipal', 'Commercial'].map((type) => {
              const stat = zipAverages.averages.find((a) => a.customer_type === type);
              if (!stat) return null;
              return (
                <div
                  key={type}
                  className={`rounded-lg border p-4 ${TYPE_COLORS[type] || 'bg-gray-50 border-gray-200 text-gray-800'}`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide mb-2">{type}</p>
                  <p className="text-2xl font-bold">
                    ${stat.avg_monthly_bill.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                  <p className="text-sm mt-1">avg monthly bill</p>
                  <p className="text-sm mt-1">
                    {stat.avg_monthly_usage_ccf.toFixed(2)} CCF avg usage
                  </p>
                  <p className="text-xs mt-2 opacity-70">{stat.customer_count} customer{stat.customer_count !== 1 ? 's' : ''}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weather Widget */}
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
                    const badgeMap = { red: 'bg-red-100 text-red-700', orange: 'bg-orange-100 text-orange-700', teal: 'bg-teal-100 text-teal-700', blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700' };
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h2 className="text-xl font-bold text-hydro-deep-aqua mb-4">Recent Alerts</h2>
          {alerts.length === 0 ? (
            <p className="text-gray-500">No active alerts</p>
          ) : (
            <div className="space-y-3">
              {alerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="p-3 bg-red-50 border-l-4 border-red-500 rounded">
                  <div className="flex justify-between">
                    <span className="font-semibold text-red-700">{alert.alert_type}</span>
                    <span className="text-sm text-gray-600">{alert.alert_date}</span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">
                    Usage: {alert.usage_ccf} CCF ({alert.deviation_percentage}% deviation)
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
              <p className="text-gray-500 mb-4">No forecasts available</p>
              <button 
                className="btn-primary"
                onClick={() => window.location.href = '/forecasts'}
              >
                Generate Forecast
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {forecasts.slice(0, 3).map(forecast => (
                <div key={forecast.id} className="p-3 bg-hydro-sky-blue rounded">
                  <div className="flex justify-between">
                    <span className="font-semibold text-hydro-deep-aqua">{forecast.forecast_date}</span>
                    <span className="text-hydro-charcoal">{forecast.predicted_usage_ccf.toFixed(2)} CCF</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Est. Amount: ${forecast.predicted_amount.toFixed(2)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Dashboard;