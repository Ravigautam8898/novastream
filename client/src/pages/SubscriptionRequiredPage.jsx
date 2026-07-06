import { useAuth } from '../context/AuthContext';

export default function SubscriptionRequiredPage() {
  const { user, logout } = useAuth();

  const subStatus = user?.subscription?.status;

  const statusInfo = {
    suspended: {
      title: 'Subscription Suspended',
      message: 'Your subscription has been suspended. You cannot access content until it is resumed by an administrator.',
      steps: ['Contact your administrator to request reactivation', 'Wait for an admin to resume your subscription'],
      icon: '🔒',
    },
    expired: {
      title: 'Subscription Expired',
      message: 'Your subscription has expired. You need an active subscription to continue accessing NovaStream content.',
      steps: ['Contact your administrator to renew your subscription', 'Ask about available plans and renewal options'],
      icon: '⏰',
    },
    disabled: {
      title: 'Subscription Disabled',
      message: 'Your subscription has been disabled. Please contact an administrator for more information.',
      steps: ['Contact your administrator for assistance', 'An admin can re-enable your subscription if appropriate'],
      icon: '🚫',
    },
    default: {
      title: 'Subscription Required',
      message: 'Your account does not have an active subscription. You need one to access NovaStream content.',
      steps: ['Contact your administrator or manager to assign a subscription plan', 'If you believe this is an error, ask your admin to check your subscription status'],
      icon: '🔒',
    },
  };

  const info = statusInfo[subStatus] || statusInfo.default;

  return (
    <div className="min-h-screen bg-netflix-dark flex flex-col items-center justify-center p-6">
      <div className="max-w-md w-full text-center">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-netflix-red/10 flex items-center justify-center">
          <span className="text-2xl">{info.icon}</span>
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">{info.title}</h1>
        <p className="text-netflix-text-2 text-sm mb-6 leading-relaxed">
          Hi <span className="text-white font-medium">{user?.username || 'there'}</span>, {info.message}
        </p>

        <div className="bg-netflix-dark-2 border border-netflix-border/20 rounded-xl p-5 mb-6 text-left">
          <h3 className="text-sm font-semibold text-white mb-3">What you can do:</h3>
          <ul className="space-y-2.5">
            {info.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2.5 text-xs text-netflix-text-2">
                <span className="text-netflix-red mt-0.5 shrink-0">→</span>
                {step}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={logout}
          className="px-6 py-2.5 text-sm rounded bg-netflix-red text-white hover:bg-red-700 transition-colors"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
