import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { getAlerts, acknowledgeAlert, dispatchAlert, applyBillAdjustment, detectAnomalies } from '../services/api';

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_RATE = 5.72;
const PER_PAGE     = 25;

function dollarImpact(alert) {
  const excess = Math.max(0, parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf));
  return excess * DEFAULT_RATE;
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

// ── Alert summary row shown inside both action modals ─────────────────────────
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
  const [error, setError]   = useState(null);

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
                 fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
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
                   background: loading ? '#93c5fd' : '#1d4ed8', color: '#fff',
                   fontSize: '13px', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
          {loading ? 'Dispatching…' : 'Dispatch Investigation'}
        </button>
      </div>
    </Modal>
  );
}

// ── Bill credit modal ─────────────────────────────────────────────────────────
function BillCreditModal({ alert, onClose, onSuccess }) {
  const excess    = Math.max(0, parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf));
  const suggested = (excess * DEFAULT_RATE).toFixed(2);
  const [amount, setAmount]   = useState(suggested);
  const [note, setNote]       = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

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
        <h2 style={{ fontSize: '18px', fontWeight: 800, color: '#0A4C78', margin: 0 }}>Apply Bill Credit</h2>
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
        <input type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
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
      <textarea value={note} onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. Confirmed leak at meter, credit for excess usage…"
        rows={2}
        style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: '8px', padding: '10px 12px',
                 fontSize: '13px', resize: 'vertical', boxSizing: 'border-box', outline: 'none', fontFamily: 'inherit' }}
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

