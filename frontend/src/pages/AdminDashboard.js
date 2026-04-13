import React, { useState, useEffect, useRef } from 'react';
import { importData, getAdminCharges, setCustomerRate, getZipRates, createZipRate, updateZipRate, deleteZipRate, getZipAnalytics, createUser, adminSearchBills, updateBill, getDelinquent, shutoffWater, restoreWater, detectAnomalies, generateHistoricalBills } from '../services/api';

const TABS = [
  { key: 'tools',     label: 'Tools' },
  { key: 'customers', label: 'Customers' },
  { key: 'bills',     label: 'Bills' },
  { key: 'rates',     label: 'Rates' },
];

function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('tools');
  const loadedTabs = useRef(new Set());

  // ── System Jobs ──────────────────────────────────────────────────────────────
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [detectingAnomalies, setDetectingAnomalies] = useState(false);
  const [generatingBills, setGeneratingBills] = useState(false);
  const [result, setResult] = useState(null);
  const [importError, setImportError] = useState(null);
  const [anomalyResult, setAnomalyResult] = useState(null);
  const [anomalyError, setAnomalyError] = useState(null);
  const [billResult, setBillResult] = useState(null);
  const [billRunError, setBillRunError] = useState(null);

  // ── Invite User ──────────────────────────────────────────────────────────────
  const [inviteForm, setInviteForm] = useState({ email: '', first_name: '', last_name: '', customer_type: 'Residential', mailing_address: '', zip_code: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [inviteError, setInviteError] = useState(null);

  // ── Customers ────────────────────────────────────────────────────────────────
  const [charges, setCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState(null);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [chargesSearch, setChargesSearch] = useState('');
  const [editingRateFor, setEditingRateFor] = useState(null);
  const [rateEditValues, setRateEditValues] = useState({ custom_rate_per_ccf: '', zip_code: '' });
  const [rateSaving, setRateSaving] = useState(false);

  // ── Delinquent ───────────────────────────────────────────────────────────────
  const [delinquent, setDelinquent] = useState([]);
  const [delinquentLoading, setDelinquentLoading] = useState(false);
  const [delinquentSearch, setDelinquentSearch] = useState('');
  const [shutoffWorking, setShutoffWorking] = useState(null);

  // ── Bills ────────────────────────────────────────────────────────────────────
  const [bills, setBills] = useState([]);
  const [billsLoading, setBillsLoading] = useState(false);
  const [billsSearch, setBillsSearch] = useState('');
  const [billsStatus, setBillsStatus] = useState('');
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsPage, setBillsPage] = useState(1);
  const [editingBill, setEditingBill] = useState(null);
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState(null);

  // ── Rates ────────────────────────────────────────────────────────────────────
  const [zipRates, setZipRates] = useState([]);
  const [zipRatesLoading, setZipRatesLoading] = useState(false);
  const [zipRateForm, setZipRateForm] = useState({ zip_code: '', rate_per_ccf: '', description: '' });
  const [editingZipRate, setEditingZipRate] = useState(null);
  const [zipRateError, setZipRateError] = useState(null);
  const [zipAnalytics, setZipAnalytics] = useState([]);
  const [zipAnalyticsLoading, setZipAnalyticsLoading] = useState(false);
  const [zipAnalyticsSearch, setZipAnalyticsSearch] = useState('');
  const [expandedZip, setExpandedZip] = useState(null);

  // ── Lazy data loading ────────────────────────────────────────────────────────
  useEffect(() => {
    if (loadedTabs.current.has(activeTab)) return;
    loadedTabs.current.add(activeTab);

    if (activeTab === 'customers') {
      setChargesLoading(true);
      setDelinquentLoading(true);
      Promise.all([
        getAdminCharges()
          .then(r => setCharges(r.data.customers))
          .catch(err => setChargesError(err.response?.data?.error || 'Failed to load customers')),
        getDelinquent()
          .then(r => setDelinquent(r.data.delinquent))
          .catch(() => {}),
      ]).finally(() => {
        setChargesLoading(false);
        setDelinquentLoading(false);
      });
    }

    if (activeTab === 'rates') {
      setZipRatesLoading(true);
      setZipAnalyticsLoading(true);
      Promise.all([
        getZipRates()
          .then(r => setZipRates(r.data.zip_rates))
          .catch(() => {}),
        getZipAnalytics()
          .then(r => setZipAnalytics(r.data.zip_analytics))
          .catch(() => {}),
      ]).finally(() => {
        setZipRatesLoading(false);
        setZipAnalyticsLoading(false);
      });
    }
  }, [activeTab]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleShutoffAction = async (customerId, mode) => {
    setShutoffWorking(customerId);
    try {
      const res = mode === 'restore'
        ? await restoreWater(customerId)
        : await shutoffWater(customerId, mode);
      const updated = res.data.customer;
      const patch = { water_status: updated.water_status, shutoff_notice_at: updated.shutoff_notice_at, shutoff_at: updated.shutoff_at };
      setDelinquent(prev => prev.map(c => c.customer_id === customerId ? { ...c, ...patch } : c));
      setCharges(prev => prev.map(c => c.customer_id === customerId ? { ...c, ...patch } : c));
    } catch (err) {
      alert(err.response?.data?.error || 'Action failed');
    } finally {
      setShutoffWorking(null);
    }
  };

  const openRateEditor = (customer) => {
    setEditingRateFor(customer.customer_id);
    setRateEditValues({ custom_rate_per_ccf: customer.custom_rate_per_ccf ?? '', zip_code: customer.zip_code ?? '' });
  };

  const handleSaveCustomerRate = async (customerId) => {
    setRateSaving(true);
    try {
      const payload = {
        custom_rate_per_ccf: rateEditValues.custom_rate_per_ccf !== '' ? parseFloat(rateEditValues.custom_rate_per_ccf) : null,
        zip_code: rateEditValues.zip_code,
      };
      await setCustomerRate(customerId, payload);
      setCharges(prev => prev.map(c => c.customer_id === customerId ? { ...c, ...payload } : c));
      setEditingRateFor(null);
    } catch (err) {
      setChargesError(err.response?.data?.error || 'Failed to save rate');
    } finally {
      setRateSaving(false);
    }
  };

  const handleZipRateSubmit = async () => {
    setZipRateError(null);
    try {
      if (editingZipRate) {
        const updated = { rate_per_ccf: parseFloat(zipRateForm.rate_per_ccf), description: zipRateForm.description };
        await updateZipRate(editingZipRate, updated);
        setZipRates(prev => prev.map(r => r.id === editingZipRate ? { ...r, ...updated } : r));
      } else {
        const res = await createZipRate({ zip_code: zipRateForm.zip_code, rate_per_ccf: parseFloat(zipRateForm.rate_per_ccf), description: zipRateForm.description });
        setZipRates(prev => [...prev, res.data.zip_rate]);
      }
      setZipRateForm({ zip_code: '', rate_per_ccf: '', description: '' });
      setEditingZipRate(null);
    } catch (err) {
      setZipRateError(err.response?.data?.error || 'Failed to save zip code rate');
    }
  };

  const handleEditZipRate = (rate) => {
    setEditingZipRate(rate.id);
    setZipRateForm({ zip_code: rate.zip_code, rate_per_ccf: String(rate.rate_per_ccf), description: rate.description || '' });
  };

  const handleDeleteZipRate = async (id) => {
    setZipRateError(null);
    try {
      await deleteZipRate(id);
      setZipRates(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      setZipRateError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleFileChange = (e) => { setFile(e.target.files[0]); setImportError(null); setResult(null); };

  const handleImport = async () => {
    if (!file) { setImportError('Please select a file first'); return; }
    setImporting(true); setImportError(null); setResult(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await importData(formData);
      setResult(response.data);
      setFile(null);
      document.getElementById('file-input').value = '';
    } catch (err) {
      setImportError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDetectAnomalies = async () => {
    setDetectingAnomalies(true); setAnomalyError(null); setAnomalyResult(null);
    try {
      const response = await detectAnomalies();
      setAnomalyResult(response.data);
    } catch (err) {
      setAnomalyError(err.response?.data?.error || 'Anomaly detection failed');
    } finally {
      setDetectingAnomalies(false);
    }
  };

  const handleGenerateBills = async () => {
    setGeneratingBills(true); setBillRunError(null); setBillResult(null);
    try {
      const response = await generateHistoricalBills();
      setBillResult(response.data);
    } catch (err) {
      setBillRunError(err.response?.data?.error || 'Bill generation failed');
    } finally {
      setGeneratingBills(false);
    }
  };

  const handleInviteUser = async () => {
    setInviteError(null); setInviteResult(null);
    if (!inviteForm.email) { setInviteError('Email is required'); return; }
    setInviteLoading(true);
    try {
      const res = await createUser({ ...inviteForm, role: 'customer' });
      const token = res.data.invite_token;
      const link = `${window.location.origin}/accept-invite?token=${token}`;
      setInviteResult({ invite_link: link });
      setInviteForm({ email: '', first_name: '', last_name: '', customer_type: 'Residential', mailing_address: '', zip_code: '' });
    } catch (err) {
      setInviteError(err.response?.data?.error || 'Failed to create invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const fetchBills = async (search = billsSearch, status = billsStatus, page = billsPage) => {
    setBillsLoading(true); setBillError(null);
    try {
      const res = await adminSearchBills({ search, status, page });
      setBills(res.data.bills); setBillsTotal(res.data.total);
    } catch (err) {
      setBillError(err.response?.data?.error || 'Failed to load bills');
    } finally {
      setBillsLoading(false);
    }
  };

  const handleBillSearch = (e) => { e.preventDefault(); setBillsPage(1); fetchBills(billsSearch, billsStatus, 1); };

  const handleSaveBill = async () => {
    if (!editingBill) return;
    setBillSaving(true); setBillError(null);
    try {
      await updateBill(editingBill.id, { total_amount: parseFloat(editingBill.total_amount), status: editingBill.status, due_date: editingBill.due_date });
      setEditingBill(null);
      fetchBills();
    } catch (err) {
      setBillError(err.response?.data?.error || 'Failed to save bill');
    } finally {
      setBillSaving(false);
    }
  };

  const statusColor = { active: 'bg-green-100 text-green-700', pending_shutoff: 'bg-yellow-100 text-yellow-800', shutoff: 'bg-red-100 text-red-700' };
  const statusLabel = { active: 'Active', pending_shutoff: 'Notice Sent', shutoff: 'Shut Off' };

  // ── Shared shutoff actions cell ───────────────────────────────────────────────
  const ShutoffActions = ({ customer }) => (
    <div className="flex gap-2 flex-wrap">
      {customer.water_status === 'active' && (
        <button onClick={() => handleShutoffAction(customer.customer_id, 'notice')} disabled={shutoffWorking === customer.customer_id}
          className="text-xs px-2 py-1 rounded font-semibold bg-yellow-100 text-yellow-800 hover:bg-yellow-200 disabled:opacity-50">
          {shutoffWorking === customer.customer_id ? '…' : 'Send Notice'}
        </button>
      )}
      {customer.water_status === 'pending_shutoff' && (<>
        <button onClick={() => handleShutoffAction(customer.customer_id, 'shutoff')} disabled={shutoffWorking === customer.customer_id}
          className="text-xs px-2 py-1 rounded font-semibold bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50">
          {shutoffWorking === customer.customer_id ? '…' : 'Shut Off'}
        </button>
        <button onClick={() => handleShutoffAction(customer.customer_id, 'restore')} disabled={shutoffWorking === customer.customer_id}
          className="text-xs px-2 py-1 rounded font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">Restore</button>
      </>)}
      {customer.water_status === 'shutoff' && (
        <button onClick={() => handleShutoffAction(customer.customer_id, 'restore')} disabled={shutoffWorking === customer.customer_id}
          className="text-xs px-2 py-1 rounded font-semibold bg-green-100 text-green-700 hover:bg-green-200 disabled:opacity-50">
          {shutoffWorking === customer.customer_id ? '…' : 'Restore'}
        </button>
      )}
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Admin</h1>
        <p className="text-sm text-gray-400 mt-1">Manage customers, billing, rates, and system operations</p>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 bg-white bg-opacity-60 p-1 rounded-xl border border-gray-200 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background: activeTab === tab.key ? '#0A4C78' : 'transparent',
              color: activeTab === tab.key ? '#fff' : '#6b7280',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════
          TOOLS TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'tools' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Invite User */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-1">Invite User</h2>
            <p className="text-sm text-gray-500 mb-4">Create a customer account and share the invite link to set their password.</p>

            {inviteError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">{inviteError}</div>}
            {inviteResult && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-sm">
                <p className="font-semibold mb-1">Invite link created!</p>
                <div className="flex items-center gap-2 mt-2">
                  <input readOnly value={inviteResult.invite_link} className="input-field text-xs flex-1" onClick={e => e.target.select()} />
                  <button className="btn-primary text-sm px-3 py-2 whitespace-nowrap" onClick={() => navigator.clipboard.writeText(inviteResult.invite_link)}>Copy</button>
                </div>
              </div>
            )}

            <div className="space-y-3">
              <input type="email" placeholder="Email *" value={inviteForm.email} onChange={e => setInviteForm({ ...inviteForm, email: e.target.value })} className="input-field" />
              <div className="grid grid-cols-2 gap-2">
                <input type="text" placeholder="First Name" value={inviteForm.first_name} onChange={e => setInviteForm({ ...inviteForm, first_name: e.target.value })} className="input-field" />
                <input type="text" placeholder="Last Name" value={inviteForm.last_name} onChange={e => setInviteForm({ ...inviteForm, last_name: e.target.value })} className="input-field" />
              </div>
              <select value={inviteForm.customer_type} onChange={e => setInviteForm({ ...inviteForm, customer_type: e.target.value })} className="input-field">
                <option value="Residential">Residential</option>
                <option value="Municipal">Municipal</option>
                <option value="Commercial">Commercial</option>
              </select>
              <input type="text" placeholder="Mailing Address" value={inviteForm.mailing_address} onChange={e => setInviteForm({ ...inviteForm, mailing_address: e.target.value })} className="input-field" />
              <input type="text" placeholder="Zip Code" value={inviteForm.zip_code} onChange={e => setInviteForm({ ...inviteForm, zip_code: e.target.value })} className="input-field" maxLength={10} />
              <button onClick={handleInviteUser} disabled={inviteLoading} className="btn-primary w-full">
                {inviteLoading ? 'Creating Invite…' : 'Create Invite Link'}
              </button>
            </div>
          </div>

          {/* Data Import */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-1">Data Import</h2>
            <p className="text-sm text-gray-500 mb-4">Import CSV/XLSX usage data (max 100 MB)</p>

            {importError && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">{importError}</div>}
            {result && (
              <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4 text-sm">
                <p className="font-semibold">{result.message}</p>
                <p>Records imported: {result.imported_records}</p>
                <p>Customers created: {result.customers_created}</p>
                {result.errors?.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer font-semibold">Errors ({result.errors.length})</summary>
                    <ul className="mt-2">{result.errors.slice(0, 10).map((err, i) => <li key={i}>{err}</li>)}</ul>
                  </details>
                )}
              </div>
            )}

            <input id="file-input" type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className="input-field mb-3" disabled={importing} />
            {file && <p className="text-sm text-gray-600 mb-3">Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</p>}
            <button onClick={handleImport} disabled={!file || importing} className="btn-primary w-full">
              {importing ? 'Importing…' : 'Import Data'}
            </button>
            {importing && (
              <div className="mt-4 text-center">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue" />
                <p className="text-sm text-gray-600 mt-2">Processing… please wait</p>
              </div>
            )}
          </div>

          {/* System Jobs */}
          <div className="card">
            <h2 className="text-lg font-semibold mb-1">System Jobs</h2>
            <p className="text-sm text-gray-500 mb-4">Periodic maintenance tasks — run as needed.</p>

            <div className="space-y-3">
              {anomalyError && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm">{anomalyError}</div>}
              {anomalyResult && (
                <div className={`px-3 py-2 rounded text-sm border ${anomalyResult.no_data ? 'bg-yellow-50 border-yellow-300 text-yellow-800' : 'bg-green-100 border-green-400 text-green-700'}`}>
                  {anomalyResult.message}
                </div>
              )}
              <button onClick={handleDetectAnomalies} disabled={detectingAnomalies} className="btn-primary w-full">
                {detectingAnomalies ? 'Running Detection…' : 'Run Anomaly Detection'}
              </button>

              <div className="border-t pt-3">
                {billRunError && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded text-sm mb-2">{billRunError}</div>}
                {billResult && <div className="bg-green-100 border border-green-400 text-green-700 px-3 py-2 rounded text-sm mb-2">{billResult.message} — {billResult.total_bills} bills generated</div>}
                <button onClick={handleGenerateBills} disabled={generatingBills} className="btn-primary w-full">
                  {generatingBills ? 'Generating…' : 'Generate Historical Bills'}
                </button>
                <p className="text-xs text-gray-400 mt-2">Builds monthly bills for all customers from historical usage data.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          CUSTOMERS TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'customers' && (
        <div className="space-y-6">

          {/* Delinquent Accounts */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-hydro-deep-aqua">Delinquent Accounts</h2>
                <p className="text-sm text-gray-500 mt-0.5">Unpaid bills older than 90 days.</p>
              </div>
              <div className="flex items-center gap-3">
                {delinquent.length > 0 && (
                  <span className="bg-red-100 text-red-700 text-xs font-bold px-3 py-1 rounded-full">
                    {delinquent.length} delinquent
                  </span>
                )}
                <input type="text" placeholder="Search…" value={delinquentSearch} onChange={e => setDelinquentSearch(e.target.value)} className="input-field text-sm w-48" />
              </div>
            </div>

            {delinquentLoading && <div className="flex justify-center py-8"><div className="hydro-spinner" /></div>}

            {!delinquentLoading && delinquent.length === 0 && (
              <div className="text-center py-8 text-gray-400">
                <p className="text-2xl mb-2">✅</p>
                <p className="text-sm font-medium">No delinquent accounts — all customers are current.</p>
              </div>
            )}

            {!delinquentLoading && delinquent.length > 0 && (() => {
              const q = delinquentSearch.toLowerCase();
              const filtered = delinquent.filter(c => !q || (c.customer_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.location_id || '').includes(q));
              return (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {['Customer', 'Type', 'Unpaid Bills', 'Amount Owed', 'Oldest Due', 'Status', 'Actions'].map(h => (
                          <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {filtered.map(c => (
                        <tr key={c.customer_id} className={`hover:bg-gray-50 ${c.water_status === 'shutoff' ? 'bg-red-50' : c.water_status === 'pending_shutoff' ? 'bg-yellow-50' : ''}`}>
                          <td className="px-4 py-3">
                            <p className="font-semibold text-gray-800">{c.customer_name}</p>
                            <p className="text-xs text-gray-500">{c.email}</p>
                            {c.shutoff_notice_at && <p className="text-xs text-yellow-700 mt-0.5">Notice sent {new Date(c.shutoff_notice_at).toLocaleDateString()}</p>}
                            {c.shutoff_at && <p className="text-xs text-red-700 mt-0.5">Shut off {new Date(c.shutoff_at).toLocaleDateString()}</p>}
                          </td>
                          <td className="px-4 py-3 text-gray-600">{c.customer_type}</td>
                          <td className="px-4 py-3 font-semibold text-red-600">{c.unpaid_count}</td>
                          <td className="px-4 py-3 font-semibold text-red-600">${c.unpaid_total?.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-4 py-3 text-gray-600">{c.oldest_due ? new Date(c.oldest_due + 'T00:00:00').toLocaleDateString() : '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[c.water_status] || statusColor.active}`}>
                              {statusLabel[c.water_status] || 'Active'}
                            </span>
                          </td>
                          <td className="px-4 py-3"><ShutoffActions customer={c} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && delinquentSearch && <p className="text-center text-gray-400 text-sm py-4">No results for "{delinquentSearch}"</p>}
                </div>
              );
            })()}
          </div>

          {/* Customer Accounts */}
          <div className="card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-hydro-deep-aqua">Customer Accounts</h2>
                <p className="text-sm text-gray-500 mt-0.5">View rates, billing summary, and manage water service.</p>
              </div>
              <input type="text" placeholder="Search by name or email…" value={chargesSearch} onChange={e => setChargesSearch(e.target.value)} className="input-field w-64 text-sm" />
            </div>

            {chargesError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">{chargesError}</div>}

            {chargesLoading ? (
              <div className="flex justify-center py-8"><div className="hydro-spinner" /></div>
            ) : (
              <div className="overflow-x-auto">
                {!chargesSearch && <p className="text-xs text-gray-400 mb-2">Showing top 10 by total billed — search to find any customer.</p>}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-hydro-sky-blue text-left">
                      {['Customer', 'Type', 'Zip', 'Rate', 'Bills', 'Total Billed', 'Bill Status', 'Service', ''].map(h => (
                        <th key={h} className={`px-4 py-2 font-semibold text-hydro-deep-aqua ${h === 'Total Billed' || h === 'Bills' ? 'text-right' : ''}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const q = chargesSearch.toLowerCase();
                      const sorted = [...charges].sort((a, b) => b.total_amount - a.total_amount);
                      const rows = q ? sorted.filter(c => (c.customer_name || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q)) : sorted.slice(0, 10);
                      if (rows.length === 0) return <tr><td colSpan={9} className="text-center text-gray-400 py-6">No customers found.</td></tr>;
                      return rows.map(customer => (
                        <React.Fragment key={customer.customer_id}>
                          <tr className={`border-b hover:bg-gray-50 ${customer.water_status === 'shutoff' ? 'bg-red-50' : customer.water_status === 'pending_shutoff' ? 'bg-yellow-50' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium">{customer.customer_name || '—'}</p>
                              <p className="text-xs text-gray-400">{customer.email || '—'}</p>
                            </td>
                            <td className="px-4 py-3 text-gray-600">{customer.customer_type || '—'}</td>
                            <td className="px-4 py-3 text-gray-600">{customer.zip_code || '—'}</td>
                            <td className="px-4 py-3">
                              {customer.custom_rate_per_ccf != null ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">${customer.custom_rate_per_ccf.toFixed(2)} custom</span>
                              ) : customer.zip_code && zipRates.find(z => z.zip_code === customer.zip_code && z.is_active) ? (
                                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">${zipRates.find(z => z.zip_code === customer.zip_code).rate_per_ccf.toFixed(2)} zip</span>
                              ) : <span className="text-gray-400 text-xs">default</span>}
                            </td>
                            <td className="px-4 py-3 text-right">{customer.bill_count}</td>
                            <td className="px-4 py-3 text-right font-semibold text-hydro-deep-aqua">${customer.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {Object.entries(customer.status_counts).map(([status, count]) => (
                                  <span key={status} className={`px-2 py-0.5 rounded-full text-xs font-medium ${status === 'paid' ? 'bg-green-100 text-green-700' : status === 'overdue' ? 'bg-red-100 text-red-700' : status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>
                                    {count} {status}
                                  </span>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusColor[customer.water_status] || statusColor.active}`}>{statusLabel[customer.water_status] || 'Active'}</span>
                                <ShutoffActions customer={customer} />
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right whitespace-nowrap">
                              <button onClick={() => openRateEditor(customer)} className="text-xs px-2 py-1 rounded border border-hydro-deep-aqua text-hydro-deep-aqua hover:bg-hydro-sky-blue mr-1">Set Rate</button>
                              <button onClick={() => setExpandedCustomer(expandedCustomer === customer.customer_id ? null : customer.customer_id)} className="text-gray-400 text-xs">
                                {expandedCustomer === customer.customer_id ? '▲' : '▼'}
                              </button>
                            </td>
                          </tr>

                          {editingRateFor === customer.customer_id && (
                            <tr>
                              <td colSpan={9} className="px-6 py-3 bg-purple-50 border-b">
                                <div className="flex flex-wrap items-end gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Zip Code</label>
                                    <input type="text" value={rateEditValues.zip_code} onChange={e => setRateEditValues(v => ({ ...v, zip_code: e.target.value }))} placeholder="e.g. 90210" className="input-field text-sm w-28" />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-600 mb-1">Custom Rate ($/CCF) — blank to clear</label>
                                    <input type="number" step="0.01" min="0" value={rateEditValues.custom_rate_per_ccf} onChange={e => setRateEditValues(v => ({ ...v, custom_rate_per_ccf: e.target.value }))} placeholder="e.g. 6.50" className="input-field text-sm w-32" />
                                  </div>
                                  <button onClick={() => handleSaveCustomerRate(customer.customer_id)} disabled={rateSaving} className="btn-primary text-sm px-3 py-1.5">{rateSaving ? 'Saving…' : 'Save'}</button>
                                  <button onClick={() => setEditingRateFor(null)} className="text-sm px-3 py-1.5 border rounded text-gray-600 hover:bg-gray-100">Cancel</button>
                                </div>
                              </td>
                            </tr>
                          )}

                          {expandedCustomer === customer.customer_id && (
                            <tr>
                              <td colSpan={9} className="px-6 py-4 bg-gray-50">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="text-left text-gray-500 border-b">
                                      {['Period', 'Usage (CCF)', 'Rate ($/CCF)', 'Cost', 'Due Date', 'Status'].map(h => <th key={h} className="pb-1 pr-4">{h}</th>)}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {customer.bills.map(bill => {
                                      const usage = parseFloat(bill.total_usage_ccf);
                                      const cost = parseFloat(bill.total_amount);
                                      const rate = usage > 0 ? (cost / usage).toFixed(2) : '—';
                                      return (
                                        <tr key={bill.id} className="border-b border-gray-100">
                                          <td className="py-1.5 pr-4">{bill.billing_period_start} – {bill.billing_period_end}</td>
                                          <td className="py-1.5 pr-4">{usage.toFixed(2)}</td>
                                          <td className="py-1.5 pr-4 text-gray-500">${rate}</td>
                                          <td className="py-1.5 pr-4 font-semibold text-hydro-deep-aqua">${cost.toFixed(2)}</td>
                                          <td className="py-1.5 pr-4 text-gray-600">{bill.due_date}</td>
                                          <td className="py-1.5">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bill.status === 'paid' ? 'bg-green-100 text-green-700' : bill.status === 'overdue' ? 'bg-red-100 text-red-700' : bill.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{bill.status}</span>
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          BILLS TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'bills' && (
        <div className="card">
          <h2 className="text-lg font-semibold text-hydro-deep-aqua mb-1">Bill Management</h2>
          <p className="text-sm text-gray-500 mb-4">Search and adjust individual bills by customer name, email, or location ID.</p>

          {billError && <div className="bg-red-100 border border-red-400 text-red-700 px-3 py-2 rounded mb-3 text-sm">{billError}</div>}

          <form onSubmit={handleBillSearch} className="flex flex-wrap gap-2 mb-4">
            <input type="text" placeholder="Search by name, email, or location ID…" value={billsSearch} onChange={e => setBillsSearch(e.target.value)} className="input-field flex-1 min-w-48" />
            <select value={billsStatus} onChange={e => setBillsStatus(e.target.value)} className="input-field w-36">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="overdue">Overdue</option>
              <option value="sent">Sent</option>
            </select>
            <button type="submit" className="btn-primary px-5" disabled={billsLoading}>
              {billsLoading ? 'Searching…' : 'Search'}
            </button>
          </form>

          {bills.length === 0 && !billsLoading && <p className="text-sm text-gray-400 text-center py-6">Search above to find bills.</p>}

          {bills.length > 0 && (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-hydro-sky-blue text-left">
                      {['Customer', 'Type', 'Period', 'Usage (CCF)', 'Amount', 'Due Date', 'Status', ''].map(h => (
                        <th key={h} className="px-3 py-2 font-semibold text-hydro-deep-aqua">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map(bill => (
                      <tr key={bill.id} className={`border-b hover:bg-gray-50 ${editingBill?.id === bill.id ? 'bg-yellow-50' : ''}`}>
                        <td className="px-3 py-2"><p className="font-medium">{bill.customer_name}</p><p className="text-xs text-gray-400">{bill.customer_email}</p></td>
                        <td className="px-3 py-2 text-gray-600">{bill.customer_type}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{bill.billing_period_start} → {bill.billing_period_end}</td>
                        <td className="px-3 py-2">{parseFloat(bill.total_usage_ccf).toFixed(2)}</td>
                        <td className="px-3 py-2 font-semibold">
                          {editingBill?.id === bill.id
                            ? <input type="number" step="0.01" value={editingBill.total_amount} onChange={e => setEditingBill({ ...editingBill, total_amount: e.target.value })} className="input-field w-24 text-sm py-1" />
                            : `$${parseFloat(bill.total_amount).toFixed(2)}`}
                        </td>
                        <td className="px-3 py-2">
                          {editingBill?.id === bill.id
                            ? <input type="date" value={editingBill.due_date} onChange={e => setEditingBill({ ...editingBill, due_date: e.target.value })} className="input-field text-sm py-1" />
                            : bill.due_date}
                        </td>
                        <td className="px-3 py-2">
                          {editingBill?.id === bill.id
                            ? <select value={editingBill.status} onChange={e => setEditingBill({ ...editingBill, status: e.target.value })} className="input-field text-sm py-1">
                                <option value="pending">Pending</option>
                                <option value="paid">Paid</option>
                                <option value="overdue">Overdue</option>
                                <option value="sent">Sent</option>
                              </select>
                            : <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${bill.status === 'paid' ? 'bg-green-100 text-green-700' : bill.status === 'overdue' ? 'bg-red-100 text-red-700' : bill.status === 'sent' ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700'}`}>{bill.status}</span>}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-right">
                          {editingBill?.id === bill.id ? (<>
                            <button onClick={handleSaveBill} disabled={billSaving} className="text-xs px-2 py-1 rounded bg-green-600 text-white hover:bg-green-700 mr-1">{billSaving ? '…' : 'Save'}</button>
                            <button onClick={() => setEditingBill(null)} className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100">Cancel</button>
                          </>) : (
                            <button onClick={() => setEditingBill({ id: bill.id, total_amount: parseFloat(bill.total_amount).toFixed(2), status: bill.status, due_date: bill.due_date })} className="text-xs px-2 py-1 rounded border border-hydro-deep-aqua text-hydro-deep-aqua hover:bg-hydro-sky-blue">Edit</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-gray-500">Showing {bills.length} of {billsTotal} bills (page {billsPage})</p>
                <div className="flex gap-2">
                  <button disabled={billsPage === 1} onClick={() => { const p = billsPage - 1; setBillsPage(p); fetchBills(billsSearch, billsStatus, p); }} className="text-xs px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Previous</button>
                  <button disabled={billsPage * 25 >= billsTotal} onClick={() => { const p = billsPage + 1; setBillsPage(p); fetchBills(billsSearch, billsStatus, p); }} className="text-xs px-3 py-1 rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50">Next</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════
          RATES TAB
      ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'rates' && (
        <div className="space-y-6">

          {/* Zip Code Rates */}
          <div className="card">
            <h2 className="text-lg font-semibold text-hydro-deep-aqua mb-1">Zip Code Rates</h2>
            <p className="text-sm text-gray-500 mb-4">Area-based rate overrides — applied when a customer has no individual rate set.</p>

            {zipRateError && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4 text-sm">{zipRateError}</div>}

            <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-gray-50 rounded">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Zip Code</label>
                <input type="text" value={zipRateForm.zip_code} onChange={e => setZipRateForm(f => ({ ...f, zip_code: e.target.value }))} placeholder="e.g. 90210" disabled={!!editingZipRate} className="input-field text-sm w-28" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Rate ($/CCF)</label>
                <input type="number" step="0.01" min="0" value={zipRateForm.rate_per_ccf} onChange={e => setZipRateForm(f => ({ ...f, rate_per_ccf: e.target.value }))} placeholder="e.g. 6.00" className="input-field text-sm w-32" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
                <input type="text" value={zipRateForm.description} onChange={e => setZipRateForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Downtown district" className="input-field text-sm w-48" />
              </div>
              <button onClick={handleZipRateSubmit} disabled={!zipRateForm.rate_per_ccf || (!editingZipRate && !zipRateForm.zip_code)} className="btn-primary text-sm px-3 py-1.5">
                {editingZipRate ? 'Update Rate' : 'Add Rate'}
              </button>
              {editingZipRate && (
                <button onClick={() => { setEditingZipRate(null); setZipRateForm({ zip_code: '', rate_per_ccf: '', description: '' }); }} className="text-sm px-3 py-1.5 border rounded text-gray-600 hover:bg-gray-100">Cancel</button>
              )}
            </div>

            {zipRatesLoading ? <p className="text-sm text-gray-500">Loading…</p>
              : zipRates.length === 0 ? <p className="text-sm text-gray-500">No zip code rates configured yet.</p>
              : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-hydro-sky-blue text-left">
                      {['Zip Code', 'Rate ($/CCF)', 'Description', 'Active', ''].map(h => (
                        <th key={h} className="px-4 py-2 font-semibold text-hydro-deep-aqua">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {zipRates.map(rate => (
                      <tr key={rate.id} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{rate.zip_code}</td>
                        <td className="px-4 py-2 font-semibold text-hydro-deep-aqua">${rate.rate_per_ccf.toFixed(2)}</td>
                        <td className="px-4 py-2 text-gray-600">{rate.description || '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rate.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                            {rate.is_active ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          <button onClick={() => handleEditZipRate(rate)} className="text-xs px-2 py-1 rounded border border-hydro-deep-aqua text-hydro-deep-aqua hover:bg-hydro-sky-blue mr-1">Edit</button>
                          <button onClick={() => handleDeleteZipRate(rate.id)} className="text-xs px-2 py-1 rounded border border-red-400 text-red-600 hover:bg-red-50">Delete</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
          </div>

          {/* Zip Code Analytics */}
          <div className="card">
            <h2 className="text-lg font-semibold text-hydro-deep-aqua mb-1">Zip Code Analytics</h2>
            <p className="text-sm text-gray-500 mb-4">Average monthly bill, usage, and total revenue by zip code and account type.</p>

            <input type="text" placeholder="Search by zip code…" value={zipAnalyticsSearch} onChange={e => setZipAnalyticsSearch(e.target.value)} className="input-field w-full max-w-xs mb-4" />

            {zipAnalyticsLoading ? (
              <div className="flex justify-center py-6"><div className="hydro-spinner" /></div>
            ) : zipAnalytics.length === 0 ? (
              <p className="text-sm text-gray-500">No data yet — generate bills first.</p>
            ) : (() => {
              const sorted = [...zipAnalytics].sort((a, b) => b.types.reduce((s, t) => s + t.customer_count, 0) - a.types.reduce((s, t) => s + t.customer_count, 0));
              const filtered = zipAnalyticsSearch ? sorted.filter(z => z.zip_code.includes(zipAnalyticsSearch)) : sorted.slice(0, 5);
              return (
                <div className="overflow-x-auto">
                  {!zipAnalyticsSearch && <p className="text-xs text-gray-400 mb-2">Showing top 5 zip codes — search to find any.</p>}
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-hydro-sky-blue text-left">
                        {['Zip Code', 'Account Types', 'Customers', 'Avg Monthly Bill', 'Total Revenue', ''].map((h, i) => (
                          <th key={h} className={`px-4 py-2 font-semibold text-hydro-deep-aqua ${i >= 2 && i <= 4 ? 'text-right' : ''}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(z => {
                        const totalCustomers = z.types.reduce((s, t) => s + t.customer_count, 0);
                        const totalRevenue = z.types.reduce((s, t) => s + t.total_revenue, 0);
                        const avgBill = z.types.reduce((s, t) => s + t.avg_monthly_bill * t.customer_count, 0) / (totalCustomers || 1);
                        return (
                          <React.Fragment key={z.zip_code}>
                            <tr className="border-b hover:bg-gray-50">
                              <td className="px-4 py-3 font-semibold text-hydro-deep-aqua">{z.zip_code}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1 flex-wrap">
                                  {z.types.map(t => (
                                    <span key={t.customer_type} className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.customer_type === 'Residential' ? 'bg-blue-100 text-blue-700' : t.customer_type === 'Municipal' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{t.customer_type}</span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">{totalCustomers}</td>
                              <td className="px-4 py-3 text-right font-semibold">${avgBill.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-right font-semibold text-hydro-deep-aqua">${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                              <td className="px-4 py-3 text-right">
                                <button onClick={() => setExpandedZip(expandedZip === z.zip_code ? null : z.zip_code)} className="text-gray-400 text-xs">
                                  {expandedZip === z.zip_code ? '▲' : '▼'}
                                </button>
                              </td>
                            </tr>
                            {expandedZip === z.zip_code && (
                              <tr>
                                <td colSpan={6} className="px-6 py-4 bg-gray-50 border-b">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="text-left text-gray-500 border-b">
                                        {['Account Type', 'Customers', 'Avg Monthly Usage (CCF)', 'Avg Monthly Bill', 'Total Revenue'].map((h, i) => (
                                          <th key={h} className={`pb-1 pr-4 ${i > 0 ? 'text-right' : ''}`}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {z.types.map(t => (
                                        <tr key={t.customer_type} className="border-b border-gray-100">
                                          <td className="py-1.5 pr-4">
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.customer_type === 'Residential' ? 'bg-blue-100 text-blue-700' : t.customer_type === 'Municipal' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>{t.customer_type}</span>
                                          </td>
                                          <td className="py-1.5 pr-4 text-right">{t.customer_count}</td>
                                          <td className="py-1.5 pr-4 text-right">{t.avg_monthly_usage_ccf.toFixed(2)}</td>
                                          <td className="py-1.5 pr-4 text-right font-semibold">${t.avg_monthly_bill.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                          <td className="py-1.5 text-right font-semibold text-hydro-deep-aqua">${t.total_revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminDashboard;
