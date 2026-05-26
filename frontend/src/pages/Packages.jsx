import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../api/axios';
import Modal from '../components/Modal';

const initialForm = {
  name: '',
  speed: '',
  duration_days: '',
  price: '',
};

export default function Packages() {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState(null);
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState({});

  async function load() {
    setLoading(true);
    try {
      const { data } = await api.get('/packages');
      setPackages(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load packages');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const update = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
  };

  const validate = () => {
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Package name is required';
    if (!form.speed.trim()) nextErrors.speed = 'Speed is required';
    if (!form.duration_days || Number(form.duration_days) <= 0) nextErrors.duration_days = 'Duration must be greater than 0';
    if (!form.price || Number(form.price) <= 0) nextErrors.price = 'Price must be greater than 0';
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingPackage(null);
    setForm(initialForm);
    setErrors({});
  };

  const openAddModal = () => {
    setEditingPackage(null);
    setForm(initialForm);
    setErrors({});
    setModalOpen(true);
  };

  const openEditModal = (pkg) => {
    setEditingPackage(pkg);
    setForm({
      name: pkg.name || '',
      speed: pkg.speed || '',
      duration_days: String(pkg.duration_days || ''),
      price: String(pkg.price || ''),
    });
    setErrors({});
    setModalOpen(true);
  };

  const savePackage = async (event) => {
    event.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_days: Number(form.duration_days),
        price: Number(form.price),
      };

      if (editingPackage) {
        await api.patch(`/packages/${editingPackage.id}`, payload);
        toast.success('Package updated');
      } else {
        await api.post('/packages/add', payload);
        toast.success('Package added');
      }

      closeModal();
      await load();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save package');
    } finally {
      setSaving(false);
    }
  };

  const deletePackage = async (pkg) => {
    if (!window.confirm(`Delete ${pkg.name}?`)) return;

    setDeletingId(pkg.id);
    try {
      await api.delete(`/packages/${pkg.id}`);
      setPackages((current) => current.filter((item) => item.id !== pkg.id));
      toast.success('Package deleted');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to delete package');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface-card">
        <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="page-title">Packages</h1>
          </div>
          <button type="button" className="btn-primary" onClick={openAddModal}>
            Add Package
          </button>
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium text-slate-950">Customer Packages</h2>
        </div>
        <div className="table-shell overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="table-head">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Speed</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Price</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="table-cell text-slate-500" colSpan="5">Loading packages...</td></tr>
              ) : packages.length === 0 ? (
                <tr><td className="table-cell text-slate-500" colSpan="5">No packages found.</td></tr>
              ) : packages.map((pkg, index) => (
                <tr key={pkg.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                  <td className="table-cell font-medium text-slate-950">{pkg.name}</td>
                  <td className="table-cell">{pkg.speed}</td>
                  <td className="table-cell">{pkg.duration_days} days</td>
                  <td className="table-cell font-medium text-slate-950">KES {pkg.price}</td>
                  <td className="table-cell">
                    <div className="flex flex-wrap gap-2">
                      <button type="button" className="btn-secondary" onClick={() => openEditModal(pkg)}>
                        Edit
                      </button>
                      <button type="button" className="btn-danger" onClick={() => deletePackage(pkg)} disabled={deletingId === pkg.id}>
                        {deletingId === pkg.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {modalOpen && (
        <Modal title={editingPackage ? 'Edit Package' : 'Add Package'} onClose={closeModal}>
          <form className="space-y-4" onSubmit={savePackage}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="form-label" htmlFor="name">Name</label>
                <input id="name" name="name" className="form-input" value={form.name} onChange={update} />
                {errors.name && <p className="form-error">{errors.name}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="speed">Speed</label>
                <input id="speed" name="speed" className="form-input" value={form.speed} onChange={update} placeholder="10M or 10M/10M" />
                {errors.speed && <p className="form-error">{errors.speed}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="duration_days">Duration days</label>
                <input id="duration_days" name="duration_days" type="number" className="form-input" value={form.duration_days} onChange={update} />
                {errors.duration_days && <p className="form-error">{errors.duration_days}</p>}
              </div>
              <div>
                <label className="form-label" htmlFor="price">Price</label>
                <input id="price" name="price" type="number" className="form-input" value={form.price} onChange={update} />
                {errors.price && <p className="form-error">{errors.price}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
              <button type="button" className="btn-secondary" onClick={closeModal}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={saving}>
                {saving ? 'Saving...' : editingPackage ? 'Update Package' : 'Save Package'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
