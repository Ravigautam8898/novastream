import StatCard from '../../components/admin/StatCard';
import StatusBadge from '../../components/admin/StatusBadge';

export default function AdminOverview({ stats, loading, role }) {
  const isManager = role === 'manager';
  const isSuperAdmin = role === 'super_admin';
  const title = isSuperAdmin ? 'System Overview' : isManager ? 'Manager Dashboard' : 'Server Overview';
  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-6">{title}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-netflix-dark-2 rounded-lg p-4 border border-netflix-border/20">
              <div className="h-3 w-20 rounded shimmer mb-3" />
              <div className="h-7 w-16 rounded shimmer mb-1" />
              <div className="h-3 w-24 rounded shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-12">
        <p className="text-netflix-text-2">Failed to load server stats.</p>
      </div>
    );
  }

  const memMb = (stats.memory?.heapUsed || 0) / 1024 / 1024;
  const memTotal = (stats.memory?.heapTotal || 0) / 1024 / 1024;
  const memPercent = memTotal > 0 ? ((memMb / memTotal) * 100).toFixed(1) : 0;
  const uptimeHours = Math.floor(stats.uptime / 3600);
  const uptimeMinutes = Math.floor((stats.uptime % 3600) / 60);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <StatusBadge status="online" label={isManager ? 'Manager View' : 'Server Online'} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {isManager ? (
          <>
            <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 col-span-2 md:col-span-4 flex items-center gap-3">
              <span className="text-lg">👥</span>
              <div>
                <p className="text-xs text-netflix-text-3">My Members</p>
                <p className="text-sm text-white">View member details on the <strong>Subscriptions</strong> tab</p>
              </div>
            </div>
            <StatCard
              label="Memory (Heap)"
              value={`${memMb.toFixed(0)} MB`}
              sublabel={`${memPercent}% of ${memTotal.toFixed(0)} MB`}
              icon="💾"
              color="purple"
            />
            <StatCard
              label="Uptime"
              value={`${uptimeHours}h ${uptimeMinutes}m`}
              icon="⏱️"
              color="gray"
            />
            <StatCard
              label="Node.js"
              value={stats.nodeVersion || '—'}
              icon="⚙️"
              color="gray"
            />
          </>
        ) : (
          <>
            <StatCard
              label="Users"
              value={stats.users?.total ?? 0}
              sublabel={`${stats.users?.active ?? 0} active · ${stats.users?.admins ?? 0} admins`}
              icon="👥"
              color="blue"
            />
            <StatCard
              label="Content"
              value={stats.content?.total ?? 0}
              sublabel={`${stats.content?.movies ?? 0} movies · ${stats.content?.series ?? 0} series`}
              icon="🎬"
              color="netflix-red"
            />
            <StatCard
              label="Active Sessions"
              value={stats.sessions?.active ?? 0}
              icon="🔑"
              color="green"
            />
            <StatCard
              label="Blocked IPs"
              value={stats.security?.blockedIPs ?? 0}
              icon="🛡️"
              color="yellow"
            />
            <StatCard
              label="Memory (Heap)"
              value={`${memMb.toFixed(0)} MB`}
              sublabel={`${memPercent}% of ${memTotal.toFixed(0)} MB`}
              icon="💾"
              color="purple"
            />
            <StatCard
              label="Uptime"
              value={`${uptimeHours}h ${uptimeMinutes}m`}
              icon="⏱️"
              color="gray"
            />
            <StatCard
              label="Node.js"
              value={stats.nodeVersion || '—'}
              icon="⚙️"
              color="gray"
            />
            <StatCard
              label="Last Updated"
              value={stats.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : '—'}
              icon="🕐"
              color="gray"
            />
          </>
        )}
      </div>
    </div>
  );
}
