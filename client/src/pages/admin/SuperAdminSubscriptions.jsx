import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import { useAuth } from '../../context/AuthContext';
import StatCard from '../../components/admin/StatCard';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import SubscriptionBadge from '../../components/admin/SubscriptionBadge';
import ExpiryCountdown from '../../components/admin/ExpiryCountdown';
import SubscriptionHistoryTable from '../../components/admin/SubscriptionHistoryTable';
import RenewalDialog from '../../components/admin/RenewalDialog';
import AssignDialog from '../../components/admin/AssignDialog';
import OwnershipDialog from '../../components/admin/OwnershipDialog';
import QuotaCard from '../../components/admin/QuotaCard';
import OwnershipLabel from '../../components/admin/OwnershipLabel';

export default function SuperAdminSubscriptions() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [expiring, setExpiring] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected user detail
  const [selectedUser, setSelectedUser] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(false);

  // Dialogs & loading states
  const [renewTarget, setRenewTarget] = useState(null);
  const [assignTarget, setAssignTarget] = useState(null);
  const [ownershipTarget, setOwnershipTarget] = useState(null);
  const [actionLoading, setActionLoading] = useState(null); // tracks which action/user is loading

  const [activeTab, setActiveTab] = useState('all');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [userData, statsData, expiringData] = await Promise.all([
        adminApi.getUsers().catch(() => ({ users: [] })),
        adminApi.getSubscriptionStats().catch(() => null),
        adminApi.getExpiringSubscriptions({ days: 7 }).catch(() => ({ subscriptions: [] })),
      ]);
      setUsers(userData.users || []);
      setStats(statsData);
      setExpiring(Array.isArray(expiringData)
        ? expiringData
        : (expiringData.subscriptions || []));
    } catch {
      toast.error('Failed to load subscription data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

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

  const handleCancelUpgrade = async (userId) => {
    if (actionLoading === 'cancel-' + userId) return;
    setActionLoading('cancel-' + userId);
    try {
      await adminApi.cancelUpgradeSubscription(userId, { reason: 'Upgrade cancelled by admin' });
      toast.success('Pending upgrade cancelled');
      fetchData();
      if (selectedUser?._id === userId) loadSubscription(selectedUser);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel upgrade');
    } finally {
      setActionLoading(null);
    }
  };

  const handleAction = async (action, userId) => {
    try {
      if (action === 'activate') await adminApi.activateSubscription(userId, { reason: 'manual activation' });
      else if (action === 'deactivate') await adminApi.deactivateSubscription(userId, { reason: 'manual deactivation' });
      else if (action === 'suspend') await adminApi.suspendSubscription(userId, { reason: 'suspension' });
      else if (action === 'resume') await adminApi.resumeSubscription(userId, { reason: 'resumed' });
      else if (action === 'expire') {
        await adminApi.expireSubscription(userId, { reason: 'manual expiration' });
      } else {
        console.warn('Unhandled action:', action);
        return;
      }
      toast.success(`Subscription ${action}d`);
      fetchData();
      if (selectedUser?._id === userId) loadSubscription(selectedUser);
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to ${action}`);
    }
  };

  const getFilteredUsers = () => {
    let list = [...users];
    switch (activeTab) {
      case 'has-sub':
        return list.filter(u => u.subscription?.status);
      case 'no-sub':
        return list.filter(u => !u.subscription?.status);
      case 'expired':
        return list.filter(u => {
          const sub = u.subscription;
          return sub?.status && sub?.expiryDate && new Date(sub.expiryDate) <= new Date();
        });
      case 'expiring':
        return list.filter(u => {
          const sub = u.subscription;
          if (!sub?.expiryDate) return false;
          const daysLeft = (new Date(sub.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
          return daysLeft > 0 && daysLeft <= 7;
        });
      default:
        return list;
    }
  };

  const userColumns = [
    { key: 'username', label: 'User', sortable: true, render: (r) => (
      <button onClick={() => loadSubscription(r)} className="text-white font-medium hover:text-netflix-red transition-colors">{r.username}</button>
    )},
    { key: 'role', label: 'Role', render: (r) => <StatusBadge status={r.role} /> },
    { key: 'subscription', label: 'Subscription', render: (r) => {
      if (r.role === 'super_admin' || r.role === 'manager') {
        return <span className="text-[10px] text-netflix-text-3 italic">Not Required</span>;
      }
      return <SubscriptionBadge status={r.subscription?.status || r.subscription?.displayStatus} />;
    }},
    { key: 'expiry', label: 'Expiry', render: (r) => {
      if (r.role === 'super_admin' || r.role === 'manager') {
        return <span className="text-xs text-netflix-text-3 italic">Admin Access</span>;
      }
      if (!r.subscription?.status && !r.subscription?.expiryDate) {
        return <span className="text-netflix-text-3 text-xs">—</span>;
      }
      return <ExpiryCountdown daysRemaining={r.subscription?.daysRemaining} expiryDate={r.subscription?.expiryDate} status={r.subscription?.status} />;
    }},
    { key: 'createdBy', label: 'Owner', render: (r) => <OwnershipLabel user={r} /> },
    { key: 'actions', label: 'Actions', render: (r) => {
      if (r.role === 'super_admin' || r.role === 'manager') {
        return <span className="text-[10px] text-netflix-text-3">—</span>;
      }
      return (
        <div className="flex gap-1.5 flex-wrap">
          {r.subscription?.status ? (
            <>
              <button onClick={() => setRenewTarget(r)} className="text-[10px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">Renew</button>
              {r.subscription.status === 'suspended' ? (
                <button onClick={() => handleAction('resume', r._id)} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Resume</button>
              ) : (
                <button onClick={() => handleAction('suspend', r._id)} className="text-[10px] px-2 py-0.5 rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">Suspend</button>
              )}
            </>
          ) : (
            <button onClick={() => setAssignTarget(r)} className="text-[10px] px-2 py-0.5 rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Assign</button>
          )}
        </div>
      );
    }},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Subscription Management</h2>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('all')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'all' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>All</button>
          <button onClick={() => setActiveTab('has-sub')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'has-sub' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>With Sub</button>
          <button onClick={() => setActiveTab('no-sub')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'no-sub' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>No Sub</button>
          <button onClick={() => setActiveTab('expiring')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'expiring' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>Expiring</button>
          <button onClick={() => setActiveTab('expired')} className={`px-3 py-1.5 text-xs rounded transition-colors ${activeTab === 'expired' ? 'bg-netflix-red text-white' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}>Expired</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Active Subs" value={stats.active ?? 0} icon="✅" color="green" />
          <StatCard label="Expiring (7d)" value={stats.expiring ?? 0} icon="⏰" color="yellow" />
          <StatCard label="Expired" value={stats.expired ?? 0} icon="❌" color="red" />
        </div>
      )}

      {/* Expiring alert */}
      {expiring.length > 0 && (
        <div className="bg-orange-500/5 border border-orange-500/20 rounded-lg px-4 py-3 mb-6">
          <p className="text-sm text-orange-400">
            ⚠ {expiring.length} subscription{expiring.length > 1 ? 's' : ''} expiring within 7 days
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Users table */}
        <div className={`${selectedUser ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
          <DataTable
            columns={userColumns}
            data={getFilteredUsers()}
            keyField="_id"
            loading={loading}
            emptyMessage="No users match this filter."
          />
        </div>

        {/* Subscriber detail panel */}
        {selectedUser && (
          <div className="xl:col-span-1 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-white">{selectedUser.username}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-netflix-text-3 hover:text-white text-xs">✕</button>
            </div>

            {subLoading ? (
              <div className="space-y-3">
                <div className="h-24 rounded shimmer" />
                <div className="h-12 rounded shimmer" />
              </div>
            ) : subscription?.exists ? (
              <>
                <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-netflix-text-3">Status</span>
                    <SubscriptionBadge status={subscription.displayStatus || subscription.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-netflix-text-3">Plan</span>
                    <span className="text-sm text-white">{subscription.planLabel || subscription.plan}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-netflix-text-3">Expiry</span>
                    <ExpiryCountdown daysRemaining={subscription.daysRemaining} expiryDate={subscription.expiryDate} status={subscription.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-netflix-text-3">Version</span>
                    <span className="text-xs text-netflix-text-2">{subscription.version || 0}</span>
                  </div>

                  {/* Pending plan upgrade */}
                  {subscription.pendingPlan && (
                    <div className="bg-blue-500/5 border border-blue-500/20 rounded p-3 mt-2">
                      <p className="text-xs text-blue-400 font-medium mb-1">⏳ Pending Upgrade</p>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-netflix-text-3">To:</span>
                        <span className="text-white">{subscription.pendingPlan.planLabel}</span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-netflix-text-3">Activates:</span>
                        <span className="text-netflix-text-2">
                          {subscription.pendingPlan.startDate
                            ? new Date(subscription.pendingPlan.startDate).toLocaleDateString()
                            : 'When current expires'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => setAssignTarget(selectedUser)} className="px-3 py-1.5 text-xs rounded bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors">
                    {subscription.pendingPlan ? 'Change Upgrade' : 'Upgrade'}
                  </button>
                  <button onClick={() => setRenewTarget(selectedUser)} className="px-3 py-1.5 text-xs rounded bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-colors">Renew</button>
                  <button onClick={() => setRenewTarget(selectedUser)} className="px-3 py-1.5 text-xs rounded bg-teal-500/10 text-teal-400 hover:bg-teal-500/20 transition-colors">Extend</button>
                  {subscription.status === 'suspended' ? (
                    <button onClick={() => handleAction('resume', selectedUser._id)} className="px-3 py-1.5 text-xs rounded bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors">Resume</button>
                  ) : (
                    <button onClick={() => handleAction('suspend', selectedUser._id)} className="px-3 py-1.5 text-xs rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors">Suspend</button>
                  )}
                  {subscription.status === 'active' && (
                    <button onClick={() => handleAction('deactivate', selectedUser._id)} className="px-3 py-1.5 text-xs rounded bg-gray-500/10 text-gray-400 hover:bg-gray-500/20 transition-colors">Deactivate</button>
                  )}                    {subscription.pendingPlan && (
                    <button
                      onClick={() => handleCancelUpgrade(selectedUser._id)}
                      disabled={actionLoading === 'cancel-' + selectedUser._id}
                      className="px-3 py-1.5 text-xs rounded bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {actionLoading === 'cancel-' + selectedUser._id ? 'Cancelling...' : 'Cancel Upgrade'}
                    </button>
                  )}
                  <button onClick={() => handleAction('expire', selectedUser._id)} className="px-3 py-1.5 text-xs rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors">Expire Now</button>
                </div>

                <SubscriptionHistoryTable userId={selectedUser._id} />
              </>
            ) : (
              <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 text-center">
                {selectedUser.role === 'super_admin' || selectedUser.role === 'manager' ? (
                  <p className="text-sm text-netflix-text-3">Admin access — no subscription required</p>
                ) : (
                  <>
                    <p className="text-sm text-netflix-text-3 mb-3">No subscription</p>
                    <button onClick={() => setAssignTarget(selectedUser)} className="px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 transition-colors">Assign Now</button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dialogs */}
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
        hasExistingPlan={!!assignTarget?.subscription?.status}
        currentPlan={assignTarget?.subscription?.plan}
      />
      <OwnershipDialog
        open={!!ownershipTarget}
        mode="single"
        selectedIds={ownershipTarget ? [ownershipTarget._id] : []}
        onClose={() => setOwnershipTarget(null)}
        onSuccess={fetchData}
      />
    </div>
  );
}
