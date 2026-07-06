import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import StatCard from '../../components/admin/StatCard';
import StatusBadge from '../../components/admin/StatusBadge';

export default function AdminProcess() {
  const [process, setProcess] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchProcess = useCallback(async () => {
    try {
      const data = await adminApi.getProcessInfo();
      setProcess(data);
    } catch (err) {
      if (!loading) toast.error('Failed to load process info');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => { fetchProcess(); }, [fetchProcess]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchProcess, 15000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchProcess]);

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-6">Process Manager</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-netflix-dark-2 rounded-lg p-4 border border-netflix-border/20">
              <div className="h-3 w-16 rounded shimmer mb-3" />
              <div className="h-7 w-20 rounded shimmer mb-1" />
              <div className="h-3 w-16 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!process) {
    return (
      <div className="text-center py-12">
        <p className="text-netflix-text-2">Failed to load process information.</p>
      </div>
    );
  }

  const mem = process.memory || {};
  const uptimeFormatted = formatUptime(process.uptime);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">Process Manager</h2>
          <StatusBadge status="online" label="Running" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-netflix-text-3">
            PID: <span className="font-mono text-white">{process.pid || '—'}</span>
          </span>
          <button
            onClick={() => fetchProcess()}
            className="px-2 py-1 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2 py-1 text-xs rounded transition-colors ${
              autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'
            }`}
          >
            {autoRefresh ? '● Auto' : '○ Auto'}
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Process ID"
          value={process.pid || '—'}
          sublabel={process.title || ''}
          icon="⚙️"
          color="blue"
        />
        <StatCard
          label="Uptime"
          value={uptimeFormatted}
          icon="⏱️"
          color="green"
        />
        <StatCard
          label="Memory (RSS)"
          value={mem.rss ? `${(mem.rss / 1024 / 1024).toFixed(0)} MB` : '—'}
          icon="💾"
          color="purple"
        />
        <StatCard
          label="Node.js"
          value={process.nodeVersion || '—'}
          sublabel={`${process.platform || ''} ${process.arch || ''}`}
          icon="🟢"
          color="green"
        />
      </div>

      {/* Memory Details */}
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-netflix-border/20">
          <h3 className="text-sm font-semibold text-white">Memory Usage</h3>
        </div>
        <div className="p-4 space-y-4">
          {/* Memory Bar */}
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span className="text-netflix-text-3">Heap Used</span>
              <span className="text-white">
                {mem.heapUsed ? `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB` : '—'}
                {mem.heapTotal ? ` / ${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB` : ''}
              </span>
            </div>
            <div className="w-full bg-netflix-dark-3 rounded-full h-2.5 overflow-hidden">
              <div
                className="bg-netflix-red h-2.5 rounded-full transition-all duration-500"
                style={{ width: `${mem.heapTotal ? Math.min((mem.heapUsed / mem.heapTotal) * 100, 100) : 0}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-netflix-text-3 mt-1">
              <span>0%</span>
              <span>{mem.heapTotal ? `${((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)}%` : '—'}</span>
              <span>100%</span>
            </div>
          </div>

          {/* Memory Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-netflix-text-3 text-xs">RSS</p>
              <p className="text-white text-sm font-medium">{mem.rss ? `${(mem.rss / 1024 / 1024).toFixed(1)} MB` : '—'}</p>
            </div>
            <div>
              <p className="text-netflix-text-3 text-xs">Heap Total</p>
              <p className="text-white text-sm font-medium">{mem.heapTotal ? `${(mem.heapTotal / 1024 / 1024).toFixed(1)} MB` : '—'}</p>
            </div>
            <div>
              <p className="text-netflix-text-3 text-xs">Heap Used</p>
              <p className="text-white text-sm font-medium">{mem.heapUsed ? `${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB` : '—'}</p>
            </div>
            <div>
              <p className="text-netflix-text-3 text-xs">External</p>
              <p className="text-white text-sm font-medium">{mem.external ? `${(mem.external / 1024 / 1024).toFixed(1)} MB` : '—'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Process Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Environment</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">NODE_ENV</span>
              <span className="text-white">{process.env || 'development'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Platform</span>
              <span className="text-white">{process.platform || '—'} {process.arch || ''}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Working Dir</span>
              <span className="text-white text-xs font-mono truncate max-w-[250px]" title={process.cwd}>
                {process.cwd || '—'}
              </span>
            </div>
          </div>
        </div>

        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Runtime</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Node.js</span>
              <span className="text-white">{process.nodeVersion || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Process Title</span>
              <span className="text-white text-xs truncate max-w-[200px]" title={process.title}>{process.title || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Uptime</span>
              <span className="text-white">{uptimeFormatted}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatUptime(seconds) {
  if (!seconds) return '—';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}
