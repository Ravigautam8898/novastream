import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import PlanSelector from './PlanSelector';

export default function AssignDialog({ open, userId, username, onClose, onSuccess, hasExistingPlan, currentPlan }) {
  const [plan, setPlan] = useState('');
  const [customDays, setCustomDays] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const isUpgrade = hasExistingPlan;

  useEffect(() => {
    if (open) {
      setPlan('');
      setCustomDays('');
      setNotes('');
    }
  }, [open]);

  if (!open) return null;

  const handleAssign = async () => {
    if (!plan) { toast.error('Select a plan'); return; }
    if (plan === 'custom' && (!customDays || parseInt(customDays) < 1)) {
      toast.error('Enter valid custom duration'); return;
    }

    setSaving(true);
    try {
      const body = { plan, notes: notes || undefined };
      if (plan === 'custom') body.customDurationDays = parseInt(customDays);

      if (isUpgrade) {
        body.reason = 'Plan upgrade';
        await adminApi.upgradeSubscription(userId, body);
        toast.success(`Upgrade to ${plan} queued — activates when current plan expires`);
      } else {
        body.userId = userId;
        await adminApi.createSubscription(body);
        toast.success(`Subscription assigned to ${username}`);
      }
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="fixed inset-0 bg-black/60" />
      <div className="relative bg-netflix-dark-2 rounded-xl border border-netflix-border/20 w-full max-w-md p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-white mb-1">
          {isUpgrade ? 'Upgrade Plan' : 'Assign Subscription'}
        </h3>
        <p className="text-xs text-netflix-text-3 mb-4">
          User: <span className="text-netflix-text-2">{username}</span>
          {isUpgrade && currentPlan && (
            <span className="ml-2 text-netflix-red">
              (current: {currentPlan})
            </span>
          )}
        </p>
        {isUpgrade && (
          <div className="bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2 mb-4">
            <p className="text-xs text-blue-400">
              ⏳ New plan will auto-activate when your current plan expires. No service interruption.
            </p>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-netflix-text-3 mb-1.5">Plan *</label>
            <PlanSelector value={plan} onChange={setPlan} includeCustom />
          </div>

          {plan === 'custom' && (
            <div>
              <label className="block text-xs text-netflix-text-3 mb-1.5">Custom Duration (days) *</label>
              <input
                type="number"
                min="1"
                max="3650"
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                placeholder="e.g. 90"
                className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-netflix-text-3 mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes..."
              rows={2}
              className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50 resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded border border-netflix-border/30 text-netflix-text-2 hover:text-white hover:border-netflix-border/50 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Saving...' : isUpgrade ? 'Queue Upgrade' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  );
}
