import { useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import AdminLayout from './components/admin/AdminLayout';
import AdminProtectedRoute from './components/admin/AdminProtectedRoute';
import ProtectedRoute from './components/ProtectedRoute';
import Sidebar from './components/Sidebar';
import AdminAuditLog from './pages/admin/AdminAuditLog';
import AdminDashboard from './pages/admin/AdminDashboard';
import AdminLogin from './pages/admin/AdminLogin';
import AdminSiteSettings from './pages/admin/AdminSiteSettings';
import AdminTenantDetail from './pages/admin/AdminTenantDetail';
import AdminTenants from './pages/admin/AdminTenants';
import AdminUsers from './pages/admin/AdminUsers';
import Customers from './pages/Customers';
import CustomerPortal from './pages/CustomerPortal';
import Dashboard from './pages/Dashboard';
import Home from './pages/Home';
import Login from './pages/Login';
import Packages from './pages/Packages';
import Payments from './pages/Payments';
import Register from './pages/Register';

function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-app-bg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="min-h-screen w-full min-w-0 lg:ml-[240px] lg:w-[calc(100%-240px)]">
        <Navbar onMenuClick={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-[1200px] px-4 py-4 sm:px-8 sm:py-5">
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/packages" element={<Packages />} />
            <Route path="/payments" element={<Payments />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

export default function App() {
  const isAdminHost = window.location.hostname.split('.')[0] === 'admin';

  return (
    <Routes>
      <Route path="/" element={isAdminHost ? <Navigate to="/admin/login" replace /> : <Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/portal/:tenantId" element={<CustomerPortal />} />
      <Route path="/customers/:tenantId" element={<CustomerPortal />} />
      <Route path="/customer/:tenantId" element={<CustomerPortal />} />
      <Route path="/hotspot/:tenantId" element={<CustomerPortal />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route element={<AdminProtectedRoute />}>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<Navigate to="/admin/dashboard" replace />} />
          <Route path="dashboard" element={<AdminDashboard />} />
          <Route path="tenants" element={<AdminTenants />} />
          <Route path="tenants/:id" element={<AdminTenantDetail />} />
          <Route path="users" element={<AdminUsers />} />
          <Route path="site" element={<AdminSiteSettings />} />
          <Route path="audit" element={<AdminAuditLog />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route path="/*" element={<DashboardLayout />} />
      </Route>
    </Routes>
  );
}
