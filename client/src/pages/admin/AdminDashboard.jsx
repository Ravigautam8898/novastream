import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import adminApi from '../../api/admin.api';
import AdminOverview from './AdminOverview';
import AdminUsers from './AdminUsers';
import AdminContent from './AdminContent';
import AdminLogs from './AdminLogs';
import AdminSecurity from './AdminSecurity';
import AdminHealth from './AdminHealth';
import AdminDatabase from './AdminDatabase';
import AdminConfig from './AdminConfig';
import AdminProcess from './AdminProcess';
import AdminActivity from './AdminActivity';
import SuperAdminSubscriptions from './SuperAdminSubscriptions';
import SuperAdminHierarchy from './SuperAdminHierarchy';
import ManagerSubscriptions from './ManagerSubscriptions';
import ManagerMembers from './ManagerMembers';
import SubscriptionUserPage from './SubscriptionUserPage';
import PlanManager from './PlanManager';

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const isManager = user?.role === 'manager';
  const isAdmin = isSuperAdmin || isManager;

  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const tabs = [
    { key: 'overview', label: 'Overview', icon: '📊', path: '/admin' },
    ...(isManager ? [{ key: 'members', label: 'Members', icon: '👥', path: '/admin/members' }] : []),
    ...(isAdmin ? [{ key: 'subscriptions', label: 'Subscriptions', icon: '💳', path: '/admin/subscriptions' }] : []),
    ...(isSuperAdmin ? [{ key: 'hierarchy', label: 'Hierarchy', icon: '🌳', path: '/admin/hierarchy' }] : []),
    ...(isSuperAdmin ? [{ key: 'plans', label: 'Plans', icon: '📋', path: '/admin/plans' }] : []),
    ...(isSuperAdmin ? [{ key: 'users', label: 'Users', icon: '👥', path: '/admin/users' }] : []),
    ...(isSuperAdmin ? [{ key: 'content', label: 'Content', icon: '🎬', path: '/admin/content' }] : []),
    ...(isSuperAdmin ? [{ key: 'health', label: 'Health', icon: '❤️', path: '/admin/health' }] : []),
    ...(isSuperAdmin ? [{ key: 'process', label: 'Process', icon: '⚙️', path: '/admin/process' }] : []),
    ...(isSuperAdmin ? [{ key: 'database', label: 'Database', icon: '🗄️', path: '/admin/database' }] : []),
    ...(isSuperAdmin ? [{ key: 'config', label: 'Config', icon: '⚡', path: '/admin/config' }] : []),
    ...(isSuperAdmin ? [{ key: 'activity', label: 'Activity', icon: '📈', path: '/admin/activity' }] : []),
    ...(isSuperAdmin ? [{ key: 'logs', label: 'Logs', icon: '📋', path: '/admin/logs' }] : []),
    ...(isSuperAdmin ? [{ key: 'security', label: 'Security', icon: '🔒', path: '/admin/security' }] : []),
  ];

  useEffect(() => {
    const loadStats = async () => {
      try {
        const data = await adminApi.getStats();
        if (isManager) {
          // Manager overview shows only system-level stats (membership counts live on Subscriptions tab)
          setStats({
            memory: data.memory,
            uptime: data.uptime,
            nodeVersion: data.nodeVersion,
            timestamp: data.timestamp,
            myMembers: 0,
            myActive: 0,
            myExpired: 0,
          });
        } else {
          setStats(data);
        }
      } catch {
        // Keep defaults
      } finally {
        setLoading(false);
      }
    };
    loadStats();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-netflix-dark flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-netflix-dark-2 border-r border-netflix-border/20
        transform transition-transform duration-200 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="p-4 border-b border-netflix-border/20">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-netflix-red text-lg font-bold tracking-tight">NovaStream</h1>
              <p className="text-netflix-text-3 text-[10px] uppercase tracking-wider mt-0.5">Admin Panel</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-netflix-text-3 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <nav className="p-3 space-y-1">
          {tabs.map((tab) => (
            <NavLink
              key={tab.key}
              to={tab.path}
              end={tab.key === 'overview'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-netflix-red/10 text-netflix-red font-medium'
                    : 'text-netflix-text-2 hover:text-white hover:bg-white/[0.05]'
                }`
              }
            >
              <span className="text-base">{tab.icon}</span>
              {tab.label}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-netflix-border/20">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-xs text-netflix-text-3 hover:text-white transition-colors w-full"
          >
            <span>←</span>
            Back to Site
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0">
        {/* Top bar (mobile) */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-netflix-border/20 bg-netflix-dark-2">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-netflix-text-2 hover:text-white"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-netflix-red text-sm font-bold">NovaStream Admin</h1>
          <div className="w-6" />
        </div>

        <div className="p-4 md:p-6 lg:p-8 max-w-7xl mx-auto">
          <Routes>
            <Route index element={<AdminOverview stats={stats} loading={loading} role={user?.role} />} />
            {isManager && (
              <Route path="members" element={<ManagerMembers />} />
            )}
            {isAdmin && (
              <Route path="subscriptions" element={
                isSuperAdmin ? <SuperAdminSubscriptions /> : <ManagerSubscriptions />
              } />
            )}
            {isSuperAdmin && (
              <Route path="subscriptions/user/:userId" element={<SubscriptionUserPage />} />
            )}
            {isSuperAdmin && <Route path="hierarchy" element={<SuperAdminHierarchy />} />}
            {isSuperAdmin && <Route path="users" element={<AdminUsers />} />}
            {isSuperAdmin && <Route path="content" element={<AdminContent />} />}
            {isSuperAdmin && <Route path="logs" element={<AdminLogs />} />}
            {isSuperAdmin && <Route path="health" element={<AdminHealth />} />}
            {isSuperAdmin && <Route path="process" element={<AdminProcess />} />}
            {isSuperAdmin && <Route path="database" element={<AdminDatabase />} />}
            {isSuperAdmin && <Route path="config" element={<AdminConfig />} />}
            {isSuperAdmin && <Route path="activity" element={<AdminActivity />} />}
            {isSuperAdmin && <Route path="plans" element={<PlanManager />} />}
            {isSuperAdmin && <Route path="security" element={<AdminSecurity />} />}
          </Routes>
        </div>
      </div>
    </div>
  );
}
