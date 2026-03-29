import React, { useState, useEffect, useCallback } from 'react';
import {
  adminSearchBills, updateBill, sendNotification,
  getAdminCharges, getBillingStats, generateBill,
} from '../services/api';

const PER_PAGE = 25;

const STATUS_COLOR = {
  paid:    'bg-green-100 text-green-700',
  sent:    'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-700',
};

function BillingDashboard() {
  const [stats, setStats] = useState(null);

  // Bills table
  const [bills, setBills] = useState([]);
  const [billsTotal, setBillsTotal] = useState(0);
  const [billsPage, setBillsPage] = useState(1);
  const [billsSearch, setBillsSearch] = useState('');
  const [billsStatus, setBillsStatus] = useState('');
  const [billsLoading, setBillsLoading] = useState(false);

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

  // Generate bill modal
  const [generateModal, setGenerateModal] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [generateForm, setGenerateForm] = useState({ customer_id: '', month: '' });
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [generateSuccess, setGenerateSuccess] = useState(null);

  useEffect(() => {
    fetchStats();
    fetchBills(1, '', '');
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStats = async () => {
    try {
      const res = await getBillingStats();
      setStats(res.data);
    } catch (e) {}
  };

  const fetchBills = useCallback(async (page, search, status) => {
    setBillsLoading(true);
    try {
      const res = await adminSearchBills({ page, search, status });
      setBills(res.data.bills || []);
      setBillsTotal(res.data.total || 0);
    } catch (e) {}
    finally { setBillsLoading(false); }
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    setBillsPage(1);
    fetchBills(1, billsSearch, billsStatus);
  };

  const handleStatusFilter = (status) => {
    setBillsStatus(status);
    setBillsPage(1);
    fetchBills(1, billsSearch, status);
  };

  const handlePage = (newPage) => {
    setBillsPage(newPage);
    fetchBills(newPage, billsSearch, billsStatus);
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

  const totalPages = Math.ceil(billsTotal / PER_PAGE);

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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Outstanding</p>
          <p className="text-2xl font-bold text-hydro-deep-aqua">${(stats?.outstanding?.total || 0).toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-0.5">{stats?.outstanding?.count || 0} bills pending or sent</p>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #ef4444' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Overdue</p>
          <p className="text-2xl font-bold text-red-600">${(stats?.overdue?.total || 0).toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-0.5">{stats?.overdue?.count || 0} bills overdue</p>
        </div>
        <div className="card" style={{ borderLeft: '4px solid #22c55e' }}>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Paid This Month</p>
          <p className="text-2xl font-bold text-green-600">${(stats?.paid_this_month?.total || 0).toFixed(2)}</p>
          <p className="text-sm text-gray-500 mt-0.5">{stats?.paid_this_month?.count || 0} payments received</p>
        </div>
      </div>

      {/* Bills Table */}
      <div className="card">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1">
            <input
              type="text"
              value={billsSearch}
              onChange={e => setBillsSearch(e.target.value)}
              placeholder="Search by customer name, email, or location ID…"
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="text-sm font-medium px-4 py-2 rounded-lg text-white"
              style={{ background: '#0A4C78' }}
            >
              Search
            </button>
          </form>
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
          </select>
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
                  {bills.map(bill => (
                    <tr key={bill.id} className="border-t hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">{bill.customer_name}</p>
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
                        <div className="flex justify-end gap-2">
                          {bill.status === 'pending' && (
                            <button
                              onClick={() => handleMarkSent(bill)}
                              className="text-xs px-2.5 py-1 rounded border border-blue-200 text-blue-600 hover:bg-blue-50 transition whitespace-nowrap"
                            >
                              Mark Sent
                            </button>
                          )}
                          {bill.status !== 'paid' && (
                            <button
                              onClick={() => openRemind(bill)}
                              className="text-xs px-2.5 py-1 rounded border border-yellow-200 text-yellow-700 hover:bg-yellow-50 transition"
                            >
                              Remind
                            </button>
                          )}
                          <button
                            onClick={() => openEdit(bill)}
                            className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 transition"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
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

      {/* Edit Bill Modal */}
      {editingBill && (
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
        </div>
      )}

      {/* Send Reminder Modal */}
      {remindBill && (
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
        </div>
      )}

      {/* Generate Bill Modal */}
      {generateModal && (
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
        </div>
      )}
    </div>
  );
}

export default BillingDashboard;
