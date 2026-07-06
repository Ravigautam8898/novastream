import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import apiClient from '../../api/client';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';

export default function AdminActivity() {
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userActivity, setUserActivity] = useState(null);
  const [userLoading, setUserLoading] = useState(false);
  const [users, setUsers] = useState([]);

  const fetchActivity = useCallback(async () => {
    setLoading(true);
    try {
      // Get users first for the selector
      const userData = await adminApi.getUsers();
      setUsers(Array.isArray(userData?.users) ? userData.users : []);
    } catch {
      // Silently fail
    }

    try {
      // Fetch recent activity via admin API
      const { data } = await apiClient.get('/admin/activity/recent');
      const items = Array.isArray(data?.data?.items) ? data.data.items : [];
      // Add unique key for DataTable since activity data lacks _id
      setActivity(items.map((item, i) => ({ ...item, _key: `activity-${i}-${Date.now()}` })));
    } catch (err) {
      toast.error('Failed to load activity');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchActivity(); }, [fetchActivity]);

  const handleSelectUser = async (userId) => {
    setSelectedUser(userId);
    setUserLoading(true);
    try {
      const { data } = await apiClient.get(`/admin/users/${userId}/activity`);
      setUserActivity(data.data);
    } catch {
      toast.error('Failed to load user activity');
      setUserActivity(null);
    } finally {
      setUserLoading(false);
    }
  };

  const activityColumns = [
    {
      key: 'username', label: 'User', render: (r) => (
        <button
          onClick={() => handleSelectUser(r.userId)}
          className="text-white text-sm font-medium hover:text-netflix-red transition-colors"
        >
          {r.username || 'Unknown'}
        </button>
      ),
    },
    {
      key: 'type', label: 'Action', render: (r) => (
        <StatusBadge status={r.type === 'watch' ? 'active' : r.type === 'login' ? 'pending' : 'featured'} label={r.type} />
      ),
    },
    {
      key: 'content', label: 'Content', render: (r) => r.content ? (
        <Link to={`/watch/${r.content.contentType || 'movie'}/${r.content.slug}`} className="text-blue-400 hover:text-blue-300 text-xs">
          {r.content.title}
        </Link>
      ) : <span className="text-netflix-text-3">—</span>,
    },
    {
      key: 'timestamp', label: 'When', sortable: true, render: (r) => (
        <span className="text-netflix-text-2 text-xs">
          {r.timestamp ? new Date(r.timestamp).toLocaleString() : '—'}
        </span>
      ),
    },
  ];

  // Find selected username
  const selectedUsername = selectedUser
    ? users.find(u => u._id === selectedUser)?.username || 'Loading...'
    : null;

  return (
    <div>
      <h2 className="text-xl font-bold text-white mb-6">User Activity</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity Feed */}
        <div className="lg:col-span-2">
          <h3 className="text-sm font-semibold text-white mb-3">Recent Activity (All Users)</h3>
          <DataTable
            columns={activityColumns}
            data={activity}
            keyField={'_key'}
            loading={loading}
            emptyMessage="No recent activity found."
          />
        </div>

        {/* User Detail Panel */}
        <div>
          <h3 className="text-sm font-semibold text-white mb-3">
            {selectedUsername ? `${selectedUsername}'s Timeline` : 'User Details'}
          </h3>

          {!selectedUser && (
            <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 text-center">
              <p className="text-netflix-text-3 text-sm">
                Click a username in the activity feed to see their full timeline.
              </p>
              <p className="text-netflix-text-3 text-xs mt-2">
                Shows: watch history, logins, and favorites.
              </p>
            </div>
          )}

          {userLoading && (
            <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6">
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-8 rounded shimmer" />
                ))}
              </div>
            </div>
          )}

          {userActivity && !userLoading && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-3">
                <p className="text-white font-medium text-sm">{userActivity.displayName || userActivity.username}</p>
                <p className="text-netflix-text-3 text-xs">@{userActivity.username}</p>
                <p className="text-netflix-text-3 text-xs mt-1">{userActivity.total} total actions</p>
              </div>

              {(userActivity.activity || []).map((entry, idx) => (
                <div key={idx} className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs">
                      {entry.type === 'watch' ? '▶️' : entry.type === 'login' ? '🔑' : '⭐'}
                    </span>
                    <StatusBadge status={entry.type === 'watch' ? 'active' : entry.type === 'login' ? 'pending' : 'featured'} label={entry.type} />
                    <span className="text-netflix-text-3 text-xs ml-auto">
                      {entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}
                    </span>
                  </div>
                  {entry.type === 'watch' && entry.content && (
                    <p className="text-netflix-text-2 text-xs">
                      Watched: <span className="text-white">{entry.content.title}</span>
                      {entry.episode && <span className="text-netflix-text-3"> — S{entry.episode.seasonNumber}E{entry.episode.episodeNumber}</span>}
                      {entry.duration > 0 && <span className="text-netflix-green ml-1">({Math.round((entry.progress / entry.duration) * 100)}%)</span>}
                    </p>
                  )}
                  {entry.type === 'login' && (
                    <p className="text-netflix-text-2 text-xs">
                      IP: <span className="font-mono text-netflix-text">{entry.ip || '—'}</span>
                      {entry.userAgent && <span className="block truncate">{entry.userAgent}</span>}
                    </p>
                  )}
                  {entry.type === 'favorite' && entry.content && (
                    <p className="text-netflix-text-2 text-xs">
                      Added to My List: <span className="text-white">{entry.content.title}</span>
                    </p>
                  )}
                </div>
              ))}

              {(userActivity.activity || []).length === 0 && (
                <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6 text-center">
                  <p className="text-netflix-text-3 text-sm">No activity found for this user.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
