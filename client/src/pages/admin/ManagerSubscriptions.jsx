import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import SubscriptionBadge from '../../components/admin/SubscriptionBadge';
import ExpiryCountdown from '../../components/admin/ExpiryCountdown';
import SubscriptionCard from '../../components/admin/SubscriptionCard';
import SubscriptionHistoryTable from '../../components/admin/SubscriptionHistoryTable';
import RenewalDialog from '../../components/admin/RenewalDialog';
import AssignDialog from '../../components/admin/AssignDialog';
import QuotaCard from '../../components/admin/QuotaCard';
import StatCard from '../../components/admin/StatCard';

export default function ManagerSubscriptions() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  // Detail
  const [selectedUser, setSelectedUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(false);

  // Dialogs
  const [renewTarget, setRenewTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);

  // Action loading (prevent double-clicks on Suspend/Resume)
  const [actionLoading, setActionLoading] = useState(null);

  // Quota info
  const [quota, setQuota] = useState(null);

  const [activeTab, setActiveTab] = useState('all');

  const retryCountRef = useRef(0);

  const fetchData = useCallback(async () => {
    const userId = currentUser?.id || currentUser?._id;
    if (!userId) {
      // Auth not ready yet — retry with backoff, max 3 attempts
      retryCountRef.current += 1;
      if (retryCountRef.current <= 3) {
        setTimeout(() => fetchData(), 500 * retryCountRef.current);
      } else {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    try {
      const [userData, quotaData] = await Promise.all([
        adminApi.getUsers().catch(() => ({ users: [] })),
        adminApi.getManagerQuota(userId).catch(() => null),
      ]);
      const myUsers = userData.users || [];
      setUsers(myUsers);
      setQuota(quotaData);

      // Compute manager-level stats
      const total = myUsers.length;
      const withSub = myUsers.filter(u => u.subscription?.status).length;
      const expired = myUsers.filter(u => {
        const sub = u.subscription;
        return sub?.status && sub?.expiryDate && new Date(sub.expiryDate) <= new Date();
      }).length;
      setStats({ total, withSub, expired, active: withSub - expired });
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id, currentUser?._id]);

  useEffect(() => {
    // Safety timeout: ensure loading resolves even if API fails silently
    const safetyTimer = setTimeout(() => setLoading(false), 8000);
    fetchData();
    return () => clearTimeout(safetyTimer);
  }, [fetchData]);

  const loadSubscription = async (u) => {
    setSelectedUser(u);
    setSubLoading(true);
    try {
      const data = await adminApi.getSubscription(u._id);
      setSubscription(data);
    } catch {
      setSubscription(null);
    } finally {
      setSubLoading(false);
    }
  };

  const handleAction = async (action, userId) => {
    const key = `${action}-${userId}`;
    if (actionLoading === key) return; // Already processing this action
    setActionLoading(key);
    try {
      if (action === 'suspend') await adminApi.suspendSubscription(userId, { reason: 'suspension' });
      else if (action === 'resume') await adminApi.resumeSubscription(userId, { reason: 'resumed' });
      toast.success(`Subscription ${action}d`);
      fetchData();
      if (selectedUser?._id === userId) loadSubscription(selectedUser);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action}`);
    } finally {
      setActionLoading(null);
    }
  };

  const getFilteredUsers = () => {
    let list = [...users];
    switch (activeTab) {
      case 'has-sub': return list.filter(u => u.subscription?.status);
      case 'no-sub': return list.filter(u => !u.subscription?.status);
      case 'expired': return list.filter(u => {
        const sub = u.subscription;
        return sub?.status && sub?.expiryDate && new Date(sub.expiryDate) <= new Date();
      });
      case 'expiring': return list.filter(u => {
        const sub = u.subscription;
        if (!sub?.expiryDate) return false;
        const daysLeft = (new Date(sub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
        return daysLeft > 0 && daysLeft <= 7;
      });
      default: return list;
    }
  };

  const userColumns = [
    { key: 'username', label: 'User', sortable: true, render: (r) => (
      <button onClick={() => loadSubscription(r)} className="text-white font-medium hover:text-blue-400 transition-colors">{r.username}</button>
    )},
    { key: 'subscription', label: 'Sub', render: (r) => <SubscriptionBadge status={r.subscription?.status || r.subscription?.displayStatus} /> },
    { key: 'expiry', label: 'Expiry', render: (r) => {
      if (!r.subscription?.status && !r.subscription?.expiryDate) {
        return <span className="text-netflix-text-3 text-xs">—</span>;
      }
      return <ExpiryCountdown daysRemaining={r.subscription?.daysRemaining} expiryDate={r.subscription?.expiryDate} status={r.subscription?.status} />;
    } },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex gap-1.5 flex-wrap">
        {r.subscription?.status ? (
          <>
            <button onClick={() => setRenewTarget(r)} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">Renew</button>
            {r.subscription.status === 'suspended' ? (
              <button onClick={() => handleAction('resume', r._id)} disabled={actionLoading === `resume-${r._id}`} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Resume</button>
            ) : (
              <button onClick={() => handleAction('suspend', r._id)} disabled={actionLoading === `suspend-${r._id}`} className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Suspend</button>
            )}
          </>
        ) : (
          <button onClick={() => setAssignTarget(r)} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Assign</button>
        )}
      </div>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">My Members</h2>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'all' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>All</button>
          <button onClick={() => setActiveTab('has-sub')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'has-sub' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>With Sub</button>
          <button onClick={() => setActiveTab('no-sub')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'no-sub' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>No Sub</button>
          <button onClick={() => setActiveTab('expiring')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'expiring' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>Expiring</button>
        </div>
      </div>

      {/* Quota + Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {quota && <QuotaCard label="Members Created" current={quota.currentCounts?.totalMembers || 0} limit={quota.quotaUsage?.maxMembers || 999} icon="👥" />}
        {stats && (
          <>
            <StatCard label="Total Members" value={stats.total} icon="👥" color="blue" />
            <StatCard label="Active" value={stats.active} icon="✅" color="green" />
            <StatCard label="Expired" value={stats.expired} icon="❌" color="red" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className={`${selectedUser ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
          <DataTable
            columns={userColumns}
            data={getFilteredUsers()}
            keyField="_id"
            loading={loading}
            emptyMessage={loading ? '' : 'No members created yet.'}
          />
        </div>

        {/* Detail panel */}
        {selectedUser && (
          <div className="xl:col-span-1 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedUser.username}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-netflix-text-3 hover:text-white text-xs">✕</button>
            </div>

            {subLoading ? (
              <div className="h-24 rounded shimmer" />
            ) : (
              <>
                <SubscriptionCard subscription={subscription} user={selectedUser} />
                {subscription?.exists && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => setRenewTarget(selectedUser)} className="px-3 py-1.5 text-xs rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">Renew</button>
                      {subscription.status === 'suspended' ? (
                      <button onClick={() => handleAction('resume', selectedUser._id)} disabled={actionLoading === `resume-${selectedUser._id}`} className="px-3 py-1.5 text-xs rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Resume</button>
                    ) : (
                      <button onClick={() => handleAction('suspend', selectedUser._id)} disabled={actionLoading === `suspend-${selectedUser._id}`} className="px-3 py-1.5 text-xs rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">Suspend</button>
                    )}
                    </div>
                    <SubscriptionHistoryTable userId={selectedUser._id} />
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <RenewalDialog
        open={!!renewTarget}
        userId={renewTarget?._id}
        currentExpiry={renewTarget?.subscription?.expiryDate}
        onClose={() => setRenewTarget(null)}
        onSuccess={fetchData}
      />
      <AssignDialog
        open={!!assignTarget}
        userId={assignTarget?._id}
        username={assignTarget?.username}
        onClose={() => setAssignTarget(null)}
        onSuccess={fetchData}
      />
    </div>
  );
}
