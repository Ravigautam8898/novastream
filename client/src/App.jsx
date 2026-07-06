import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import ProtectedRoute from './components/auth/ProtectedRoute';
import AdminRoute from './components/admin/AdminRoute';
import SubscriptionGuard from './components/auth/SubscriptionGuard';
import SessionExpiredHandler from './components/auth/SessionExpiredHandler';
import ErrorBoundary from './components/ui/ErrorBoundary';

// PF-001: Route-level code splitting — each page is loaded on demand.
// LoginPage is the most common first-visit landing page, so it's critical
// to keep it synchronous. AdminDashboard is the heaviest (5 sub-pages +
// DataTable + StatCard) — ideal lazy candidate.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const HomePage = lazy(() => import('./pages/HomePage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const CategoryPage = lazy(() => import('./pages/CategoryPage'));
const DetailPage = lazy(() => import('./pages/DetailPage'));
const WatchPage = lazy(() => import('./pages/WatchPage'));
const MyListPage = lazy(() => import('./pages/MyListPage'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const SubscriptionRequiredPage = lazy(() => import('./pages/SubscriptionRequiredPage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));

// Minimal loading fallback for lazy-loaded routes
function PageFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-netflix-dark">
      <div className="w-8 h-8 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  // FE-001: App renders immediately without waiting for auth verification.
  // ProtectedRoute handles the auth guard — unauthenticated users are
  // redirected to /login. This eliminates the 3-12s spinner on every
  // hard refresh while the verify token request is in-flight.
  return (
    <>
      <SessionExpiredHandler />
      <ErrorBoundary>
      <Suspense fallback={<PageFallback />}>
      <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <HomePage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/search"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <SearchPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/category/:category"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <CategoryPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watch/:contentType/:slug"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <DetailPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/watch/:contentType/:slug/play"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <WatchPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/my-list"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <MyListPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <SubscriptionGuard>
              <HistoryPage />
            </SubscriptionGuard>
          </ProtectedRoute>
        }
      />
      <Route path="/subscription-required" element={<SubscriptionRequiredPage />} />
      <Route
        path="/admin"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route
        path="/admin/*"
        element={
          <AdminRoute>
            <AdminDashboard />
          </AdminRoute>
        }
      />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
    </Suspense>
    </ErrorBoundary>
    </>
  );
}
