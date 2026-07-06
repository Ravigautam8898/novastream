import { useState, useEffect } from 'react';
import adminApi from '../../api/admin.api';

const ACTION_LABELS = {
  subscription_created: 'Created',
  subscription_renewed: 'Renewed',
  subscription_extended: 'Extended',
  subscription_suspended: 'Suspended',
  subscription_resumed: 'Resumed',
  subscription_activated: 'Activated',
  subscription_deactivated: 'Deactivated',
  subscription_expired: 'Expired',
};

const ACTION_COLORS = {
  subscription_created: 'text-green-400',
  subscription_renewed: 'text-blue-400',
  subscription_extended: 'text-blue-400',
  subscription_suspended: 'text-orange-400',
  subscription_resumed: 'text-green-400',
  subscription_activated: 'text-green-400',
  subscription_deactivated: 'text-gray-400',
  subscription_expired: 'text-red-400',
};

export default function SubscriptionHistoryTable({ userId }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    adminApi.getSubscriptionHistory(userId)
      .then((data) => setHistory(data.history || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 rounded shimmer" />
        ))}
      </div>
    );
  }

  if (!history.length) {
    return <p className="text-netflix-text-3 text-sm text-center py-4">No history yet</p>;
  }

  return (
    <div className="max-h-60 overflow-y-auto space-y-1 pr-1 scrollbar-thin">
      {history.map((entry) => {
        const label = ACTION_LABELS[entry.action] || entry.action;
        const color = ACTION_COLORS[entry.action] || 'text-netflix-text-2';
        const date = new Date(entry.createdAt).toLocaleString();

        return (
          <div key={entry._id} className="flex items-start gap-3 py-2 border-b border-netflix-border/10 last:border-0">
            <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0 bg-netflix-red/60" />
            <div className="flex-1 min-w-0">
              <p className={`text-xs font-medium ${color}`}>{label}</p>
              <p className="text-[10px] text-netflix-text-3 mt-0.5">{date}</p>
              {entry.reason && <p className="text-[10px] text-netflix-text-3 mt-0.5 italic">{entry.reason}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
