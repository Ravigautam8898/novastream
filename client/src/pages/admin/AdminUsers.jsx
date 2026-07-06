import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);  // Create user form
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'member' });
  const [creating, setCreating] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // Reset password
  const [resetTarget, setResetTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getUsers();
      setUsers(data.users || []);
    } catch (err) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!newUser.username || !newUser.password) {
      toast.error('Username and password are required');
      return;
    }
    if (newUser.password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setCreating(true);
    try {
      await adminApi.createUser(newUser);
      toast.success(`User '${newUser.username}' created`);
      setShowCreate(false);
      setNewUser({ username: '', password: '', role: 'user' });
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await adminApi.deleteUser(deleteTarget._id);
      toast.success(`User '${deleteTarget.username}' deleted`);
      setDeleteTarget(null);
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleReset = async () => {
    if (!resetTarget || !newPassword) return;
    if (newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    setResetting(true);
    try {
      await adminApi.resetUserPassword(resetTarget._id, newPassword);
      toast.success(`Password reset for '${resetTarget.username}'`);
      setResetTarget(null);
      setNewPassword('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setResetting(false);
    }
  };

  const columns = [
    { key: 'username', label: 'Username', sortable: true, render: (r) => <span className="text-white font-medium">{r.username}</span> },
    { key: 'role', label: 'Role', render: (r) => <StatusBadge status={r.role} /> },
    { key: 'isActive', label: 'Status', render: (r) => <StatusBadge status={r.isActive ? 'active' : 'inactive'} /> },
    { key: 'lastLoginAt', label: 'Last Login', sortable: true, render: (r) => r.lastLoginAt ? new Date(r.lastLoginAt).toLocaleDateString() : '—' },
    { key: 'createdAt', label: 'Created', sortable: true, render: (r) => new Date(r.createdAt).toLocaleDateString() },
    {
      key: 'actions', label: 'Actions', render: (r) => (
        <div className="flex gap-2">
          <button
            onClick={() => { setResetTarget(r); setNewPassword(''); }}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Reset PW
          </button>
          <button
            onClick={() => setDeleteTarget(r)}
            className="text-xs text-red-400 hover:text-red-300 transition-colors"
          >
            Delete
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">User Management</h2>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="px-3 py-1.5 text-xs rounded bg-netflix-red text-white hover:bg-red-700 transition-colors"
        >
          {showCreate ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {/* Create User Form */}
      {showCreate && (
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              placeholder="Username"
              value={newUser.username}
              onChange={(e) => setNewUser(u => ({ ...u, username: e.target.value }))}
              className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
            />
            <input
              type="password"
              placeholder="Password (min 6 chars)"
              value={newUser.password}
              onChange={(e) => setNewUser(u => ({ ...u, password: e.target.value }))}
              className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
            />
            <select
              value={newUser.role}
              onChange={(e) => setNewUser(u => ({ ...u, role: e.target.value }))}
              className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-netflix-red/50"
            >
              <option value="member">Member</option>
              <option value="manager">Manager</option>
              <option value="super_admin">Super Admin</option>
            </select>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 text-sm rounded bg-netflix-red text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
            >
              {creating ? 'Creating...' : 'Create User'}
            </button>
          </div>
        </div>
      )}

      <DataTable
        columns={columns}
        data={users}
        keyField="_id"
        loading={loading}
        emptyMessage="No users found. Create one above."
      />

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete User"
        message={`Are you sure you want to delete '${deleteTarget?.username}'? This action cannot be undone.`}
        confirmLabel="Delete User"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />

      {/* Reset Password Dialog */}
      <ConfirmDialog
        open={!!resetTarget}
        title="Reset Password"
        message={
          <div>
            <p className="mb-3 text-netflix-text-2">New password for <strong className="text-white">{resetTarget?.username}</strong>:</p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Enter new password (min 6 chars)"
              className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
              autoFocus
            />
          </div>
        }
        confirmLabel={resetting ? 'Resetting...' : 'Reset Password'}
        variant="primary"
        onConfirm={handleReset}
        onCancel={() => { setResetTarget(null); setNewPassword(''); }}
        loading={resetting}
      />
    </div>
  );
}
