import React, { useState, useEffect } from 'react';
import { importData, getAdminCharges } from '../services/api';
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
    fetchCharges();
  }, []);

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
              <li>Rate: $2.50/CCF for Residential</li>
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
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua text-right">Bills</th>
                    <th className="px-4 py-2 font-semibold text-hydro-deep-aqua text-right">Total Charges</th>
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
                          className="border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() =>
                            setExpandedCustomer(
                              expandedCustomer === customer.customer_id ? null : customer.customer_id
                            )
                          }
                        >
                          <td className="px-4 py-3 font-medium">{customer.customer_name || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.email || '—'}</td>
                          <td className="px-4 py-3 text-gray-600">{customer.customer_type || '—'}</td>
                          <td className="px-4 py-3 text-right">{customer.bill_count}</td>
                          <td className="px-4 py-3 text-right font-semibold">
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
                          <td className="px-4 py-3 text-gray-400 text-right">
                            {expandedCustomer === customer.customer_id ? '▲' : '▼'}
                          </td>
                        </tr>
                        {expandedCustomer === customer.customer_id && (
                          <tr key={`${customer.customer_id}-bills`}>
                            <td colSpan={7} className="px-6 py-4 bg-gray-50">
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="text-left text-gray-500 border-b">
                                    <th className="pb-1 pr-4">Period</th>
                                    <th className="pb-1 pr-4">Usage (CCF)</th>
                                    <th className="pb-1 pr-4">Amount</th>
                                    <th className="pb-1 pr-4">Due Date</th>
                                    <th className="pb-1">Status</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {customer.bills.map((bill) => (
                                    <tr key={bill.id} className="border-b border-gray-100">
                                      <td className="py-1.5 pr-4">
                                        {bill.billing_period_start} – {bill.billing_period_end}
                                      </td>
                                      <td className="py-1.5 pr-4">{parseFloat(bill.total_usage_ccf).toFixed(2)}</td>
                                      <td className="py-1.5 pr-4 font-medium">
                                        ${parseFloat(bill.total_amount).toFixed(2)}
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
                                  ))}
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