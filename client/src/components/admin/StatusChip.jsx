const DOT_COLORS = {
  active: 'bg-green-400',
  trial: 'bg-blue-400',
  expired: 'bg-red-400',
  suspended: 'bg-orange-400',
  disabled: 'bg-gray-500',
  none: 'bg-gray-600',
  true: 'bg-green-400',
  false: 'bg-red-400',
  yes: 'bg-green-400',
  no: 'bg-red-400',
};

export default function StatusChip({ status, label }) {
  const dotColor = DOT_COLORS[status] || 'bg-gray-500';
  const displayLabel = label || (typeof status === 'string' ? status.charAt(0).toUpperCase() + status.slice(1) : String(status));

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-netflix-text-2">
      <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
      {displayLabel}
    </span>
  );
}
