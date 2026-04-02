import React, { useState, useEffect } from 'react';
import {
  getBills, payBill,
  getPaymentMethod, savePaymentMethod, deletePaymentMethod, toggleAutopay,
} from '../services/api';

const STATUS_COLOR = {
  paid:    'bg-green-100 text-green-700',
  sent:    'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-700',
};

const CARD_ICONS = {
  visa:       '💳 Visa',
  mastercard: '💳 Mastercard',
  amex:       '💳 Amex',
  discover:   '💳 Discover',
  card:       '💳 Card',
};

function detectCardType(number) {
  const n = number.replace(/\D/g, '');
  if (n.startsWith('4')) return 'visa';
  if (n.startsWith('5')) return 'mastercard';
  if (n.startsWith('3')) return 'amex';
  if (n.startsWith('6')) return 'discover';
  return 'card';
}

function formatCardInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(.{4})/g, '$1 ').trim();
}

function formatExpiryInput(value) {
  const digits = value.replace(/\D/g, '').slice(0, 4);
  if (digits.length >= 3) return digits.slice(0, 2) + '/' + digits.slice(2);
  return digits;
}

function Pay() {
  // Bills
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payConfirm, setPayConfirm] = useState(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState(null);

  // Payment method
  const [paymentMethod, setPaymentMethod] = useState(null); // null = none on file
  const [autopayEnabled, setAutopayEnabled] = useState(false);
  const [pmLoading, setPmLoading] = useState(true);

  // Add/edit card modal
  const [cardModal, setCardModal] = useState(false);
  const [cardForm, setCardForm] = useState({ card_number: '', name: '', expiry: '' });
  const [cardSaving, setCardSaving] = useState(false);
  const [cardError, setCardError] = useState(null);

  // Autopay toggle
  const [autopayWorking, setAutopayWorking] = useState(false);

  // Remove confirm
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    getBills()
      .then(r => setBills(r.data.bills || []))
      .catch(() => {})
      .finally(() => setLoading(false));

    getPaymentMethod()
      .then(r => {
        setPaymentMethod(r.data.payment_method);
        setAutopayEnabled(r.data.autopay_enabled);
      })
      .catch(() => {})
      .finally(() => setPmLoading(false));
  }, []);

  const unpaid = bills.filter(b => b.status !== 'paid');
  const totalOwed = unpaid.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
  const hasOverdue = unpaid.some(b => b.status === 'overdue');

  // Pay a bill
  const handlePay = async () => {
    if (!payConfirm) return;
    setPaying(true);
    setPayError(null);
    try {
      const res = await payBill(payConfirm.id);
      setBills(prev => prev.map(b => b.id === payConfirm.id ? res.data.bill : b));
      setPayConfirm(null);
    } catch (err) {
      setPayError(err.response?.data?.error || 'Payment failed. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  // Save payment method
  const handleSaveCard = async () => {
    setCardSaving(true);
    setCardError(null);
    try {
      const res = await savePaymentMethod({
        card_number: cardForm.card_number.replace(/\s/g, ''),
        name: cardForm.name,
        expiry: cardForm.expiry,
      });
      setPaymentMethod(res.data.payment_method);
      setCardModal(false);
      setCardForm({ card_number: '', name: '', expiry: '' });
    } catch (err) {
      setCardError(err.response?.data?.error || 'Failed to save card.');
    } finally {
      setCardSaving(false);
    }
  };

  // Remove payment method
  const handleRemove = async () => {
    setRemoving(true);
    try {
      await deletePaymentMethod();
      setPaymentMethod(null);
      setAutopayEnabled(false);
      setRemoveConfirm(false);
    } catch (e) {}
    finally { setRemoving(false); }
  };

  // Toggle autopay
  const handleAutopay = async (val) => {
    setAutopayWorking(true);
    try {
      const res = await toggleAutopay(val);
      setAutopayEnabled(res.data.autopay_enabled);
    } catch (err) {
      alert(err.response?.data?.error || 'Could not update autopay.');
    } finally {
      setAutopayWorking(false);
    }
  };

  const cardType = detectCardType(cardForm.card_number);

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
        <p className="text-sm text-gray-400 mt-1">Review bills, manage your payment method, and set up autopay</p>
      </div>

      {/* ── Payment Settings ── */}
      <div className="card mb-6">
        <h2 className="text-lg font-bold text-hydro-deep-aqua mb-4">Payment Settings</h2>

        {pmLoading ? (
          <div className="hydro-spinner" />
        ) : (
          <div className="flex flex-col sm:flex-row gap-6">

            {/* Saved card */}
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Payment Method</p>
              {paymentMethod ? (
                <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">
                      {CARD_ICONS[paymentMethod.type] || '💳 Card'} ending in {paymentMethod.last4}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{paymentMethod.name} · Expires {paymentMethod.expiry}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setCardForm({ card_number: '', name: paymentMethod.name, expiry: paymentMethod.expiry }); setCardModal(true); setCardError(null); }}
                      className="text-xs px-2.5 py-1 rounded border border-gray-200 text-gray-600 hover:bg-white transition"
                    >
                      Change
                    </button>
                    <button
                      onClick={() => setRemoveConfirm(true)}
                      className="text-xs px-2.5 py-1 rounded border border-red-200 text-red-500 hover:bg-red-50 transition"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-dashed border-gray-300">
                  <p className="text-sm text-gray-400 flex-1">No payment method on file.</p>
                  <button
                    onClick={() => { setCardForm({ card_number: '', name: '', expiry: '' }); setCardModal(true); setCardError(null); }}
                    className="text-sm font-semibold px-4 py-2 rounded-lg text-white transition flex-shrink-0"
                    style={{ background: '#0A4C78' }}
                    onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                    onMouseLeave={e => e.currentTarget.style.opacity = '1'}
                  >
                    + Add Card
                  </button>
                </div>
              )}
            </div>

            {/* Autopay toggle */}
            <div className="sm:w-64 flex-shrink-0">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Autopay</p>
              <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800">
                    {autopayEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                  {/* Toggle switch */}
                  <button
                    onClick={() => handleAutopay(!autopayEnabled)}
                    disabled={autopayWorking || !paymentMethod}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40"
                    style={{ background: autopayEnabled ? '#0A4C78' : '#d1d5db' }}
                  >
                    <span
                      className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                      style={{ transform: autopayEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                    />
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {autopayEnabled
                    ? 'Bills will be paid automatically when sent.'
                    : paymentMethod
                      ? 'Enable to pay bills automatically when sent.'
                      : 'Add a payment method to enable autopay.'}
                </p>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Unpaid bills ── */}
      {unpaid.length === 0 ? (
        <div className="card text-center py-16">
          <div className="text-5xl mb-4">✓</div>
          <p className="text-xl font-semibold text-green-600">You're all caught up!</p>
          <p className="text-sm text-gray-500 mt-2">No outstanding bills at this time.</p>
        </div>
      ) : (
        <>
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
        </>
      )}

      {/* ── Payment history ── */}
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
                    <td className="py-2.5 text-sm text-gray-400">
                      {bill.paid_at ? `Paid ${bill.paid_at.slice(0, 10)}` : ''}
                    </td>
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

      {/* ── Add/Change Card Modal ── */}
      {cardModal && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!cardSaving) setCardModal(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-hydro-deep-aqua mb-5">
              {paymentMethod ? 'Change Payment Method' : 'Add Payment Method'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Card Number</label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="1234 5678 9012 3456"
                    value={cardForm.card_number}
                    onChange={e => setCardForm(f => ({ ...f, card_number: formatCardInput(e.target.value) }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-16"
                  />
                  {cardForm.card_number && (
                    <span className="absolute right-3 top-2 text-xs text-gray-400 font-medium capitalize">
                      {cardType !== 'card' ? cardType : ''}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Cardholder Name</label>
                <input
                  type="text"
                  placeholder="Jane Smith"
                  value={cardForm.name}
                  onChange={e => setCardForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase mb-1">Expiry (MM/YY)</label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="12/27"
                  value={cardForm.expiry}
                  onChange={e => setCardForm(f => ({ ...f, expiry: formatExpiryInput(e.target.value) }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <p className="text-xs text-gray-400 mt-3">
              Your card number is never stored — only the last 4 digits are saved.
            </p>

            {cardError && <p className="text-sm text-red-600 mt-3">{cardError}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setCardModal(false)}
                disabled={cardSaving}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCard}
                disabled={cardSaving}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-60"
                style={{ background: '#0A4C78' }}
                onMouseEnter={e => { if (!cardSaving) e.currentTarget.style.opacity = '0.85'; }}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                {cardSaving ? 'Saving…' : 'Save Card'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Remove Confirm Modal ── */}
      {removeConfirm && (
        <div
          className="fixed inset-0 flex items-center justify-center z-50"
          style={{ background: 'rgba(0,0,0,0.45)' }}
          onClick={() => { if (!removing) setRemoveConfirm(false); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Remove Payment Method?</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will also disable autopay. You can add a new card at any time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setRemoveConfirm(false)}
                disabled={removing}
                className="flex-1 px-4 py-2.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemove}
                disabled={removing}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-red-500 hover:bg-red-600 transition disabled:opacity-60"
              >
                {removing ? 'Removing…' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Pay Confirmation Modal ── */}
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

            <div className="border border-gray-100 rounded-xl overflow-hidden mb-4">
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
              {paymentMethod && (
                <div className="flex justify-between px-4 py-2.5 border-t border-gray-100">
                  <span className="text-sm text-gray-500">Paying with</span>
                  <span className="text-sm text-gray-700 capitalize">
                    {paymentMethod.type} ···· {paymentMethod.last4}
                  </span>
                </div>
              )}
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
                disabled={paying}
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
