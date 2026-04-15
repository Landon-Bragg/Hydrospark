import React, { useState, useEffect } from 'react';
import { getBills } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

// ── Brand ─────────────────────────────────────────────────────
const DEEP  = [10,  76, 120];
const SPARK = [30, 167, 214];
const CO = {
  name:    'HydroSpark Water Co.',
  tagline: 'Water Utility Services',
  addr:    '123 Waterway Blvd, Suite 100  ·  Clearwater, FL 33755',
  contact: '(800) 555-0100  ·  billing@hydrospark.io',
  web:     'hydrospark.io',
};

// ── Helpers ────────────────────────────────────────────────────
const invNum = (id) => 'INV-' + String(id).padStart(6, '0');

const fmtDate = (s, long = false) => {
  if (!s) return '—';
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  return d.toLocaleDateString('en-US', long
    ? { year: 'numeric', month: 'long',  day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' }
  );
};

// ── Status config ──────────────────────────────────────────────
const STATUS = {
  paid:     { bg: '#dcfce7', text: '#15803d', border: '#86efac', label: 'PAID',     row: 'bg-green-100 text-green-700',   pdfRgb: [21, 128,  61] },
  sent:     { bg: '#dbeafe', text: '#1d4ed8', border: '#93c5fd', label: 'SENT',     row: 'bg-blue-100 text-blue-700',     pdfRgb: [29,  78, 216] },
  pending:  { bg: '#fef9c3', text: '#a16207', border: '#fde047', label: 'PENDING',  row: 'bg-yellow-100 text-yellow-800', pdfRgb: [161, 98,   7] },
  overdue:  { bg: '#fee2e2', text: '#b91c1c', border: '#fca5a5', label: 'OVERDUE',  row: 'bg-red-100 text-red-700',       pdfRgb: [185, 28,  28] },
  refunded: { bg: '#f3e8ff', text: '#7e22ce', border: '#d8b4fe', label: 'REFUNDED', row: 'bg-purple-100 text-purple-700', pdfRgb: [126, 34, 206] },
};

// ── Logo: render the water-drop mark to a canvas → PNG data URL ──
function getLogoDataUrl() {
  const SIZE = 128;
  const canvas = document.createElement('canvas');
  canvas.width  = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  const s = SIZE / 24; // scale factor (SVG viewBox is 24×24)

  // Navy rounded-rect background
  const r = SIZE * 0.16;
  ctx.fillStyle = '#0A4C78';
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(SIZE - r, 0);
  ctx.quadraticCurveTo(SIZE, 0, SIZE, r);
  ctx.lineTo(SIZE, SIZE - r);
  ctx.quadraticCurveTo(SIZE, SIZE, SIZE - r, SIZE);
  ctx.lineTo(r, SIZE);
  ctx.quadraticCurveTo(0, SIZE, 0, SIZE - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();
  ctx.fill();

  // Water-drop fill (white) — mirrors the SVG path in Layout.js
  // M12 2 C12 2 4.5 10.8 4.5 15.5 C4.5 19.64 7.86 23 12 23
  //         C16.14 23 19.5 19.64 19.5 15.5 C19.5 10.8 12 2 12 2 Z
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  ctx.beginPath();
  ctx.moveTo(12*s, 2*s);
  ctx.bezierCurveTo(12*s, 2*s,     4.5*s, 10.8*s,  4.5*s,  15.5*s);
  ctx.bezierCurveTo(4.5*s, 19.64*s, 7.86*s, 23*s,   12*s,   23*s);
  ctx.bezierCurveTo(16.14*s, 23*s,  19.5*s, 19.64*s, 19.5*s, 15.5*s);
  ctx.bezierCurveTo(19.5*s, 10.8*s, 12*s,   2*s,    12*s,   2*s);
  ctx.closePath();
  ctx.fill();

  // Highlight stroke (spark-blue) — inner shine line
  ctx.strokeStyle = 'rgba(30,167,214,0.70)';
  ctx.lineWidth   = 1.6 * s;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(9*s, 17*s);
  ctx.quadraticCurveTo(9*s, 14.5*s, 11.5*s, 13*s);
  ctx.stroke();

  return canvas.toDataURL('image/png');
}

// ── PDF header helper (shared) ─────────────────────────────────
function pdfHeader(doc, subtitle) {
  const pw = doc.internal.pageSize.getWidth();

  // Navy band
  doc.setFillColor(...DEEP);
  doc.rect(0, 0, pw, 45, 'F');

  // Spark-blue accent strip
  doc.setFillColor(...SPARK);
  doc.rect(0, 45, pw, 1.5, 'F');

  // HydroSpark logo image (water-drop mark on navy background)
  try {
    const logoData = getLogoDataUrl();
    doc.addImage(logoData, 'PNG', 12, 10, 22, 22);
  } catch (e) {
    // Fallback: plain "HS" text badge if canvas is unavailable
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 10, 22, 22, 3, 3, 'F');
    doc.setTextColor(...DEEP);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('HS', 23, 23.5, { align: 'center' });
  }

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text(CO.name, 40, 19);

  // Company details
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 210, 240);
  doc.text(CO.tagline, 40, 25);
  doc.text(CO.addr,    40, 30.5);
  doc.text(CO.contact, 40, 36);

  // Subtitle right-aligned
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(150, 210, 240);
  doc.text(subtitle.toUpperCase(), pw - 14, 17, { align: 'right' });
}

