import React, { useState, useEffect } from 'react';
import { getAlerts, acknowledgeAlert } from '../services/api';

function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    loadAlerts();
  }, [filter]);

  const loadAlerts = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { status: filter } : {};
      const response = await getAlerts(params);
      setAlerts(response.data.alerts || []);
    } catch (err) {
      console.error('Failed to load alerts', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      await loadAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
  };

  const getAlertColor = (type) => {
    const colors = {
      'spike': 'border-red-500 bg-red-50',
      'leak': 'border-orange-500 bg-orange-50',
      'unusual_pattern': 'border-yellow-500 bg-yellow-50'
    };
    return colors[type] || 'border-gray-500 bg-gray-50';
  };

  const getRiskColor = (score) => {
    if (score >= 75) return 'text-red-600';
    if (score >= 50) return 'text-orange-600';
    return 'text-yellow-600';
  };

  if (loading) return <div className="text-center py-10">Loading alerts...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua">Anomaly Alerts</h1>
        
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="input-field w-48"
        >
          <option value="all">All Alerts</option>
          <option value="new">New</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
          <p className="text-sm mb-1">New Alerts</p>
          <p className="text-3xl font-bold">{alerts.filter(a => a.status === 'new').length}</p>
        </div>
        <div className="card bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
          <p className="text-sm mb-1">Acknowledged</p>
          <p className="text-3xl font-bold">{alerts.filter(a => a.status === 'acknowledged').length}</p>
        </div>
        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
          <p className="text-sm mb-1">Resolved</p>
          <p className="text-3xl font-bold">{alerts.filter(a => a.status === 'resolved').length}</p>
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-xl text-gray-600">No alerts found</p>
          <p className="text-sm text-gray-500 mt-2">
            {filter === 'all' ? 'No anomalies detected yet' : `No ${filter} alerts`}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {alerts.map((alert) => (
            <div key={alert.id} className={`card border-l-4 ${getAlertColor(alert.alert_type)}`}>
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-gray-800 capitalize">
                      {alert.alert_type.replace('_', ' ')}
                    </h3>
                    <span className={`text-2xl font-bold ${getRiskColor(alert.risk_score)}`}>
                      Risk: {parseFloat(alert.risk_score).toFixed(0)}%
                    </span>
                  </div>

                  {(alert.customer_name || alert.customer_email) && (
                    <div className="text-sm text-gray-600 mb-2">
                      <span className="font-medium">{alert.customer_name}</span>
                      {alert.customer_email && (
                        <span className="ml-2 text-gray-400">{alert.customer_email}</span>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-600">Date</p>
                      <p className="font-semibold">{alert.alert_date}</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Usage</p>
                      <p className="font-semibold">{parseFloat(alert.usage_ccf).toFixed(2)} CCF</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Expected</p>
                      <p className="font-semibold">{parseFloat(alert.expected_usage_ccf).toFixed(2)} CCF</p>
                    </div>
                    <div>
                      <p className="text-gray-600">Deviation</p>
                      <p className="font-semibold text-red-600">
                        {parseFloat(alert.deviation_percentage).toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>

                {alert.status === 'new' && (
                  <button
                    onClick={() => handleAcknowledge(alert.id)}
                    className="btn-secondary ml-4"
                  >
                    Acknowledge
                  </button>
                )}
                
                {alert.status !== 'new' && (
                  <span className="ml-4 px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm font-semibold">
                    {alert.status.toUpperCase()}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Alerts;