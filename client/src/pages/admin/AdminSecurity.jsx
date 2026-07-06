import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

export default function AdminSecurity() {
  const [blockedIPs, setBlockedIPs] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Block IP form
  const [showBlockForm, setShowBlockForm] = useState(false);
  const [blockData, setBlockData] = useState({ ip: '', reason: 'manual' });
  const [blocking, setBlocking] = useState(false);

  // Unblock confirmation
  const [unblockTarget, setUnblockTarget] = useState(null);
  const [unblocking, setUnblocking] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [ipData, sessionData] = await Promise.all([
        adminApi.getBlockedIPs().catch(() => []),
        adminApi.getSessions().catch(() => []),
      ]);
      setBlockedIPs(Array.isArray(ipData) ? ipData : []);
      setSessions(Array.isArray(sessionData) ? sessionData : []);
    } catch {
      toast.error('Failed to load security data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleBlockIP = async () => {
    if (!blockData.ip) { toast.error('IP address is required'); return; }
    setBlocking(true);
    try {
      await adminApi.blockIP(blockData);
      toast.success(`IP ${blockData.ip} blocked`);
      setShowBlockForm(false);
      setBlockData({ ip: '', reason: 'manual' });
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to block IP');
    } finally {
      setBlocking(false);
    }
  };

  const handleUnblock = async () => {
    if (!unblockTarget) return;
    setUnblocking(true);
    try {
      await adminApi.unblockIP(unblockTarget._id);
      toast.success(`IP unblocked`);
      setUnblockTarget(null);
      fetchData();
    } catch (err) {
      toast.error('Failed to unblock IP');
    } finally {
      setUnblocking(false);
    }
  };

  const ipColumns = [
    { key: 'ip', label: 'IP Address', sortable: true, render: (r) => <span className="text-white font-mono text-sm">{r.ip}</span> },
    { key: 'reason', label: 'Reason', render: (r) => <StatusBadge status={r.reason === 'manual' ? 'admin' : 'pending'} label={r.reason} /> },
    { key: 'blockedBy', label: 'Blocked By', render: (r) => <span className="text-netflix-text-2">{r.blockedBy || 'system'}</span> },
    { key: 'expiresAt', label: 'Expires', render: (r) => r.expiresAt ? new Date(r.expiresAt).toLocaleDateString() : <span className="text-red-400">Never</span> },
    { key: 'blockedAt', label: 'Blocked At', render: (r) => new Date(r.blockedAt).toLocaleDateString() },
    { key: 'actions', label: 'Actions', render: (r) => <button onClick={() => setUnblockTarget(r)} className="text-xs text-green-400 hover:text-green-300 transition-colors">Unblock</button> },
  ];

  const sessionColumns = [
    { key: 'username', label: 'User', sortable: true, render: (r) => <span className="text-white text-sm">{r.username || r.userId}</span> },
    { key: 'ip', label: 'IP', render: (r) => <span className="font-mono text-xs text-netflix-text-2">{r.ip || '—'}</span> },
    { key: 'createdAt', label: 'Created', render: (r) => new Date(r.createdAt).toLocaleString() },
  ];

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">Security</h2>

      {/* Blocked IPs */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-white">Blocked IP Addresses</h3>
          <button
            onClick={() => setShowBlockForm(!showBlockForm)}
            className="px-3 py-1 text-xs rounded bg-netflix-red text-white hover:bg-red-700 transition-colors"
          >
            {showBlockForm ? 'Cancel' : '+ Block IP'}
          </button>
        </div>

        {showBlockForm && (
          <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 mb-4">
            <div className="flex gap-3">
              <input
                placeholder="IP address (e.g. 192.168.1.1)"
                value={blockData.ip}
                onChange={(e) => setBlockData(d => ({ ...d, ip: e.target.value }))}
                className="flex-1 bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
              />
              <select
                value={blockData.reason}
                onChange={(e) => setBlockData(d => ({ ...d, reason: e.target.value }))}
                className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-netflix-red/50"
              >
                <option value="manual">Manual</option>
                <option value="abuse">Abuse</option>
                <option value="bruteforce">Brute Force</option>
                <option value="scraping">Scraping</option>
              </select>
              <button
                onClick={handleBlockIP}
                disabled={blocking}
                className="px-4 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {blocking ? 'Blocking...' : 'Block'}
              </button>
            </div>
          </div>
        )}

        <DataTable
          columns={ipColumns}
          data={blockedIPs}
          keyField="_id"
          loading={loading}
          emptyMessage="No blocked IPs."
        />
      </div>

      {/* Active Sessions */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Active Sessions</h3>
        <DataTable
          columns={sessionColumns}
          data={sessions}
          keyField="_id"
          loading={loading}
          emptyMessage="No active sessions."
        />
      </div>

      <ConfirmDialog
        open={!!unblockTarget}
        title="Unblock IP"
        message={`Unblock IP ${unblockTarget?.ip}?`}
        confirmLabel="Unblock"
        onConfirm={handleUnblock}
        onCancel={() => setUnblockTarget(null)}
        loading={unblocking}
      />
    </div>
  );
}
