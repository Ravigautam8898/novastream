import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import favoritesApi from '../api/favorites.api';
import Header from '../components/layout/Header';
import { CardSkeleton } from '../components/ui/LoadingSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

import { TMDB_IMAGE_BASE } from '../config/images';

export default function MyListPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);
  const [removing, setRemoving] = useState(false);

  const fetchFavorites = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await favoritesApi.getFavorites();
      // Handle both array and { items: [...] } response formats defensively
      if (Array.isArray(data)) {
        setItems(data);
      } else if (data && Array.isArray(data.items)) {
        setItems(data.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load favorites');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchFavorites(); }, [fetchFavorites]);

  const handleToggle = async (contentId) => {
    // Optimistic removal
    setItems((prev) => prev.filter((item) => item._id !== contentId));
    try {
      await favoritesApi.toggleFavorite(contentId);
      toast.success('Removed from My List');
    } catch (err) {
      // Revert on error
      toast.error('Failed to remove');
      fetchFavorites();
    }
  };

  const year = (item) =>
    item.releaseDate
      ? new Date(item.releaseDate).getFullYear()
      : item.firstAirDate
        ? new Date(item.firstAirDate).getFullYear()
        : null;

  if (loading) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <div className="pt-20 px-6 md:px-12 max-w-7xl mx-auto">
          <div className="h-8 w-40 rounded shimmer mb-6" />
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 18 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <div className="pt-20 px-6">
          <ErrorState message={error} onRetry={fetchFavorites} />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <div className="pt-20">
          <EmptyState
            icon="❤️"
            title="Your list is empty"
            message="Browse content and add your favorites by tapping the + icon on any movie or show."
            action={
              <Link to="/" className="btn-primary inline-block mt-4">
                Browse Content
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />
      <div className="pt-20 px-6 md:px-12 max-w-7xl mx-auto pb-12">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-white">
            My List
            <span className="text-netflix-text-3 text-base font-normal ml-2">
              ({items.length} {items.length === 1 ? 'item' : 'items'})
            </span>
          </h1>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {items.map((item) => (
            <div key={item._id} className="group relative">
              {/* Poster */}
              <Link
                to={`/watch/${item.contentType || 'movie'}/${item.slug}`}
                className="block aspect-[2/3] rounded-lg overflow-hidden bg-netflix-dark-2 relative"
              >
                {item.posterPath ? (
                  <img
                    src={`${TMDB_IMAGE_BASE}/w342${item.posterPath}`}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-netflix-dark-3">
                    <span className="text-3xl">🎬</span>
                  </div>
                )}

                {/* Gradient overlay + play button on hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors duration-300 flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-netflix-red/90 opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-center justify-center transform group-hover:scale-100 scale-50">
                    <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </Link>

              {/* Remove button (top-right corner) */}
              <button
                onClick={() => handleToggle(item._id)}
                className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-netflix-red/90 backdrop-blur-sm
                  flex items-center justify-center opacity-80 hover:opacity-100 transition-all duration-200 hover:scale-110 z-10"
                aria-label={`Remove ${item.title} from My List`}
                title="Remove from My List"
              >
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>

              {/* Title + meta */}
              <div className="mt-2 px-0.5">
                <p className="text-sm text-white truncate font-medium">{item.title}</p>
                <div className="flex items-center gap-2 text-xs text-netflix-text-3">
                  {year(item) && <span>{year(item)}</span>}
                  {item.voteAverage > 0 && (
                    <span className="text-netflix-green">★ {item.voteAverage.toFixed(1)}</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
