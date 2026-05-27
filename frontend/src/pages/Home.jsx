import { Building2, Mail, MapPin, Phone, Wifi } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';

const publicApi = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://billing-saas-430b.onrender.com/api',
});

export default function Home() {
  const [site, setSite] = useState(null);

  useEffect(() => {
    publicApi.get('/public/site')
      .then(({ data }) => setSite(data))
      .catch(() => setSite({
        brand_name: 'Billing SaaS',
        headline: 'Internet billing built for hotspot businesses',
        subheadline: 'Sell packages, collect M-Pesa payments, and activate MikroTik users automatically.',
        about: 'We help hotspot operators manage customers, packages, payments, and access control from one secure platform.',
        phone: '+254 700 000 000',
        email: 'support@example.com',
        location: 'Nairobi, Kenya',
        address: 'Nairobi, Kenya',
        cta_label: 'Register your business',
        cta_url: '/register',
      }));
  }, []);

  if (!site) {
    return <main className="min-h-screen bg-slate-50" />;
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-app-accent text-white">
              <Wifi size={22} />
            </div>
            <span className="text-lg font-bold text-slate-900">{site.brand_name}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link className="btn-secondary" to="/login">Login</Link>
            <Link className="btn-primary" to={site.cta_url || '/register'}>{site.cta_label || 'Register'}</Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl gap-8 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <div>
          <p className="text-sm font-bold uppercase tracking-widest text-app-accent">Hotspot billing platform</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-bold leading-tight text-app-navy sm:text-5xl">{site.headline}</h1>
          <p className="mt-5 max-w-2xl text-lg text-slate-600">{site.subheadline}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link className="btn-primary" to={site.cta_url || '/register'}>{site.cta_label || 'Register your business'}</Link>
          </div>
        </div>
        <div className="surface-card p-6">
          <Building2 className="text-app-accent" size={32} />
          <h2 className="mt-4 text-xl font-bold text-app-navy">About Us</h2>
          <p className="mt-3 text-sm leading-6 text-slate-600">{site.about}</p>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-6xl gap-4 px-4 py-10 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-5">
            <Phone className="text-app-accent" size={22} />
            <p className="mt-3 text-sm font-semibold text-slate-500">Phone</p>
            <p className="font-bold text-slate-900">{site.phone}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-5">
            <Mail className="text-app-accent" size={22} />
            <p className="mt-3 text-sm font-semibold text-slate-500">Email</p>
            <p className="font-bold text-slate-900">{site.email}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-5">
            <MapPin className="text-app-accent" size={22} />
            <p className="mt-3 text-sm font-semibold text-slate-500">Location</p>
            <p className="font-bold text-slate-900">{site.location || site.address}</p>
          </div>
        </div>
      </section>
    </main>
  );
}
