import React, { useState, useEffect } from 'react';
import { importData, getAdminCharges, setCustomerRate, getZipRates, createZipRate, updateZipRate, deleteZipRate } from '../services/api';
import axios from 'axios';

function AdminDashboard() {
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [detectingAnomalies, setDetectingAnomalies] = useState(false);
  const [generatingBills, setGeneratingBills] = useState(false);
  const [result, setResult] = useState(null);
  const [anomalyResult, setAnomalyResult] = useState(null);
  const [billResult, setBillResult] = useState(null);
  const [error, setError] = useState(null);
  const [charges, setCharges] = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [chargesError, setChargesError] = useState(null);
  const [expandedCustomer, setExpandedCustomer] = useState(null);
  const [chargesSearch, setChargesSearch] = useState('');

  // Per-customer rate editing
  const [editingRateFor, setEditingRateFor] = useState(null); // customer_id
  const [rateEditValues, setRateEditValues] = useState({ custom_rate_per_ccf: '', zip_code: '' });
  const [rateSaving, setRateSaving] = useState(false);

  // Zip code rates
  const [zipRates, setZipRates] = useState([]);
  const [zipRatesLoading, setZipRatesLoading] = useState(false);
  const [zipRateForm, setZipRateForm] = useState({ zip_code: '', rate_per_ccf: '', description: '' });
  const [editingZipRate, setEditingZipRate] = useState(null); // id
  const [zipRateError, setZipRateError] = useState(null);

  useEffect(() => {
    const fetchCharges = async () => {
      setChargesLoading(true);
      setChargesError(null);
      try {
        const response = await getAdminCharges();
        setCharges(response.data.customers);
      } catch (err) {
        setChargesError(err.response?.data?.error || 'Failed to load charges');
      } finally {
        setChargesLoading(false);
      }
    };

    const fetchZipRates = async () => {
      setZipRatesLoading(true);
      try {
        const response = await getZipRates();
        setZipRates(response.data.zip_rates);
      } catch (err) {
        // non-fatal
      } finally {
        setZipRatesLoading(false);
      }
    };

    fetchCharges();
    fetchZipRates();
  }, []);

  const openRateEditor = (customer) => {
    setEditingRateFor(customer.customer_id);
    setRateEditValues({
      custom_rate_per_ccf: customer.custom_rate_per_ccf ?? '',
      zip_code: customer.zip_code ?? '',
    });
  };

  const handleSaveCustomerRate = async (customerId) => {
    setRateSaving(true);
    try {
      const payload = {
        custom_rate_per_ccf: rateEditValues.custom_rate_per_ccf !== '' ? parseFloat(rateEditValues.custom_rate_per_ccf) : null,
        zip_code: rateEditValues.zip_code,
      };
      await setCustomerRate(customerId, payload);
      const response = await getAdminCharges();
      setCharges(response.data.customers);
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
        await updateZipRate(editingZipRate, {
          rate_per_ccf: parseFloat(zipRateForm.rate_per_ccf),
          description: zipRateForm.description,
        });
      } else {
        await createZipRate({
          zip_code: zipRateForm.zip_code,
          rate_per_ccf: parseFloat(zipRateForm.rate_per_ccf),
          description: zipRateForm.description,
        });
      }
      const response = await getZipRates();
      setZipRates(response.data.zip_rates);
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
      setZipRates((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setZipRateError(err.response?.data?.error || 'Failed to delete');
    }
  };

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
    setError(null);
    setResult(null);
  };

  const handleImport = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setImporting(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await importData(formData);
      setResult(response.data);
      setFile(null);
      document.getElementById('file-input').value = '';
    } catch (err) {
      setError(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handleDetectAnomalies = async () => {
    setDetectingAnomalies(true);
    setError(null);
    setAnomalyResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5001/api/admin/detect',
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setAnomalyResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Anomaly detection failed');
    } finally {
      setDetectingAnomalies(false);
    }
  };

  const handleGenerateBills = async () => {
    setGeneratingBills(true);
    setError(null);
    setBillResult(null);

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        'http://localhost:5001/api/admin/generate-historical-bills',
        {},
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setBillResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Bill generation failed');
    } finally {
      setGeneratingBills(false);
    }
  };

  return (
    <div>
      <h1 className="text-3xl font-bold text-hydro-deep-aqua mb-6">Admin Dashboard</h1>
      
      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Data Import Card */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Data Import</h2>
          <p className="text-gray-600 mb-4">Import CSV/XLSX usage data (max 100MB)</p>
          
          {result && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              <p className="font-semibold">{result.message}</p>
              <p>Records imported: {result.imported_records}</p>
              <p>Customers created: {result.customers_created}</p>
              {result.errors && result.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer font-semibold">Errors ({result.errors.length})</summary>
                  <ul className="mt-2 text-sm">
                    {result.errors.slice(0, 10).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          
          <input
            id="file-input"
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileChange}
            className="input-field mb-4"
            disabled={importing}
          />
          
          {file && (
            <p className="text-sm text-gray-600 mb-2">
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
          
          <button
            onClick={handleImport}
            disabled={!file || importing}
            className="btn-primary w-full"
          >
            {importing ? 'Importing... This may take several minutes' : 'Import Data'}
          </button>
          
          {importing && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue"></div>
              <p className="text-sm text-gray-600 mt-2">Processing large file... Please wait</p>
            </div>
          )}
        </div>

        {/* Anomaly Detection Card */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Anomaly Detection</h2>
          <p className="text-gray-600 mb-4">
            Run ML-based anomaly detection on all customer usage data to identify spikes, leaks, and unusual patterns.
          </p>

          {anomalyResult && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              <p className="font-semibold">{anomalyResult.message}</p>
              <p className="text-sm mt-1">
                Detected {anomalyResult.anomalies?.length || 0} anomalies across all customers
              </p>
            </div>
          )}

          <button
            onClick={handleDetectAnomalies}
            disabled={detectingAnomalies}
            className="btn-primary w-full"
          >
            {detectingAnomalies ? 'Running Detection...' : '🚨 Run Anomaly Detection'}
          </button>

          {detectingAnomalies && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue"></div>
              <p className="text-sm text-gray-600 mt-2">Analyzing usage patterns... This may take 1-2 minutes</p>
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
            <p className="font-semibold text-hydro-deep-aqua mb-1">Detection Method:</p>
            <p className="text-gray-700">Uses Isolation Forest ML algorithm with dynamic thresholds to identify:</p>
            <ul className="list-disc list-inside mt-2 text-gray-700">
              <li>Usage spikes (100%+ above normal)</li>
              <li>Potential leaks (unusual patterns)</li>
              <li>Abnormal consumption</li>
            </ul>
          </div>
        </div>

        {/* Bill Generation Card */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Generate Historical Bills</h2>
          <p className="text-gray-600 mb-4">
            Generate monthly bills for all customers based on their historical usage data from 2018-2026.
          </p>

          {billResult && (
            <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-4">
              <p className="font-semibold">{billResult.message}</p>
              <p className="text-sm mt-1">
                Generated {billResult.total_bills} bills
              </p>
            </div>
          )}

          <button
            onClick={handleGenerateBills}
            disabled={generatingBills}
            className="btn-primary w-full"
          >
            {generatingBills ? 'Generating Bills...' : '💰 Generate All Historical Bills'}
          </button>

          {generatingBills && (
            <div className="mt-4 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue"></div>
              <p className="text-sm text-gray-600 mt-2">Generating bills for 657 customers... This may take 2-3 minutes</p>
            </div>
          )}

          <div className="mt-4 p-3 bg-blue-50 rounded text-sm">
            <p className="font-semibold text-hydro-deep-aqua mb-1">What this does:</p>
            <ul className="list-disc list-inside text-gray-700">
              <li>Creates monthly bills for each customer</li>
              <li>Calculates usage from 2018-2026</li>
              <li>Sets status (paid/sent/overdue/pending)</li>
              <li>Rate: $5.72/CCF for Residential</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Charges by User */}
      <div className="card mt-6">
        <h2 className="text-xl font-semibold mb-4">Charges by User</h2>

        {chargesError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {chargesError}
          </div>
        )}

        {chargesLoading ? (
          <div className="text-center py-8">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-hydro-spark-blue"></div>
            <p className="text-sm text-gray-600 mt-2">Loading charges...</p>
          </div>
        ) : (
          <>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={chargesSearch}
              onChange={(e) => setChargesSearch(e.target.value)}
              className="input-field mb-4 w-full max-w-sm"
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-hydro-sky-blue text-left">
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Customer</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Email</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Type</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Zip</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Rate ($/CCF)</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua text-right">Bills</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua text-right">Total Cost</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Status Summary</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {charges
                    .filter((c) => {
                      const q = chargesSearch.toLowerCase();
                      return (
                        !q ||
                        (c.customer_name || '').toLowerCase().includes(q) ||
                        (c.email || '').toLowerCase().includes(q)
                      );
                    })
                    .map((customer) => (
                      <>
                        <tr
                          key={customer.customer_id}
                          className="border-b hover:bg-gray-50"
                        >
                          <td className="px-4 py-3 font-medium">{customer.customer_name || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.email || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.customer_type || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.zip_code || '—'}</td>
                          <td className="px-4 py-3">
                            {customer.custom_rate_per_ccf != null ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                                ${customer.custom_rate_per_ccf.toFixed(2)} custom
                              </span>
                            ) : customer.zip_code && zipRates.find(z => z.zip_code === customer.zip_code && z.is_active) ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                                ${zipRates.find(z => z.zip_code === customer.zip_code).rate_per_ccf.toFixed(2)} zip
                              </span>
                            ) : (
                              <span className="text-gray-400 text-xs">default</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">{customer.bill_count}</td>
                          <td className="px-4 py-3 text-right font-semibold text-hydro-deep-aqua">
                            ${customer.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1 flex-wrap">
                              {Object.entries(customer.status_counts).map(([status, count]) => (
                                <span
                                  key={status}
                                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                    status === 'paid'
                                      ? 'bg-green-100 text-green-700'
                                      : status === 'overdue'
                                      ? 'bg-red-100 text-red-700'
                                      : status === 'sent'
                                      ? 'bg-blue-100 text-blue-700'
                                      : 'bg-yellow-100 text-yellow-700'
                                  }`}
                                >
                                  {count} {status}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <button
                              onClick={() => openRateEditor(customer)}
                              className="text-xs px-2 py-1 rounded border border-hydro-deep-aqua text-hydro-deep-aqua hover:bg-hydro-sky-blue mr-1"
                            >
                              Set Rate
                            </button>
                            <button
                              onClick={() =>
                                setExpandedCustomer(
                                  expandedCustomer === customer.customer_id ? null : customer.customer_id
                                )
                              }
                              className="text-gray-400 text-xs"
                            >
                              {expandedCustomer === customer.customer_id ? '▲' : '▼'}
                            </button>
                          </td>
                        </tr>

                        {/* Inline rate editor */}
                        {editingRateFor === customer.customer_id && (
                          <tr key={`${customer.customer_id}-rate-edit`}>
                            <td colSpan={9} className="px-6 py-3 bg-purple-50 border-b">
                              <div className="flex flex-wrap items-end gap-3">
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Zip Code</label>
                                  <input
                                    type="text"
                                    value={rateEditValues.zip_code}
                                    onChange={(e) => setRateEditValues(v => ({ ...v, zip_code: e.target.value }))}
                                    placeholder="e.g. 90210"
                                    className="input-field text-sm w-28"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium text-gray-600 mb-1">Custom Rate ($/CCF) — leave blank to clear</label>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    value={rateEditValues.custom_rate_per_ccf}
                                    onChange={(e) => setRateEditValues(v => ({ ...v, custom_rate_per_ccf: e.target.value }))}
                                    placeholder="e.g. 6.50"
                                    className="input-field text-sm w-32"
                                  />
                                </div>
                                <button
                                  onClick={() => handleSaveCustomerRate(customer.customer_id)}
                                  disabled={rateSaving}
                                  className="btn-primary text-sm px-3 py-1.5"
                                >
                                  {rateSaving ? 'Saving...' : 'Save'}
                                </button>
                                <button
                                  onClick={() => setEditingRateFor(null)}
                                  className="text-sm px-3 py-1.5 border rounded text-gray-600 hover:bg-gray-100"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}

                        {/* Expanded bills */}
                        {expandedCustomer === customer.customer_id && (
                          <tr key={`${customer.customer_id}-bills`}>
                            <td colSpan={9} className="px-6 py-4 bg-gray-50">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-1 pr-4">Period</th>
                                    <th className="pb-1 pr-4">Usage (CCF)</th>
                                    <th className="pb-1 pr-4">Rate ($/CCF)</th>
                                    <th className="pb-1 pr-4">Cost</th>
                                    <th className="pb-1 pr-4">Due Date</th>
                                    <th className="pb-1">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customer.bills.map((bill) => {
                                    const usage = parseFloat(bill.total_usage_ccf);
                                    const cost = parseFloat(bill.total_amount);
                                    const rate = usage > 0 ? (cost / usage).toFixed(2) : '—';
                                    return (
                                      <tr key={bill.id} className="border-b border-gray-100">
                                        <td className="py-1.5 pr-4">
                                          {bill.billing_period_start} – {bill.billing_period_end}
                                        </td>
                                        <td className="py-1.5 pr-4">{usage.toFixed(2)}</td>
                                        <td className="py-1.5 pr-4 text-gray-500">${rate}</td>
                                        <td className="py-1.5 pr-4 font-semibold text-hydro-deep-aqua">
                                          ${cost.toFixed(2)}
                                        </td>
                                        <td className="py-1.5 pr-4 text-gray-600">{bill.due_date}</td>
                                        <td className="py-1.5">
                                          <span
                                            className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                              bill.status === 'paid'
                                                ? 'bg-green-100 text-green-700'
                                                : bill.status === 'overdue'
                                                ? 'bg-red-100 text-red-700'
                                                : bill.status === 'sent'
                                                ? 'bg-blue-100 text-blue-700'
                                                : 'bg-yellow-100 text-yellow-700'
                                            }`}
                                          >
                                            {bill.status}
                                          </span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                </tbody>
              </table>
              {charges.length === 0 && !chargesLoading && (
                <p className="text-center text-gray-500 py-6">No charges found.</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* Zip Code Rates */}
      <div className="card mt-6">
        <h2 className="text-xl font-semibold mb-1">Zip Code Rates</h2>
        <p className="text-sm text-gray-500 mb-4">Area-based rate overrides applied when a customer has no individual rate set.</p>

        {zipRateError && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            {zipRateError}
          </div>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-5 p-4 bg-gray-50 rounded">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Zip Code</label>
            <input
              type="text"
              value={zipRateForm.zip_code}
              onChange={(e) => setZipRateForm(f => ({ ...f, zip_code: e.target.value }))}
              placeholder="e.g. 90210"
              disabled={!!editingZipRate}
              className="input-field text-sm w-28"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rate ($/CCF)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={zipRateForm.rate_per_ccf}
              onChange={(e) => setZipRateForm(f => ({ ...f, rate_per_ccf: e.target.value }))}
              placeholder="e.g. 6.00"
              className="input-field text-sm w-32"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description (optional)</label>
            <input
              type="text"
              value={zipRateForm.description}
              onChange={(e) => setZipRateForm(f => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Downtown district"
              className="input-field text-sm w-48"
            />
          </div>
          <button
            onClick={handleZipRateSubmit}
            disabled={!zipRateForm.rate_per_ccf || (!editingZipRate && !zipRateForm.zip_code)}
            className="btn-primary text-sm px-3 py-1.5"
          >
            {editingZipRate ? 'Update Rate' : 'Add Rate'}
          </button>
          {editingZipRate && (
            <button
              onClick={() => { setEditingZipRate(null); setZipRateForm({ zip_code: '', rate_per_ccf: '', description: '' }); }}
              className="text-sm px-3 py-1.5 border rounded text-gray-600 hover:bg-gray-100"
            >
              Cancel
            </button>
          )}
        </div>

        {zipRatesLoading ? (
          <p className="text-sm text-gray-500">Loading zip rates...</p>
        ) : zipRates.length === 0 ? (
          <p className="text-sm text-gray-500">No zip code rates configured yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-hydro-sky-blue text-left">
                <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Zip Code</th>
                <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Rate ($/CCF)</th>
                <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Description</th>
                <th className="px-4 py-2 font-semibold text-hydro-deep-aqua">Active</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {zipRates.map((rate) => (
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
                    <button
                      onClick={() => handleEditZipRate(rate)}
                      className="text-xs px-2 py-1 rounded border border-hydro-deep-aqua text-hydro-deep-aqua hover:bg-hydro-sky-blue mr-1"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteZipRate(rate.id)}
                      className="text-xs px-2 py-1 rounded border border-red-400 text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* System Info */}
      <div className="card mt-6">
        <h2 className="text-xl font-semibold mb-4">System Information</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-hydro-sky-blue rounded">
            <p className="text-sm text-gray-600">Total Records</p>
            <p className="text-2xl font-bold text-hydro-deep-aqua">1,035,131</p>
            <p className="text-xs text-gray-500 mt-1">Water usage records</p>
          </div>
          <div className="p-4 bg-hydro-sky-blue rounded">
            <p className="text-sm text-gray-600">Total Customers</p>
            <p className="text-2xl font-bold text-hydro-deep-aqua">657</p>
            <p className="text-xs text-gray-500 mt-1">Active accounts</p>
          </div>
          <div className="p-4 bg-hydro-sky-blue rounded">
            <p className="text-sm text-gray-600">Date Range</p>
            <p className="text-2xl font-bold text-hydro-deep-aqua">2018-2026</p>
            <p className="text-xs text-gray-500 mt-1">8 years of data</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AdminDashboard;