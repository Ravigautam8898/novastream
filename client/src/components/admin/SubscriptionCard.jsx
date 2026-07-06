import SubscriptionBadge from './SubscriptionBadge';
import ExpiryCountdown from './ExpiryCountdown';
import StatusChip from './StatusChip';

export default function SubscriptionCard({ subscription, user }) {
  if (!subscription || !subscription.exists) {
    return (
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-5">
        <p className="text-netflix-text-3 text-sm">No subscription assigned</p>
      </div>
    );
  }

  const s = subscription;

  return (
    <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Subscription</h3>
        <SubscriptionBadge status={s.displayStatus || s.status} />
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-netflix-text-3 text-xs">Plan</p>
          <p className="text-white font-medium mt-0.5">{s.planLabel || s.plan || '—'}</p>
        </div>
        <div>
          <p className="text-netflix-text-3 text-xs">Days Remaining</p>
          <p className="mt-0.5"><ExpiryCountdown daysRemaining={s.daysRemaining} expiryDate={s.expiryDate} status={s.status} /></p>
        </div>
        <div>
          <p className="text-netflix-text-3 text-xs">Activation</p>
          <p className="text-netflix-text-2 mt-0.5">{s.activationDate ? new Date(s.activationDate).toLocaleDateString() : '—'}</p>
        </div>
        <div>
          <p className="text-netflix-text-3 text-xs">Expiry</p>
          <p className="text-netflix-text-2 mt-0.5">{s.expiryDate ? new Date(s.expiryDate).toLocaleDateString() : '—'}</p>
        </div>
        <div>
          <p className="text-netflix-text-3 text-xs">Renewals</p>
          <p className="text-netflix-text-2 mt-0.5">{s.renewalCount || 0}</p>
        </div>
        <div>
          <p className="text-netflix-text-3 text-xs">Version</p>
          <p className="text-netflix-text-2 mt-0.5">{s.version || '—'}</p>
        </div>
      </div>

      {s.flags?.trial && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded px-3 py-2">
          <p className="text-xs text-blue-400">
            Trial ends {s.trialEndDate ? new Date(s.trialEndDate).toLocaleDateString() : 'soon'}
          </p>
        </div>
      )}

      {s.notes && (
        <div>
          <p className="text-netflix-text-3 text-xs mb-1">Notes</p>
          <p className="text-netflix-text text-xs bg-netflix-dark-3 rounded px-3 py-2">{s.notes}</p>
        </div>
      )}
    </div>
  );
}
