import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

const PLAN_TYPE_COLORS = {
  trial: 'blue',
  standard: 'green',
  promotional: 'yellow',
  custom: 'purple',
};

function PlanForm({ plan, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: plan?.name || '',
    description: plan?.description || '',
    durationDays: plan?.durationDays ?? '',
    type: plan?.type || 'standard',
    price: plan?.price ?? '',
    currency: plan?.currency || 'USD',
    maxDevices: plan?.maxDevices ?? '',
    maxStreams: plan?.maxStreams ?? '',
    isActive: plan?.isActive ?? true,
    badgeColor: plan?.badgeColor || 'blue',
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name || form.name.trim().length < 2) {
      toast.error('Plan name must be at least 2 characters');
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description,
      type: form.type,
      badgeColor: form.badgeColor,
      isActive: form.isActive,
      currency: form.currency,
    };

    if (form.durationDays !== '' && form.durationDays !== null) {
      const d = parseInt(form.durationDays);
      if (isNaN(d) || d < 1 || d > 3650) {
        toast.error('Duration must be between 1 and 3650 days');
        return;
      }
      payload.durationDays = d;
    } else {
      payload.durationDays = null;
    }

    if (form.price !== '' && form.price !== null) {
      payload.price = parseFloat(form.price);
    }

    if (form.maxDevices !== '' && form.maxDevices !== null) {
      payload.maxDevices = parseInt(form.maxDevices);
    }
    if (form.maxStreams !== '' && form.maxStreams !== null) {
      payload.maxStreams = parseInt(form.maxStreams);
    }

    setSaving(true);
    try {
      if (plan) {
        await adminApi.updatePlan(plan.planId, payload);
        toast.success(`Plan '${payload.name}' updated`);
      } else {
        await adminApi.createPlan(payload);
        toast.success(`Plan '${payload.name}' created`);
      }
      onSave();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save plan');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50 w-full';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative bg-netflix-dark-2 rounded-xl border border-netflix-border/20 w-full max-w-lg p-6 shadow-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-4">{plan ? 'Edit Plan' : 'Create Plan'}</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-netflix-text-3 mb-1">Plan Name *</label>
            <input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Diwali Offer" className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-netflix-text-3 mb-1">Description</label>
            <textarea value={form.description} onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description" rows={2} className={`${inputClass} resize-none`} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Type *</label>
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className={inputClass}>
                <option value="standard">Standard</option>
                <option value="trial">Trial</option>
                <option value="promotional">Promotional</option>
                <option value="custom">Custom</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Duration (days)</label>
              <input type="number" min="1" max="3650" value={form.durationDays} onChange={(e) => setForm(f => ({ ...f, durationDays: e.target.value }))} placeholder="Leave empty for indefinite" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Price</label>
              <input type="number" min="0" step="0.01" value={form.price} onChange={(e) => setForm(f => ({ ...f, price: e.target.value }))} placeholder="0 = free" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Currency</label>
              <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))} className={inputClass}>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="INR">INR</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Max Devices</label>
              <input type="number" min="1" value={form.maxDevices} onChange={(e) => setForm(f => ({ ...f, maxDevices: e.target.value }))} placeholder="Unlimited" className={inputClass} />
            </div>
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1">Max Streams</label>
              <input type="number" min="1" value={form.maxStreams} onChange={(e) => setForm(f => ({ ...f, maxStreams: e.target.value }))} placeholder="Unlimited" className={inputClass} />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-sm rounded border border-netflix-border/30 text-netflix-text-2 hover:text-white transition-colors">Cancel</button>
          <button onClick={handleSubmit} disabled={saving} className="flex-1 px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
            {saving ? 'Saving...' : plan ? 'Update Plan' : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PlanManager() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [editTarget, setEditTarget] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.listPlans(true);
      setPlans(data.plans || []);
    } catch {
      toast.error('Failed to load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deletePlan(deleteTarget.planId);
      toast.success(`Plan '${deleteTarget.name}' disabled`);
      setDeleteTarget(null);
      fetchPlans();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to disable plan');
    } finally {
      setDeleting(false);
    }
  };

  const handleEnable = async (planId, name) => {
    try {
      await adminApi.updatePlan(planId, { isActive: true });
      toast.success(`Plan '${name}' enabled`);
      fetchPlans();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to enable plan');
    }
  };

  const columns = [
    { key: 'name', label: 'Plan Name', sortable: true, render: (r) => <span className="text-white font-medium">{r.name}</span> },
    { key: 'planId', label: 'ID', render: (r) => <span className="text-netflix-text-3 text-xs font-mono">{r.planId}</span> },
    {
      key: 'durationDays', label: 'Duration', render: (r) => {
        if (!r.durationDays) return <span className="text-netflix-text-3">—</span>;
        return <span>{r.durationDays} days</span>;
      },
    },
    { key: 'type', label: 'Type', render: (r) => <StatusBadge status={PLAN_TYPE_COLORS[r.type] || 'default'} label={r.type} /> },
    {
      key: 'price', label: 'Price', render: (r) => {
        if (!r.price && r.price !== 0) return <span className="text-netflix-text-3">—</span>;
        return <span>{r.currency || '$'}{r.price === 0 ? 'Free' : r.price.toFixed(2)}</span>;
      },
    },
    {
      key: 'isActive', label: 'Status', render: (r) => (
        <StatusBadge status={r.isActive ? 'active' : 'inactive'} label={r.isActive ? 'Active' : 'Disabled'} />
      ),
    },
    {
      key: 'actions', label: 'Actions', render: (r) => (
        <div className="flex gap-2">
          <button onClick={() => setEditTarget(r)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Edit</button>
          {r.isActive ? (
            <button onClick={() => setDeleteTarget(r)} className="text-xs text-red-400 hover:text-red-300 transition-colors">Disable</button>
          ) : (
            <button onClick={() => handleEnable(r.planId, r.name)} className="text-xs text-green-400 hover:text-green-300 transition-colors">Enable</button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Plan Management</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-xs rounded bg-netflix-red text-white hover:bg-red-700 transition-colors"
        >
          + Create Plan
        </button>
      </div>

      <DataTable
        columns={columns}
        data={plans}
        keyField="planId"
        loading={loading}
        emptyMessage="No plans found. Create one above."
      />

      {/* Create Dialog */}
      {showCreate && (
        <PlanForm
          onSave={() => { setShowCreate(false); fetchPlans(); }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Edit Dialog */}
      {editTarget && (
        <PlanForm
          plan={editTarget}
          onSave={() => { setEditTarget(null); fetchPlans(); }}
          onCancel={() => setEditTarget(null)}
        />
      )}

      {/* Disable Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Disable Plan"
        message={`Disable plan '${deleteTarget?.name}'? Existing subscriptions with this plan will keep working.`}
        confirmLabel="Disable Plan"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
}
