import { CreditCard, Plus, RefreshCw, Router, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';

const initialForm = {
  name: '',
  phone: '',
  username: '',
  password: '',
  package_name: '',
  provision_mikrotik: true,
};

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

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [payingId, setPayingId] = useState(null);
  const [provisioningId, setProvisioningId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  const packageMap = useMemo(() => {
    return packages.reduce((map, item) => {
      map[item.name] = item;
      return map;
    }, {});
  }, [packages]);

  async function load() {
    setLoading(true);
    try {
      const [customerRes, packageRes] = await Promise.all([
        api.get('/customers'),
        api.get('/packages'),
      ]);
      setCustomers(Array.isArray(customerRes.data) ? customerRes.data : []);
      setPackages(Array.isArray(packageRes.data) ? packageRes.data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load customers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const update = (event) => {
    const { name, type, checked, value } = event.target;
    setForm((current) => ({ ...current, [name]: type === 'checkbox' ? checked : value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Name is required';
    if (!form.phone.trim()) nextErrors.phone = 'Phone is required';
    if (!form.username.trim()) nextErrors.username = 'Username is required';
    if (!form.password.trim()) nextErrors.password = 'Password is required';
    if (!form.package_name) nextErrors.package_name = 'Package is required';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const closeModal = () => {
    setModalOpen(false);
    setForm(initialForm);
    setErrors({});
  };

  const addCustomer = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      await api.post('/customers/add', form);
      toast.success('Customer added');
      closeModal();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to add customer');
    } finally {
      setSaving(false);
    }
  };

  const deleteCustomer = async (customer) => {
    if (!window.confirm(`Delete ${customer.name}?`)) return;

    setDeletingId(customer.id);
    try {
      await api.delete(`/customers/${customer.id}`);
      setCustomers((current) => current.filter((item) => item.id !== customer.id));
      toast.success('Customer deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete customer');
    } finally {
      setDeletingId(null);
    }
  };

  const pushStk = async (customer) => {
    const selectedPackage = packageMap[customer.package];
    setPayingId(customer.id);
    try {
      await api.post('/payments/pay', {
        customer_id: customer.id,
        customer_name: customer.name,
        phone: customer.phone,
        amount: selectedPackage?.price,
        package_name: customer.package,
        service_type: 'pppoe',
      });
      toast.success('STK push sent');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to send STK push');
    } finally {
      setPayingId(null);
    }
  };

  const provisionCustomer = async (customer) => {
    setProvisioningId(customer.id);
    try {
      await api.post(`/customers/${customer.id}/provision`);
      toast.success('Customer provisioned on MikroTik');
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to provision customer');
    } finally {
      setProvisioningId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="page-title">Customers</h1>
        </div>
        <button type="button" className="btn-primary" onClick={() => setModalOpen(true)}>
          Add Customer
        </button>
      </div>

      <div className="table-shell overflow-x-auto">
        <table className="min-w-[900px] divide-y divide-slate-200">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Username</th>
              <th className="px-3 py-3">Package</th>
              <th className="px-3 py-3">MikroTik</th>
              <th className="px-3 py-3">Expiry</th>
              <th className="px-3 py-3">Status</th>
              <th className="sticky right-0 border-l border-slate-200 bg-slate-50 px-3 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td className="table-cell text-slate-500" colSpan="8">Loading customers...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td className="table-cell text-slate-500" colSpan="8">No customers found.</td></tr>
            ) : customers.map((customer) => (
              <tr key={customer.id}>
                <td className="table-cell px-3 font-medium text-slate-900">{customer.name}</td>
                <td className="table-cell px-3">{customer.phone}</td>
                <td className="table-cell px-3">{customer.username}</td>
                <td className="table-cell px-3">{customer.package || '-'}</td>
                <td className="table-cell px-3"><StatusBadge status={customer.provisioning_status || 'pending'} /></td>
                <td className="table-cell px-3">{formatDate(customer.expiry_date)}</td>
                <td className="table-cell px-3"><StatusBadge status={customer.status} /></td>
                <td className="table-cell sticky right-0 border-l border-slate-200 bg-white px-3">
                  <div className="flex flex-nowrap gap-2">
                    <button type="button" className="btn-secondary" onClick={() => provisionCustomer(customer)} disabled={provisioningId === customer.id}>
                      <Router size={16} />
                      {provisioningId === customer.id ? 'Provisioning...' : 'Provision'}
                    </button>
                    <button type="button" className="btn-secondary" onClick={() => pushStk(customer)} disabled={payingId === customer.id}>
                      <CreditCard size={16} />
                      {payingId === customer.id ? 'Sending...' : 'Pay'}
                    </button>
                    <button type="button" className="btn-danger" onClick={() => deleteCustomer(customer)} disabled={deletingId === customer.id}>
                      <Trash2 size={16} />
                      {deletingId === customer.id ? 'Deleting...' : 'Delete'}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal title="Add Customer" onClose={closeModal}>
          <form className="space-y-4" onSubmit={addCustomer}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="name">Name</label>
                <input id="name" name="name" className="form-input" value={form.name} onChange={update} />
                {errors.name && <p className="form-error">{errors.name}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="phone">Phone</label>
                <input id="phone" name="phone" className="form-input" value={form.phone} onChange={update} />
                {errors.phone && <p className="form-error">{errors.phone}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="username">Username</label>
                <input id="username" name="username" className="form-input" value={form.username} onChange={update} />
                {errors.username && <p className="form-error">{errors.username}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="password">Password</label>
                <input id="password" name="password" type="password" className="form-input" value={form.password} onChange={update} />
                {errors.password && <p className="form-error">{errors.password}</p>}
              </div>
              <div className="sm:col-span-2">
                <label className="form-label" htmlFor="package_name">Package</label>
                <select id="package_name" name="package_name" className="form-input" value={form.package_name} onChange={update}>
                  <option value="">Select a package</option>
                  {packages.map((pkg) => (
                    <option key={pkg.id} value={pkg.name}>{pkg.name}</option>
                  ))}
                </select>
                {errors.package_name && <p className="form-error">{errors.package_name}</p>}
              </div>
              <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
                <input
                  type="checkbox"
                  name="provision_mikrotik"
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  checked={form.provision_mikrotik}
                  onChange={update}
                />
                <span>
                  <span className="block font-semibold text-slate-800">Create this customer on MikroTik now</span>
                  <span className="mt-1 block">
                    This creates a PPPoE secret on MikroTik using the selected package/profile and keeps it disabled until payment.
                  </span>
                </span>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Saving...
                  </>
                ) : 'Save Customer'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
