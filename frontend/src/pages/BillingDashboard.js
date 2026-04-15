import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
  adminSearchBills, updateBill, refundBill, sendNotification,
  getAdminCharges, getBillingStats, generateBill, getUsage, getAlerts,
} from '../services/api';
import { BillInvoice } from './Bills';

const PER_PAGE = 25;

const STATUS_COLOR = {
  paid:     'bg-green-100 text-green-700',
  sent:     'bg-blue-100 text-blue-700',
  pending:  'bg-yellow-100 text-yellow-800',
  overdue:  'bg-red-100 text-red-700',
  refunded: 'bg-purple-100 text-purple-700',
};

const WATER_STATUS_COLOR = {
  active:          'bg-green-100 text-green-700',
  'pending shutoff': 'bg-yellow-100 text-yellow-800',
  shutoff:         'bg-red-100 text-red-700',
};

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function BillingDashboard() {
  const [stats, setStats] = useState(null);

  // Bills table
  const [bills, setBills] = useState([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsPage, setBillsPage] = useState(1);
  const [billsSearch, setBillsSearch] = useState('');
  const [billsStatus, setBillsStatus] = useState('');
  const [billsLoading, setBillsLoading] = useState(false);
  const [billsDateFrom, setBillsDateFrom] = useState('');
  const [billsDateTo, setBillsDateTo] = useState('');
  const [billsCustomerType, setBillsCustomerType] = useState('');

  // Edit bill modal
  const [editingBill, setEditingBill] = useState(null);
  const [editForm, setEditForm] = useState({ total_amount: '', status: '', due_date: '' });
  const [billSaving, setBillSaving] = useState(false);
  const [billError, setBillError] = useState(null);

  // Send reminder modal
  const [remindBill, setRemindBill] = useState(null);
  const [remindMessage, setRemindMessage] = useState('');
  const [remindSending, setRemindSending] = useState(false);
  const [remindSent, setRemindSent] = useState(false);

  // Refund modal
  const [refundingBill, setRefundingBill] = useState(null);
  const [refundProcessing, setRefundProcessing] = useState(false);
  const [refundError, setRefundError] = useState(null);

  // Generate bill modal
  const [generateModal, setGenerateModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [generateForm, setGenerateForm] = useState({ customer_id: '', month: '' });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generateSuccess, setGenerateSuccess] = useState(null);

  // Customer detail panel
  const [customerPanel, setCustomerPanel] = useState(null);
  const [panelBills, setPanelBills] = useState([]);
  const [panelUsage, setPanelUsage] = useState([]);   // all months, sorted desc
  const [panelAlerts, setPanelAlerts] = useState([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelRange, setPanelRange] = useState(6);       // months: 3 | 6 | 12 | 0 = all
  const [panelMetric, setPanelMetric] = useState('ccf'); // 'ccf' | 'amount'
  const [panelDailyUsage, setPanelDailyUsage] = useState([]);  // raw daily records
  const [panelYear, setPanelYear] = useState('all');
  const [panelGranularity, setPanelGranularity] = useState('monthly'); // 'monthly' | 'daily'
  const [panelDailyRange, setPanelDailyRange] = useState(90); // days: 30 | 90 | 365 | 0 = all

  // Invoice expand/collapse in the bills table
  const [expandedBill, setExpandedBill] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchBills(1, '', '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search — fires 400 ms after the user stops typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setBillsPage(1);
      fetchBills(1, billsSearch, billsStatus);
    }, 400);
    return () => clearTimeout(timer);
  }, [billsSearch]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async (filterParams = {}) => {
    try {
      const res = await getBillingStats(filterParams);
      setStats(res.data);
    } catch (e) {}
  };

  const fetchBills = useCallback(async (page, search, status, dateFrom, dateTo, customerType) => {
    setBillsLoading(true);
    try {
      const res = await adminSearchBills({
        page, search, status,
        date_from: dateFrom ?? billsDateFrom,
        date_to:   dateTo   ?? billsDateTo,
        customer_type: customerType ?? billsCustomerType,
      });
      setBills(res.data.bills || []);
      setBillsTotal(res.data.total || 0);
    } catch (e) {}
    finally { setBillsLoading(false); }
  }, [billsDateFrom, billsDateTo, billsCustomerType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helper: build the non-status filter params for the stats endpoint
  const statsParams = (overrides = {}) => {
    const p = {};
    const df = overrides.date_from     !== undefined ? overrides.date_from     : billsDateFrom;
    const dt = overrides.date_to       !== undefined ? overrides.date_to       : billsDateTo;
    const ct = overrides.customer_type !== undefined ? overrides.customer_type : billsCustomerType;
    const sr = overrides.search        !== undefined ? overrides.search        : billsSearch;
    if (df) p.date_from     = df;
    if (dt) p.date_to       = dt;
    if (ct) p.customer_type = ct;
    if (sr) p.search        = sr;
    return p;
  };

  const handleStatusFilter = (status) => {
    setBillsStatus(status);
    setBillsPage(1);
    fetchBills(1, billsSearch, status, billsDateFrom, billsDateTo, billsCustomerType);
    // Stats are not scoped by status (cards show per-status breakdown), no fetchStats needed
  };

  const handleApplyFilters = () => {
    setBillsPage(1);
    fetchBills(1, billsSearch, billsStatus, billsDateFrom, billsDateTo, billsCustomerType);
    fetchStats(statsParams());
  };

  const handleClearFilters = () => {
    setBillsDateFrom('');
    setBillsDateTo('');
    setBillsCustomerType('');
    setBillsPage(1);
    fetchBills(1, billsSearch, billsStatus, '', '', '');
    fetchStats(statsParams({ date_from: '', date_to: '', customer_type: '' }));
  };

  const handlePage = (newPage) => {
    setBillsPage(newPage);
    fetchBills(newPage, billsSearch, billsStatus, billsDateFrom, billsDateTo, billsCustomerType);
  };

  // Edit
  const openEdit = (bill) => {
    setEditingBill(bill);
    setEditForm({
      total_amount: parseFloat(bill.total_amount).toFixed(2),
      status: bill.status,
      due_date: bill.due_date,
    });
    setBillError(null);
  };

  const handleEditSave = async () => {
    setBillSaving(true);
    setBillError(null);
    try {
      const res = await updateBill(editingBill.id, editForm);
      const updated = { ...editingBill, ...res.data.bill };
      setBills(prev => prev.map(b => b.id === editingBill.id ? updated : b));
      setEditingBill(null);
      fetchStats();
      // Refresh panel if open and it's the same customer
      if (customerPanel && customerPanel.customer_id === editingBill.customer_id) {
        refreshPanel(customerPanel);
      }
    } catch (err) {
      setBillError(err.response?.data?.error || 'Failed to save');
    } finally {
      setBillSaving(false);
    }
  };

  // Quick mark sent
  const handleMarkSent = async (bill) => {
    try {
      const res = await updateBill(bill.id, { status: 'sent' });
      const updated = { ...bill, ...res.data.bill };
      setBills(prev => prev.map(b => b.id === bill.id ? updated : b));
      fetchStats();
    } catch (e) {}
  };

  // Refund
  const handleRefund = async () => {
    setRefundProcessing(true);
    setRefundError(null);
    try {
      const res = await refundBill(refundingBill.id);
      const updated = { ...refundingBill, ...res.data.bill };
      setBills(prev => prev.map(b => b.id === refundingBill.id ? updated : b));
      setRefundingBill(null);
      fetchStats();
      if (customerPanel && customerPanel.customer_id === refundingBill.customer_id) {
        refreshPanel(customerPanel);
      }
    } catch (err) {
      setRefundError(err.response?.data?.error || 'Failed to process refund');
    } finally {
      setRefundProcessing(false);
    }
  };

  // Reminder
  const openRemind = (bill) => {
    setRemindBill(bill);
    const amount = parseFloat(bill.total_amount).toFixed(2);
    setRemindMessage(
      `Hi ${bill.customer_name},\n\nYour water bill of $${amount} for the period ${bill.billing_period_start} to ${bill.billing_period_end} is due on ${bill.due_date}.\n\nPlease log in to HydroSpark to view and pay your bill.\n\nThank you,\nHydroSpark Billing Team`
    );
    setRemindSent(false);
  };

  const handleSendReminder = async () => {
    setRemindSending(true);
    try {
      await sendNotification({
        title: 'Payment Reminder',
        message: remindMessage,
        user_id: remindBill.user_id,
      });
      setRemindSent(true);
      setTimeout(() => { setRemindBill(null); setRemindSent(false); }, 1500);
    } catch (e) {}
    finally { setRemindSending(false); }
  };

  // Generate bill
  const openGenerate = async () => {
    setGenerateModal(true);
    setGenerateError(null);
    setGenerateSuccess(null);
    setGenerateForm({ customer_id: '', month: '' });
    if (customers.length === 0) {
      setCustomersLoading(true);
      try {
        const res = await getAdminCharges();
        setCustomers(res.data.customers || []);
      } catch (e) {}
      finally { setCustomersLoading(false); }
    }
  };

  const handleGenerateBill = async () => {
    if (!generateForm.customer_id || !generateForm.month) {
      setGenerateError('Please select a customer and billing month.');
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    const [year, month] = generateForm.month.split('-').map(Number);
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    try {
      const res = await generateBill({
        customer_id: parseInt(generateForm.customer_id),
        start_date: start,
        end_date: end,
      });
      const bill = res.data.bill;
      setGenerateSuccess(`Bill generated: $${parseFloat(bill.total_amount).toFixed(2)} for ${start} → ${end}`);
      setGenerateForm({ customer_id: '', month: '' });
      fetchStats();
      fetchBills(billsPage, billsSearch, billsStatus);
    } catch (err) {
      setGenerateError(err.response?.data?.error || 'Failed to generate bill');
    } finally {
      setGenerating(false);
    }
  };

  // Customer detail panel
  const refreshPanel = async (info) => {
    setPanelLoading(true);
    try {
      const [billsRes, usageRes, alertsRes] = await Promise.all([
        adminSearchBills({ customer_id: info.customer_id, per_page: 50 }),
        getUsage({ customer_id: info.customer_id }),
        getAlerts({ customer_id: info.customer_id }),
      ]);

      setPanelBills(billsRes.data.bills || []);

      // Aggregate daily usage into monthly totals
      const usageData = usageRes.data.usage || [];
      setPanelDailyUsage(usageData);
      const monthMap = {};
      usageData.forEach(u => {
        const key = `${u.year}-${String(u.month).padStart(2, '0')}`;
        if (!monthMap[key]) monthMap[key] = { year: u.year, month: u.month, total: 0 };
        monthMap[key].total += parseFloat(u.daily_usage_ccf);
      });
      const monthly = Object.values(monthMap)
        .sort((a, b) => b.year - a.year || b.month - a.month);
      setPanelUsage(monthly);

      setPanelAlerts((alertsRes.data.alerts || []).slice(0, 5));
    } catch (e) {}
    finally { setPanelLoading(false); }
  };

  const openCustomerPanel = (bill) => {
    const info = {
      customer_id: bill.customer_id,
      customer_name: bill.customer_name,
      customer_email: bill.customer_email,
      customer_type: bill.customer_type,
      location_id: bill.location_id,
      water_status: bill.water_status || 'active',
      user_id: bill.user_id,
    };
    setCustomerPanel(info);
    setPanelBills([]);
    setPanelUsage([]);
    setPanelAlerts([]);
    setPanelRange(6);
    setPanelMetric('ccf');
    setPanelGranularity('monthly');
    setPanelDailyRange(90);
    setPanelYear('all');
    refreshPanel(info);
  };

  const totalPages = Math.ceil(billsTotal / PER_PAGE);

  // ── Derived stats ──────────────────────────────────────────────────────────
  // Priority: open customer panel > active table filters > global
  const isTableFiltered = !!(billsDateFrom || billsDateTo || billsCustomerType || billsSearch);
  const isFiltered = customerPanel !== null || isTableFiltered;
  const firstOfThisMonth = (() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; })();

  // When a customer panel is open, compute stats from the customer's fetched bills.
  // Otherwise, `stats` already reflects any active table filters (updated in handleApplyFilters etc.)
  const displayStats = customerPanel !== null
    ? {
        outstanding: {
          count: panelBills.filter(b => ['pending', 'sent'].includes(b.status)).length,
          total: panelBills.filter(b => ['pending', 'sent'].includes(b.status))
            .reduce((s, b) => s + parseFloat(b.total_amount), 0),
        },
        overdue: {
          count: panelBills.filter(b => b.status === 'overdue').length,
          total: panelBills.filter(b => b.status === 'overdue')
            .reduce((s, b) => s + parseFloat(b.total_amount), 0),
        },
        paid_this_month: {
          count: panelBills.filter(b => b.status === 'paid' && b.paid_at && new Date(b.paid_at) >= firstOfThisMonth).length,
          total: panelBills.filter(b => b.status === 'paid' && b.paid_at && new Date(b.paid_at) >= firstOfThisMonth)
            .reduce((s, b) => s + parseFloat(b.total_amount), 0),
        },
      }
    : stats;

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Billing</h1>
          <p className="text-sm text-gray-400 mt-1">Manage bills, send reminders, and track payments</p>
        </div>
        <button
          onClick={openGenerate}
          className="text-white text-sm font-semibold px-4 py-2 rounded-lg transition"
          style={{ background: '#0A4C78' }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          + Generate Bill
        </button>
      </div>

      {/* Filter indicator */}
      {isFiltered && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
          <span className="text-xs text-blue-500">▼</span>
          <p className="text-sm font-semibold text-blue-800 flex-1">
            {customerPanel
              ? <>Showing stats for: <span className="text-hydro-deep-aqua">{customerPanel.customer_name}</span></>
              : <>Showing stats for: <span className="text-hydro-deep-aqua">filtered results</span>
                  {billsCustomerType && <span className="ml-1 text-blue-500 font-normal">({billsCustomerType})</span>}
                  {(billsDateFrom || billsDateTo) && (
                    <span className="ml-1 text-blue-500 font-normal">
                      {billsDateFrom && billsDateTo ? ` · ${billsDateFrom} → ${billsDateTo}` : billsDateFrom ? ` · from ${billsDateFrom}` : ` · to ${billsDateTo}`}
                    </span>
                  )}
                </>
            }
          </p>
          <button
            onClick={() => {
              if (customerPanel) setCustomerPanel(null);
              else handleClearFilters();
            }}
            className="text-xs text-blue-500 hover:text-blue-700 font-semibold"
          >
            Show all ×
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-hydro-deep-aqua">
            ${(displayStats?.outstanding?.total || 0).toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{displayStats?.outstanding?.count || 0} bills pending or sent</p>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-600">
            ${(displayStats?.overdue?.total || 0).toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{displayStats?.overdue?.count || 0} bills overdue</p>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #22c55e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Paid This Month</p>
          <p className="text-2xl font-bold text-green-600">
            ${(displayStats?.paid_this_month?.total || 0).toFixed(2)}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{displayStats?.paid_this_month?.count || 0} payments received</p>
        </div>
      </div>

      {/* Bills Table */}
      <div className="card">
        {/* ── Filter bar ── */}
        <div className="flex flex-col gap-3 mb-5">
          {/* Row 1: search + status */}
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={billsSearch}
              onChange={e => setBillsSearch(e.target.value)}
              placeholder="Search by customer name, email, or location ID…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={billsStatus}
              onChange={e => handleStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
              <option value="overdue">Overdue</option>
              <option value="paid">Paid</option>
              <option value="refunded">Refunded</option>
            </select>
            <select
              value={billsCustomerType}
              onChange={e => { setBillsCustomerType(e.target.value); setBillsPage(1); fetchBills(1, billsSearch, billsStatus, billsDateFrom, billsDateTo, e.target.value); fetchStats(statsParams({ customer_type: e.target.value })); }}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="Residential">Residential</option>
              <option value="Municipal">Municipal</option>
              <option value="Commercial">Commercial</option>
            </select>
          </div>
          {/* Row 2: date range */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400 font-medium whitespace-nowrap">Period:</span>
            <input
              type="date"
              value={billsDateFrom}
              onChange={e => setBillsDateFrom(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              title="Billing period from"
            />
            <span className="text-xs text-gray-400">→</span>
            <input
              type="date"
              value={billsDateTo}
              onChange={e => setBillsDateTo(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
              title="Billing period to"
            />
            <button
              onClick={handleApplyFilters}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white transition"
              style={{ background: '#0A4C78' }}
            >
              Apply
            </button>
            {(billsDateFrom || billsDateTo || billsCustomerType) && (
              <button
                onClick={handleClearFilters}
                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        {billsLoading ? (
          <div className="flex justify-center py-12"><div className="hydro-spinner" /></div>
        ) : bills.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No bills found</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Customer</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Period</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(bill => {
                    const isExp = expandedBill === bill.id;
                    const customerInfo = {
                      customer_name: bill.customer_name,
                      mailing_address: bill.mailing_address,
                      zip_code: bill.zip_code,
                      location_id: bill.location_id,
                      customer_type: bill.customer_type,
                    };
                    return (
                      <React.Fragment key={bill.id}>
                        <tr className={`border-t ${isExp ? 'bg-blue-50/40' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => openCustomerPanel(bill)}
                              className="text-left hover:underline"
                            >
                              <p className="text-sm font-medium text-hydro-deep-aqua">{bill.customer_name}</p>
                            </button>
                            <p className="text-xs text-gray-400">{bill.customer_email}</p>
                            <p className="text-xs text-gray-400">{bill.location_id}</p>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {bill.billing_period_start} → {bill.billing_period_end}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-hydro-deep-aqua whitespace-nowrap">
                            ${parseFloat(bill.total_amount).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                            {bill.due_date}
                            {bill.paid_at && (
                              <p className="text-xs text-green-600">
                                Paid {bill.paid_at.slice(0, 10)}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${STATUS_COLOR[bill.status] || 'bg-gray-100 text-gray-600'}`}>
                              {bill.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2 flex-wrap">
                              {bill.status === 'pending' && (
                                <button
                                  onClick={() => handleMarkSent(bill)}
                                  className="text-xs px-2.5 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition whitespace-nowrap"
                                >
                                  Mark Sent
                                </button>
                              )}
                              {bill.status !== 'paid' && bill.status !== 'refunded' && (
                                <button
                                  onClick={() => openRemind(bill)}
                                  className="text-xs px-2.5 py-1 rounded border border-yellow-200 text-yellow-700 hover:bg-yellow-50 transition"
                                >
                                  Remind
                                </button>
                              )}
                              {bill.status === 'paid' && (
                                <button
                                  onClick={() => { setRefundingBill(bill); setRefundError(null); }}
                                  className="text-xs px-2.5 py-1 rounded border border-purple-200 text-purple-700 hover:bg-purple-50 transition whitespace-nowrap"
                                >
                                  Refund
                                </button>
                              )}
                              {bill.status === 'paid' || bill.status === 'refunded' ? (
                                <span
                                  className="text-xs px-2.5 py-1 rounded border border-gray-100 text-gray-300 cursor-not-allowed"
                                  title="Paid bills cannot be edited"
                                >
                                  Edit
                                </span>
                              ) : (
                                <button
                                  onClick={() => openEdit(bill)}
                                  className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                                >
                                  Edit
                                </button>
                              )}
                              <button
                                onClick={() => setExpandedBill(isExp ? null : bill.id)}
                                className="text-xs px-2.5 py-1 rounded border transition whitespace-nowrap"
                                style={isExp
                                  ? { borderColor: 'rgba(30,167,214,0.5)', color: '#0A4C78', background: 'rgba(30,167,214,0.08)' }
                                  : { borderColor: '#e5e7eb', color: '#6b7280' }}
                              >
                                {isExp ? 'Close' : 'View'} <span style={{ display: 'inline-block', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                              </button>
                            </div>
                          </td>
                        </tr>

                        {isExp && (
                          <tr>
                            <td colSpan={6} className="px-5 pb-6 pt-3" style={{ background: 'linear-gradient(to bottom, rgba(239,246,255,0.4), transparent)' }}>
                              <BillInvoice bill={bill} customer={customerInfo} />
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-400">{billsTotal} total &bull; Page {billsPage} of {totalPages}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePage(billsPage - 1)}
                    disabled={billsPage === 1}
                    className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => handlePage(billsPage + 1)}
                    disabled={billsPage >= totalPages}
                    className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Customer Detail Panel ── */}
      {customerPanel && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.35)' }}
          onClick={() => setCustomerPanel(null)}
        >
          <div
            className="bg-white h-full overflow-y-auto shadow-2xl"
            style={{ width: '480px', maxWidth: '100vw' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Panel header */}
            <div className="px-6 py-5 border-b border-gray-100" style={{ background: '#0A4C78' }}>
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-white font-bold text-xl">{customerPanel.customer_name}</p>
                  <p className="text-blue-200 text-sm mt-0.5">{customerPanel.customer_email}</p>
                </div>
                <button
                  onClick={() => setCustomerPanel(null)}
                  className="text-blue-200 hover:text-white text-xl font-bold leading-none mt-0.5"
                >
                  ×
                </button>
              </div>
              <div className="flex gap-3 mt-3 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full bg-white bg-opacity-20 text-white font-medium">
                  {customerPanel.customer_type}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-white bg-opacity-20 text-white font-medium">
                  {customerPanel.location_id}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${WATER_STATUS_COLOR[customerPanel.water_status] || 'bg-gray-100 text-gray-600'}`}>
                  {customerPanel.water_status}
                </span>
              </div>
            </div>

            {panelLoading ? (
              <div className="flex justify-center py-16"><div className="hydro-spinner" /></div>
            ) : (
              <div className="px-6 py-5 space-y-6">

                {/* Usage summary */}
                <div>
                  {/* ── Filter controls ── */}
                  <div className="flex flex-wrap items-center justify-between gap-y-2 mb-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Usage History</p>
                    <div className="flex flex-wrap items-center gap-1.5">

                      {/* Granularity toggle */}
                      <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs">
                        {[['monthly', 'Monthly'], ['daily', 'Daily']].map(([val, label]) => (
                          <button key={val}
                            onClick={() => {
                              setPanelGranularity(val);
                              if (val === 'daily') setPanelMetric('ccf');
                            }}
                            className="px-2 py-1"
                            style={panelGranularity === val
                              ? { background: '#0A4C78', color: '#fff' }
                              : { background: '#fff', color: '#374151' }}
                          >{label}</button>
                        ))}
                      </div>

                      {/* Metric toggle — monthly only */}
                      {panelGranularity === 'monthly' && (
                        <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs">
                          {[['ccf', 'CCF'], ['amount', '$']].map(([val, label]) => (
                            <button key={val}
                              onClick={() => setPanelMetric(val)}
                              className="px-2 py-1"
                              style={panelMetric === val
                                ? { background: '#0A4C78', color: '#fff' }
                                : { background: '#fff', color: '#374151' }}
                            >{label}</button>
                          ))}
                        </div>
                      )}

                      {/* Range buttons */}
                      <div className="flex rounded-md overflow-hidden border border-gray-200 text-xs">
                        {panelGranularity === 'monthly'
                          ? [[3,'3m'],[6,'6m'],[12,'12m'],[0,'All']].map(([val, label]) => (
                              <button key={val} onClick={() => setPanelRange(val)} className="px-2 py-1"
                                style={panelRange === val
                                  ? { background: '#0A4C78', color: '#fff' }
                                  : { background: '#fff', color: '#374151' }}
                              >{label}</button>
                            ))
                          : [[30,'30d'],[90,'90d'],[365,'1yr'],[0,'All']].map(([val, label]) => (
                              <button key={val} onClick={() => setPanelDailyRange(val)} className="px-2 py-1"
                                style={panelDailyRange === val
                                  ? { background: '#0A4C78', color: '#fff' }
                                  : { background: '#fff', color: '#374151' }}
                              >{label}</button>
                            ))
                        }
                      </div>

                      {/* Year filter */}
                      {(() => {
                        const years = [...new Set(panelUsage.map(u => u.year))].sort((a, b) => b - a);
                        if (years.length < 2) return null;
                        return (
                          <select value={panelYear} onChange={e => setPanelYear(e.target.value)}
                            style={{ border: '1px solid #e5e7eb', borderRadius: '6px', fontSize: '11px',
                                     padding: '2px 6px', background: '#fff', color: '#374151' }}>
                            <option value="all">All Years</option>
                            {years.map(y => <option key={y} value={String(y)}>{y}</option>)}
                          </select>
                        );
                      })()}

                    </div>
                  </div>

                  {/* ── Chart ── */}
                  {panelUsage.length === 0 ? (
                    <p className="text-sm text-gray-400">No usage data found.</p>
                  ) : (() => {
                    let chartData;

                    if (panelGranularity === 'monthly') {
                      const sorted = [...panelUsage].sort((a, b) =>
                        a.year !== b.year ? a.year - b.year : a.month - b.month
                      );
                      const yearFiltered = panelYear === 'all'
                        ? sorted
                        : sorted.filter(u => u.year === parseInt(panelYear));
                      const sliced = panelRange === 0 ? yearFiltered : yearFiltered.slice(-panelRange);
                      chartData = sliced.map(u => {
                        const matchBill = panelBills.find(b => {
                          const d = new Date(b.billing_period_end);
                          return d.getFullYear() === u.year && (d.getMonth() + 1) === u.month;
                        });
                        return {
                          label: `${MONTH_NAMES[u.month]} ${String(u.year).slice(2)}`,
                          ccf: parseFloat(u.total.toFixed(2)),
                          amount: matchBill ? parseFloat(parseFloat(matchBill.total_amount).toFixed(2)) : 0,
                        };
                      });
                    } else {
                      // Daily mode — aggregate raw records by date
                      const dayMap = {};
                      panelDailyUsage.forEach(u => {
                        if (!u.usage_date) return;
                        dayMap[u.usage_date] = (dayMap[u.usage_date] || 0) + parseFloat(u.daily_usage_ccf);
                      });
                      let entries = Object.entries(dayMap).sort(([a], [b]) => a.localeCompare(b));
                      if (panelYear !== 'all') {
                        entries = entries.filter(([d]) => d.startsWith(panelYear));
                      }
                      const sliced = panelDailyRange === 0 ? entries : entries.slice(-panelDailyRange);
                      const avg = sliced.length > 0
                        ? sliced.reduce((s, [, v]) => s + v, 0) / sliced.length : 0;
                      chartData = sliced.map(([date, ccf]) => ({
                        label: date.slice(5),   // MM-DD
                        fullDate: date,
                        ccf: parseFloat(ccf.toFixed(2)),
                        color: ccf > avg * 1.3 ? '#ef4444' : ccf > avg ? '#f59e0b' : '#1ea7d6',
                      }));
                    }

                    const dataKey = panelGranularity === 'daily' ? 'ccf'
                      : panelMetric === 'amount' ? 'amount' : 'ccf';
                    const tickFmt = panelMetric === 'amount' && panelGranularity === 'monthly'
                      ? (v) => `$${v}` : (v) => `${v}`;
                    const isDailyMode = panelGranularity === 'daily';
                    const labelInterval = isDailyMode
                      ? Math.max(0, Math.floor(chartData.length / 10) - 1) : 0;

                    return (
                      <ResponsiveContainer width="100%" height={isDailyMode ? 210 : 180}>
                        <BarChart data={chartData}
                          margin={{ top: 4, right: 8, left: 0, bottom: isDailyMode ? 24 : 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                          <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={labelInterval}
                            angle={isDailyMode ? -45 : 0}
                            textAnchor={isDailyMode ? 'end' : 'middle'}
                          />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={tickFmt}
                            width={panelMetric === 'amount' && !isDailyMode ? 50 : 36}
                          />
                          <Tooltip
                            formatter={(value) =>
                              panelMetric === 'amount' && !isDailyMode
                                ? [`$${value}`, 'Amount']
                                : [`${value} CCF`, 'Usage']
                            }
                            labelFormatter={(label, payload) =>
                              payload?.[0]?.payload?.fullDate || label
                            }
                          />
                          {isDailyMode ? (
                            <Bar dataKey={dataKey} radius={[2, 2, 0, 0]}>
                              {chartData.map((entry, i) => (
                                <Cell key={i} fill={entry.color || '#1ea7d6'} />
                              ))}
                            </Bar>
                          ) : (
                            <Bar dataKey={dataKey} fill="#0A4C78" radius={[3, 3, 0, 0]} />
                          )}
                        </BarChart>
                      </ResponsiveContainer>
                    );
                  })()}

                  {panelGranularity === 'daily' && (
                    <div className="flex gap-3 text-xs text-gray-400 mt-1">
                      <span><span className="inline-block w-2 h-2 rounded-sm bg-sky-400 mr-1" />Normal</span>
                      <span><span className="inline-block w-2 h-2 rounded-sm bg-amber-400 mr-1" />Above avg</span>
                      <span><span className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1" />30%+ above avg</span>
                    </div>
                  )}
                </div>

                {/* Alerts */}
                {panelAlerts.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Recent Alerts</p>
                    <div className="space-y-2">
                      {panelAlerts.map((a, i) => (
                        <div key={i} className="flex justify-between items-center text-sm p-2 rounded-lg bg-red-50">
                          <span className="text-red-700 font-medium capitalize">{a.alert_type}</span>
                          <span className="text-xs text-gray-400">{a.alert_date}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Bills */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Bill History</p>
                  {panelBills.length === 0 ? (
                    <p className="text-sm text-gray-400">No bills found.</p>
                  ) : (
                    <div className="space-y-2">
                      {panelBills.map(b => (
                        <div key={b.id} className="flex justify-between items-center p-3 rounded-lg border border-gray-100 hover:bg-gray-50">
                          <div>
                            <p className="text-sm text-gray-700">
                              {b.billing_period_start} → {b.billing_period_end}
                            </p>
                            <p className="text-xs text-gray-400">Due {b.due_date}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-hydro-deep-aqua">
                              ${parseFloat(b.total_amount).toFixed(2)}
                            </p>
                            <span className={`text-xs px-1.5 py-0.5 rounded font-semibold ${STATUS_COLOR[b.status] || 'bg-gray-100 text-gray-600'}`}>
                              {b.status.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            )}
          </div>
        </div>
      )}

      {/* Edit Bill Modal */}
      {editingBill && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!billSaving) setEditingBill(null); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-1">Edit Bill</h3>
            <p className="text-sm text-gray-500 mb-5">
              {editingBill.customer_name} &bull; {editingBill.billing_period_start} to {editingBill.billing_period_end}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Amount ($)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editForm.total_amount}
                  onChange={e => setEditForm(f => ({ ...f, total_amount: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Due Date</label>
                <input
                  type="date"
                  value={editForm.due_date}
                  onChange={e => setEditForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Status</label>
                <select
                  value={editForm.status}
                  onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="pending">Pending</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>

            {billError && <p className="text-sm text-red-600 mt-3">{billError}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditingBill(null)}
                disabled={billSaving}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={billSaving}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#0A4C78' }}
                onMouseEnter={e => { if (!billSaving) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {billSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Send Reminder Modal */}
      {remindBill && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!remindSending) { setRemindBill(null); setRemindSent(false); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-1">Send Payment Reminder</h3>
            <p className="text-sm text-gray-500 mb-4">
              To: {remindBill.customer_name} ({remindBill.customer_email})
            </p>

            <textarea
              value={remindMessage}
              onChange={e => setRemindMessage(e.target.value)}
              rows={8}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => { setRemindBill(null); setRemindSent(false); }}
                disabled={remindSending}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendReminder}
                disabled={remindSending || remindSent}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: remindSent ? '#22c55e' : '#0A4C78' }}
              >
                {remindSent ? 'Sent!' : remindSending ? 'Sending…' : 'Send Reminder'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Refund Confirmation Modal */}
      {refundingBill && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!refundProcessing) { setRefundingBill(null); setRefundError(null); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-800">Issue Refund</h3>
                <p className="text-sm text-gray-500">This action cannot be undone</p>
              </div>
            </div>

            <div className="bg-purple-50 rounded-xl p-4 mb-5">
              <p className="text-sm font-semibold text-gray-700">{refundingBill.customer_name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {refundingBill.billing_period_start} → {refundingBill.billing_period_end}
              </p>
              <p className="text-xl font-bold text-purple-700 mt-2">
                ${parseFloat(refundingBill.total_amount).toFixed(2)}
              </p>
            </div>

            <p className="text-sm text-gray-600 mb-5">
              This will mark the bill as <strong>Refunded</strong> and notify the customer. The bill will no longer be editable.
            </p>

            {refundError && <p className="text-sm text-red-600 mb-4">{refundError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setRefundingBill(null); setRefundError(null); }}
                disabled={refundProcessing}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRefund}
                disabled={refundProcessing}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#7c3aed' }}
                onMouseEnter={e => { if (!refundProcessing) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {refundProcessing ? 'Processing…' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Generate Bill Modal */}
      {generateModal && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!generating) setGenerateModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-5">Generate Bill</h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Customer</label>
                {customersLoading ? (
                  <p className="text-sm text-gray-400">Loading customers…</p>
                ) : (
                  <select
                    value={generateForm.customer_id}
                    onChange={e => setGenerateForm(f => ({ ...f, customer_id: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">Select customer…</option>
                    {customers.map(c => (
                      <option key={c.customer_id} value={c.customer_id}>
                        {c.customer_name} ({c.location_id})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Billing Month</label>
                <input
                  type="month"
                  value={generateForm.month}
                  onChange={e => setGenerateForm(f => ({ ...f, month: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            {generateError && <p className="text-sm text-red-600 mt-3">{generateError}</p>}
            {generateSuccess && <p className="text-sm text-green-600 mt-3">{generateSuccess}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setGenerateModal(false)}
                disabled={generating}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Close
              </button>
              <button
                onClick={handleGenerateBill}
                disabled={generating}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#0A4C78' }}
                onMouseEnter={e => { if (!generating) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export default BillingDashboard;
