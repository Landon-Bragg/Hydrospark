import React, { useState, useEffect } from 'react';
import { getBills } from '../services/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useAuth } from '../context/AuthContext';

function Bills() {
  const { user } = useAuth();
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedBill, setExpandedBill] = useState(null);

  useEffect(() => {
    loadBills();
  }, []);

  const loadBills = async () => {
    try {
      setLoading(true);
      const response = await getBills();
      setBills(response.data.bills || []);
    } catch (err) {
      setError('Failed to load bills');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      'paid': 'bg-green-100 text-green-800',
      'sent': 'bg-blue-100 text-blue-800',
      'pending': 'bg-yellow-100 text-yellow-800',
      'overdue': 'bg-red-100 text-red-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr + 'T00:00:00');
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const handleDownloadAllStatements = () => {
    const customer = user?.customer;
    const doc = new jsPDF();

    doc.setFontSize(22);
    doc.setTextColor(0, 75, 135);
    doc.text('HYDROSPARK WATER CO.', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Official Billing Statement', 14, 28);
    doc.text('Invoice Date: ' + new Date().toLocaleDateString(), 14, 33);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text('BILL TO:', 14, 45);
    doc.setFont(undefined, 'normal');
    if (customer) {
      doc.text(customer.customer_name, 14, 53);
      doc.text('Location ID: ' + customer.location_id, 14, 59);
      doc.text(customer.mailing_address || 'No Address on File', 14, 65);
    }

    const totalAmount = bills.reduce((sum, b) => sum + parseFloat(b.total_amount), 0);
    const totalUsage = bills.reduce((sum, b) => sum + parseFloat(b.total_usage_ccf), 0);

    doc.setFontSize(11);
    doc.setTextColor(80);
    doc.text('Total Bills: ' + bills.length, 14, 77);
    doc.text('Total Usage: ' + totalUsage.toFixed(2) + ' CCF', 14, 83);
    doc.text('Total Amount: $' + totalAmount.toFixed(2), 14, 89);

    autoTable(doc, {
      startY: 99,
      head: [['Billing Period', 'Usage (CCF)', 'Rate ($/CCF)', 'Cost', 'Due Date', 'Status']],
      body: bills.map(b => {
        const usage = parseFloat(b.total_usage_ccf);
        const cost = parseFloat(b.total_amount);
        const rate = usage > 0 ? '$' + (cost / usage).toFixed(2) : '—';
        return [
          b.billing_period_start + ' to ' + b.billing_period_end,
          usage.toFixed(2),
          rate,
          '$' + cost.toFixed(2),
          b.due_date,
          b.status.toUpperCase()
        ];
      }),
      theme: 'grid',
      headStyles: { fillColor: [0, 75, 135] },
      styles: { fontSize: 10 }
    });

    const filename = customer
      ? 'HydroSpark_Statement_' + customer.customer_name.replace(/\s+/g, '_') + '.pdf'
      : 'HydroSpark_Statement.pdf';

    doc.save(filename);
  };

  const handleDownloadSingleBill = (bill) => {
    const customer = user?.customer;
    const doc = new jsPDF();

    const usage = parseFloat(bill.total_usage_ccf);
    const cost = parseFloat(bill.total_amount);
    const rate = usage > 0 ? (cost / usage).toFixed(2) : '—';

    doc.setFontSize(22);
    doc.setTextColor(0, 75, 135);
    doc.text('HYDROSPARK WATER CO.', 14, 20);

    doc.setFontSize(10);
    doc.setTextColor(100);
    doc.text('Water Service Invoice', 14, 28);
    doc.text('Printed: ' + new Date().toLocaleDateString(), 14, 33);

    doc.setFontSize(12);
    doc.setTextColor(0);
    doc.setFont(undefined, 'bold');
    doc.text('BILL TO:', 14, 45);
    doc.setFont(undefined, 'normal');
    if (customer) {
      doc.text(customer.customer_name, 14, 53);
      doc.text('Location ID: ' + customer.location_id, 14, 59);
      doc.text(customer.mailing_address || 'No Address on File', 14, 65);
    }

    autoTable(doc, {
      startY: 75,
      head: [['Description', 'Amount']],
      body: [
        ['Billing Period', bill.billing_period_start + ' to ' + bill.billing_period_end],
        ['Water Usage', usage.toFixed(2) + ' CCF'],
        ['Rate', '$' + rate + ' / CCF'],
        ['Due Date', bill.due_date],
        ['Status', bill.status.toUpperCase()],
        ['Total Charges', '$' + cost.toFixed(2)],
      ],
      theme: 'grid',
      headStyles: { fillColor: [0, 75, 135] },
      styles: { fontSize: 11 },
      columnStyles: { 0: { fontStyle: 'bold' } }
    });

    const period = bill.billing_period_start.slice(0, 7);
    const name = customer ? customer.customer_name.replace(/\s+/g, '_') : 'Bill';
    doc.save(`HydroSpark_Invoice_${name}_${period}.pdf`);
  };

  if (loading) return <div className="text-center py-10">Loading bills...</div>;

  return (
    <div>
      <h1 className="text-3xl font-bold text-hydro-deep-aqua mb-6">Bills</h1>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
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
              <p className="text-sm mb-1">Total Paid</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'paid').reduce((sum, b) => sum + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-yellow-500 to-yellow-600 text-white">
              <p className="text-sm mb-1">Pending</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'pending' || b.status === 'sent').reduce((sum, b) => sum + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
            <div className="card bg-gradient-to-br from-red-500 to-red-600 text-white">
              <p className="text-sm mb-1">Overdue</p>
              <p className="text-2xl font-bold">
                ${bills.filter(b => b.status === 'overdue').reduce((sum, b) => sum + parseFloat(b.total_amount), 0).toFixed(2)}
              </p>
            </div>
          </div>

          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Bill History</h2>
              <button
                onClick={handleDownloadAllStatements}
                className="text-white bg-hydro-deep-aqua border border-hydro-deep-aqua px-4 py-2 rounded text-sm font-semibold hover:opacity-90 transition"
              >
                Download Full Statement
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Bill Period</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Usage (CCF)</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Rate ($/CCF)</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Cost</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Due Date</th>
                    <th className="px-4 py-2 text-left text-sm font-semibold text-gray-700">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map((bill) => {
                    const usage = parseFloat(bill.total_usage_ccf);
                    const cost = parseFloat(bill.total_amount);
                    const rate = usage > 0 ? (cost / usage).toFixed(2) : '—';
                    const isExpanded = expandedBill === bill.id;

                    return (
                      <React.Fragment key={bill.id}>
                        <tr
                          className={`border-t hover:bg-gray-50 cursor-pointer ${isExpanded ? 'bg-blue-50' : ''}`}
                          onClick={() => setExpandedBill(isExpanded ? null : bill.id)}
                        >
                          <td className="px-4 py-3 text-sm">
                            {bill.billing_period_start} to {bill.billing_period_end}
                          </td>
                          <td className="px-4 py-3 text-sm">{usage.toFixed(2)}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">${rate}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-hydro-deep-aqua">
                            ${cost.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-sm">{bill.due_date}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getStatusColor(bill.status)}`}>
                              {bill.status.toUpperCase()}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-xs text-gray-400">
                              {isExpanded ? '▲ Hide' : '▼ View'}
                            </span>
                          </td>
                        </tr>

                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="px-0 py-0 border-t-0">
                              <div className="mx-4 mb-4 mt-1 border border-gray-200 rounded-lg overflow-hidden shadow-sm">
                                {/* Invoice header */}
                                <div className="bg-hydro-deep-aqua text-white px-6 py-4 flex justify-between items-start">
                                  <div>
                                    <h3 className="text-lg font-bold tracking-wide">HYDROSPARK WATER CO.</h3>
                                    <p className="text-blue-200 text-sm mt-0.5">Water Service Invoice</p>
                                  </div>
                                  <div className="text-right">
                                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                                      bill.status === 'paid' ? 'bg-green-400 text-green-900' :
                                      bill.status === 'overdue' ? 'bg-red-400 text-red-900' :
                                      'bg-yellow-300 text-yellow-900'
                                    }`}>
                                      {bill.status.toUpperCase()}
                                    </span>
                                  </div>
                                </div>

                                <div className="p-6">
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                    {/* Billing period */}
                                    <div>
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Billing Period</p>
                                      <p className="text-gray-800 font-medium">
                                        {formatDate(bill.billing_period_start)}
                                      </p>
                                      <p className="text-gray-500 text-sm">to</p>
                                      <p className="text-gray-800 font-medium">
                                        {formatDate(bill.billing_period_end)}
                                      </p>
                                    </div>

                                    {/* Due date */}
                                    <div>
                                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Due Date</p>
                                      <p className={`text-lg font-semibold ${bill.status === 'overdue' ? 'text-red-600' : 'text-gray-800'}`}>
                                        {formatDate(bill.due_date)}
                                      </p>
                                      {bill.paid_at && (
                                        <p className="text-green-600 text-sm mt-1">
                                          Paid {formatDate(bill.paid_at.slice(0, 10))}
                                        </p>
                                      )}
                                    </div>
                                  </div>

                                  {/* Charges breakdown */}
                                  <div className="border border-gray-100 rounded-lg overflow-hidden">
                                    <div className="bg-gray-50 px-4 py-2">
                                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Charges</p>
                                    </div>
                                    <div className="divide-y divide-gray-100">
                                      <div className="flex justify-between px-4 py-3">
                                        <span className="text-sm text-gray-600">Water Usage</span>
                                        <span className="text-sm font-medium">{usage.toFixed(2)} CCF</span>
                                      </div>
                                      <div className="flex justify-between px-4 py-3">
                                        <span className="text-sm text-gray-600">Rate</span>
                                        <span className="text-sm font-medium">${rate} / CCF</span>
                                      </div>
                                      <div className="flex justify-between px-4 py-3 bg-hydro-sky-blue">
                                        <span className="text-sm font-bold text-hydro-deep-aqua">Total Due</span>
                                        <span className="text-lg font-bold text-hydro-deep-aqua">${cost.toFixed(2)}</span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Actions */}
                                  <div className="flex justify-end mt-4">
                                    <button
                                      onClick={(e) => { e.stopPropagation(); handleDownloadSingleBill(bill); }}
                                      className="text-sm px-4 py-2 border border-hydro-deep-aqua text-hydro-deep-aqua rounded hover:bg-hydro-sky-blue transition"
                                    >
                                      Download Invoice
                                    </button>
                                  </div>
                                </div>
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
