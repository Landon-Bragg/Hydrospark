import React, { useState, useEffect } from 'react';
import { generateForecast, generateSystemForecast, getForecasts } from '../services/api';
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

  useEffect(() => {
    if (isAdmin) {
      // Admins generate on demand — system forecasts are not stored in the DB
      setLoading(false);
    } else {
      loadCustomerForecasts();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        title: { display: true, text: 'Water Usage (CCF)', font: { size: 14, weight: 'bold' } }
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

  if (loading) return <div className="text-center py-10">Loading forecasts...</div>;

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

      {forecasts.length === 0 && !generating ? (
        <div className="card text-center py-12">
          <div className="text-6xl mb-4">📈</div>
          <p className="text-xl text-gray-600 mb-4">No forecast available yet</p>
          <p className="text-gray-500 mb-6">
            {isAdmin
              ? 'Generate a 12-month system-wide forecast using aggregated real usage from all customers'
              : 'Generate a 12-month forecast using our ML model'}
          </p>
          <button onClick={handleGenerateForecast} className="btn-primary">
            Generate Forecast
          </button>
        </div>
      ) : forecasts.length > 0 ? (
        <div>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card bg-gradient-to-br from-hydro-spark-blue to-hydro-deep-aqua text-white">
              <p className="text-sm mb-1 opacity-90">Total Predicted Usage</p>
              <p className="text-3xl font-bold">{totalPredictedUsage.toFixed(0)} CCF</p>
              <p className="text-xs mt-1 opacity-75">
                {isAdmin ? 'All customers · Next 12 months' : 'Next 12 months'}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-hydro-green to-green-600 text-white">
              <p className="text-sm mb-1 opacity-90">Average Daily</p>
              <p className="text-3xl font-bold">{avgDailyUsage.toFixed(2)} CCF</p>
              <p className="text-xs mt-1 opacity-75">
                {isAdmin ? 'System-wide per day' : 'Per day forecast'}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-purple-500 to-purple-600 text-white">
              <p className="text-sm mb-1 opacity-90">
                {isAdmin ? 'Total Estimated Revenue' : 'Total Estimated Cost'}
              </p>
              <p className="text-3xl font-bold">
                ${totalPredictedCost.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs mt-1 opacity-75">
                {isAdmin ? 'At default rate · Next 12 months' : 'Next 12 months'}
              </p>
            </div>
          </div>

          {/* Chart */}
          <div className="card mb-6">
            <div style={{ height: '400px' }}>
              <Line data={chartData} options={chartOptions} />
            </div>
          </div>

          {/* Forecast Table */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Detailed Forecast Data</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">Predicted Usage</th>
                    <th className="px-4 py-3 text-left text-sm font-semibold text-gray-700">
                      {isAdmin ? 'Est. Revenue' : 'Estimated Cost'}
                    </th>
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
                        {forecast.confidence_lower && forecast.confidence_upper ? (
                          `${parseFloat(forecast.confidence_lower).toFixed(2)} – ${parseFloat(forecast.confidence_upper).toFixed(2)} CCF`
                        ) : 'N/A'}
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
          </div>

          {/* Info Card */}
          <div className="card mt-6 bg-blue-50">
            <div className="flex items-start">
              <div className="text-3xl mr-4">ℹ️</div>
              <div>
                <h3 className="font-semibold text-hydro-deep-aqua mb-2">About This Forecast</h3>
                <p className="text-sm text-gray-700 mb-2">
                  {isAdmin
                    ? 'This forecast aggregates real daily usage across all customers, summed by date, then applies a weighted moving average to project total system demand.'
                    : 'This forecast uses a weighted moving average algorithm that analyzes your historical usage patterns to predict future consumption.'}
                </p>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  <li>Recent usage trends (last 30 days weighted 50%)</li>
                  <li>Medium-term trends (last 90 days weighted 30%)</li>
                  <li>Long-term average (last year weighted 20%)</li>
                  <li>Seasonal variation applied via sine-wave adjustment</li>
                </ul>
                <p className="text-xs text-gray-600 mt-3">
                  Model version: {forecasts[0]?.model_version || 'N/A'}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default Forecasts;
