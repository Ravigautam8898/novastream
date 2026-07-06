const STATUS_STYLES = {
  active: 'bg-green-500/10 text-green-400 border-green-500/20',
  trial: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  expired: 'bg-red-500/10 text-red-400 border-red-500/20',
  suspended: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  disabled: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  none: 'bg-netflix-dark-3 text-netflix-text-3 border-netflix-border/20',
  trial_expired: 'bg-red-500/5 text-red-400/60 border-red-500/10',
};

export default function SubscriptionBadge({ status, size = 'sm' }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.none;
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).replace('_', ' ') : 'None';
  const sizeClass = size === 'lg' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center font-medium rounded-full border ${style} ${sizeClass}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${status === 'active' ? 'bg-green-400' : status === 'expired' ? 'bg-red-400' : 'bg-gray-400'}`} />
      {label}
    </span>
  );
}
