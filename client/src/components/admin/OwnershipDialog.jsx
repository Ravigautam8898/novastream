import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';

export default function OwnershipDialog({ open, mode = 'single', selectedIds, onClose, onSuccess }) {
  const [managers, setManagers] = useState([]);
  const [targetManagerId, setTargetManagerId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setTargetManagerId('');
      setLoading(true);
      adminApi.getUsers()
        .then((data) => {
          const users = data.users || [];
          setManagers(users.filter(u => u.role === 'manager' || u.role === 'super_admin'));
        })
        .catch(() => toast.error('Failed to load managers'))
        .finally(() => setLoading(false));
    }
  }, [open]);

  if (!open) return null;

  const getTitle = () => {
    switch (mode) {
      case 'batch': return 'Batch Transfer Ownership';
      case 'all': return 'Transfer All Members';
      default: return 'Transfer Ownership';
    }
  };

  const getDescription = () => {
    const count = mode === 'all' ? 'all members' : `${selectedIds?.length || 1} user(s)`;
    return `Transfer ${count} to another manager:`;
  };

  const handleTransfer = async () => {
    if (!targetManagerId) { toast.error('Select a target manager'); return; }
    setSaving(true);
    try {
      if (mode === 'all') {
        await adminApi.transferAllOwnership({ fromManagerId: selectedIds?.[0], toManagerId: targetManagerId });
      } else if (mode === 'batch') {
        await adminApi.transferOwnershipBatch({ userIds: selectedIds, toManagerId: targetManagerId });
      } else {
        await adminApi.transferOwnership({ userId: selectedIds?.[0], toManagerId: targetManagerId });
      }
      toast.success('Ownership transferred');
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Transfer failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative bg-netflix-dark-2 rounded-xl border border-netflix-border/20 w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-1">{getTitle()}</h3>
        <p className="text-xs text-netflix-text-3 mb-4">{getDescription()}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-netflix-text-3 mb-1.5">Target Manager *</label>
            {loading ? (
              <div className="h-10 rounded bg-netflix-dark-3 shimmer" />
            ) : (
              <select
                value={targetManagerId}
                onChange={(e) => setTargetManagerId(e.target.value)}
                className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-netflix-red/50"
              >
                <option value="">Select a manager...</option>
                {managers.map((m) => (
                  <option key={m._id} value={m._id}>
                    {m.username} ({m.role})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded border border-netflix-border/30 text-netflix-text-2 hover:text-white hover:border-netflix-border/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleTransfer}
            disabled={saving || !targetManagerId}
            className="flex-1 px-4 py-2 text-sm rounded bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Transferring...' : 'Transfer'}
          </button>
        </div>
      </div>
    </div>
  );
}
