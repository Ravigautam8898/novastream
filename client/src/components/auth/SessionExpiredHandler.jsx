import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * SessionExpiredHandler — listens for auth:expired events from the API client
 * and gracefully navigates to the login page using React Router.
 *
 * This replaces the old window.location.href = '/login' approach which caused
 * a full browser page reload and destroyed all React state.
 *
 * Mount this high in the component tree (e.g., App.jsx) so it's always active.
 */
export default function SessionExpiredHandler() {
  const navigate = useNavigate();
  const { logout } = useAuth();

  useEffect(() => {
    const handleExpired = () => {
      // Only redirect if not already on login page
      if (window.location.pathname === '/login') return;

      // Clear auth state and navigate gracefully
      logout();
      navigate('/login', { replace: true });
    };

    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, [navigate, logout]);

  return null;
}
