import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';

function toDate(value) {
  if (!value) return null;
  if (value._seconds) return new Date(value._seconds * 1000);
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function formatDate(value) {
  const date = toDate(value);
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleString() : '-';
}

export default function Payments() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const { data } = await api.get('/payments');
        setPayments(Array.isArray(data) ? data : []);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load payments');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Payments</h1>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">M-Pesa Code</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Paid At</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="table-cell text-slate-500" colSpan="6">Loading payments...</td></tr>
            ) : payments.length === 0 ? (
              <tr><td className="table-cell text-slate-500" colSpan="6">No payments found.</td></tr>
            ) : payments.map((payment) => (
              <tr key={payment.id}>
                <td className="table-cell font-medium text-slate-900">{payment.customer_name || '-'}</td>
                <td className="table-cell">{payment.phone || '-'}</td>
                <td className="table-cell">KES {payment.amount || 0}</td>
                <td className="table-cell">{payment.mpesa_code || '-'}</td>
                <td className="table-cell"><StatusBadge status={payment.status} /></td>
                <td className="table-cell">{formatDate(payment.paid_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
