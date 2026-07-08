import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import StatCard from '../../components/admin/StatCard';

function Gauge({ label, percent, color = 'text-netflix-red', bgColor = 'bg-netflix-red', size = 'md' }) {
  const r = size === 'lg' ? 54 : 40;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.min(percent, 100)) / 100;

  return (
    <div className="flex flex-col items-center">
      <svg width={r * 2 + 20} height={r * 2 + 20} className="transform -rotate-90">
        <circle cx={r + 10} cy={r + 10} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
        <circle
          cx={r + 10} cy={r + 10} r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          className={`transition-all duration-700 ${color}`}
        />
      </svg>
      <span className={`text-2xl font-bold mt-1 ${color}`}>{Math.round(percent)}%</span>
      <span className="text-netflix-text-3 text-xs mt-0.5">{label}</span>
    </div>
  );
}

export default function AdminHealth() {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchHealth = useCallback(async () => {
    try {
      const data = await adminApi.getSystemHealth();
      setHealth(data);
    } catch (err) {
      if (!loading) toast.error('Failed to load system health');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  useEffect(() => { fetchHealth(); }, [fetchHealth]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchHealth]);

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-6">System Health</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-netflix-dark-2 rounded-lg p-6 border border-netflix-border/20 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full shimmer mb-3" />
              <div className="h-4 w-16 rounded shimmer mb-1" />
              <div className="h-3 w-20 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!health) {
    return (
      <div className="text-center py-12">
        <p className="text-netflix-text-2">Failed to load system health data.</p>
      </div>
    );
  }

  const processInfo = health.process || {};
  const mem = health.memory || {};
  const cpu = health.cpu || {};
  const disk = health.disk || {};
  const uptimeHours = Math.floor(health.uptime / 3600);
  const uptimeMinutes = Math.floor((health.uptime % 3600) / 60);

  // D-012: Metadata system health
  const metadata = health.metadata || {};
  const providers = metadata.providers || [];
  const scheduler = metadata.scheduler || {};
  const schedulerHealth = scheduler.health || {};

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">System Health</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-netflix-text-3">
            Last updated: {health.timestamp ? new Date(health.timestamp).toLocaleTimeString() : '—'}
          </span>
          <button
            onClick={() => fetchHealth()}
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
            {autoRefresh ? '● Auto (10s)' : '○ Auto'}
          </button>
        </div>
      </div>

      {/* Gauges */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 flex flex-col items-center">
          <Gauge label="CPU Usage" percent={cpu.percent || 0} color="text-netflix-red" bgColor="bg-netflix-red" size="lg" />
          <p className="text-netflix-text-3 text-xs mt-2">{cpu.cores || '—'} cores · {cpu.model?.split(' ')[0] || ''}</p>
        </div>
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 flex flex-col items-center">
          <Gauge label="Memory" percent={mem.percent || 0} color="text-blue-400" bgColor="bg-blue-400" size="lg" />
          <p className="text-netflix-text-3 text-xs mt-2">{mem.humanUsed} / {mem.humanTotal}</p>
        </div>
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 flex flex-col items-center">
          <Gauge label="Heap Used" percent={processInfo.memory ? Math.round((processInfo.memory.heapUsed / processInfo.memory.heapTotal) * 100) : 0} color="text-purple-400" bgColor="bg-purple-400" size="lg" />
          <p className="text-netflix-text-3 text-xs mt-2">
            {processInfo.memory ? `${(processInfo.memory.heapUsed / 1024 / 1024).toFixed(0)} MB` : '—'}
          </p>
        </div>
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 flex flex-col items-center">
          <Gauge label="Uptime" percent={Math.min((health.uptime / (30 * 24 * 3600)) * 100, 100)} color="text-netflix-green" bgColor="bg-netflix-green" size="lg" />
          <p className="text-netflix-text-3 text-xs mt-2">{uptimeHours}h {uptimeMinutes}m</p>
        </div>
      </div>

      {/* ── D-012: Metadata System Section ── */}
      {providers.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span>📡</span>
            <span>Metadata System</span>
            <span className={`text-xs font-normal px-2 py-0.5 rounded-full ${
              schedulerHealth.status === 'healthy' ? 'bg-green-500/20 text-green-400'
                : schedulerHealth.status === 'degraded' ? 'bg-yellow-500/20 text-yellow-400'
                : schedulerHealth.status === 'failing' ? 'bg-red-500/20 text-red-400'
                : 'bg-netflix-dark-3 text-netflix-text-2'
            }`}>
              {schedulerHealth.status || 'starting'}
            </span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            {providers.map((provider) => (
              <div key={provider.id} className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      provider.health === 'healthy' ? 'bg-green-400'
                        : provider.health === 'degraded' ? 'bg-yellow-400'
                        : 'bg-red-400'
                    }`} />
                    <h4 className="text-sm font-semibold text-white">{provider.name}</h4>
                  </div>
                  <span className="text-[10px] text-netflix-text-3 uppercase">{provider.type}</span>
                </div>                  <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-netflix-text-3">ID</span>
                    <span className="text-netflix-text-2 font-mono">{provider.id}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-netflix-text-3">Status</span>
                    <span className={`font-medium capitalize ${
                      provider.health === 'healthy' ? 'text-green-400'
                        : provider.health === 'degraded' ? 'text-yellow-400'
                        : 'text-red-400'
                    }`}>
                      {provider.health}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-netflix-text-3">Enabled</span>
                    <span className={provider.enabled ? 'text-green-400' : 'text-red-400'}>
                      {provider.enabled ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-netflix-text-3">Capabilities</span>
                    <span className="text-netflix-text-2">{(provider.capabilities || []).join(', ') || '—'}</span>
                  </div>
                  {provider.successRate !== null && (
                    <div className="flex justify-between">
                      <span className="text-netflix-text-3">Success Rate</span>
                      <span className="text-netflix-text-2">{(provider.successRate * 100).toFixed(1)}%</span>
                    </div>
                  )}
                  {provider.avgLatencyMs !== null && (
                    <div className="flex justify-between">
                      <span className="text-netflix-text-3">Avg Latency</span>
                      <span className="text-netflix-text-2">{provider.avgLatencyMs}ms</span>
                    </div>
                  )}
                  {provider.lastCheckAt && (
                    <div className="flex justify-between">
                      <span className="text-netflix-text-3">Last Check</span>
                      <span className="text-netflix-text-2">{new Date(provider.lastCheckAt).toLocaleString()}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Scheduler info card */}
            <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
              <h4 className="text-sm font-semibold text-white mb-3">Refresh Scheduler</h4>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Status</span>
                  <span className={`font-medium ${scheduler.scheduler?.isRunning ? 'text-green-400' : 'text-netflix-text-2'}`}>
                    {scheduler.scheduler?.isRunning ? 'Running' : 'Stopped'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Mode</span>
                  <span className="text-netflix-text-2">
                    Hourly aligned
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Interval</span>
                  <span className="text-netflix-text-2">{scheduler.scheduler?.intervalMinutes || 60} min</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Last Refresh</span>
                  <span className="text-netflix-text-2">
                    {scheduler.history?.lastSuccessAt
                      ? new Date(scheduler.history.lastSuccessAt).toLocaleString()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Next Refresh</span>
                  <span className="text-netflix-text-2">
                    {scheduler.scheduler?.nextRefreshTime
                      ? new Date(scheduler.scheduler.nextRefreshTime).toLocaleString()
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Cache</span>
                  <span className={`font-medium ${
                    schedulerHealth.status === 'healthy' ? 'text-green-400'
                      : schedulerHealth.status === 'degraded' ? 'text-yellow-400'
                      : schedulerHealth.status === 'failing' ? 'text-red-400'
                      : 'text-netflix-text-2'
                  }`}>
                    {schedulerHealth.status === 'healthy' ? 'Healthy'
                      : schedulerHealth.status === 'degraded' ? 'Degraded'
                      : schedulerHealth.status === 'failing' ? 'Failing'
                      : 'Starting'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Total Refreshes</span>
                  <span className="text-netflix-text-2">{scheduler.history?.totalAttempts || 0}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-netflix-text-3">Last Failure</span>
                  <span className={`${scheduler.history?.lastFailureAt ? 'text-red-400' : 'text-netflix-text-3'}`}>
                    {scheduler.history?.lastFailureAt
                      ? new Date(scheduler.history.lastFailureAt).toLocaleString()
                      : 'None'}
                  </span>
                </div>
                {scheduler.history?.lastError && (
                  <div className="flex justify-between">
                    <span className="text-netflix-text-3">Error</span>
                    <span className="text-red-400 text-[10px] max-w-[150px] truncate" title={scheduler.history.lastError}>
                      {scheduler.history.lastError}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Cards */}
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">CPU Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Usage</span>
              <span className="text-white">{cpu.percent}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Cores</span>
              <span className="text-white">{cpu.cores}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Model</span>
              <span className="text-white text-xs truncate max-w-[200px]" title={cpu.model}>{cpu.model || 'Unknown'}</span>
            </div>
          </div>
        </div>

        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Memory Details</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Total (RSS)</span>
              <span className="text-white">{processInfo.memory ? `${(processInfo.memory.rss / 1024 / 1024).toFixed(0)} MB` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Heap Used</span>
              <span className="text-white">{processInfo.memory ? `${(processInfo.memory.heapUsed / 1024 / 1024).toFixed(0)} MB` : '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Heap Total</span>
              <span className="text-white">{processInfo.memory ? `${(processInfo.memory.heapTotal / 1024 / 1024).toFixed(0)} MB` : '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">System</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Platform</span>
              <span className="text-white">{health.platform || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Node.js</span>
              <span className="text-white">{health.nodeVersion || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Process ID</span>
              <span className="text-white font-mono text-xs">{processInfo.pid || '—'}</span>
            </div>
          </div>
        </div>

        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4">
          <h3 className="text-sm font-semibold text-white mb-3">Disk</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Project Path</span>
              <span className="text-white text-xs font-mono truncate max-w-[180px]" title={disk.path}>{disk.path || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-netflix-text-3">Available</span>
              <span className="text-netflix-text-2 text-xs">{disk.available || 'N/A'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
