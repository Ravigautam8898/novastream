export default function ExpiryCountdown({ daysRemaining, expiryDate, status }) {
  // Non-active statuses take priority
  if (status === 'disabled') {
    return <span className="text-gray-400 text-xs font-medium">Disabled</span>;
  }
  if (status === 'suspended') {
    return <span className="text-orange-400 text-xs font-medium">Suspended</span>;
  }
  if (status === 'expired') {
    return (
      <span className="text-red-400 text-xs">
        Expired{expiryDate ? <span className="text-netflix-text-3 ml-1">({new Date(expiryDate).toLocaleDateString()})</span> : ''}
      </span>
    );
  }

  // Compute daysRemaining from expiryDate if not provided
  const days = daysRemaining !== undefined
    ? daysRemaining
    : expiryDate
      ? Math.ceil((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
      : undefined;

  if (days === undefined) {
    return <span className="text-netflix-text-3 text-xs">—</span>;
  }

  if (days <= 0) {
    return (
      <span className="text-red-400 text-xs">
        Expired{expiryDate ? <span className="text-netflix-text-3 ml-1">({new Date(expiryDate).toLocaleDateString()})</span> : ''}
      </span>
    );
  }

  let color = 'text-green-400';
  if (days <= 7) color = 'text-red-400';
  else if (days <= 30) color = 'text-yellow-400';

  const dayLabel = days === 1 ? '1 day' : `${days} days`;
  const dateLabel = expiryDate ? new Date(expiryDate).toLocaleDateString() : '';

  return (
    <span className={`${color} text-xs font-medium`}>
      {dayLabel}
      {dateLabel && <span className="text-netflix-text-3 ml-1">({dateLabel})</span>}
    </span>
  );
}
