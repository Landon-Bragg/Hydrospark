import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { getAlerts, acknowledgeAlert, dispatchAlert, applyBillAdjustment } from '../services/api';

// ── Suggested credit helper ───────────────────────────────────────────────────
// Uses the default $5.72/CCF rate as a rough estimate; admin can override.
const DEFAULT_RATE = 5.72;

function suggestedCredit(alert) {
  const excess = Math.max(0, parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf));
  return (excess * DEFAULT_RATE).toFixed(2);
}

// ── Shared modal shell ────────────────────────────────────────────────────────
function Modal({ onClose, children }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={onClose}
    >
      <div
        style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '500px',
                 width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── Alert summary row shown inside both modals ────────────────────────────────
function AlertSummary({ alert }) {
  const diff = parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf);
  const sign = diff >= 0 ? '+' : '';
  const pct  = parseFloat(alert.deviation_percentage);
  return (
    <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
                  padding: '12px 16px', marginBottom: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div>
          {alert.customer_name && (
            <p style={{ fontWeight: 700, fontSize: '14px', color: '#111', margin: 0 }}>{alert.customer_name}</p>
          )}
          <p style={{ fontSize: '13px', color: '#6b7280', margin: '2px 0 0' }}>
            {alert.alert_date} &middot; <span style={{ textTransform: 'capitalize' }}>{alert.alert_type.replace('_', ' ')}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontWeight: 700, fontSize: '14px', color: '#dc2626', margin: 0 }}>
            {sign}{diff.toFixed(2)} CCF
          </p>
          <p style={{ fontSize: '11px', color: '#9ca3af', margin: '1px 0 0' }}>
            {sign}{pct.toFixed(1)}% vs expected
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Dispatch modal ────────────────────────────────────────────────────────────
function DispatchModal({ alert, onClose, onSuccess }) {
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await dispatchAlert(alert.id, { notes });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to dispatch investigation');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={loading ? undefined : onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '22px' }}>🔧</span>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0A4C78', margin: 0 }}>
          Dispatch Investigation
        </h2>
      </div>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
        A service/investigation request will be logged and the customer will be notified.
      </p>

      <AlertSummary alert={alert} />

      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
        Investigation notes <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
      </label>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="e.g. Check meter at facility, possible irrigation leak…"
        rows={3}
        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px',
                 fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                 fontFamily: 'inherit' }}
      />

      {error && (
        <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '10px', fontWeight: 600 }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={onClose}
          disabled={loading}
          style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
                   background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600,
                   cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ padding: '9px 18px', borderRadius: '8px', border: 'none',
                   background: loading ? '#93c5fd' : '#1d4ed8', color: '#fff',
                   fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Dispatching…' : 'Dispatch Investigation'}
        </button>
      </div>
    </Modal>
  );
}

// ── Bill credit modal ─────────────────────────────────────────────────────────
function BillCreditModal({ alert, onClose, onSuccess }) {
  const suggested = suggestedCredit(alert);
  const [amount, setAmount]   = useState(suggested);
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const excess = Math.max(0, parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf));

  const handleSubmit = async () => {
    const parsed = parseFloat(amount);
    if (!parsed || parsed <= 0) { setError('Enter a valid credit amount'); return; }
    setLoading(true);
    setError(null);
    try {
      await applyBillAdjustment(alert.id, { amount: parsed, note });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply credit');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal onClose={loading ? undefined : onClose}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
        <span style={{ fontSize: '22px' }}>💳</span>
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0A4C78', margin: 0 }}>
          Apply Bill Credit
        </h2>
      </div>
      <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
        A credit will be deducted from the bill covering this alert date and the customer will be notified.
      </p>

      <AlertSummary alert={alert} />

      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
        Credit amount ($)
      </label>
      <div style={{ position: 'relative', marginBottom: '6px' }}>
        <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                       fontSize: '14px', color: '#6b7280', pointerEvents: 'none' }}>$</span>
        <input
          type="number"
          min="0.01"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px',
                   padding: '10px 12px 10px 24px', fontSize: '15px', fontWeight: 700,
                   boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
        />
      </div>
      {excess > 0 && (
        <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '16px' }}>
          Suggested: {excess.toFixed(2)} excess CCF × ${DEFAULT_RATE}/CCF = <strong>${suggested}</strong> — edit as needed
        </p>
      )}

      <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
        Reason / note <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
      </label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Confirmed leak at meter, credit for excess usage…"
        rows={2}
        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px',
                 fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                 fontFamily: 'inherit' }}
      />

      {error && (
        <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '10px', fontWeight: 600 }}>{error}</p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
        <button
          onClick={onClose}
          disabled={loading}
          style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
                   background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600,
                   cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ padding: '9px 18px', borderRadius: '8px', border: 'none',
                   background: loading ? '#6ee7b7' : '#059669', color: '#fff',
                   fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}
        >
          {loading ? 'Applying…' : `Apply $${parseFloat(amount || 0).toFixed(2)} Credit`}
        </button>
      </div>
    </Modal>
  );
}

