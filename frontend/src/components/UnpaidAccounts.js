// ─────────────────────────────────────────────────────────────────────────────
// FILE: frontend/src/components/UnpaidAccounts.js
//
// Drop-in component for BillingDashboard.js.
//
// Usage in BillingDashboard.js:
//   1. Import at the top:
//        import UnpaidAccounts from '../components/UnpaidAccounts';
//
//   2. Add the api import:
//        import { ..., getUnpaidAccounts } from '../services/api';
//
//   3. Place <UnpaidAccounts onOpenCustomer={openCustomerPanel} />
//      just above the bills table card (before <div className="card">)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { getUnpaidAccounts, sendNotification, updateBill, adminSearchBills } from '../services/api';

const URGENCY = {
  critical: { label: 'Overdue',     bg: 'bg-red-100',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500'    },
  warning:  { label: 'Past Due',    bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  pending:  { label: 'Outstanding', bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-200', dot: 'bg-yellow-400' },
};

const WATER_STATUS_STYLE = {
  active:          'bg-green-100 text-green-700',
  pending_shutoff: 'bg-yellow-100 text-yellow-800',
  shutoff:         'bg-red-100 text-red-700',
};

export default function UnpaidAccounts({ onOpenCustomer }) {
  const [unpaid, setUnpaid]           = useState([]);
  const [summary, setSummary]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [filterType, setFilterType]   = useState('');
  const [filterUrgency, setFilterUrgency] = useState(''); // '' | 'critical' | 'warning' | 'pending'
  const [collapsed, setCollapsed]     = useState(false);

  // Bulk reminder state
  const [reminding, setReminding]     = useState(null);  // customer_id being reminded
  const [reminded, setReminded]       = useState({});     // { customer_id: true }

  // Mark overdue state
  const [markingOverdue, setMarkingOverdue] = useState(null);

  const fetchUnpaid = useCallback(async (s = search, ct = filterType) => {
    setLoading(true);
    try {
      const res = await getUnpaidAccounts({ search: s, customer_type: ct });
      setUnpaid(res.data.unpaid || []);
      setSummary(res.data.summary || null);
    } catch (e) {
      console.error('Failed to load unpaid accounts', e);
    } finally {
      setLoading(false);
    }
  }, [search, filterType]);

  useEffect(() => {
    fetchUnpaid();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => fetchUnpaid(search, filterType), 350);
    return () => clearTimeout(t);
  }, [search, filterType]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleRemind = async (customer) => {
    setReminding(customer.customer_id);
    try {
      // Fetch the customer's oldest unpaid bill for the reminder message
      const billsRes = await adminSearchBills({
        customer_id: customer.customer_id,
        status: customer.urgency === 'critical' ? 'overdue' : '',
        per_page: 1,
      });
      const bill = billsRes.data.bills?.[0];
      const amount = customer.unpaid_total.toLocaleString('en-US', { minimumFractionDigits: 2 });
      const dueDate = customer.oldest_due
        ? new Date(customer.oldest_due + 'T00:00:00').toLocaleDateString()
        : 'soon';

      const message = bill
        ? `Hi ${customer.customer_name},\n\nYour water bill of $${amount} for the period ${bill.billing_period_start} to ${bill.billing_period_end} was due on ${dueDate}.\n\nPlease log in to HydroSpark to view and pay your balance.\n\nThank you,\nHydroSpark Billing Team`
        : `Hi ${customer.customer_name},\n\nYou have an outstanding balance of $${amount} due on ${dueDate}.\n\nPlease log in to HydroSpark to view and pay your balance.\n\nThank you,\nHydroSpark Billing Team`;

      // We need the user_id — fetch from the bills response
      const userId = bill?.user_id;
      if (!userId) {
        alert('Could not find user account for this customer.');
        return;
      }

      await sendNotification({
        title: customer.urgency === 'critical' ? 'Overdue Balance Notice' : 'Payment Reminder',
        message,
        user_id: userId,
      });

      setReminded(prev => ({ ...prev, [customer.customer_id]: true }));
      setTimeout(() => setReminded(prev => { const n = { ...prev }; delete n[customer.customer_id]; return n; }), 3000);
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to send reminder');
    } finally {
      setReminding(null);
    }
  };

  const handleMarkOverdue = async (customer) => {
    if (!window.confirm(`Mark all unpaid bills for ${customer.customer_name} as Overdue?`)) return;
    setMarkingOverdue(customer.customer_id);
    try {
      // Fetch all pending/sent bills for this customer and mark them overdue
      const billsRes = await adminSearchBills({ customer_id: customer.customer_id, per_page: 100 });
      const toMark = (billsRes.data.bills || []).filter(b => ['pending', 'sent'].includes(b.status));
      await Promise.all(toMark.map(b => updateBill(b.id, { status: 'overdue' })));
      // Refresh
      await fetchUnpaid();
    } catch (e) {
      alert(e.response?.data?.error || 'Failed to mark overdue');
    } finally {
      setMarkingOverdue(null);
    }
  };

  // Filter displayed rows
  const displayed = unpaid.filter(c => {
    if (filterUrgency && c.urgency !== filterUrgency) return false;
    return true;
  });

  const totalOwed = displayed.reduce((s, c) => s + c.unpaid_total, 0);

  if (!loading && unpaid.length === 0) return null; // hide when clean

  return (
    <div className="card mb-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-gray-400 hover:text-gray-600 transition"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            <span style={{ display: 'inline-block', transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
          </button>
          <div>
            <h2 className="text-lg font-semibold text-hydro-deep-aqua">Unpaid Accounts</h2>
            <p className="text-xs text-gray-400 mt-0.5">Customers with outstanding balances</p>
          </div>
        </div>

        {/* Summary badges */}
        {summary && !collapsed && (
          <div className="flex flex-wrap gap-2">
            {summary.critical > 0 && (
              <button
                onClick={() => setFilterUrgency(filterUrgency === 'critical' ? '' : 'critical')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${filterUrgency === 'critical' ? 'bg-red-600 text-white border-red-600' : 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
                {summary.critical} Overdue
              </button>
            )}
            {summary.warning > 0 && (
              <button
                onClick={() => setFilterUrgency(filterUrgency === 'warning' ? '' : 'warning')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${filterUrgency === 'warning' ? 'bg-orange-600 text-white border-orange-600' : 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500 inline-block" />
                {summary.warning} Past Due
              </button>
            )}
            {summary.pending > 0 && (
              <button
                onClick={() => setFilterUrgency(filterUrgency === 'pending' ? '' : 'pending')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition ${filterUrgency === 'pending' ? 'bg-yellow-600 text-white border-yellow-600' : 'bg-yellow-100 text-yellow-800 border-yellow-200 hover:bg-yellow-200'}`}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 inline-block" />
                {summary.pending} Outstanding
              </button>
            )}
            <button
              onClick={() => fetchUnpaid()}
              className="px-3 py-1 rounded-full text-xs font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 transition"
            >
              ↺ Refresh
            </button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          {/* ── Filters ── */}
          <div className="flex flex-wrap gap-2 mb-4 mt-3">
            <input
              type="text"
              placeholder="Search by name, email, or location ID…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="flex-1 min-w-48 border border-gray-200 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">All Types</option>
              <option value="Residential">Residential</option>
              <option value="Municipal">Municipal</option>
              <option value="Commercial">Commercial</option>
            </select>
          </div>

          {/* ── Content ── */}
          {loading ? (
            <div className="flex justify-center py-8"><div className="hydro-spinner" /></div>
          ) : displayed.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p className="text-2xl mb-2">✅</p>
              <p className="text-sm font-medium">No unpaid accounts match your filters.</p>
            </div>
          ) : (
            <>
              {/* Total owed callout */}
              <div className="flex items-center justify-between px-4 py-2 rounded-lg mb-4"
                style={{ background: 'linear-gradient(135deg, #0A4C78, #1EA7D6)' }}>
                <p className="text-white text-sm font-medium">
                  {displayed.length} account{displayed.length !== 1 ? 's' : ''} with unpaid balances
                  {filterUrgency && <span className="ml-1 opacity-75">({URGENCY[filterUrgency]?.label})</span>}
                </p>
                <p className="text-white font-bold text-lg">
                  ${totalOwed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      {['Customer', 'Type', 'Unpaid Bills', 'Amount Owed', 'Oldest Due', 'Urgency', 'Service', 'Actions'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayed.map(c => {
                      const u = URGENCY[c.urgency] || URGENCY.pending;
                      const isReminding = reminding === c.customer_id;
                      const justReminded = reminded[c.customer_id];
                      const isMarkingOverdue = markingOverdue === c.customer_id;

                      return (
                        <tr
                          key={c.customer_id}
                          className={`hover:bg-gray-50 transition ${c.urgency === 'critical' ? 'bg-red-50/40' : c.urgency === 'warning' ? 'bg-orange-50/30' : ''}`}
                        >
                          {/* Customer */}
                          <td className="px-4 py-3">
                            <button
                              className="text-left group"
                              onClick={() => onOpenCustomer && onOpenCustomer({
                                customer_id: c.customer_id,
                                customer_name: c.customer_name,
                                customer_email: c.email,
                                customer_type: c.customer_type,
                                location_id: c.location_id,
                                water_status: c.water_status,
                              })}
                            >
                              <p className="font-semibold text-hydro-deep-aqua group-hover:underline">{c.customer_name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">{c.email}</p>
                              <p className="text-xs text-gray-300">{c.location_id}</p>
                            </button>
                          </td>

                          {/* Type */}
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.customer_type === 'Residential' ? 'bg-blue-100 text-blue-700'
                              : c.customer_type === 'Municipal' ? 'bg-green-100 text-green-700'
                              : 'bg-purple-100 text-purple-700'
                            }`}>
                              {c.customer_type}
                            </span>
                          </td>

                          {/* Unpaid count */}
                          <td className="px-4 py-3">
                            <span className="font-semibold text-gray-800">{c.unpaid_count}</span>
                            {c.overdue_total > 0 && (
                              <p className="text-xs text-red-600 mt-0.5">
                                ${c.overdue_total.toFixed(2)} overdue
                              </p>
                            )}
                          </td>

                          {/* Amount */}
                          <td className="px-4 py-3">
                            <span className="font-bold text-gray-900">
                              ${c.unpaid_total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>

                          {/* Oldest due */}
                          <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                            {c.oldest_due
                              ? new Date(c.oldest_due + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </td>

                          {/* Urgency badge */}
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${u.bg} ${u.text} ${u.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${u.dot}`} />
                              {u.label}
                            </span>
                          </td>

                          {/* Water status */}
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${WATER_STATUS_STYLE[c.water_status] || 'bg-gray-100 text-gray-600'}`}>
                              {c.water_status === 'pending_shutoff' ? 'Notice Sent' : c.water_status === 'shutoff' ? 'Shut Off' : 'Active'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              {/* Send reminder */}
                              <button
                                onClick={() => handleRemind(c)}
                                disabled={isReminding || justReminded}
                                className={`text-xs px-2.5 py-1 rounded border font-medium transition whitespace-nowrap ${
                                  justReminded
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : 'bg-yellow-50 text-yellow-700 border-yellow-200 hover:bg-yellow-100'
                                } disabled:opacity-60`}
                              >
                                {justReminded ? '✓ Sent' : isReminding ? '…' : 'Remind'}
                              </button>

                              {/* Mark overdue — only for pending/sent accounts */}
                              {c.urgency !== 'critical' && (
                                <button
                                  onClick={() => handleMarkOverdue(c)}
                                  disabled={isMarkingOverdue}
                                  className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 font-medium transition whitespace-nowrap disabled:opacity-60"
                                >
                                  {isMarkingOverdue ? '…' : 'Mark Overdue'}
                                </button>
                              )}

                              {/* View customer detail */}
                              <button
                                onClick={() => onOpenCustomer && onOpenCustomer({
                                  customer_id: c.customer_id,
                                  customer_name: c.customer_name,
                                  customer_email: c.email,
                                  customer_type: c.customer_type,
                                  location_id: c.location_id,
                                  water_status: c.water_status,
                                })}
                                className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-100 font-medium transition"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
