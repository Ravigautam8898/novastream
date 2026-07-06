export default function QuotaCard({ label, current, limit, icon }) {
  const percentage = limit > 0 ? Math.round((current / limit) * 100) : 0;
  const isWarning = percentage >= 80;
  const isCritical = percentage >= 95;

  return (
    <div className="bg-netflix-dark-3 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon && <span className="text-base">{icon}</span>}
          <p className="text-netflix-text-3 text-xs">{label}</p>
        </div>
        <p className={`text-xs font-medium ${isCritical ? 'text-red-400' : isWarning ? 'text-yellow-400' : 'text-netflix-text-2'}`}>
          {current}/{limit}
        </p>
      </div>
      <div className="w-full h-1.5 bg-netflix-dark-4 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${isCritical ? 'bg-red-500' : isWarning ? 'bg-yellow-500' : 'bg-green-500'}`}
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}
