import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { getWorkOrders, completeWorkOrder } from '../services/api';

const DEFAULT_RATE = 5.72;

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return iso; }
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

// ── Complete Work Order Modal ──────────────────────────────────────────────────
function CompleteModal({ order, onClose, onSuccess }) {
  const [notes, setNotes]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape' && !loading) onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, loading]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      await completeWorkOrder(order.id, { completion_notes: notes });
      onSuccess();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to complete work order');
    } finally {
      setLoading(false);
    }
  };

  const diff = parseFloat(order.usage_ccf) - parseFloat(order.expected_usage_ccf);
  const pct  = parseFloat(order.deviation_percentage);

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex',
               alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}
      onClick={() => { if (!loading) onClose(); }}
    >
      <div
        style={{ background: '#fff', borderRadius: '14px', padding: '28px', maxWidth: '500px',
                 width: '92%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <span style={{ fontSize: '22px' }}>✅</span>
          <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0A4C78', margin: 0 }}>
            Complete Work Order
          </h2>
        </div>
        <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '20px' }}>
          Mark this job as done. Billing will be notified automatically.
        </p>

        {/* Order summary */}
        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px',
                      padding: '12px 16px', marginBottom: '20px' }}>
          <p style={{ fontWeight: 700, fontSize: '14px', color: '#111', margin: '0 0 4px' }}>
            {order.customer_name}
          </p>
          {order.mailing_address && (
            <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 6px' }}>{order.mailing_address}</p>
          )}
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: '#4b5563' }}>
            <span>Alert date: <strong>{fmtDate(order.alert_date)}</strong></span>
            <span>Usage: <strong>{parseFloat(order.usage_ccf).toFixed(2)} CCF</strong></span>
            <span style={{ color: '#dc2626', fontWeight: 700 }}>
              +{diff.toFixed(2)} CCF (+{pct.toFixed(0)}%)
            </span>
          </div>
          {order.notes && (
            <p style={{ fontSize: '12px', color: '#374151', fontStyle: 'italic', marginTop: '8px',
                        borderTop: '1px solid #fca5a5', paddingTop: '8px', margin: '8px 0 0' }}>
              Dispatch notes: "{order.notes}"
            </p>
          )}
        </div>

        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, color: '#374151', marginBottom: '6px' }}>
          Completion notes <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. Found and repaired irrigation leak at backflow preventer. Meter reading confirmed."
          rows={4}
          style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px',
                   fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none',
                   fontFamily: 'inherit' }}
        />

        {error && (
          <p style={{ fontSize: '13px', color: '#dc2626', marginTop: '10px', fontWeight: 600,
                      background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '6px',
                      padding: '8px 12px' }}>
            {error}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
          <button onClick={onClose} disabled={loading}
            style={{ padding: '9px 18px', borderRadius: '8px', border: '1px solid #d1d5db',
                     background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding: '9px 18px', borderRadius: '8px', border: 'none',
                     background: loading ? '#6ee7b7' : '#059669', color: '#fff',
                     fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            {loading ? 'Completing…' : 'Mark as Complete'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
function WorkOrders() {
  const [tab, setTab]               = useState('open');   // open | completed
  const [orders, setOrders]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [completing, setCompleting] = useState(null);     // order being completed

  const load = async (status = tab) => {
    setLoading(true);
    try {
      const res = await getWorkOrders({ status });
      setOrders(res.data.work_orders || []);
    } catch (err) {
      console.error('Failed to load work orders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(tab); }, [tab]); // eslint-disable-line

  const openCount     = tab === 'open'      ? orders.length : null;
  const completedCount = tab === 'completed' ? orders.length : null;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>
            Work Orders
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Dispatched field investigations
          </p>
        </div>
        <button onClick={() => load(tab)}
          style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db',
                   background: '#fff', color: '#374151', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>
          Refresh
        </button>
      </div>

      {/* ── Tab bar ── */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '20px',
                    borderBottom: '2px solid #f0f0f0', paddingBottom: '0' }}>
        {[['open', 'Open'], ['completed', 'Completed']].map(([val, label]) => (
          <button key={val} onClick={() => setTab(val)}
            style={{
              padding: '8px 18px', fontSize: '14px', fontWeight: 600, cursor: 'pointer',
              border: 'none', background: 'none', borderBottom: tab === val ? '2px solid #0A4C78' : '2px solid transparent',
              color: tab === val ? '#0A4C78' : '#6b7280', marginBottom: '-2px', transition: 'all .15s',
            }}>
            {label}
            {val === 'open' && openCount !== null && openCount > 0 && (
              <span style={{ marginLeft: '6px', background: '#ef4444', color: '#fff',
                             fontSize: '11px', fontWeight: 700, padding: '1px 6px',
                             borderRadius: '9999px' }}>
                {openCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="hydro-spinner" />
          <p className="text-sm text-gray-400 font-medium">Loading work orders…</p>
        </div>
      ) : orders.length === 0 ? (
        <div className="card text-center py-16">
          <p style={{ fontSize: '40px', marginBottom: '12px' }}>
            {tab === 'open' ? '✅' : '📋'}
          </p>
          <p className="text-xl text-gray-600 font-semibold">
            {tab === 'open' ? 'No open work orders' : 'No completed work orders'}
          </p>
          <p className="text-sm text-gray-400 mt-2">
            {tab === 'open'
              ? 'All caught up — no dispatched investigations pending.'
              : 'Completed jobs will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const diff   = parseFloat(order.usage_ccf) - parseFloat(order.expected_usage_ccf);
            const pct    = parseFloat(order.deviation_percentage);
            const impact = diff * DEFAULT_RATE;

            return (
              <div key={order.id}
                style={{ background: '#fff', border: '1px solid #e5e7eb',
                         borderLeft: `4px solid ${tab === 'open' ? '#ef4444' : '#10b981'}`,
                         borderRadius: '10px', overflow: 'hidden',
                         boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>
                <div style={{ padding: '18px 20px' }}>

                  {/* ── Top row: customer + status ── */}
                  <div style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'flex-start', gap: '16px', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ fontSize: '16px', fontWeight: 800, color: '#111', margin: '0 0 2px' }}>
                        {order.customer_name || 'Unknown Customer'}
                      </h3>
                      {order.mailing_address && (
                        <p style={{ fontSize: '13px', color: '#6b7280', margin: 0 }}>
                          {order.mailing_address}
                          {order.zip_code && ` ${order.zip_code}`}
                        </p>
                      )}
                      <div style={{ display: 'flex', gap: '10px', marginTop: '4px', flexWrap: 'wrap' }}>
                        {order.location_id && (
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Location: <strong style={{ color: '#374151' }}>{order.location_id}</strong>
                          </span>
                        )}
                        {order.customer_type && (
                          <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                            Type: <strong style={{ color: '#374151' }}>{order.customer_type}</strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      {tab === 'open' ? (
                        <span style={{ padding: '3px 10px', background: '#fef9c3', color: '#713f12',
                                       border: '1px solid #fde68a', borderRadius: '20px',
                                       fontSize: '11px', fontWeight: 700 }}>
                          OPEN
                        </span>
                      ) : (
                        <span style={{ padding: '3px 10px', background: '#d1fae5', color: '#065f46',
                                       border: '1px solid #a7f3d0', borderRadius: '20px',
                                       fontSize: '11px', fontWeight: 700 }}>
                          COMPLETED
                        </span>
                      )}
                      {tab === 'open' && (
                        <button onClick={() => setCompleting(order)}
                          style={{ padding: '7px 16px', fontSize: '13px', fontWeight: 700,
                                   border: 'none', borderRadius: '7px', cursor: 'pointer',
                                   background: '#059669', color: '#fff' }}>
                          Complete Job
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ── Metrics grid ── */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', fontSize: '13px',
                                padding: '12px 14px', background: '#f9fafb', borderRadius: '8px',
                                marginBottom: '12px' }}>
                    <div>
                      <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Alert Date</p>
                      <p style={{ fontWeight: 700, margin: 0 }}>{fmtDate(order.alert_date)}</p>
                    </div>
                    <div>
                      <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Usage</p>
                      <p style={{ fontWeight: 700, margin: 0 }}>{parseFloat(order.usage_ccf).toFixed(2)} CCF</p>
                    </div>
                    <div>
                      <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Expected</p>
                      <p style={{ fontWeight: 700, margin: 0 }}>{parseFloat(order.expected_usage_ccf).toFixed(2)} CCF</p>
                    </div>
                    <div>
                      <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Overage</p>
                      <p style={{ fontWeight: 700, color: '#dc2626', margin: 0 }}>
                        +{diff.toFixed(2)} CCF (+{pct.toFixed(0)}%)
                      </p>
                    </div>
                    {impact > 0 && (
                      <div>
                        <p style={{ color: '#6b7280', margin: '0 0 2px' }}>Est. Bill Impact</p>
                        <p style={{ fontWeight: 700, color: '#b45309', margin: 0 }}>${impact.toFixed(2)}</p>
                      </div>
                    )}
                  </div>

                  {/* ── Dispatch notes ── */}
                  {order.notes && (
                    <div style={{ marginBottom: '10px' }}>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280',
                                  textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>
                        Dispatch Notes
                      </p>
                      <p style={{ fontSize: '13px', color: '#374151', fontStyle: 'italic',
                                  background: '#eff6ff', border: '1px solid #bfdbfe',
                                  borderRadius: '6px', padding: '8px 12px', margin: 0 }}>
                        "{order.notes}"
                      </p>
                    </div>
                  )}

                  {/* ── Completion notes (completed tab) ── */}
                  {order.completion_notes && (
                    <div>
                      <p style={{ fontSize: '11px', fontWeight: 700, color: '#6b7280',
                                  textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>
                        Completion Notes
                      </p>
                      <p style={{ fontSize: '13px', color: '#374151', fontStyle: 'italic',
                                  background: '#ecfdf5', border: '1px solid #a7f3d0',
                                  borderRadius: '6px', padding: '8px 12px', margin: 0 }}>
                        "{order.completion_notes}"
                      </p>
                    </div>
                  )}

                  {/* ── Timestamps ── */}
                  <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '11px', color: '#9ca3af' }}>
                    {order.dispatched_at && <span>Dispatched: {fmtDateTime(order.dispatched_at)}</span>}
                    {order.resolved_at   && <span>Completed: {fmtDateTime(order.resolved_at)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {completing && (
        <CompleteModal
          order={completing}
          onClose={() => setCompleting(null)}
          onSuccess={() => { setCompleting(null); load(tab); }}
        />
      )}
    </div>
  );
}

export default WorkOrders;
