import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import { useAuth } from '../../context/AuthContext';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import SubscriptionBadge from '../../components/admin/SubscriptionBadge';

export default function ManagerMembers() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);

  // Create form
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers();
      // Manager sees only own members (already scoped by backend)
      setUsers(data.users || []);
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      toast.error('Username and password are required');
      return;
    }
    if (newUsername.length < 3) {
      toast.error('Username must be at least 3 characters');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    setCreating(true);
    try {
      await adminApi.createUser({
        username: newUsername,
        password: newPassword,
        role: 'member',
        displayName: newDisplayName || undefined,
      });
      toast.success(`Member '${newUsername}' created`);
      setShowCreate(false);
      setNewUsername('');
      setNewPassword('');
      setNewDisplayName('');
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create member');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (userId, username) => {
    try {
      await adminApi.deleteUser(userId);
      toast.success(`Member '${username}' deleted`);
      fetchMembers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete member');
    }
  };

  const columns = [
    { key: 'username', label: 'Username', sortable: true, render: (r) => (
      <span className="text-white font-medium">{r.username}</span>
    )},
    { key: 'displayName', label: 'Display Name', render: (r) => (
      <span className="text-netflix-text-2">{r.displayName || '—'}</span>
    )},
    { key: 'subscription', label: 'Subscription', render: (r) => (
      r.subscription?.status
        ? <SubscriptionBadge status={r.subscription?.status} />
        : <span className="text-netflix-text-3 text-xs">None</span>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <StatusBadge status={r.isActive ? 'active' : 'inactive'} label={r.isActive ? 'Active' : 'Inactive'} />
    )},
    { key: 'lastLogin', label: 'Last Login', render: (r) => (
      <span className="text-xs text-netflix-text-3">
        {r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : '—'}
      </span>
    )},
    { key: 'actions', label: 'Actions', render: (r) => (
      <button
        onClick={() => {
          if (window.confirm(`Delete member '${r.username}'? This cannot be undone.`)) {
            handleDelete(r._id, r.username);
          }
        }}
        className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
      >
        Delete
      </button>
    )},
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-white">My Members</h2>
          <p className="text-xs text-netflix-text-3 mt-1">
            Manage members you've created. Members can be assigned subscriptions from the Subscriptions tab.
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 transition-colors"
        >
          + Add Member
        </button>
      </div>

      <DataTable
        columns={columns}
        data={users}
        keyField="_id"
        loading={loading}
        emptyMessage="No members created yet. Click '+ Add Member' to get started."
      />

      {/* Create Member Dialog */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setShowCreate(false)}>
          <div className="fixed inset-0 bg-black/60" />
          <div
            className="relative bg-netflix-dark-2 rounded-xl border border-netflix-border/20 w-full max-w-md p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-4">Add New Member</h3>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs text-netflix-text-3 mb-1">Username *</label>
                <input
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                  placeholder="e.g. member_test"
                  className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs text-netflix-text-3 mb-1">Password *</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
                />
              </div>
              <div>
                <label className="block text-xs text-netflix-text-3 mb-1">Display Name</label>
                <input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Optional — defaults to username"
                  className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 px-4 py-2 text-sm rounded border border-netflix-border/30 text-netflix-text-2 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {creating ? 'Creating...' : 'Create Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
