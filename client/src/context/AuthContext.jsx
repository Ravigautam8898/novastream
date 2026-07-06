import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authApi } from '../api/auth.api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('novastream_token'));
  const [loading, setLoading] = useState(true);

  // Verify token on mount
  useEffect(() => {
    const storedToken = localStorage.getItem('novastream_token');
    if (storedToken) {
      authApi.verify()
        .then((userData) => {
          // Normalize: verify returns { valid: true, user: {...} } — unwrap to flat user shape
          const normalized = userData?.user ? userData.user : userData;
          setUser(normalized);
          setToken(storedToken);
        })
        .catch(() => {
          // Token invalid — clear
          localStorage.removeItem('novastream_token');
          localStorage.removeItem('novastream_user');
          setToken(null);
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (username, password) => {
    const result = await authApi.login(username, password);
    localStorage.setItem('novastream_token', result.token);
    localStorage.setItem('novastream_user', JSON.stringify(result.user));
    setToken(result.token);
    setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(async () => {
    // Only attempt server logout if a token actually exists
    // Prevents infinite loop when interceptor triggers logout after clearing localStorage
    const hasToken = localStorage.getItem('novastream_token');
    if (hasToken) {
      try {
        await authApi.logout();
      } catch {
        // Even if logout fails on server, clear locally
      }
    }
    localStorage.removeItem('novastream_token');
    localStorage.removeItem('novastream_user');
    setToken(null);
    setUser(null);
  }, []);

  const isAuthenticated = !!token && !!user;
  // Admin roles: super_admin (new) and admin (legacy for backward compatibility)
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'manager';

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAuthenticated, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

export default AuthContext;
