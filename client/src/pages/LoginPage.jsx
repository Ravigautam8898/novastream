import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import LoginForm from '../components/auth/LoginForm';

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/';

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, loading, navigate, from]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-netflix-dark">
        <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-netflix-dark px-4">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-netflix-red/5 via-transparent to-netflix-dark pointer-events-none" />

      {/* Login card */}
      <div className="relative bg-netflix-dark-2/80 backdrop-blur-sm border border-netflix-border rounded-lg p-8 w-full max-w-sm shadow-2xl animate-fade-in">
        <LoginForm />
      </div>
    </div>
  );
}
