import { useState } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';

const QUOTA_FIELDS = [
  { key: 'maxMembers', label: 'Max Members', min: 1, max: 10000 },
  { key: 'maxActiveMembers', label: 'Max Active Members', min: 1, max: 5000 },
  { key: 'maxTrials', label: 'Max Trials', min: 1, max: 1000 },
  { key: 'maxRenewalsPerDay', label: 'Renewals/Day', min: 1, max: 1000 },
  { key: 'maxPasswordResetsPerDay', label: 'Password Resets/Day', min: 1, max: 500 },
  { key: 'maxSubscriptionExtensionsPerDay', label: 'Extensions/Day', min: 1, max: 500 },
];

export default function QuotaEditor({ managerId, onClose }) {
  const [values, setValues] = useState({});
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const filled = {};
    for (const field of QUOTA_FIELDS) {
      if (values[field.key] !== undefined && values[field.key] !== '') {
        filled[field.key] = Number(values[field.key]);
      }
    }
    if (!Object.keys(filled).length) {
      toast.error('Set at least one quota value');
      return;
    }
    setSaving(true);
    try {
      await adminApi.updateManagerQuota(managerId, filled);
      toast.success('Quota limits updated');
      onClose?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update quota');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 space-y-3">
      <h4 className="text-sm font-medium text-white">Override Manager Quotas</h4>
      {QUOTA_FIELDS.map((field) => (
        <div key={field.key}>
          <label className="text-xs text-netflix-text-3 block mb-1">{field.label}</label>
          <input
            type="number"
            min={field.min}
            max={field.max}
            placeholder={`Default: ${field.min}`}
            value={values[field.key] !== undefined ? values[field.key] : ''}
            onChange={(e) => setValues(v => ({ ...v, [field.key]: e.target.value }))}
            className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-1.5 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
          />
        </div>
      ))}
      <div className="flex gap-2 pt-1">
        <button onClick={handleSave} disabled={saving} className="btn-primary text-xs px-3 py-1.5">
          {saving ? 'Saving...' : 'Save Overrides'}
        </button>
        <button onClick={onClose} className="btn-secondary text-xs px-3 py-1.5">
          Cancel
        </button>
      </div>
    </div>
  );
}