// ── Pill toggle button ────────────────────────────────────────────────────────
function Pill({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={active
        ? { background: '#0A4C78', color: '#fff', borderColor: '#0A4C78',
            padding: '4px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '9999px',
            border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }
        : { background: '#fff', color: '#374151', borderColor: '#d1d5db',
            padding: '4px 12px', fontSize: '12px', fontWeight: 600, borderRadius: '9999px',
            border: '1px solid', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all .15s' }}
    >
      {children}
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
function Alerts() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'billing';

  // Filters — all server-side
  const [statusFilter,   setStatusFilter]   = useState('');
  const [typeFilter,     setTypeFilter]     = useState('');
  const [riskFilter,     setRiskFilter]     = useState('');
  const [dateFrom,       setDateFrom]       = useState('');
  const [dateTo,         setDateTo]         = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [sortBy,         setSortBy]         = useState('date_desc');
  const [page,           setPage]           = useState(1);

  // Data
  const [alerts,    setAlerts]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [counts,    setCounts]    = useState({ new: 0, acknowledged: 0, resolved: 0 });
  const [loading,   setLoading]   = useState(true);
  const [expanded,  setExpanded]  = useState(null); // alert id for expanded detail

  // Run detection
  const [detecting,     setDetecting]     = useState(false);
  const [detectResult,  setDetectResult]  = useState(null);

  // Action modals
  const [dispatchTarget, setDispatchTarget] = useState(null);
  const [creditTarget,   setCreditTarget]   = useState(null);

  // Core fetch — accepts explicit overrides so callers can pass new values
  // before React state has flushed
  const loadAlerts = async (overrides = {}) => {
    setLoading(true);
    try {
      const p  = overrides.page        ?? page;
      const st = overrides.status      !== undefined ? overrides.status      : statusFilter;
      const ty = overrides.alert_type  !== undefined ? overrides.alert_type  : typeFilter;
      const rl = overrides.risk_level  !== undefined ? overrides.risk_level  : riskFilter;
      const df = overrides.date_from   !== undefined ? overrides.date_from   : dateFrom;
      const dt = overrides.date_to     !== undefined ? overrides.date_to     : dateTo;
      const sr = overrides.search      !== undefined ? overrides.search      : customerSearch;
      const so = overrides.sort        !== undefined ? overrides.sort        : sortBy;

      const params = { page: p, per_page: PER_PAGE, sort: so };
      if (st) params.status     = st;
      if (ty) params.alert_type = ty;
      if (rl) params.risk_level = rl;
      if (df) params.date_from  = df;
      if (dt) params.date_to    = dt;
      if (sr) params.search     = sr;

      const res = await getAlerts(params);
      setAlerts(res.data.alerts  || []);
      setTotal(res.data.total    || 0);
      setCounts(res.data.counts  || { new: 0, acknowledged: 0, resolved: 0 });
    } catch (err) {
      console.error('Failed to load alerts', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAlerts(); }, []); // eslint-disable-line

  // Debounce customer search
  const searchTimer = useRef(null);
  const handleSearchChange = (val) => {
    setCustomerSearch(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadAlerts({ search: val, page: 1 });
    }, 400);
  };

  const handleStatusFilter = (val) => { setStatusFilter(val); setPage(1); loadAlerts({ status: val, page: 1 }); };
  const handleTypeFilter   = (val) => { setTypeFilter(val);   setPage(1); loadAlerts({ alert_type: val, page: 1 }); };
  const handleRiskFilter   = (val) => { setRiskFilter(val);   setPage(1); loadAlerts({ risk_level: val, page: 1 }); };
  const handleDateFrom     = (val) => { setDateFrom(val);     setPage(1); loadAlerts({ date_from: val, page: 1 }); };
  const handleDateTo       = (val) => { setDateTo(val);       setPage(1); loadAlerts({ date_to: val, page: 1 }); };
  const handleSort         = (val) => { setSortBy(val);       setPage(1); loadAlerts({ sort: val, page: 1 }); };
  const handlePage         = (p)   => { setPage(p);                       loadAlerts({ page: p }); };

  const clearFilters = () => {
    setTypeFilter(''); setRiskFilter(''); setDateFrom(''); setDateTo(''); setCustomerSearch('');
    setPage(1);
    loadAlerts({ alert_type: '', risk_level: '', date_from: '', date_to: '', search: '', page: 1 });
  };

  const handleAcknowledge = async (alertId) => {
    try {
      await acknowledgeAlert(alertId);
      loadAlerts();
    } catch (err) {
      console.error('Failed to acknowledge alert', err);
    }
  };

  const handleRunDetection = async () => {
    setDetecting(true);
    setDetectResult(null);
    try {
      const res = await detectAnomalies();
      setDetectResult({ ok: true, count: res.data.anomalies?.length ?? 0 });
      loadAlerts();
    } catch (err) {
      setDetectResult({ ok: false, msg: err.response?.data?.error || 'Detection failed' });
    } finally {
      setDetecting(false);
    }
  };

  const hasActiveFilters = typeFilter || riskFilter || dateFrom || dateTo || customerSearch;
  const totalPages = Math.ceil(total / PER_PAGE);

  const ALERT_STYLES = {
    spike: { border: '#ef4444', bg: '#fef2f2', label: 'Spike', icon: '⚡' },
  };

  const getRiskColor = (score) => {
    if (score >= 75) return '#dc2626';
    if (score >= 50) return '#ea580c';
    return '#ca8a04';
  };

  const getRiskLabel = (score) => {
    if (score >= 75) return 'High';
    if (score >= 50) return 'Medium';
    return 'Low';
  };

  const fmtDate = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  };

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Anomaly Alerts</h1>
          <p className="text-sm text-gray-400 mt-1">Usage spikes significantly above expected levels</p>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
            <button
              onClick={handleRunDetection}
              disabled={detecting}
              style={{
                padding: '9px 18px', borderRadius: '8px', border: 'none', cursor: detecting ? 'not-allowed' : 'pointer',
                background: detecting ? '#93c5fd' : '#0A4C78', color: '#fff',
                fontSize: '13px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px',
              }}
            >
              <span style={{ fontSize: '16px' }}>🔍</span>
              {detecting ? 'Running Detection…' : 'Run Detection'}
            </button>
            {detectResult && (
              <p style={{
                fontSize: '12px', fontWeight: 600, margin: 0,
                color: detectResult.ok ? '#059669' : '#dc2626',
              }}>
                {detectResult.ok
                  ? `Detection complete — ${detectResult.count} new anomalies found`
                  : detectResult.msg}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Status summary cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white" style={{ cursor: 'pointer' }}
          onClick={() => handleStatusFilter(statusFilter === 'new' ? '' : 'new')}>
          <p className="text-sm mb-1 opacity-80">New Alerts</p>
          <p className="text-3xl font-bold">{counts.new.toLocaleString()}</p>
          {statusFilter === 'new' && <p style={{ fontSize: '10px', marginTop: '4px', opacity: .8 }}>FILTERED</p>}
        </div>
        <div className="card bg-gradient-to-br from-yellow-500 to-yellow-600 text-white" style={{ cursor: 'pointer' }}
          onClick={() => handleStatusFilter(statusFilter === 'acknowledged' ? '' : 'acknowledged')}>
          <p className="text-sm mb-1 opacity-80">Acknowledged</p>
          <p className="text-3xl font-bold">{counts.acknowledged.toLocaleString()}</p>
          {statusFilter === 'acknowledged' && <p style={{ fontSize: '10px', marginTop: '4px', opacity: .8 }}>FILTERED</p>}
        </div>
        <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white" style={{ cursor: 'pointer' }}
          onClick={() => handleStatusFilter(statusFilter === 'resolved' ? '' : 'resolved')}>
          <p className="text-sm mb-1 opacity-80">Resolved</p>
          <p className="text-3xl font-bold">{counts.resolved.toLocaleString()}</p>
          {statusFilter === 'resolved' && <p style={{ fontSize: '10px', marginTop: '4px', opacity: .8 }}>FILTERED</p>}
        </div>
      </div>

      {/* ── Type breakdown row ── */}

      {/* ── Filter + sort bar ── */}
      <div className="card mb-5 space-y-3">
        {/* Row 1: status + risk */}
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Status</span>
          {[['','All'],['new','New'],['acknowledged','Acknowledged'],['resolved','Resolved']].map(([val, label]) => (
            <Pill key={val} active={statusFilter === val} onClick={() => handleStatusFilter(val)}>{label}</Pill>
          ))}

          <span className="text-gray-200 mx-1 hidden sm:inline">|</span>

          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider mr-1">Risk</span>
          {[['','All'],['high','High ≥75'],['medium','Med 50–74'],['low','Low <50']].map(([val, label]) => (
            <Pill key={val} active={riskFilter === val} onClick={() => handleRiskFilter(val)}>{label}</Pill>
          ))}
        </div>

        {/* Row 2: date + search + sort + clear */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Date</span>
          <input type="date" value={dateFrom} onChange={e => handleDateFrom(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs" title="From date" />
          <span className="text-xs text-gray-400">→</span>
          <input type="date" value={dateTo} onChange={e => handleDateTo(e.target.value)}
            className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs" title="To date" />

          {isAdmin && (
            <input type="text" value={customerSearch}
              onChange={e => handleSearchChange(e.target.value)}
              placeholder="Customer name…"
              className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs w-44"
            />
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Sort</span>
            <select value={sortBy} onChange={e => handleSort(e.target.value)}
              className="border border-gray-200 rounded-lg px-2.5 py-1 text-xs bg-white">
              <option value="date_desc">Newest first</option>
              <option value="date_asc">Oldest first</option>
              <option value="risk_desc">Highest risk</option>
              <option value="risk_asc">Lowest risk</option>
            </select>

            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {/* Result count */}
        <p className="text-xs text-gray-400">
          {loading ? 'Loading…' : (
            <>
              {total.toLocaleString()} alert{total !== 1 ? 's' : ''}
              {hasActiveFilters && <span className="ml-1 text-hydro-spark-blue font-medium">(filtered)</span>}
              {totalPages > 1 && <span className="ml-1">· Page {page} of {totalPages}</span>}
            </>
          )}
        </p>
      </div>

      {/* ── Alert list ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="hydro-spinner" />
          <p className="text-sm text-gray-400 font-medium">Loading alerts…</p>
        </div>
      ) : alerts.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-xl text-gray-600">No alerts match your filters</p>
          <p className="text-sm text-gray-500 mt-2">Try adjusting the status, type, risk, or date range</p>
          {hasActiveFilters && (
            <button onClick={clearFilters} className="mt-4 text-sm text-hydro-spark-blue hover:underline font-medium">
              Clear all filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {alerts.map((alert) => {
              const style   = ALERT_STYLES[alert.alert_type] || ALERT_STYLES.spike;
              const impact  = dollarImpact(alert);
              const diff    = parseFloat(alert.usage_ccf) - parseFloat(alert.expected_usage_ccf);
              const pct     = parseFloat(alert.deviation_percentage);
              const sign    = diff >= 0 ? '+' : '';
              const isOpen  = expanded === alert.id;
              const rScore  = parseFloat(alert.risk_score);

              return (
                <div key={alert.id}
                  style={{ background: '#fff', border: `1px solid #e5e7eb`, borderLeft: `4px solid ${style.border}`,
                           borderRadius: '10px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,.06)' }}>

                  {/* ── Main row ── */}
                  <div style={{ padding: '14px 18px', display: 'flex', gap: '16px', alignItems: 'flex-start' }}>

                    {/* Left: type icon + risk badge */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                  flexShrink: 0, paddingTop: '2px' }}>
                      <span style={{ fontSize: '22px', lineHeight: 1 }}>{style.icon}</span>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: getRiskColor(rScore),
                                     background: `${getRiskColor(rScore)}18`, padding: '1px 6px',
                                     borderRadius: '4px', whiteSpace: 'nowrap' }}>
                        {getRiskLabel(rScore)} {rScore.toFixed(0)}
                      </span>
                    </div>

                    {/* Center: details */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Title row */}
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 800, color: '#111', margin: 0 }}>
                          {style.label}
                        </h3>
                        {(alert.customer_name || alert.customer_email) && (
                          <span style={{ fontSize: '13px', color: '#374151', fontWeight: 600 }}>
                            {alert.customer_name}
                            {alert.customer_email && (
                              <span style={{ fontWeight: 400, color: '#9ca3af', marginLeft: '6px' }}>{alert.customer_email}</span>
                            )}
                          </span>
                        )}
                      </div>

                      {/* Metrics row */}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', fontSize: '13px' }}>
                        <div>
                          <span style={{ color: '#6b7280' }}>Date </span>
                          <span style={{ fontWeight: 600 }}>{alert.alert_date}</span>
                        </div>
                        <div>
                          <span style={{ color: '#6b7280' }}>Usage </span>
                          <span style={{ fontWeight: 600 }}>{parseFloat(alert.usage_ccf).toFixed(2)} CCF</span>
                        </div>
                        <div>
                          <span style={{ color: '#6b7280' }}>Expected </span>
                          <span style={{ fontWeight: 600 }}>{parseFloat(alert.expected_usage_ccf).toFixed(2)} CCF</span>
                        </div>
                        <div>
                          <span style={{ color: '#6b7280' }}>Deviation </span>
                          <span style={{ fontWeight: 700, color: diff > 0 ? '#dc2626' : '#059669' }}>
                            {sign}{diff.toFixed(2)} CCF ({sign}{pct.toFixed(1)}%)
                          </span>
                        </div>
                        {impact > 0.01 && (
                          <div>
                            <span style={{ color: '#6b7280' }}>Est. Impact </span>
                            <span style={{ fontWeight: 700, color: '#b45309' }}>${impact.toFixed(2)}</span>
                          </div>
                        )}
                      </div>

                      {/* Badges row */}
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px' }}>
                        <ActionBadge alert={alert} />
                        {alert.notes && (
                          <span style={{ fontSize: '11px', color: '#6b7280', fontStyle: 'italic',
                                         background: '#f3f4f6', padding: '2px 8px', borderRadius: '4px' }}>
                            "{alert.notes.length > 60 ? alert.notes.slice(0, 60) + '…' : alert.notes}"
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right: status + actions */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                      {alert.status === 'new' && (
                        <button onClick={() => handleAcknowledge(alert.id)}
                          style={{ padding: '5px 12px', fontSize: '12px', fontWeight: 600,
                                   border: '1px solid #d1d5db', color: '#374151',
                                   borderRadius: '6px', background: '#fff', cursor: 'pointer' }}>
                          Acknowledge
                        </button>
                      )}
                      {alert.status !== 'new' && (
                        <span style={{ padding: '3px 10px', background: alert.status === 'resolved' ? '#d1fae5' : '#fef9c3',
                                       color: alert.status === 'resolved' ? '#065f46' : '#713f12',
                                       border: `1px solid ${alert.status === 'resolved' ? '#a7f3d0' : '#fde68a'}`,
                                       borderRadius: '20px', fontSize: '11px', fontWeight: 700 }}>
                          {alert.status.toUpperCase()}
                        </span>
                      )}

                      {isAdmin && alert.status !== 'resolved' && (
                        <div style={{ display: 'flex', gap: '5px' }}>
                          {alert.action_taken !== 'dispatch' && (
                            <button onClick={() => setDispatchTarget(alert)}
                              style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                                       border: '1px solid #93c5fd', color: '#1d4ed8',
                                       borderRadius: '6px', background: '#eff6ff', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              🔧 Dispatch
                            </button>
                          )}
                          {alert.action_taken !== 'bill_adjustment' && (
                            <button onClick={() => setCreditTarget(alert)}
                              style={{ padding: '5px 10px', fontSize: '11px', fontWeight: 600,
                                       border: '1px solid #6ee7b7', color: '#065f46',
                                       borderRadius: '6px', background: '#ecfdf5', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              💳 Credit
                            </button>
                          )}
                        </div>
                      )}

                      {/* Expand toggle */}
                      <button
                        onClick={() => setExpanded(isOpen ? null : alert.id)}
                        style={{ fontSize: '11px', color: '#9ca3af', background: 'none', border: 'none',
                                 cursor: 'pointer', padding: '2px 4px', marginTop: '2px' }}>
                        {isOpen ? 'Less ▲' : 'Details ▾'}
                      </button>
                    </div>
                  </div>

                  {/* ── Expanded detail panel ── */}
                  {isOpen && (
                    <div style={{ background: '#f9fafb', borderTop: '1px solid #f0f0f0', padding: '14px 18px 14px 56px' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', fontSize: '12px' }}>

                        {/* Customer context */}
                        {(alert.location_id || alert.customer_type || alert.zip_code) && (
                          <div>
                            <p style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', fontSize: '11px',
                                        textTransform: 'uppercase', letterSpacing: '.04em' }}>Customer</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', color: '#4b5563' }}>
                              {alert.location_id   && <span>Location ID: <strong>{alert.location_id}</strong></span>}
                              {alert.customer_type && <span>Type: <strong>{alert.customer_type}</strong></span>}
                              {alert.zip_code      && <span>Zip: <strong>{alert.zip_code}</strong></span>}
                            </div>
                          </div>
                        )}

                        {/* Timeline */}
                        <div>
                          <p style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', fontSize: '11px',
                                      textTransform: 'uppercase', letterSpacing: '.04em' }}>Timeline</p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', color: '#4b5563' }}>
                            {alert.created_at    && <span>Detected: <strong>{fmtDate(alert.created_at)}</strong></span>}
                            {alert.dispatched_at && <span>Dispatched: <strong>{fmtDate(alert.dispatched_at)}</strong></span>}
                            {alert.resolved_at   && <span>Resolved: <strong>{fmtDate(alert.resolved_at)}</strong></span>}
                          </div>
                        </div>

                        {/* Credit detail */}
                        {alert.bill_adjustment_amount && (
                          <div>
                            <p style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', fontSize: '11px',
                                        textTransform: 'uppercase', letterSpacing: '.04em' }}>Credit Applied</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', color: '#4b5563' }}>
                              <span>Amount: <strong style={{ color: '#059669' }}>${parseFloat(alert.bill_adjustment_amount).toFixed(2)}</strong></span>
                            </div>
                          </div>
                        )}

                        {/* Notes */}
                        {alert.notes && (
                          <div style={{ flex: '1 1 200px' }}>
                            <p style={{ fontWeight: 700, color: '#374151', marginBottom: '6px', fontSize: '11px',
                                        textTransform: 'uppercase', letterSpacing: '.04em' }}>Notes</p>
                            <p style={{ color: '#4b5563', fontStyle: 'italic', margin: 0 }}>{alert.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Pagination ── */}
          {totalPages > 1 && (
            <div className="flex justify-between items-center mt-6 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-400">
                {((page - 1) * PER_PAGE + 1).toLocaleString()}–{Math.min(page * PER_PAGE, total).toLocaleString()} of {total.toLocaleString()}
              </p>
              <div className="flex items-center gap-1">
                <button onClick={() => handlePage(1)} disabled={page === 1}
                  className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition">
                  «
                </button>
                <button onClick={() => handlePage(page - 1)} disabled={page === 1}
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">
                  ← Prev
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
                  const p = start + i;
                  if (p > totalPages) return null;
                  return (
                    <button key={p} onClick={() => handlePage(p)}
                      className="text-xs px-3 py-1.5 rounded border transition"
                      style={p === page
                        ? { background: '#0A4C78', color: '#fff', borderColor: '#0A4C78' }
                        : { background: '#fff', color: '#374151', borderColor: '#e5e7eb' }}>
                      {p}
                    </button>
                  );
                })}
                <button onClick={() => handlePage(page + 1)} disabled={page >= totalPages}
                  className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition">
                  Next →
                </button>
                <button onClick={() => handlePage(totalPages)} disabled={page >= totalPages}
                  className="text-xs px-2 py-1.5 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 transition">
                  »
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {dispatchTarget && (
        <DispatchModal
          alert={dispatchTarget}
          onClose={() => setDispatchTarget(null)}
          onSuccess={() => { setDispatchTarget(null); loadAlerts(); }}
        />
      )}

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
