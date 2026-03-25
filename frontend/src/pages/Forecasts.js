import React, { useState, useEffect } from 'react';
import { generateForecast, generateSystemForecast, getForecasts, getWeatherForecast } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

function Forecasts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'billing';

  const [forecasts, setForecasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Weather
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);

  useEffect(() => {
    if (isAdmin) {
      setLoading(false);
    } else {
      loadCustomerForecasts();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const customerZip = user?.customer?.zip_code;
    if (customerZip && !weather && !weatherLoading) {
      loadWeather(customerZip);
    }
  }, [user?.customer?.zip_code]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadWeather = async (zip) => {
    if (!zip) return;
    setWeatherLoading(true);
    try {
      const res = await getWeatherForecast(zip);
      setWeather(res.data);
    } catch {
      // non-fatal
    } finally {
      setWeatherLoading(false);
    }
  };

  const loadCustomerForecasts = async () => {
    try {
      setLoading(true);
      const response = await getForecasts();
      setForecasts(response.data.forecasts || []);
    } catch (err) {
      setError('Failed to load forecasts');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateForecast = async () => {
    try {
      setGenerating(true);
      setError(null);
      setSuccess(null);

      if (isAdmin) {
        const response = await generateSystemForecast({ months: 12 });
        setForecasts(response.data.forecasts || []);
        setSuccess('System-wide forecast generated successfully!');
      } else {
        await generateForecast({ months: 12 });
        setSuccess('Forecast generated successfully!');
        await loadCustomerForecasts();
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate forecast');
    } finally {
      setGenerating(false);
    }
  };

  const chartTitle = isAdmin
    ? 'System-Wide 12-Month Forecast (All Customers)'
    : '12-Month Water Usage Forecast';

  const chartData = {
    labels: forecasts.map(f => {
      const date = new Date(f.forecast_date);
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Predicted Usage (CCF)',
        data: forecasts.map(f => parseFloat(f.predicted_usage_ccf)),
        borderColor: '#1EA7D6',
        backgroundColor: 'rgba(30, 167, 214, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 6,
      },
      {
        label: 'Upper Confidence',
        data: forecasts.map(f => parseFloat(f.confidence_upper || f.predicted_usage_ccf)),
        borderColor: 'rgba(30, 167, 214, 0.3)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.4,
      },
      {
        label: 'Lower Confidence',
        data: forecasts.map(f => parseFloat(f.confidence_lower || f.predicted_usage_ccf)),
        borderColor: 'rgba(30, 167, 214, 0.3)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        pointRadius: 0,
        tension: 0.4,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      title: {
        display: true,
        text: chartTitle,
        font: { size: 16, weight: 'bold' },
        color: '#0A4C78'
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        callbacks: {
          label: function(context) {
            if (!isAdmin) return null; // hide exact values for customers
            let label = context.dataset.label || '';
            if (label) label += ': ';
            label += context.parsed.y.toFixed(2) + ' CCF';
            return label;
          }
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        title: { display: true, text: isAdmin ? 'Water Usage (CCF)' : 'Usage Trend', font: { size: 14, weight: 'bold' } },
        ticks: isAdmin ? {} : { display: false },
        grid: isAdmin ? {} : { display: false },
      },
      x: {
        title: { display: true, text: 'Date', font: { size: 14, weight: 'bold' } }
      }
    },
    interaction: { mode: 'nearest', axis: 'x', intersect: false }
  };

  const totalPredictedUsage = forecasts.reduce((sum, f) => sum + parseFloat(f.predicted_usage_ccf), 0);
  const totalPredictedCost = forecasts.reduce((sum, f) => sum + parseFloat(f.predicted_amount), 0);
  const avgDailyUsage = forecasts.length > 0 ? totalPredictedUsage / forecasts.length : 0;

  // Group forecasts into calendar months for customer qualitative view
  const forecastsByMonth = React.useMemo(() => {
    const map = {};
    forecasts.forEach(f => {
      const d = new Date(f.forecast_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!map[key]) map[key] = { key, label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }), days: [] };
      map[key].days.push(f);
    });
    return Object.values(map).map(m => ({
      ...m,
      totalCcf: m.days.reduce((s, f) => s + parseFloat(f.predicted_usage_ccf), 0),
      totalAmt: m.days.reduce((s, f) => s + parseFloat(f.predicted_amount), 0),
    }));
  }, [forecasts]);

  // Baseline = average monthly CCF across first 3 months (or all if fewer)
  const baselineMonths = forecastsByMonth.slice(0, 3);
  const baselineCcf = baselineMonths.length
    ? baselineMonths.reduce((s, m) => s + m.totalCcf, 0) / baselineMonths.length
    : 0;

  const getTrend = (ccf) => {
    if (!baselineCcf) return null;
    const pct = ((ccf - baselineCcf) / baselineCcf) * 100;
    if (pct <= -20) return { label: 'Much Lower',    arrow: '↓↓', bg: '#f0fdf4', border: '#86efac', color: '#166534' };
    if (pct <= -5)  return { label: 'Lower',         arrow: '↓',  bg: '#f0fdf4', border: '#86efac', color: '#15803d' };
    if (pct <   5)  return { label: 'About the Same',arrow: '→',  bg: '#f8fafc', border: '#cbd5e1', color: '#475569' };
    if (pct <  20)  return { label: 'Higher',        arrow: '↑',  bg: '#fffbeb', border: '#fcd34d', color: '#92400e' };
    return               { label: 'Much Higher',     arrow: '↑↑', bg: '#fef2f2', border: '#fca5a5', color: '#991b1b' };
  };

  const nextMonthTrend = forecastsByMonth.length ? getTrend(forecastsByMonth[0].totalCcf) : null;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading forecasts…</p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-hydro-deep-aqua">Usage Forecasts</h1>
          {isAdmin && (
            <p className="text-sm text-gray-500 mt-1">
              System-wide view — aggregated real usage across all customers
            </p>
          )}
        </div>

        <button
          onClick={handleGenerateForecast}
          disabled={generating}
          className="btn-primary"
        >
          {generating ? 'Generating...' : '📊 Generate New Forecast'}
        </button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      {generating && (
        <div className="card mb-6 text-center py-8">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-hydro-spark-blue mb-4"></div>
          <p className="text-lg font-semibold">
            {isAdmin ? 'Aggregating all customer data and generating forecast...' : 'Generating forecast using ML model...'}
          </p>
          <p className="text-sm text-gray-600 mt-2">
            {isAdmin ? 'This may take a moment with large datasets.' : 'Analyzing your usage patterns...'}
          </p>
        </div>
      )}

      {/* Weather Panel */}
      <div className="card mb-6 border-2 border-hydro-sky-blue">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-2xl">🌤️</span>
              <h2 className="text-xl font-bold text-hydro-deep-aqua">14-Day Weather & Water Usage Outlook</h2>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-semibold">Live · Open-Meteo</span>
            </div>
            <p className="text-sm text-gray-500">
              Real-time weather forecast for your service address — showing predicted impact on water demand each day.
            </p>
          </div>
          {weather && (
            <p className="text-sm text-gray-500 mt-1">
              📍 <strong>{weather.location}</strong> ({weather.zip_code})
            </p>
          )}
        </div>

        {weatherLoading && (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue mb-3"></div>
            <p className="text-sm text-gray-500">Fetching live weather data for your area...</p>
          </div>
        )}

        {!weatherLoading && !weather && (
          <div className="text-center py-8 text-gray-400">
            <p className="text-3xl mb-2">🌡️</p>
            <p className="text-sm">No service address zip code on file. Contact your administrator to update your account.</p>
          </div>
        )}

        {!weatherLoading && weather && (
          <>
            <div className="overflow-x-auto">
              <div className="flex gap-2 pb-2" style={{ minWidth: 'max-content' }}>
                {weather.days.map((day, idx) => {
                  const colorMap = {
                    red: 'bg-red-50 border-red-300',
                    orange: 'bg-orange-50 border-orange-300',
                    teal: 'bg-teal-50 border-teal-300',
                    blue: 'bg-blue-50 border-blue-300',
                    green: 'bg-green-50 border-green-300',
                  };
                  const textMap = {
                    red: 'text-red-700',
                    orange: 'text-orange-700',
                    teal: 'text-teal-700',
                    blue: 'text-blue-700',
                    green: 'text-green-700',
                  };
                  const badgeMap = {
                    red: 'bg-red-100 text-red-700',
                    orange: 'bg-orange-100 text-orange-700',
                    teal: 'bg-teal-100 text-teal-700',
                    blue: 'bg-blue-100 text-blue-700',
                    green: 'bg-green-100 text-green-700',
                  };
                  const dateObj = new Date(day.date + 'T12:00:00');
                  const label = idx === 0
                    ? 'Today'
                    : dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                  return (
                    <div
                      key={day.date}
                      title={day.water_impact_desc}
                      className={`rounded-lg border p-3 w-32 flex-shrink-0 ${colorMap[day.water_impact_color] || 'bg-gray-50 border-gray-200'} ${idx === 0 ? 'ring-2 ring-hydro-spark-blue' : ''}`}
                    >
                      <p className="text-xs font-semibold text-gray-600 mb-1">{label}</p>
                      <p className={`text-sm font-bold ${textMap[day.water_impact_color]}`}>
                        {day.max_temp_f !== null ? `${day.max_temp_f}°F` : '—'}
                      </p>
                      <p className="text-xs text-gray-500">
                        Low: {day.min_temp_f !== null ? `${day.min_temp_f}°F` : '—'}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Rain: {day.precipitation_mm > 0 ? `${day.precipitation_mm}mm` : 'None'}
                      </p>
                      {day.uv_index !== null && (
                        <p className="text-xs text-gray-400 mt-0.5">UV: {day.uv_index}</p>
                      )}
                      <div className={`mt-2 text-xs font-semibold px-1.5 py-0.5 rounded text-center ${badgeMap[day.water_impact_color]}`}>
                        {day.water_impact}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-gray-50 rounded text-xs text-gray-600">
                <strong>Impact levels:</strong> Hot, dry days (95°F+) drive the highest outdoor irrigation and cooling demand.
                Rainy or cool days typically reduce usage below baseline.
              </div>
              <div className="p-3 bg-blue-50 rounded text-xs text-blue-700">
                <strong>Today's outlook:</strong> {weather.days[0]?.water_impact_desc}
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3 text-right">
              Weather data provided by <a href="https://open-meteo.com" target="_blank" rel="noreferrer" className="underline">Open-Meteo</a> · updates daily
            </p>
          </>
        )}
      </div>

      {forecasts.length === 0 && !generating ? (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">📈</div>
          <p className="text-xl text-gray-600 mb-4">No forecast available yet</p>
          <p className="text-gray-500 mb-6">
            {isAdmin
              ? 'Generate a 12-month system-wide forecast using aggregated real usage from all customers'
              : 'Generate a 12-month forecast. New customers are estimated from regional neighbors and local weather — no prior usage needed.'}
          </p>
          <button onClick={handleGenerateForecast} className="btn-primary">
            Generate Forecast
          </button>
        </div>
      ) : forecasts.length > 0 ? (
        <div>
          {/* Summary Cards — exact for admin, qualitative for customers */}
          {isAdmin ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="card bg-gradient-to-br from-hydro-spark-blue to-hydro-deep-aqua text-white">
                <p className="text-sm mb-1 opacity-90">Total Predicted Usage</p>
                <p className="text-3xl font-bold">{totalPredictedUsage.toFixed(0)} CCF</p>
                <p className="text-xs mt-1 opacity-75">All customers · Next 12 months</p>
              </div>
              <div className="card bg-gradient-to-br from-hydro-green to-green-600 text-white">
                <p className="text-sm mb-1 opacity-90">Average Daily</p>
                <p className="text-3xl font-bold">{avgDailyUsage.toFixed(2)} CCF</p>
                <p className="text-xs mt-1 opacity-75">System-wide per day</p>
              </div>
              <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                <p className="text-sm mb-1 opacity-90">Total Estimated Revenue</p>
                <p className="text-3xl font-bold">
                  ${totalPredictedCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </p>
                <p className="text-xs mt-1 opacity-75">At default rate · Next 12 months</p>
              </div>
            </div>
          ) : nextMonthTrend && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="card" style={{ borderLeft: `4px solid ${nextMonthTrend.border}`, background: nextMonthTrend.bg }}>
                <p className="text-sm font-medium text-gray-500 mb-1">Next Month's Bill</p>
                <p className="text-3xl font-bold" style={{ color: nextMonthTrend.color }}>
                  {nextMonthTrend.arrow} {nextMonthTrend.label}
                </p>
                <p className="text-xs text-gray-400 mt-1">Compared to your recent average</p>
              </div>
              <div className="card bg-gray-50">
                <p className="text-sm font-medium text-gray-500 mb-1">12-Month Outlook</p>
                <p className="text-base font-semibold text-gray-700 mt-1">
                  {forecastsByMonth.filter(m => getTrend(m.totalCcf)?.label === 'Much Higher' || getTrend(m.totalCcf)?.label === 'Higher').length} months above average
                </p>
                <p className="text-base font-semibold text-gray-700">
                  {forecastsByMonth.filter(m => getTrend(m.totalCcf)?.label === 'Much Lower' || getTrend(m.totalCcf)?.label === 'Lower').length} months below average
                </p>
                <p className="text-xs text-gray-400 mt-1">Based on seasonal patterns</p>
              </div>
            </div>
          )}

          {/* Chart */}
          <div className="card mb-6">
            <div style={{ height: '400px' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Forecast Table — exact for admin, qualitative monthly for customers */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">
              {isAdmin ? 'Detailed Forecast Data' : 'Monthly Outlook'}
            </h2>
            {isAdmin ? (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Predicted Usage</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Est. Revenue</th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Confidence Range</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {forecasts.slice(0, 30).map((forecast, idx) => (
                      <tr key={forecast.id || idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          {new Date(forecast.forecast_date).toLocaleDateString('en-US', {
                            year: 'numeric', month: 'short', day: 'numeric'
                          })}
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-hydro-deep-aqua">
                          {parseFloat(forecast.predicted_usage_ccf).toFixed(2)} CCF
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold text-green-600">
                          ${parseFloat(forecast.predicted_amount).toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {forecast.confidence_lower && forecast.confidence_upper
                            ? `${parseFloat(forecast.confidence_lower).toFixed(2)} – ${parseFloat(forecast.confidence_upper).toFixed(2)} CCF`
                            : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {forecasts.length > 30 && (
                  <p className="text-sm text-gray-500 mt-4 text-center">
                    Showing first 30 of {forecasts.length} days
                  </p>
                )}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {forecastsByMonth.map((month, idx) => {
                  const trend = getTrend(month.totalCcf);
                  if (!trend) return null;
                  return (
                    <div key={month.key} className="flex items-center justify-between py-3 px-1">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 w-36">{month.label}</span>
                        {idx === 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                            Next month
                          </span>
                        )}
                      </div>
                      <span
                        className="text-sm font-semibold px-3 py-1 rounded-full"
                        style={{ background: trend.bg, color: trend.color, border: `1px solid ${trend.border}` }}
                      >
                        {trend.arrow} {trend.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Info Card */}
          <div className="card mt-6 bg-blue-50">
            <div className="flex items-start">
              <div className="text-3xl mr-4">ℹ️</div>
              <div className="flex-1">
                <h3 className="font-semibold text-hydro-deep-aqua mb-2">About This Forecast</h3>
                {(() => {
                  const mv = forecasts[0]?.model_version || '';
                  const isZipBaseline = mv === 'zip_baseline_weather_v1';
                  const isSystem = mv.startsWith('system_');
                  return (
                    <>
                      {isZipBaseline && (
                        <div className="mb-3 px-3 py-2 rounded-lg text-sm font-medium"
                          style={{ background: 'rgba(30,167,214,0.10)', border: '1px solid rgba(30,167,214,0.22)', color: '#0A4C78' }}>
                          New account — this forecast uses average usage from customers in your zip code with a similar account type as your starting point. It will personalise once 30+ days of your own usage are recorded.
                        </div>
                      )}
                      <p className="text-sm text-gray-700 mb-2">
                        {isSystem
                          ? 'Aggregates real daily usage across all customers, applies a weighted moving average, then blends in seasonal climate norms to project system-wide demand.'
                          : isZipBaseline
                            ? 'Regional peer data provides the daily baseline, then seasonal climate patterns and live weather data shape the curve month by month.'
                            : 'Your personal usage history drives this forecast via a weighted moving average, refined by monthly climate patterns and live 14-day weather data for your area.'}
                      </p>
                      <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                        {!isZipBaseline && !isSystem && <li>Recent usage (last 30 days) — 50% weight</li>}
                        {!isZipBaseline && !isSystem && <li>Medium-term trends (last 90 days) — 30% weight</li>}
                        {!isZipBaseline && !isSystem && <li>Long-term average (last year) — 20% weight</li>}
                        {isZipBaseline && <li>Baseline from same-zip, same account-type neighbors</li>}
                        <li>Monthly seasonal multipliers derived from US water utility climate norms</li>
                        <li>
                          {isSystem
                            ? 'Seasonal norms blended across Residential, Commercial, and Municipal types'
                            : 'Live 14-day Open-Meteo weather applied to near-term days (±12% nudge)'}
                        </li>
                      </ul>
                      <p className="text-xs text-gray-400 mt-3">
                        Model: <span className="font-medium text-gray-500">{mv || 'N/A'}</span>
                      </p>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Forecasts;
