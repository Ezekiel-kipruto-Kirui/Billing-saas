import { ExternalLink, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useParams } from 'react-router-dom';
import adminApi from '../../api/adminAxios';
import StatusBadge from '../../components/StatusBadge';

const editableFields = [
  'business_name',
  'owner_name',
  'email',
  'phone',
  'mikrotik_host',
  'mikrotik_user',
  'mikrotik_port',
  'mpesa_shortcode',
  'mpesa_business_shortcode',
  'mpesa_shortcode_type',
  'mpesa_consumer_key',
  'status',
];

const labels = {
  business_name: 'Business name',
  owner_name: 'Owner name',
  email: 'Email',
  phone: 'Phone',
  mikrotik_host: 'MikroTik host',
  mikrotik_user: 'MikroTik user',
  mikrotik_port: 'MikroTik port',
  mpesa_shortcode: 'M-Pesa shortcode',
  mpesa_business_shortcode: 'M-Pesa business shortcode',
  mpesa_shortcode_type: 'M-Pesa shortcode type',
  mpesa_consumer_key: 'M-Pesa consumer key',
  status: 'Status',
};

function DataTable({ rows, columns, empty }) {
  return (
    <div className="table-shell overflow-x-auto">
      <table className="min-w-full divide-y divide-slate-200">
        <thead className="table-head">
          <tr>{columns.map((column) => <th key={column.key} className="px-4 py-3">{column.label}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.length === 0 ? (
            <tr><td className="table-cell text-slate-500" colSpan={columns.length}>{empty}</td></tr>
          ) : rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td key={column.key} className="table-cell">{column.render ? column.render(row) : row[column.key] || '-'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminTenantDetail() {
  const { id } = useParams();
  const [tenant, setTenant] = useState(null);
  const [form, setForm] = useState({});
  const [secrets, setSecrets] = useState({
    mikrotik_pass: '',
    mpesa_consumer_secret: '',
    mpesa_passkey: '',
  });
  const [tab, setTab] = useState('customers');
  const [tabRows, setTabRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function loadTenant() {
    const { data } = await adminApi.get(`/admin/tenants/${id}`);
    setTenant(data);
    setForm(editableFields.reduce((acc, field) => ({ ...acc, [field]: data[field] || '' }), {}));
  }

  async function loadTab(nextTab = tab) {
    const { data } = await adminApi.get(`/admin/tenants/${id}/${nextTab}`);
    setTabRows(Array.isArray(data) ? data : []);
  }

  useEffect(() => {
    async function load() {
      try {
        await loadTenant();
        await loadTab('customers');
      } catch (error) {
        toast.error(error.response?.data?.error || 'Failed to load tenant');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const switchTab = async (nextTab) => {
    setTab(nextTab);
    setTabRows([]);
    try {
      await loadTab(nextTab);
    } catch (error) {
      toast.error(error.response?.data?.error || `Failed to load ${nextTab}`);
    }
  };

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const updateSecret = (event) => {
    setSecrets((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await adminApi.patch(`/admin/tenants/${id}`, {
        ...form,
        ...Object.fromEntries(Object.entries(secrets).filter(([, value]) => String(value).trim())),
        mikrotik_port: Number(form.mikrotik_port || 8728),
      });
      toast.success('Tenant updated');
      setSecrets({ mikrotik_pass: '', mpesa_consumer_secret: '', mpesa_passkey: '' });
      await loadTenant();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to update tenant');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm font-medium text-slate-600">Loading tenant...</p>;
  if (!tenant) return <p className="text-sm font-medium text-slate-600">Tenant not found.</p>;

  const columns = {
    customers: [
      { key: 'name', label: 'Name' },
      { key: 'phone', label: 'Phone' },
      { key: 'username', label: 'Username' },
      { key: 'package', label: 'Package' },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ],
    payments: [
      { key: 'customer_name', label: 'Customer' },
      { key: 'phone', label: 'Phone' },
      { key: 'amount', label: 'Amount', render: (row) => `KES ${row.amount || 0}` },
      { key: 'mpesa_code', label: 'M-Pesa Code' },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
    ],
    packages: [
      { key: 'name', label: 'Name' },
      { key: 'speed', label: 'Speed' },
      { key: 'duration_days', label: 'Duration' },
      { key: 'price', label: 'Price', render: (row) => `KES ${row.price || 0}` },
    ],
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{tenant.business_name}</h1>
          <p className="mt-1 text-sm text-slate-500">Tenant ID: {tenant.id}</p>
        </div>
        <a className="btn-secondary" href={`/portal/${tenant.id}`} target="_blank" rel="noreferrer">
          <ExternalLink size={16} />
          Customer Portal
        </a>
      </div>

      <form className="rounded-lg bg-white p-6 shadow-soft ring-1 ring-slate-200" onSubmit={save}>
        <div className="grid gap-4 md:grid-cols-2">
          {editableFields.map((field) => (
            <div key={field}>
              <label className="form-label" htmlFor={field}>{labels[field]}</label>
              {field === 'status' ? (
                <select id={field} name={field} className="form-input" value={form[field]} onChange={update}>
                  <option value="active">active</option>
                  <option value="pending_setup">pending_setup</option>
                  <option value="suspended">suspended</option>
                  <option value="inactive">inactive</option>
                </select>
              ) : field === 'mpesa_shortcode_type' ? (
                <select id={field} name={field} className="form-input" value={form[field]} onChange={update}>
                  <option value="CustomerBuyGoodsOnline">CustomerBuyGoodsOnline</option>
                  <option value="CustomerPayBillOnline">CustomerPayBillOnline</option>
                </select>
              ) : (
                <input id={field} name={field} className="form-input" value={form[field]} onChange={update} />
              )}
            </div>
          ))}

          <div>
            <label className="form-label">tenant password</label>
            <input className="form-input" value="••••••••" disabled />
          </div>

          {[
            ['mikrotik_pass', 'MikroTik password'],
            ['mpesa_consumer_secret', 'M-Pesa consumer secret'],
            ['mpesa_passkey', 'M-Pesa passkey'],
          ].map(([field, label]) => (
            <div key={field}>
              <label className="form-label" htmlFor={field}>{label}</label>
              <input
                id={field}
                name={field}
                type="password"
                className="form-input"
                placeholder="Leave blank to keep existing value"
                value={secrets[field]}
                onChange={updateSecret}
              />
            </div>
          ))}

          {['mpesa_callback_url', 'mpesa_environment'].map((field) => (
            <div key={field}>
              <label className="form-label">{field}</label>
              <input className="form-input" value={tenant[field] || '-'} disabled />
            </div>
          ))}
        </div>

        <button type="submit" className="mt-5 inline-flex items-center justify-center gap-2 rounded-md bg-[#e94560] px-4 py-2 text-sm font-bold text-white hover:bg-[#c73652] disabled:opacity-60" disabled={saving}>
          <Save size={17} />
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>

      <section className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {['customers', 'payments', 'packages'].map((item) => (
            <button key={item} className={`rounded-md px-4 py-2 text-sm font-bold capitalize ${tab === item ? 'bg-[#e94560] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`} onClick={() => switchTab(item)}>
              {item}
            </button>
          ))}
        </div>
        <DataTable rows={tabRows} columns={columns[tab]} empty={`No ${tab} found for this tenant.`} />
      </section>
    </div>
  );
}
