import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import ProtectedRoute from '../auth/ProtectedRoute';

export default function AdminRoute({ children }) {
  const { isAdmin } = useAuth();

  return (
    <ProtectedRoute>
      {isAdmin ? (
        children
      ) : (
        <div className="min-h-screen bg-netflix-dark flex flex-col items-center justify-center px-6 text-center">
          <span className="text-5xl mb-4">🔒</span>
          <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-netflix-text-2 max-w-md mb-6">
            You need admin privileges to access this page.
          </p>
          <a href="/" className="btn-primary">
            Go Home
          </a>
        </div>
      )}
    </ProtectedRoute>
  );
}
