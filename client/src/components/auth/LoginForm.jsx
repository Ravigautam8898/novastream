import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { sanitizeSearchInput } from '../../utils/sanitize';
import toast from 'react-hot-toast';

export default function LoginForm() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Client-side validation + sanitization
    const sanitizedUsername = sanitizeSearchInput(username);
    if (!sanitizedUsername) {
      setError('Username is required');
      return;
    }
    if (!password) {
      setError('Password is required');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
      await login(sanitizedUsername, password);
      toast.success('Welcome back!');
    } catch (err) {
      const message = err.response?.data?.message || 'Invalid credentials';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      {/* Logo */}
      <div className="text-center mb-2">
        <h1 className="text-netflix-red text-4xl font-bold tracking-tight">NovaStream</h1>
        <p className="text-netflix-text-2 text-sm mt-2">Sign in to continue</p>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-netflix-red/10 border border-netflix-red/30 rounded px-4 py-3 text-sm text-netflix-red">
          {error}
        </div>
      )}

      {/* Username */}
      <div>
        <label htmlFor="username" className="block text-sm font-medium text-netflix-text-2 mb-1.5">
          Username
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="input-field"
          placeholder="Enter your username"
          autoComplete="username"
          autoFocus
          disabled={loading}
        />
      </div>

      {/* Password */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-netflix-text-2 mb-1.5">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field"
          placeholder="Enter your password"
          autoComplete="current-password"
          disabled={loading}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Signing in...
          </>
        ) : (
          'Sign In'
        )}
      </button>

      {/* Footer */}
      <p className="text-center text-netflix-text-3 text-xs mt-6">
        This is a private server.{' '}
        <span className="block mt-1">Contact your admin for access.</span>
      </p>
    </form>
  );
}
