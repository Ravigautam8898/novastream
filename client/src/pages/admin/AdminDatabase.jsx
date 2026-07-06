import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import StatCard from '../../components/admin/StatCard';
import StatusBadge from '../../components/admin/StatusBadge';

export default function AdminDatabase() {
  const [dbStats, setDbStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getDatabaseStats();
      setDbStats(data);
    } catch (err) {
      toast.error('Failed to load database stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-6">Database</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-netflix-dark-2 rounded-lg p-4 border border-netflix-border/20">
              <div className="h-3 w-16 rounded shimmer mb-3" />
              <div className="h-7 w-20 rounded shimmer mb-1" />
              <div className="h-3 w-24 rounded shimmer" />
            </div>
          ))}
        </div>
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 rounded shimmer" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!dbStats || dbStats.status === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-netflix-text-2 mb-2">Failed to connect to database.</p>
        <p className="text-red-400 text-sm">{dbStats?.message || 'Unknown error'}</p>
      </div>
    );
  }

  const collections = dbStats.collections || [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Database</h2>
        <StatusBadge status={dbStats.status === 'connected' ? 'online' : 'offline'} label={dbStats.status === 'connected' ? 'Connected' : 'Disconnected'} />
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Collections"
          value={collections.length}
          icon="📦"
          color="blue"
        />
        <StatCard
          label="Total Documents"
          value={collections.reduce((sum, c) => sum + (c.count || 0), 0).toLocaleString()}
          icon="📄"
          color="netflix-red"
        />
        <StatCard
          label="Data Size"
          value={dbStats.dataSize ? formatBytes(dbStats.dataSize) : '—'}
          icon="💾"
          color="purple"
        />
        <StatCard
          label="Storage Size"
          value={dbStats.storageSize ? formatBytes(dbStats.storageSize) : '—'}
          icon="💿"
          color="green"
        />
      </div>

      {/* Version Info */}
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 mb-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-netflix-text-3">MongoDB Version:</span>
          <span className="text-white font-mono">{dbStats.version || '—'}</span>
          {dbStats.indexes != null && (
            <>
              <span className="text-netflix-text-3 ml-4">Total Indexes:</span>
              <span className="text-white">{dbStats.indexes}</span>
            </>
          )}
        </div>
      </div>

      {/* Collections Table */}
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 overflow-hidden">
        <div className="px-4 py-3 border-b border-netflix-border/20">
          <h3 className="text-sm font-semibold text-white">Collections</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-netflix-border/20">
                <th className="px-4 py-3 text-left text-xs font-medium text-netflix-text-3 uppercase tracking-wider">Collection</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-netflix-text-3 uppercase tracking-wider">Documents</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-netflix-text-3 uppercase tracking-wider">Size</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-netflix-text-3 uppercase tracking-wider">Avg Size</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-netflix-text-3 uppercase tracking-wider">Indexes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-netflix-border/10">
              {collections.map((col) => (
                <tr key={col.name} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-white font-medium">{col.name}</span>
                  </td>
                  <td className="px-4 py-3 text-right text-netflix-text">{col.count.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-netflix-text">{formatBytes(col.size)}</td>
                  <td className="px-4 py-3 text-right text-netflix-text">
                    {col.avgObjSize ? formatBytes(col.avgObjSize) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-netflix-text">{col.indexes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {collections.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-netflix-text-2 text-sm">No collections found.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0);
  return `${size} ${units[i]}`;
}
