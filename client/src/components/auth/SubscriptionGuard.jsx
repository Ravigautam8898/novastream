import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * SubscriptionGuard — blocks member users from accessing content
 * if they don't have an active subscription.
 *
 * Super Admin and Manager users bypass this check (they don't need subscriptions).
 */
export default function SubscriptionGuard({ children }) {
  const { user, isAuthenticated, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-netflix-dark">
        <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Only check subscription for member users — SA/Manager bypass
  // Block all non-active statuses: no sub, suspended, expired, disabled
  const hasActiveSub = user?.subscription?.status === 'active';
  if (user?.role === 'member' && !hasActiveSub) {
    return <Navigate to="/subscription-required" state={{ from: location }} replace />;
  }

  return children;
}
