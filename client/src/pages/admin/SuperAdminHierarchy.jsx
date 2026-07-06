import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import StatCard from '../../components/admin/StatCard';
import StatusBadge from '../../components/admin/StatusBadge';
import SubscriptionBadge from '../../components/admin/SubscriptionBadge';

export default function SuperAdminHierarchy() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedManagers, setExpandedManagers] = useState({});

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers();
      setUsers(data.users || []);
    } catch {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Two-pass grouping: first extract all managers, then assign members
  const managers = {};
  const systemMembers = [];

  // Pass 1: Extract all managers
  for (const u of users) {
    if (u.role === 'super_admin' || u.role === 'admin') continue;
    if (u.role === 'manager') {
      managers[u._id] = {
        _id: u._id,
        username: u.username,
        displayName: u.displayName,
        isActive: u.isActive,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
        members: [],
      };
    }
  }

  // Pass 2: Assign members to their managers
  for (const u of users) {
    if (u.role !== 'member') continue;
    const ownerId = u.createdBy?._id || u.createdBy;
    if (ownerId && managers[ownerId]) {
      managers[ownerId].members.push(u);
    } else {
      systemMembers.push(u);
    }
  }

  // Sort managers by creation date (newest first), then by username
  const sortedManagers = Object.values(managers).sort((a, b) => {
    if (a.createdAt && b.createdAt) {
      return new Date(b.createdAt) - new Date(a.createdAt);
    }
    return (a.username || '').localeCompare(b.username || '');
  });

  // Compute stats
  const managerCount = sortedManagers.length;
  const totalMemberCount = sortedManagers.reduce((sum, m) => sum + m.members.length, 0) + systemMembers.length;
  const withSubCount = sortedManagers.reduce((sum, m) => sum + m.members.filter(u => u.subscription?.status).length, 0)
    + systemMembers.filter(u => u.subscription?.status).length;
  const activeCount = sortedManagers.reduce((sum, m) => {
    return sum + m.members.filter(u =>
      u.subscription?.status === 'active' &&
      (!u.subscription?.expiryDate || new Date(u.subscription.expiryDate) > new Date())
    ).length;
  }, 0) + systemMembers.filter(u =>
    u.subscription?.status === 'active' &&
    (!u.subscription?.expiryDate || new Date(u.subscription.expiryDate) > new Date())
  ).length;

  const toggleManager = (id) => {
    setExpandedManagers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded shimmer" />)}
        </div>
        <div className="h-64 rounded shimmer" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">Manager Hierarchy</h2>
          <p className="text-xs text-netflix-text-3 mt-1">
            Collapsible view of all managers and their members
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="Managers" value={managerCount} icon="👤" color="blue" />
        <StatCard label="Total Members" value={totalMemberCount} icon="👥" color="purple" />
        <StatCard label="With Subscription" value={withSubCount} icon="💳" color="green" />
        <StatCard label="Active" value={activeCount} icon="✅" color="green" />
      </div>

      {/* Manager sections */}
      <div className="space-y-3">
        {sortedManagers.map((manager) => {
          const isExpanded = expandedManagers[manager._id];
          const memberCount = manager.members.length;
          const activeMembers = manager.members.filter(u => u.subscription?.status === 'active').length;
          const subbedMembers = manager.members.filter(u => u.subscription?.status).length;
          const expiredMembers = manager.members.filter(u => {
            const sub = u.subscription;
            return sub?.status && sub?.expiryDate && new Date(sub.expiryDate) <= new Date();
          }).length;

          return (
            <div key={manager._id} className="bg-netflix-dark-2 rounded-xl border border-netflix-border/20 overflow-hidden">
              {/* Manager header (clickable) */}
              <button
                onClick={() => toggleManager(manager._id)}
                className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="text-netflix-text-3 text-sm transition-transform duration-200"
                    style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                  >
                    ▶
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium">{manager.displayName || manager.username}</span>
                      <StatusBadge status={manager.isActive ? 'active' : 'inactive'} label={manager.isActive ? 'Active' : 'Inactive'} />
                    </div>
                    <p className="text-[10px] text-netflix-text-3 mt-0.5">
                      @{manager.username}
                      {manager.lastLoginAt && (
                        <> &middot; Last login: {new Date(manager.lastLoginAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-netflix-text-2">{memberCount} members</span>
                  <span className="text-green-400">{activeMembers} active</span>
                  <span className="text-orange-400">{subbedMembers - activeMembers - expiredMembers} suspended</span>
                  <span className="text-red-400">{expiredMembers} expired</span>
                  <span className="text-netflix-text-3">{memberCount - subbedMembers} no sub</span>
                </div>
              </button>

              {/* Members list (collapsible) */}
              {isExpanded && (
                <div className="border-t border-netflix-border/10">
                  {memberCount === 0 ? (
                    <p className="text-netflix-text-3 text-xs text-center py-6">No members assigned to this manager.</p>
                  ) : (
                    <div className="divide-y divide-netflix-border/5">
                      {manager.members.map((member) => (
                        <div key={member._id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-netflix-red/40 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm text-white truncate">{member.displayName || member.username}</p>
                              <p className="text-[10px] text-netflix-text-3 truncate">@{member.username}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {member.subscription?.status ? (
                              <>
                                <SubscriptionBadge status={member.subscription.status} />
                                <span className="text-[10px] text-netflix-text-3">
                                  {member.subscription.plan || ''}
                                  {member.subscription.daysRemaining !== undefined && member.subscription.daysRemaining !== null && (
                                    <> &middot; {member.subscription.daysRemaining > 0 ? member.subscription.daysRemaining + 'd' : 'expired'}</>
                                  )}
                                </span>
                              </>
                            ) : (
                              <span className="text-[10px] text-netflix-text-3">No subscription</span>
                            )}
                            <a
                              href={'/admin/subscriptions/user/' + member._id}
                              className="text-[10px] px-2 py-0.5 rounded bg-netflix-red/10 text-netflix-red hover:bg-netflix-red/20 transition-colors"
                            >
                              Manage
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* System / No-owner members */}
        {systemMembers.length > 0 && (
          <div className="bg-netflix-dark-2 rounded-xl border border-netflix-border/20 overflow-hidden">
            <button
              onClick={() => toggleManager('__system__')}
              className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <span
                  className="text-netflix-text-3 text-sm transition-transform duration-200"
                  style={{ transform: expandedManagers['__system__'] ? 'rotate(90deg)' : 'rotate(0deg)' }}
                >
                  ▶
                </span>
                <div>
                  <span className="text-white font-medium">System / No Owner</span>
                  <p className="text-[10px] text-netflix-text-3 mt-0.5">Users created directly by Super Admin or with no owner</p>
                </div>
              </div>
              <span className="text-netflix-text-2 text-xs">{systemMembers.length} members</span>
            </button>

            {expandedManagers['__system__'] && (
              <div className="border-t border-netflix-border/10 divide-y divide-netflix-border/5">
                {systemMembers.map((member) => (
                  <div key={member._id} className="flex items-center justify-between px-4 py-2.5 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1.5 h-1.5 rounded-full bg-netflix-red/40 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{member.displayName || member.username}</p>
                        <p className="text-[10px] text-netflix-text-3 truncate">@{member.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {member.subscription?.status ? (
                        <>
                          <SubscriptionBadge status={member.subscription.status} />
                          <span className="text-[10px] text-netflix-text-3">
                            {member.subscription.plan || ''}
                            {member.subscription.daysRemaining !== undefined && member.subscription.daysRemaining !== null && (
                              <> &middot; {member.subscription.daysRemaining > 0 ? member.subscription.daysRemaining + 'd' : 'expired'}</>
                            )}
                          </span>
                        </>
                      ) : (
                        <span className="text-[10px] text-netflix-text-3">No subscription</span>
                      )}
                      <a
                        href={'/admin/subscriptions/user/' + member._id}
                        className="text-[10px] px-2 py-0.5 rounded bg-netflix-red/10 text-netflix-red hover:bg-netflix-red/20 transition-colors"
                      >
                        Manage
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
