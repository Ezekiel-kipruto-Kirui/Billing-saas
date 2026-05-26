import { Activity, Building2, CreditCard, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/adminAxios';
import StatCard from '../../components/StatCard';

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const statsRes = await adminApi.get('/admin/tenants/stats/summary');
        setStats(statsRes.data);
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load admin dashboard');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <p className="text-sm font-medium text-slate-600">Loading admin dashboard...</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Admin Dashboard</h1>
        <p className="mt-1 text-xs text-slate-500">System-wide tenant, customer, and payment visibility.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={Building2} label="Total Tenants" value={`${stats?.totalTenants || 0} (${stats?.activeTenants || 0} active)`} color="bg-[#e94560]" />
        <StatCard icon={Users} label="All Customers" value={stats?.totalCustomers || 0} color="bg-blue-700" />
        <StatCard icon={CreditCard} label="Payments Today" value={`KES ${stats?.paymentsToday || 0}`} color="bg-green-700" />
        <StatCard icon={Activity} label="System Health" value={stats?.systemHealth || 'unknown'} color="bg-[#16213e]" />
      </div>
    </div>
  );
}