// ── PDF footer helper ──────────────────────────────────────────
function pdfFooter(doc) {
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const y  = ph - 14;

  doc.setFillColor(249, 250, 251);
  doc.rect(0, y - 3, pw, 17, 'F');
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.3);
  doc.line(0, y - 3, pw, y - 3);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(156, 163, 175);
  doc.text(`Questions? ${CO.contact}`, 14, y + 2);
  doc.text(CO.web, pw - 14, y + 2, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(209, 213, 219);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 14, y + 7);
}

// ── Helpers ────────────────────────────────────────────────────
const isPaidStatus = (status) => status === 'paid' || status === 'refunded';

// ── WaterDrop SVG (white, for inline invoice) ──────────────────
const WaterDrop = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2C12 2 4.5 10.8 4.5 15.5C4.5 19.64 7.86 23 12 23C16.14 23 19.5 19.64 19.5 15.5C19.5 10.8 12 2 12 2Z"
      fill="rgba(255,255,255,0.92)"
    />
    <path d="M9 17C9 17 9 14.5 11.5 13" stroke="rgba(30,167,214,0.65)" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

// ── Inline invoice component ───────────────────────────────────
export function BillInvoice({ bill, customer }) {
  const usage  = parseFloat(bill.total_usage_ccf);
  const cost   = parseFloat(bill.total_amount);
  const rate   = usage > 0 ? (cost / usage).toFixed(2) : '5.72';
  const st     = STATUS[bill.status] || STATUS.pending;
  const isPaid = bill.status === 'paid';
  const isOver = bill.status === 'overdue';

  const banner = isPaid
    ? { bg: 'linear-gradient(90deg,#f0fdf4,#dcfce7)', accent: '#15803d', label: 'Amount Paid' }
    : isOver
      ? { bg: 'linear-gradient(90deg,#fff1f2,#fee2e2)', accent: '#b91c1c', label: 'Past Due Amount' }
      : { bg: 'linear-gradient(90deg,#eff6ff,#dbeafe)', accent: '#0A4C78', label: 'Amount Due' };

  const acctRows = [
    ['Account #', customer?.location_id   || '—', { fontFamily: 'monospace', fontSize: '9.5px' }],
    ['Type',      customer?.customer_type || '—', {}],
    ['Rate',      `$${rate}/CCF`,                 {}],
  ];

  const detailRows = [
    ['Invoice #', invNum(bill.id),                 { fontFamily: 'monospace', fontSize: '9.5px' }],
    ['Period',    bill.billing_period_start.slice(0, 7), {}],
    ['Due Date',  fmtDate(bill.due_date),          { color: isOver ? '#b91c1c' : '#374151', fontWeight: 700 }],
    ...(bill.paid_at ? [['Paid On', fmtDate(bill.paid_at.slice(0, 10)), { color: '#15803d' }]] : []),
  ];

  return (
    <div style={{ position: 'relative', fontFamily: "'Inter',sans-serif", background: '#fff', borderRadius: '10px', overflow: 'hidden', border: '1px solid #e5e7eb', boxShadow: '0 4px 24px rgba(10,76,120,0.10)' }}>

      {/* PAID watermark — rendered first so it sits behind content */}
      {isPaid && (
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', userSelect: 'none', zIndex: 0 }}>
          <span style={{ fontSize: '90px', fontWeight: 900, color: 'rgba(21,128,61,0.06)', transform: 'rotate(-28deg)', letterSpacing: '0.08em' }}>PAID</span>
        </div>
      )}

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── Header ─────────────────────────────────── */}
        <div style={{ background: 'linear-gradient(135deg,#0A4C78 0%,#073f64 100%)', padding: '18px 24px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <WaterDrop size={34} />
              <div>
                <div style={{ color: '#fff', fontWeight: 700, fontSize: '15px', letterSpacing: '-0.02em' }}>{CO.name}</div>
                <div style={{ color: 'rgba(150,215,245,0.80)', fontSize: '10px', marginTop: '2px' }}>{CO.tagline}</div>
                <div style={{ color: 'rgba(150,215,245,0.50)', fontSize: '9px', marginTop: '1px' }}>{CO.addr}</div>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ color: 'rgba(150,215,245,0.65)', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em' }}>Water Service Invoice</div>
              <div style={{ color: '#fff', fontWeight: 700, fontSize: '14px', marginTop: '3px', fontFamily: 'monospace' }}>{invNum(bill.id)}</div>
              <span style={{
                display: 'inline-block', marginTop: '7px',
                padding: '2px 9px', borderRadius: '4px',
                fontSize: '10px', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                background: st.bg, color: st.text, border: `1px solid ${st.border}`,
              }}>{st.label}</span>
            </div>
          </div>

          {/* Accent rule */}
          <div style={{ height: '1px', marginTop: '14px', marginLeft: '-24px', marginRight: '-24px', background: 'linear-gradient(90deg,rgba(30,167,214,0.55) 0%,transparent 100%)' }} />
        </div>

        {/* ── 3-column info grid ───────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>

          <div style={{ padding: '12px 18px', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: '6px' }}>Bill To</div>
            <div style={{ fontWeight: 700, color: '#111827', fontSize: '12px', lineHeight: 1.3 }}>{customer?.customer_name || '—'}</div>
            <div style={{ color: '#6b7280', fontSize: '10.5px', marginTop: '3px', lineHeight: 1.45 }}>{customer?.mailing_address || 'No address on file'}</div>
            {customer?.zip_code && <div style={{ color: '#9ca3af', fontSize: '10px', marginTop: '2px' }}>ZIP {customer.zip_code}</div>}
          </div>

          <div style={{ padding: '12px 18px', borderRight: '1px solid #e5e7eb' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: '6px' }}>Account</div>
            {acctRows.map(([k, v, extra]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '3px' }}>
                <span style={{ color: '#9ca3af' }}>{k}</span>
                <span style={{ fontWeight: 600, color: '#374151', ...extra }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: '12px 18px' }}>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: '6px' }}>Invoice Details</div>
            {detailRows.map(([k, v, extra]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10.5px', marginBottom: '3px' }}>
                <span style={{ color: k === 'Due Date' && isOver ? '#b91c1c' : '#9ca3af' }}>{k}</span>
                <span style={{ fontWeight: 600, color: '#374151', ...extra }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Amount banner ────────────────────────── */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 24px', background: banner.bg, borderBottom: '1px solid #e5e7eb' }}>
          <div>
            <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: banner.accent }}>{banner.label}</div>
            <div style={{ fontSize: '10.5px', color: '#6b7280', marginTop: '2px' }}>
              {fmtDate(bill.billing_period_start)} – {fmtDate(bill.billing_period_end)}
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 900, color: banner.accent, letterSpacing: '-0.02em' }}>${cost.toFixed(2)}</div>
        </div>

        {/* ── Charges table ────────────────────────── */}
        <div style={{ padding: '14px 24px' }}>
          <div style={{ fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#9ca3af', marginBottom: '8px' }}>Itemized Charges</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' }}>
            <thead>
              <tr style={{ background: 'linear-gradient(135deg,#0A4C78,#073f64)', color: '#fff' }}>
                {['Description', 'Usage', 'Unit Rate', 'Amount'].map((h, i) => (
                  <th key={h} style={{ padding: '7px 10px', textAlign: i === 0 ? 'left' : 'right', fontSize: '9px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={{ padding: '9px 10px', color: '#374151', fontWeight: 500 }}>
                  Water Service — {bill.billing_period_start.slice(0, 7)}
                  <div style={{ fontSize: '9.5px', color: '#9ca3af', marginTop: '2px' }}>
                    {Math.round(usage * 748).toLocaleString()} gallons &nbsp;·&nbsp; 1 CCF = 748 gallons
                  </div>
                </td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#6b7280' }}>{usage.toFixed(2)} CCF</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#6b7280' }}>${rate}/CCF</td>
                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#111827' }}>${cost.toFixed(2)}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background: '#f3f4f6', borderTop: '2px solid #0A4C78' }}>
                <td colSpan={3} style={{ padding: '8px 10px', fontWeight: 700, color: '#374151' }}>Total</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 900, color: '#0A4C78', fontSize: '14px' }}>${cost.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* ── Footer ───────────────────────────────── */}
        <div style={{ background: '#f9fafb', borderTop: '1px solid #e5e7eb', padding: '10px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '9.5px', color: '#9ca3af' }}>Questions? {CO.contact}</div>
          <div style={{ fontSize: '9.5px', color: '#9ca3af' }}>{CO.web}</div>
        </div>

      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────
function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBill, setExpandedBill] = useState(null);

  useEffect(() => { loadBills(); }, []);

  const loadBills = async () => {
    try {
      setLoading(true);
      const res = await getBills();
      setBills(res.data.bills || []);
    } catch {
      setError('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  // ── Single-bill PDF ────────────────────────────────────────
  const handleDownloadSingleBill = (bill) => {
    const customer = user?.customer;
    const doc  = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw   = doc.internal.pageSize.getWidth();
    const usage = parseFloat(bill.total_usage_ccf);
    const cost  = parseFloat(bill.total_amount);
    const rate  = usage > 0 ? (cost / usage).toFixed(2) : '5.72';
    const inv   = invNum(bill.id);
    const st    = STATUS[bill.status] || STATUS.pending;

    pdfHeader(doc, 'Water Service Invoice');

    // Invoice # + status in header (right side)
    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text(inv, pw - 14, 26, { align: 'right' });

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...st.pdfRgb);
    doc.text(st.label, pw - 14, 34, { align: 'right' });

    // ── 3-column info ────────────────────────────────────────
    let y = 54;
    const c1 = 14, c2 = 80, c3 = 146;
    const lbl = (text, x, yy) => {
      doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128);
      doc.text(text, x, yy);
    };
    const val = (text, x, yy, bold = false) => {
      doc.setFontSize(bold ? 10 : 9); doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setTextColor(17, 24, 39);
      doc.text(text, x, yy);
    };
    const kv = (k, v, x, yy) => {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(k, x, yy);
      doc.setTextColor(55, 65, 81); doc.setFont('helvetica', 'bold');
      doc.text(v, x + 24, yy);
    };

    lbl('BILL TO', c1, y);
    val(customer?.customer_name || '—', c1, y + 6, true);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    const addrLines = doc.splitTextToSize(customer?.mailing_address || 'No address on file', 58);
    doc.text(addrLines, c1, y + 12);
    if (customer?.zip_code) {
      doc.setFontSize(8); doc.setTextColor(156, 163, 175);
      doc.text('ZIP ' + customer.zip_code, c1, y + 12 + addrLines.length * 5);
    }

    lbl('ACCOUNT', c2, y);
    kv('Account #', customer?.location_id   || '—', c2, y + 7);
    kv('Type',      customer?.customer_type || '—', c2, y + 13);
    kv('Rate',      `$${rate}/CCF`,                 c2, y + 19);

    lbl('INVOICE DETAILS', c3, y);
    kv('Invoice #', inv,                           c3, y + 7);
    kv('Period',    bill.billing_period_start.slice(0, 7), c3, y + 13);

    const dueColor = bill.status === 'overdue' ? [185, 28, 28] : [55, 65, 81];
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text('Due Date', c3, y + 19);
    doc.setTextColor(...dueColor); doc.setFont('helvetica', 'bold');
    doc.text(bill.due_date, c3 + 24, y + 19);

    if (bill.paid_at) {
      doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text('Paid On', c3, y + 25);
      doc.setTextColor(21, 128, 61); doc.setFont('helvetica', 'bold');
      doc.text(bill.paid_at.slice(0, 10), c3 + 24, y + 25);
    }

    y += 33;

    // Separator
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.line(14, y, pw - 14, y);
    y += 8;

    // ── Amount banner ─────────────────────────────────────────
    const isOver = bill.status === 'overdue';
    const amtBg  = isPaidStatus(bill.status) ? [240, 253, 244] : isOver ? [255, 241, 242] : [239, 246, 255];
    const amtBdr = isPaidStatus(bill.status) ? [134, 239, 172] : isOver ? [252, 165, 165] : [147, 197, 253];
    const amtClr = isPaidStatus(bill.status) ? [21, 128, 61]   : isOver ? [185,  28,  28] : [30,  64, 175];
    const amtLbl = isPaidStatus(bill.status) ? 'AMOUNT PAID'   : isOver ? 'PAST DUE AMOUNT' : 'AMOUNT DUE';

    doc.setFillColor(...amtBg);
    doc.roundedRect(14, y, pw - 28, 20, 2, 2, 'F');
    doc.setDrawColor(...amtBdr); doc.setLineWidth(0.3);
    doc.roundedRect(14, y, pw - 28, 20, 2, 2, 'S');

    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...amtClr);
    doc.text(amtLbl, 20, y + 7);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text(`Period: ${fmtDate(bill.billing_period_start, true)} – ${fmtDate(bill.billing_period_end, true)}`, 20, y + 13.5);
    doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...amtClr);
    doc.text(`$${cost.toFixed(2)}`, pw - 20, y + 13, { align: 'right' });

    y += 28;

    // ── Charges table ─────────────────────────────────────────
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128);
    doc.text('ITEMIZED CHARGES', 14, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Description', 'Usage', 'Unit Rate', 'Amount']],
      body: [[
        `Water Service — ${bill.billing_period_start.slice(0, 7)}\n${Math.round(usage * 748).toLocaleString()} gallons  ·  1 CCF = 748 gal`,
        `${usage.toFixed(2)} CCF`,
        `$${rate}/CCF`,
        `$${cost.toFixed(2)}`,
      ]],
      foot: [['', '', 'TOTAL DUE', `$${cost.toFixed(2)}`]],
      theme: 'plain',
      headStyles: { fillColor: DEEP, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9, cellPadding: 4 },
      bodyStyles: { fontSize: 9.5, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 } },
      footStyles: { fillColor: [243, 244, 246], textColor: DEEP, fontStyle: 'bold', fontSize: 10.5, cellPadding: 4 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { cellWidth: 36, halign: 'right' },
        2: { cellWidth: 36, halign: 'right' },
        3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
      },
      didDrawPage: () => pdfFooter(doc),
    });

    pdfFooter(doc);

    const period = bill.billing_period_start.slice(0, 7);
    const name   = customer ? customer.customer_name.replace(/\s+/g, '_') : 'Bill';
    doc.save(`HydroSpark_Invoice_${name}_${period}.pdf`);
  };

  // ── Full statement PDF ─────────────────────────────────────
  const handleDownloadAllStatements = () => {
    const customer = user?.customer;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pw  = doc.internal.pageSize.getWidth();

    pdfHeader(doc, 'Account Statement');

    // Statement date right
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
    doc.text(`Issued: ${new Date().toLocaleDateString()}`, pw - 14, 28, { align: 'right' });

    // Customer block
    let y = 54;
    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128);
    doc.text('ACCOUNT HOLDER', 14, y);
    doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
    doc.text(customer?.customer_name || '—', 14, y + 7);
    doc.setFontSize(8.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    if (customer?.mailing_address) doc.text(customer.mailing_address, 14, y + 13);
    if (customer?.location_id) {
      doc.text('Account #: ', 14, y + 19);
      doc.setFont('helvetica', 'bold'); doc.setTextColor(17, 24, 39);
      doc.text(customer.location_id, 38, y + 19);
    }

    // Summary boxes
    const totalPaid    = bills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total_amount), 0);
    const totalPending = bills.filter(b => ['pending','sent','overdue'].includes(b.status)).reduce((s, b) => s + parseFloat(b.total_amount), 0);
    const totalUsage   = bills.reduce((s, b) => s + parseFloat(b.total_usage_ccf), 0);

    const boxes = [
      { label: 'Total Bills',    value: String(bills.length),       x: pw - 130 },
      { label: 'Total Paid',     value: `$${totalPaid.toFixed(2)}`, x: pw - 88  },
      { label: 'Outstanding',    value: `$${totalPending.toFixed(2)}`, x: pw - 46 },
    ];
    boxes.forEach(({ label, value, x }) => {
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(x, y, 38, 22, 2, 2, 'F');
      doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(label, x + 4, y + 6);
      doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(...DEEP);
      doc.text(value, x + 4, y + 16);
    });

    y += 30;

    doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(107, 114, 128);
    doc.text(`TOTAL USAGE: ${totalUsage.toFixed(2)} CCF  (${Math.round(totalUsage * 748).toLocaleString()} gallons)`, 14, y);
    y += 6;

    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3);
    doc.line(14, y, pw - 14, y);
    y += 5;

    // Bills table
    autoTable(doc, {
      startY: y,
      margin: { left: 14, right: 14 },
      head: [['Invoice #', 'Billing Period', 'Usage (CCF)', 'Rate ($/CCF)', 'Amount', 'Due Date', 'Status']],
      body: bills.map(b => {
        const u = parseFloat(b.total_usage_ccf);
        const c = parseFloat(b.total_amount);
        return [
          invNum(b.id),
          `${b.billing_period_start} – ${b.billing_period_end}`,
          u.toFixed(2),
          u > 0 ? `$${(c / u).toFixed(2)}` : '—',
          `$${c.toFixed(2)}`,
          b.due_date,
          (STATUS[b.status] || STATUS.pending).label,
        ];
      }),
      theme: 'plain',
      headStyles: { fillColor: DEEP, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8.5, cellPadding: 4 },
      bodyStyles: { fontSize: 8.5, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 } },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      columnStyles: {
        0: { cellWidth: 24, fontStyle: 'bold' },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right', fontStyle: 'bold' },
        6: { halign: 'center' },
      },
      didDrawPage: () => pdfFooter(doc),
    });

    pdfFooter(doc);

    const name = customer ? customer.customer_name.replace(/\s+/g, '_') : 'Account';
    doc.save(`HydroSpark_Statement_${name}_${new Date().toISOString().slice(0,10)}.pdf`);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="hydro-spinner" />
      <p className="text-sm text-gray-400 font-medium">Loading bills…</p>
    </div>
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-hydro-deep-aqua" style={{ letterSpacing: '-0.03em' }}>Bills</h1>
        <p className="text-sm text-gray-400 mt-1">Your billing history and payment status</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">{error}</div>
      )}

      {bills.length === 0 ? (
        <div className="card text-center py-12">
          <p className="text-xl text-gray-600">No bills available yet</p>
          <p className="text-sm text-gray-500 mt-2">Bills will appear here once generated by administrators</p>
        </div>
      ) : (
        <div>
          {/* Summary cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="card bg-gradient-to-br from-green-500 to-green-600 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">Total Paid</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'paid').reduce((s, b) => s + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">Pending</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'pending' || b.status === 'sent').reduce((s, b) => s + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
              <p className="text-xs font-semibold opacity-80 mb-1">Overdue</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'overdue').reduce((s, b) => s + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Bill history table */}
          <div className="card">
            <div className="flex justify-between items-center mb-5">
              <div>
                <h2 className="text-xl font-semibold text-hydro-deep-aqua">Bill History</h2>
                <p className="text-xs text-gray-400 mt-0.5">{bills.length} bill{bills.length !== 1 ? 's' : ''} · click any row to view invoice</p>
              </div>
              <button
                onClick={handleDownloadAllStatements}
                className="flex items-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-lg text-white transition"
                style={{ background: '#0A4C78' }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Full Statement
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Billing Period</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Usage</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Rate</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Amount</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Due Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-4 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => {
                    const usage = parseFloat(bill.total_usage_ccf);
                    const cost  = parseFloat(bill.total_amount);
                    const rate  = usage > 0 ? (cost / usage).toFixed(2) : '—';
                    const st    = STATUS[bill.status] || STATUS.pending;
                    const isExp = expandedBill === bill.id;

                    return (
                      <React.Fragment key={bill.id}>
                        <tr
                          className={`border-t border-gray-50 cursor-pointer transition-colors ${isExp ? 'bg-blue-50/40' : 'hover:bg-gray-50/60'}`}
                          onClick={() => setExpandedBill(isExp ? null : bill.id)}
                        >
                          <td className="px-4 py-3 text-sm text-gray-700">
                            {bill.billing_period_start} – {bill.billing_period_end}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">{usage.toFixed(2)} CCF</td>
                          <td className="px-4 py-3 text-sm text-gray-500">${rate}</td>
                          <td className="px-4 py-3 text-sm font-bold text-hydro-deep-aqua">${cost.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{bill.due_date}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${st.row}`}>{st.label}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`inline-flex items-center gap-1 text-xs font-medium ${isExp ? 'text-hydro-spark-blue' : 'text-gray-400'}`}>
                              {isExp ? 'Close' : 'View Invoice'}
                              <span style={{ display: 'inline-block', transform: isExp ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▾</span>
                            </span>
                          </td>
                        </tr>

                        {isExp && (
                          <tr>
                            <td colSpan={7} className="px-5 pb-6 pt-3 bg-gradient-to-b from-blue-50/30 to-transparent">
                              <BillInvoice bill={bill} customer={user?.customer} />
                              <div className="flex justify-end mt-3">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleDownloadSingleBill(bill); }}
                                  className="flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg border text-hydro-deep-aqua hover:bg-hydro-sky-blue transition"
                                  style={{ borderColor: 'rgba(10,76,120,0.25)' }}
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                  </svg>
                                  Download PDF Invoice
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Bills;
