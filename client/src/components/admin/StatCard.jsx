export default function StatCard({ label, value, sublabel, icon, trend, color = 'netflix-red' }) {
  const colorMap = {
    'netflix-red': 'text-netflix-red',
    'green': 'text-netflix-green',
    'blue': 'text-blue-400',
    'yellow': 'text-yellow-400',
    'purple': 'text-purple-400',
    'gray': 'text-netflix-text-2',
  };

  return (
    <div className="bg-netflix-dark-2 rounded-lg p-4 border border-netflix-border/20 hover:border-netflix-border/40 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-netflix-text-3 text-xs font-medium uppercase tracking-wider truncate">
            {label}
          </p>
          <p className={`text-2xl font-bold mt-1 ${colorMap[color] || 'text-white'}`}>
            {value ?? '—'}
          </p>
          {sublabel && (
            <p className="text-netflix-text-3 text-xs mt-0.5 truncate">{sublabel}</p>
          )}
        </div>
        {icon && (
          <span className="text-netflix-text-3 text-2xl flex-shrink-0 ml-3">{icon}</span>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-2 flex items-center gap-1">
          <span className={`text-xs font-medium ${trend >= 0 ? 'text-netflix-green' : 'text-red-400'}`}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
        </div>
      )}
    </div>
  );
}
