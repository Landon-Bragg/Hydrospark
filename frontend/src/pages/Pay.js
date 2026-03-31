import React, { useState, useEffect } from 'react';
import { getBills, payBill } from '../services/api';

const STATUS_COLOR = {
  paid:    'bg-green-100 text-green-700',
  sent:    'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-700',
};

function Pay() {
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payConfirm, setPayConfirm] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);
  const [cardNumber, setCardNumber] = useState('4242424242424242');
  const [expiry, setExpiry] = useState('12/26');
  const [cvc, setCvc] = useState('123');

  useEffect(() => {
    getBills()
      .then(r => setBills(r.data.bills || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const unpaid = bills.filter(b => b.status !== 'paid');
  const totalOwed = unpaid.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
  const hasOverdue = unpaid.some(b => b.status === 'overdue');

  const isFormValid = () => {
    const cardRegex = /^\d{16}$/;     // Exactly 16 digits
    const cvcRegex = /^\d{3}$/;       // Exactly 3 digits
    const expiryRegex = /^(0[1-9]|1[0-2])\/\d{2}$/; // MM/YY format

    return (
      cardRegex.test(cardNumber) &&
      cvcRegex.test(cvc) &&
      expiryRegex.test(expiry)
    );
  };

  const handlePay = async () => {
    if (!payConfirm) return;
    setPaying(true);
    setPayError(null);
    try {
      // We now pass the object as the second argument
      const res = await payBill(payConfirm.id, { cardNumber, expiry, cvc });
      setBills(prev => prev.map(b => b.id === payConfirm.id ? res.data.bill : b));
      setPayConfirm(null);
    } catch (err) {
      setPayError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading…</p>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Pay Bills</h1>
        <p className="text-sm text-gray-400 mt-1">Review and pay your outstanding water bills</p>
      </div>

      {unpaid.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">✓</div>
          <p className="text-xl font-semibold text-green-600">You're all caught up!</p>
          <p className="text-sm text-gray-500 mt-2">No outstanding bills at this time.</p>
        </div>
      ) : (
        <>
          {/* Summary banner */}
          <div
            className="rounded-xl px-6 py-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
            style={{ background: hasOverdue ? 'rgba(239,68,68,0.08)' : 'rgba(10,76,120,0.07)', border: `1px solid ${hasOverdue ? 'rgba(239,68,68,0.2)' : 'rgba(10,76,120,0.15)'}` }}
          >
            <div>
              <p className="text-sm font-semibold text-gray-700">
                {unpaid.length} unpaid bill{unpaid.length !== 1 ? 's' : ''}
                {hasOverdue && <span className="ml-2 text-red-600">— includes overdue</span>}
              </p>
              <p className="text-2xl font-bold text-hydro-deep-aqua mt-0.5">${totalOwed.toFixed(2)} total due</p>
            </div>
          </div>

          {/* Unpaid bills */}
          <div className="space-y-3 mb-8">
            {unpaid.map(bill => (
              <div key={bill.id} className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2 py-0.5 rounded text-xs font-semibold ${STATUS_COLOR[bill.status] || 'bg-gray-100 text-gray-600'}`}>
                      {bill.status.toUpperCase()}
                    </span>
                    {bill.status === 'overdue' && (
                      <span className="text-xs text-red-500 font-medium">Past due</span>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-800">
                    {bill.billing_period_start} to {bill.billing_period_end}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {parseFloat(bill.total_usage_ccf).toFixed(2)} CCF &bull; Due {bill.due_date}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-xl font-bold text-hydro-deep-aqua">${parseFloat(bill.total_amount).toFixed(2)}</p>
                  <button
                    onClick={() => setPayConfirm(bill)}
                    className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition"
                    style={{ background: '#0A4C78' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    Pay Now
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Paid bills (collapsed list) */}
          {bills.some(b => b.status === 'paid') && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Payment History</p>
              <div className="card">
                <table className="min-w-full">
                  <tbody>
                    {bills.filter(b => b.status === 'paid').map(bill => (
                      <tr key={bill.id} className="border-t first:border-t-0">
                        <td className="py-2.5 text-sm text-gray-600">
                          {bill.billing_period_start} to {bill.billing_period_end}
                        </td>
                        <td className="py-2.5 text-sm text-gray-400">{bill.paid_at ? `Paid ${bill.paid_at.slice(0, 10)}` : ''}</td>
                        <td className="py-2.5 text-sm font-medium text-gray-700 text-right">
                          ${parseFloat(bill.total_amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Confirmation modal */}
      {payConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!paying) { setPayConfirm(null); setPayError(null); } }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-1">Confirm Payment</h3>
            <p className="text-sm text-gray-500 mb-5">
              {payConfirm.billing_period_start} to {payConfirm.billing_period_end}
            </p>

            <div className="border border-gray-100 rounded-xl overflow-hidden mb-5">
              <div className="flex justify-between px-4 py-3 bg-gray-50">
                <span className="text-sm text-gray-600">Amount Due</span>
                <span className="text-lg font-bold text-hydro-deep-aqua">
                  ${parseFloat(payConfirm.total_amount).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between px-4 py-2.5">
                <span className="text-sm text-gray-500">Due Date</span>
                <span className="text-sm text-gray-700">{payConfirm.due_date}</span>
              </div>
            </div>

            {/* New Mock Payment Fields with Validation */}
            <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Card Number</label>
                <input 
                  type="text" 
                  value={cardNumber}
                  maxLength="16"
                  onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ''))}
                  className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-hydro-deep-aqua"
                  placeholder="16-digit card number"
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">Expiry</label>
                  <input 
                    type="text" 
                    value={expiry}
                    maxLength="5"
                    onChange={(e) => setExpiry(e.target.value)}
                    placeholder="MM/YY"
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-hydro-deep-aqua"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold text-gray-500 mb-1 uppercase tracking-wider">CVC</label>
                  <input 
                    type="text" 
                    value={cvc}
                    maxLength="3"
                    onChange={(e) => setCvc(e.target.value.replace(/\D/g, ''))}
                    className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:border-hydro-deep-aqua"
                    placeholder="123"
                  />
                </div>
              </div>
            </div>

            {payError && <p className="text-sm text-red-600 mb-3">{payError}</p>}

            <div className="flex gap-3">
              <button
                onClick={() => { setPayConfirm(null); setPayError(null); }}
                disabled={paying}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePay}
                disabled={paying || !isFormValid()}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#0A4C78' }}
                onMouseEnter={e => { if (!paying) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {paying ? 'Processing…' : 'Confirm Payment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Pay;
