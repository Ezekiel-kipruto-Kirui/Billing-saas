import { CreditCard, LayoutDashboard, Package, Users, X } from 'lucide-react';
import { NavLink } from 'react-router-dom';

const links = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/customers', label: 'Customers', icon: Users },
  { to: '/packages', label: 'Packages', icon: Package },
  { to: '/payments', label: 'Payments', icon: CreditCard },
];

export default function Sidebar({ open, onClose }) {
  const navClass = ({ isActive }) =>
    [
      'flex h-9 items-center gap-3 rounded-md px-3 text-sm font-medium transition',
      isActive ? 'bg-app-accent text-white' : 'text-slate-200 hover:bg-white/10 hover:text-white',
    ].join(' ');

  return (
    <>
      <div
        className={`fixed inset-0 z-30 bg-slate-950/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        onClick={onClose}
      />

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 flex-col bg-sidebar px-4 py-5 text-white transition-transform lg:w-[240px] lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="mb-6 flex h-10 items-center justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-blue-200">Billing SaaS</p>
            <h1 className="text-base font-medium text-white">Tenant Portal</h1>
          </div>
          <button
            type="button"
            className="rounded-md p-2 text-slate-200 hover:bg-white/10 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="space-y-1">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={navClass} onClick={onClose}>
              <Icon size={19} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}
