import { Edit, ExternalLink, Plus, Power, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/adminAxios';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';

const emptyForm = {
  business_name: '',
  owner_name: '',
  email: '',
  phone: '',
  password: '',
  mikrotik_host: '',
  mikrotik_user: '',
  mikrotik_pass: '',
  mikrotik_port: '8728',
  mpesa_consumer_key: '',
  mpesa_consumer_secret: '',
  mpesa_shortcode: '',
  mpesa_business_shortcode: '',
  mpesa_shortcode_type: 'CustomerBuyGoodsOnline',
  mpesa_passkey: '',
  status: 'active',
};

const labels = {
  business_name: 'Business name',
  owner_name: 'Owner name',
  email: 'Email',
  phone: 'Phone',
  password: 'Tenant password',
  mikrotik_host: 'MikroTik host',
  mikrotik_user: 'MikroTik user',
  mikrotik_pass: 'MikroTik password',
  mikrotik_port: 'MikroTik port',
  mpesa_consumer_key: 'Consumer key',
  mpesa_consumer_secret: 'Consumer secret',
  mpesa_shortcode: 'Shortcode',
  mpesa_business_shortcode: 'Business shortcode',
  mpesa_shortcode_type: 'Shortcode type',
  mpesa_passkey: 'Passkey',
  status: 'Status',
};

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function Field({ name, value, error, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="form-label" htmlFor={name}>{labels[name]}</label>
      <input id={name} name={name} type={type} className="form-input" value={value} onChange={onChange} placeholder={placeholder} />
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}

export default function AdminTenants() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [modalMode, setModalMode] = useState(null);
  const [editingTenant, setEditingTenant] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState({});

  async function load() {
    setLoading(true);
    try {
      const { data } = await adminApi.get('/admin/tenants');
      setTenants(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to load tenants');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => ({
    total: tenants.length,
    active: tenants.filter((tenant) => tenant.status === 'active').length,
    pending: tenants.filter((tenant) => tenant.status === 'pending_setup').length,
    suspended: tenants.filter((tenant) => tenant.status === 'suspended').length,
  }), [tenants]);

  const openCreate = () => {
    setModalMode('create');
    setEditingTenant(null);
    setForm(emptyForm);
    setErrors({});
  };

  const openEdit = (tenant) => {
    setModalMode('edit');
    setEditingTenant(tenant);
    setForm({
      ...emptyForm,
      business_name: tenant.business_name || '',
      owner_name: tenant.owner_name || '',
      email: tenant.email || '',
      phone: tenant.phone || '',
      password: '',
      mikrotik_host: tenant.mikrotik_host || '',
      mikrotik_user: tenant.mikrotik_user || '',
      mikrotik_pass: '',
      mikrotik_port: String(tenant.mikrotik_port || 8728),
      mpesa_consumer_key: tenant.mpesa_consumer_key || '',
      mpesa_consumer_secret: '',
      mpesa_shortcode: tenant.mpesa_shortcode || '',
      mpesa_business_shortcode: tenant.mpesa_business_shortcode || '',
      mpesa_shortcode_type: tenant.mpesa_shortcode_type || 'CustomerBuyGoodsOnline',
      mpesa_passkey: '',
      status: tenant.status || 'active',
    });
    setErrors({});
  };

  const closeModal = () => {
    if (saving) return;
    setModalMode(null);
    setEditingTenant(null);
    setForm(emptyForm);
    setErrors({});
  };

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    const createRequired = Object.keys(emptyForm).filter((field) => field !== 'status');
    const editRequired = ['business_name', 'owner_name', 'email', 'phone'];
    const required = modalMode === 'create' ? createRequired : editRequired;

    required.forEach((field) => {
      if (!String(form[field] || '').trim()) nextErrors[field] = `${labels[field]} is required`;
    });

    if (modalMode === 'create' && form.password.length < 6) {
      nextErrors.password = 'Password must be at least 6 characters';
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveTenant = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        mikrotik_port: Number(form.mikrotik_port || 8728),
      };

      if (modalMode === 'edit') {
        delete payload.password;
        ['mikrotik_pass', 'mpesa_consumer_secret', 'mpesa_passkey'].forEach((field) => {
          if (!String(payload[field] || '').trim()) delete payload[field];
        });
        await adminApi.patch(`/admin/tenants/${editingTenant.id}`, payload);
        toast.success('Tenant updated');
      } else {
        await adminApi.post('/admin/tenants', payload);
        toast.success('Tenant created');
      }

      closeModal();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to save tenant');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (tenant, status) => {
    setUpdatingId(tenant.id);
    try {
      if (status === 'suspended') {
        await adminApi.delete(`/admin/tenants/${tenant.id}`);
      } else {
        await adminApi.patch(`/admin/tenants/${tenant.id}`, { status });
      }
      toast.success(status === 'suspended' ? 'Tenant suspended' : 'Tenant activated');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update tenant');
    } finally {
      setUpdatingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Tenants</h1>
          <p className="mt-1 text-xs text-slate-500">Create, configure, and manage hotspot businesses.</p>
        </div>
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-[#e94560] px-3 py-2 text-xs font-bold text-white hover:bg-[#c73652]" type="button" onClick={openCreate}>
          <Plus size={16} />
          Create Tenant
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Total', stats.total],
          ['Active', stats.active],
          ['Pending', stats.pending],
          ['Suspended', stats.suspended],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg bg-white p-3 shadow-soft ring-1 ring-slate-200">
            <p className="text-xs font-semibold text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="table-head">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Portal</th>
              <th className="px-4 py-3">MikroTik</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="table-cell text-slate-500" colSpan="9">Loading tenants...</td></tr>
            ) : tenants.length === 0 ? (
              <tr><td className="table-cell text-slate-500" colSpan="9">No tenants found.</td></tr>
            ) : tenants.map((tenant) => (
              <tr key={tenant.id}>
                <td className="table-cell font-medium text-slate-900">{tenant.business_name}</td>
                <td className="table-cell">{tenant.owner_name}</td>
                <td className="table-cell">{tenant.email}</td>
                <td className="table-cell">{tenant.phone}</td>
                <td className="table-cell">
                  <a className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-700" href={`/portal/${tenant.id}`} target="_blank" rel="noreferrer">
                    Open <ExternalLink size={13} />
                  </a>
                </td>
                <td className="table-cell">{tenant.mikrotik_host || 'Not set'}</td>
                <td className="table-cell"><StatusBadge status={tenant.status === 'suspended' ? 'expired' : tenant.status === 'pending_setup' ? 'pending' : 'active'} /></td>
                <td className="table-cell">{formatDate(tenant.created_at)}</td>
                <td className="table-cell">
                  <div className="flex flex-wrap gap-2">
                    <button className="btn-secondary" type="button" onClick={() => openEdit(tenant)}><Edit size={15} />Edit</button>
                    {tenant.status === 'suspended' ? (
                      <button className="btn-secondary text-green-700" type="button" onClick={() => setStatus(tenant, 'active')} disabled={updatingId === tenant.id}><ShieldCheck size={15} />Activate</button>
                    ) : (
                      <button className="btn-danger" type="button" onClick={() => setStatus(tenant, 'suspended')} disabled={updatingId === tenant.id}><Power size={15} />Suspend</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalMode && (
        <Modal title={modalMode === 'create' ? 'Create Tenant' : `Edit ${editingTenant?.business_name || 'Tenant'}`} onClose={closeModal}>
          <form className="space-y-5" onSubmit={saveTenant}>
            <section>
              <h2 className="mb-3 text-sm font-bold text-slate-900">Business Info</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="business_name" value={form.business_name} error={errors.business_name} onChange={update} />
                <Field name="owner_name" value={form.owner_name} error={errors.owner_name} onChange={update} />
                <Field name="email" type="email" value={form.email} error={errors.email} onChange={update} />
                <Field name="phone" value={form.phone} error={errors.phone} onChange={update} />
                {modalMode === 'create' && <Field name="password" type="password" value={form.password} error={errors.password} onChange={update} />}
                {modalMode === 'edit' && (
                  <div>
                    <label className="form-label" htmlFor="status">Status</label>
                    <select id="status" name="status" className="form-input" value={form.status} onChange={update}>
                      <option value="active">active</option>
                      <option value="pending_setup">pending_setup</option>
                      <option value="suspended">suspended</option>
                      <option value="inactive">inactive</option>
                    </select>
                  </div>
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-bold text-slate-900">MikroTik</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="mikrotik_host" value={form.mikrotik_host} error={errors.mikrotik_host} onChange={update} />
                <Field name="mikrotik_user" value={form.mikrotik_user} error={errors.mikrotik_user} onChange={update} />
                <Field name="mikrotik_pass" type="password" value={form.mikrotik_pass} error={errors.mikrotik_pass} onChange={update} placeholder={modalMode === 'edit' ? 'Leave blank to keep existing' : ''} />
                <Field name="mikrotik_port" type="number" value={form.mikrotik_port} error={errors.mikrotik_port} onChange={update} />
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-sm font-bold text-slate-900">M-Pesa Daraja</h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field name="mpesa_consumer_key" value={form.mpesa_consumer_key} error={errors.mpesa_consumer_key} onChange={update} />
                <Field name="mpesa_consumer_secret" type="password" value={form.mpesa_consumer_secret} error={errors.mpesa_consumer_secret} onChange={update} placeholder={modalMode === 'edit' ? 'Leave blank to keep existing' : ''} />
                <Field name="mpesa_shortcode" value={form.mpesa_shortcode} error={errors.mpesa_shortcode} onChange={update} />
                <Field name="mpesa_business_shortcode" value={form.mpesa_business_shortcode} error={errors.mpesa_business_shortcode} onChange={update} />
                <div>
                  <label className="form-label" htmlFor="mpesa_shortcode_type">Shortcode type</label>
                  <select id="mpesa_shortcode_type" name="mpesa_shortcode_type" className="form-input" value={form.mpesa_shortcode_type} onChange={update}>
                    <option value="CustomerBuyGoodsOnline">CustomerBuyGoodsOnline</option>
                    <option value="CustomerPayBillOnline">CustomerPayBillOnline</option>
                  </select>
                  {errors.mpesa_shortcode_type && <p className="form-error">{errors.mpesa_shortcode_type}</p>}
                </div>
                <Field name="mpesa_passkey" type="password" value={form.mpesa_passkey} error={errors.mpesa_passkey} onChange={update} placeholder={modalMode === 'edit' ? 'Leave blank to keep existing' : ''} />
              </div>
            </section>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="inline-flex items-center justify-center rounded-md bg-[#e94560] px-4 py-2 text-xs font-bold text-white hover:bg-[#c73652]" disabled={saving}>
                {saving ? 'Saving...' : modalMode === 'create' ? 'Create Tenant' : 'Update Tenant'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
