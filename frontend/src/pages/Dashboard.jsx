import { CreditCard, Package, Users, UserX } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { useAuth } from '../context/AuthContext';

function toDate(value) {
  if (!value) return null;
  if (value._seconds) return new Date(value._seconds * 1000);
  if (value.seconds) return new Date(value.seconds * 1000);
  return new Date(value);
}

function formatDate(value) {
  const date = toDate(value);
  return date && !Number.isNaN(date.valueOf()) ? date.toLocaleDateString() : '-';
}

function sortRecent(field) {
  return (a, b) => (toDate(b[field])?.valueOf() || 0) - (toDate(a[field])?.valueOf() || 0);
}

export default function Dashboard() {
  const { tenant } = useAuth();
  const [customers, setCustomers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [customerRes, paymentRes] = await Promise.all([
          api.get('/customers'),
          api.get('/payments'),
        ]);

        if (mounted) {
          setCustomers(Array.isArray(customerRes.data) ? customerRes.data : []);
          setPayments(Array.isArray(paymentRes.data) ? paymentRes.data : []);
        }
      } catch (error) {
        toast.error(error.response?.data?.message || 'Failed to load dashboard');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const stats = useMemo(() => {
    const today = new Date().toDateString();
    const todayPayments = payments.filter((payment) => toDate(payment.paid_at)?.toDateString() === today);
    const totalToday = todayPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

    return {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((customer) => customer.status === 'active').length,
      expiredCustomers: customers.filter((customer) => customer.status === 'expired').length,
      paymentsToday: totalToday || todayPayments.length,
    };
  }, [customers, payments]);

  const recentCustomers = [...customers].sort(sortRecent('created_at')).slice(0, 5);
  const recentPayments = [...payments].sort(sortRecent('paid_at')).slice(0, 5);

  if (loading) {
    return <p className="text-sm font-medium text-slate-600">Loading dashboard...</p>;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="page-title">Dashboard</h1>
      </div>

      {tenant?.id && (
        <div className="surface-card p-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Customer portal link</p>
          <a className="mt-1 inline-block break-all text-sm font-medium text-app-accent hover:text-app-accentDark" href={`/portal/${tenant.id}`} target="_blank" rel="noreferrer">
            {window.location.origin}/portal/{tenant.id}
          </a>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Users} label="Total Customers" value={stats.totalCustomers} color="bg-app-navy" />
        <StatCard icon={Users} label="Active Customers" value={stats.activeCustomers} color="bg-green-600" />
        <StatCard icon={UserX} label="Expired Customers" value={stats.expiredCustomers} color="bg-red-600" />
        <StatCard icon={CreditCard} label="Payments Today" value={stats.paymentsToday} color="bg-app-accent" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section>
          <h2 className="mb-2 text-base font-medium text-slate-950">Recent Payments</h2>
          <div className="table-shell">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentPayments.length === 0 ? (
                  <tr><td className="table-cell text-slate-500" colSpan="3">No recent payments yet.</td></tr>
                ) : recentPayments.map((payment) => (
                  <tr key={payment.id}>
                    <td className="table-cell">{payment.customer_name || '-'}</td>
                    <td className="table-cell">KES {payment.amount || 0}</td>
                    <td className="table-cell"><StatusBadge status={payment.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-base font-medium text-slate-950">Recent Customers</h2>
          <div className="table-shell">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="table-head">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Expiry</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentCustomers.length === 0 ? (
                  <tr><td className="table-cell text-slate-500" colSpan="3">No customers added yet.</td></tr>
                ) : recentCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td className="table-cell">{customer.name}</td>
                    <td className="table-cell"><Package size={15} className="mr-1 inline" />{customer.package || '-'}</td>
                    <td className="table-cell">{formatDate(customer.expiry_date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