// ── Action taken badge ────────────────────────────────────────────────────────
function ActionBadge({ alert }) {
  if (alert.action_taken === 'dispatch') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px',
                     background: '#dbeafe', color: '#1d4ed8', border: '1px solid #bfdbfe',
                     borderRadius: '20px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
        🔧 Dispatched
      </span>
    );
  }
  if (alert.action_taken === 'bill_adjustment') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '3px 10px',
                     background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0',
                     borderRadius: '20px', fontSize: '11px', fontWeight: 700, whiteSpace: 'nowrap' }}>
        💳 ${parseFloat(alert.bill_adjustment_amount || 0).toFixed(2)} Credit
      </span>
    );
  }
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────
function Alerts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'billing';

  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  // Modal state
  const [dispatchTarget, setDispatchTarget]   = useState(null);   // alert | null
  const [creditTarget, setCreditTarget]       = useState(null);   // alert | null

  useEffect(() => {
    loadAlerts();
  }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading alerts…</p>
    </div>
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Anomaly Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">Usage spikes, leaks, and unusual patterns</p>
        </div>

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
              <div className="flex justify-between items-start gap-4">
                {/* Left: alert details */}
                <div className="flex-1 min-w-0">
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
                      {(() => {
                        const diff = parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf);
                        const pct  = parseFloat(alert.deviation_percentage);
                        const sign = diff >= 0 ? '+' : '';
                        return (
                          <>
                            <p className="font-bold text-red-600">
                              {sign}{diff.toFixed(2)} CCF
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {sign}{pct.toFixed(1)}% vs expected
                            </p>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Notes from a previous action */}
                  {alert.notes && (
                    <p className="mt-3 text-xs text-gray-500 italic bg-white border border-gray-100 rounded px-3 py-2">
                      Note: {alert.notes}
                    </p>
                  )}
                </div>

                {/* Right: status, badges, action buttons */}
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {/* Status badge */}
                  {alert.status === 'new' && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      className="btn-secondary"
                    >
                      Acknowledge
                    </button>
                  )}
                  {alert.status !== 'new' && (
                    <span className="px-3 py-1 bg-gray-200 text-gray-700 rounded text-sm font-semibold">
                      {alert.status.toUpperCase()}
                    </span>
                  )}

                  {/* Action taken badge */}
                  <ActionBadge alert={alert} />

                  {/* Admin workflow buttons */}
                  {isAdmin && alert.status !== 'resolved' && (
                    <div className="flex gap-1.5 mt-1">
                      {alert.action_taken !== 'dispatch' && (
                        <button
                          onClick={() => setDispatchTarget(alert)}
                          style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                                   border: '1px solid #93c5fd', color: '#1d4ed8',
                                   borderRadius: '6px', background: '#eff6ff', cursor: 'pointer',
                                   whiteSpace: 'nowrap' }}
                        >
                          🔧 Dispatch
                        </button>
                      )}
                      <button
                        onClick={() => setCreditTarget(alert)}
                        style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                                 border: '1px solid #6ee7b7', color: '#065f46',
                                 borderRadius: '6px', background: '#ecfdf5', cursor: 'pointer',
                                 whiteSpace: 'nowrap' }}
                      >
                        💳 Bill Credit
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Dispatch modal ── */}
      {dispatchTarget && (
        <DispatchModal
          alert={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onSuccess={() => { setDispatchTarget(null); loadAlerts(); }}
        />
      )}

      {/* ── Bill credit modal ── */}
      {creditTarget && (
        <BillCreditModal
          alert={creditTarget}
          onClose={() => setCreditTarget(null)}
          onSuccess={() => { setCreditTarget(null); loadAlerts(); }}
        />
      )}
    </div>
  );
}

export default Alerts;
