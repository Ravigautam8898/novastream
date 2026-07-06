import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import SubscriptionCard from '../../components/admin/SubscriptionCard';
import SubscriptionHistoryTable from '../../components/admin/SubscriptionHistoryTable';

export default function SubscriptionUserPage() {
  const { userId } = useParams();
  const [user, setUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([
      adminApi.getSubscription(userId).catch(() => null),
      adminApi.getUsers().then(d => d.users?.find(u => u._id === userId)).catch(() => null),
    ])
      .then(([sub, u]) => {
        setSubscription(sub);
        setUser(u);
      })
      .catch(() => toast.error('Failed to load subscription'))
      .finally(() => setLoading(false));
  }, [userId]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto space-y-4">
        <div className="h-8 w-48 rounded shimmer" />
        <div className="h-48 rounded shimmer" />
        <div className="h-32 rounded shimmer" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-white">{user?.username || 'User'}</h2>
        <p className="text-xs text-netflix-text-3 mt-1">Subscription Details</p>
      </div>

      <div className="space-y-6">
        <SubscriptionCard subscription={subscription} user={user} />

        <div>
          <h3 className="text-sm font-semibold text-white mb-3">History</h3>
          <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
            <SubscriptionHistoryTable userId={userId} />
          </div>
        </div>
      </div>
    </div>
  );
}
