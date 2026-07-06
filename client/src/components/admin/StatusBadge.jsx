export default function StatusBadge({ status, label }) {
  const config = {
    active: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-400', defaultLabel: 'Active' },
    inactive: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', defaultLabel: 'Inactive' },
    pending: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', defaultLabel: 'Pending' },
    online: { bg: 'bg-green-500/10', text: 'text-green-400', dot: 'bg-green-400', defaultLabel: 'Online' },
    offline: { bg: 'bg-red-500/10', text: 'text-red-400', dot: 'bg-red-400', defaultLabel: 'Offline' },
    admin: { bg: 'bg-purple-500/10', text: 'text-purple-400', dot: 'bg-purple-400', defaultLabel: 'Admin' },
    user: { bg: 'bg-blue-500/10', text: 'text-blue-400', dot: 'bg-blue-400', defaultLabel: 'User' },
    featured: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', dot: 'bg-yellow-400', defaultLabel: 'Featured' },
  };

  const c = config[status] || { bg: 'bg-netflix-dark-3', text: 'text-netflix-text-2', dot: 'bg-netflix-text-3', defaultLabel: status };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label || c.defaultLabel}
    </span>
  );
}
