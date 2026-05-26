import { Building2, LayoutDashboard, LogOut, Menu, Settings, Shield, Users, X } from 'lucide-react';
import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAdminAuth } from '../../context/AdminAuthContext';

const links = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/tenants', label: 'Tenants', icon: Building2 },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/site', label: 'Site', icon: Settings },
  { to: '/admin/audit', label: 'Audit Log', icon: Shield },
];

export default function AdminLayout() {
  const [open, setOpen] = useState(false);
  const { admin, logoutAdmin } = useAdminAuth();
  const navigate = useNavigate();

  const logout = () => {
    logoutAdmin();
    navigate('/admin/login', { replace: true });
  };

  const navClass = ({ isActive }) =>
    [
      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold transition',
      isActive ? 'bg-[#e94560] text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white',
    ].join(' ');

  return (
    <div className="min-h-screen bg-slate-50">
      <div
        className={`fixed inset-0 z-30 bg-slate-950/50 lg:hidden ${open ? '' : 'hidden'}`}
        onClick={() => setOpen(false)}
      />
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-[#1a1a2e] px-4 py-5 text-white transition-transform lg:w-64 lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-8 flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-[#e94560]">Admin</p>
            <h1 className="mt-1 text-xl font-bold">Control Panel</h1>
          </div>
          <button className="rounded-md p-2 hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close admin nav">
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass} onClick={() => setOpen(false)}>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <button type="button" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10" onClick={logout}>
          <LogOut size={18} />
          Logout
        </button>
      </aside>

      <div className="min-w-0 lg:ml-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between bg-[#16213e] px-4 text-white shadow-sm lg:px-8">
          <div className="flex items-center gap-3">
            <button className="rounded-md p-2 hover:bg-white/10 lg:hidden" onClick={() => setOpen(true)} aria-label="Open admin nav">
              <Menu size={22} />
            </button>
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-[#e94560]">Administrator</p>
              <h2 className="text-base font-semibold">{admin?.name || 'Administrator'}</h2>
            </div>
          </div>
          <Shield className="text-[#e94560]" size={24} />
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
