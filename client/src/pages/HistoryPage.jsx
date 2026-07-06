import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { historyApi } from '../api/history.api';
import Header from '../components/layout/Header';
import { PageSkeleton } from '../components/ui/LoadingSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';
import ConfirmDialog from '../components/admin/ConfirmDialog';

import { TMDB_IMAGE_BASE } from '../config/images';

export default function HistoryPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await historyApi.getHistory(page, 20);
      // result.data is the items array (from ApiResponse.paginated)
      // Each item has content/episode nested — flatten for render compatibility
      const rawItems = Array.isArray(result.data) ? result.data : [];
      const flattened = rawItems.map((item) => {
        const content = item.content || {};
        const episode = item.episode || null;
        return {
          // Content fields (flattened from nested content object)
          _id: item._id,
          contentId: content._id,
          slug: content.slug,
          title: content.title,
          posterPath: content.posterPath,
          backdropPath: content.backdropPath,
          contentType: content.contentType || 'movie',
          genres: content.genres,
          voteAverage: content.voteAverage,
          releaseDate: content.releaseDate,
          firstAirDate: content.firstAirDate,
          // Episode fields
          episodeId: episode?._id,
          episodeName: episode?.name,
          episodeNumber: episode?.episodeNumber,
          seasonNumber: episode?.seasonNumber,
          // Progress fields
          progress: item.progress,
          duration: item.duration,
          progressPercent: item.progressPercent,
          watchedAt: item.watchedAt,
          type: episode ? 'episode' : (content.contentType === 'series' ? 'episode' : 'movie'),
        };
      });
      setItems(flattened);
      setTotal(result.pagination?.total || 0);
      setTotalPages(result.pagination?.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load history');
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await historyApi.clearHistory();
      setItems([]);
      setTotal(0);
      toast.success('History cleared');
    } catch {
      toast.error('Failed to clear history');
    } finally {
      setClearing(false);
      setShowClearConfirm(false);
    }
  };

  const handleClearItem = async (id) => {
    try {
      await historyApi.clearHistory(id);
      setItems(prev => prev.filter(i => (i._id || i.contentId) !== id));
      setTotal(prev => prev - 1);
      toast.success('Item removed');
    } catch {
      toast.error('Failed to remove item');
    }
  };

  // Group items by date
  const grouped = {};
  for (const item of items) {
    const date = item.watchedAt ? new Date(item.watchedAt).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    }) : 'Unknown';
    if (!grouped[date]) grouped[date] = [];
    grouped[date].push(item);
  }

  if (loading) return <div className="min-h-screen bg-netflix-dark"><Header /><PageSkeleton /></div>;

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />
      <div className="pt-20 px-6 md:px-12 pb-12 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            Watch History
            {total > 0 && <span className="text-netflix-text-3 text-lg font-normal ml-2">({total})</span>}
          </h1>
          {total > 0 && (
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-netflix-red transition-colors"
            >
              Clear All
            </button>
          )}
        </div>

        {error && <ErrorState message={error} onRetry={fetchHistory} />}

        {!error && items.length === 0 && !loading && (
          <div className="pt-12">
            <EmptyState
              icon="🕐"
              title="No watch history yet"
              message="Start watching content and your history will appear here."
              action={
                <Link to="/" className="btn-primary">
                  Browse Content
                </Link>
              }
            />
          </div>
        )}

        {/* Timeline */}
        <div className="space-y-8">
          {Object.entries(grouped).map(([dateLabel, dateItems]) => (
            <div key={dateLabel}>
              <h2 className="text-sm font-semibold text-netflix-text-3 uppercase tracking-wider mb-3">
                {dateLabel}
              </h2>
              <div className="space-y-2">
                {dateItems.map((item, idx) => {
                  const slug = item.slug;
                  const posterUrl = item.posterPath
                    ? `${TMDB_IMAGE_BASE}/w92${item.posterPath}`
                    : null;

                  const time = item.watchedAt
                    ? new Date(item.watchedAt).toLocaleTimeString('en-US', {
                        hour: '2-digit', minute: '2-digit',
                      })
                    : '';

                  const contentType = item.contentType || 'movie';
                  const linkTo = `/watch/${contentType}/${slug}`;

                  return (
                    <div key={item._id || idx} className="flex items-center gap-3 bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-3 hover:border-netflix-border/40 transition-colors group">
                      {/* Poster */}
                      <Link to={linkTo} className="flex-shrink-0 w-12 h-[68px] rounded overflow-hidden bg-netflix-dark-3">
                        {posterUrl ? (
                          <img src={posterUrl} alt={item.title} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-lg">🎬</div>
                        )}
                      </Link>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <Link to={linkTo} className="text-white text-sm font-medium hover:text-netflix-red transition-colors truncate block">
                          {item.title}
                          {item.episodeName && (
                            <span className="text-netflix-text-3 font-normal ml-1">— {item.episodeName}</span>
                          )}
                        </Link>
                        <div className="flex items-center gap-2 text-xs text-netflix-text-3 mt-0.5">
                          <span className="text-[10px] px-1 py-0.5 rounded border border-netflix-border/40 uppercase">
                            {item.type === 'episode' ? 'TV' : 'Movie'}
                          </span>
                          {time && <span>{time}</span>}
                          {item.progressPercent > 0 && (
                            <span className="text-netflix-green">{item.progressPercent}% watched</span>
                          )}
                        </div>
                      </div>

                      {/* Remove button */}
                      <button
                        onClick={() => handleClearItem(item.contentId || item._id)}
                        className="flex-shrink-0 w-7 h-7 rounded-full bg-netflix-dark-3 hover:bg-netflix-red/80
                          flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200"
                        aria-label="Remove from history"
                      >
                        <svg className="w-3.5 h-3.5 text-netflix-text-2 group-hover:text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                        </svg>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 text-sm rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <span className="text-netflix-text-3 text-sm">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-4 py-2 text-sm rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showClearConfirm}
        title="Clear Watch History"
        message="Are you sure you want to clear your entire watch history? This cannot be undone."
        confirmLabel={clearing ? 'Clearing...' : 'Clear All'}
        onConfirm={handleClearAll}
        onCancel={() => setShowClearConfirm(false)}
        loading={clearing}
      />
    </div>
  );
}
