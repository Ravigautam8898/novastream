import { useState, useEffect } from 'react';
import adminApi from '../../api/admin.api';

export default function PlanSelector({ value, onChange, showAll = false, includeCustom = false, className = '' }) {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    setLoading(true);
    adminApi.getPlans(showAll)
      .then((data) => {
        let list = data.plans || [];
        if (!includeCustom) {
          list = list.filter(p => p.planId !== 'custom' && p.id !== 'custom');
        }
        setPlans(list);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [showAll, includeCustom]);

  const selectedPlan = plans.find(p => (p.planId || p.id) === value);

  const getExpiryPreview = () => {
    if (!selectedPlan) return null;
    if (!selectedPlan.durationDays) return 'Never expires';

    const days = selectedPlan.durationDays;
    if (!days || days <= 0) return null;

    const base = startDate ? new Date(startDate) : new Date();
    const expiry = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
    return expiry.toLocaleDateString();
  };

  if (loading) {
    return (
      <select disabled className={`input-field ${className}`}>
        <option>Loading plans...</option>
      </select>
    );
  }

  return (
    <div className="space-y-2">
      <select
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        className={`input-field ${className}`}
      >
        <option value="" disabled>Select a plan...</option>
        {plans.map((plan) => {
          const pid = plan.planId || plan.id;
          return (
            <option key={pid} value={pid}>
              {plan.name || plan.label} — {plan.isTrial ? `${plan.durationDays} days free` : plan.durationDays ? `${plan.durationDays} days` : 'Never expires'}
            </option>
          );
        })}
      </select>

      {value && (
        <div className="flex items-center gap-2 text-xs text-netflix-text-3">
          <label className="whitespace-nowrap">Start:</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-2 py-1 text-white text-xs focus:outline-none focus:border-netflix-red/50"
          />
          {getExpiryPreview() && (
            <span className="text-blue-400">
              Expiry: <strong>{getExpiryPreview()}</strong>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
