import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { contentApi } from '../api/content.api';
import Header from '../components/layout/Header';
import ContentCard from '../components/content/ContentCard';
import { CardSkeleton } from '../components/ui/LoadingSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

const CATEGORY_META = {
  hollywood: { label: 'Hollywood', icon: '🇺🇸', description: 'Popular English-language movies and series' },
  bollywood: { label: 'Bollywood', icon: '🇮🇳', description: 'Hindi-language films and shows' },
  korean: { label: 'Korean', icon: '🇰🇷', description: 'K-dramas, Korean films and variety shows' },
  'south-indian': { label: 'South Indian', icon: '🇮🇳', description: 'Tamil, Telugu, Malayalam, and Kannada cinema' },
};

export default function CategoryPage() {
  const { category } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const meta = CATEGORY_META[category] || {
    label: category?.charAt(0).toUpperCase() + category?.slice(1) || 'Category',
    icon: '📁',
    description: 'Browse content in this category',
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await contentApi.getByCategory(category, { page, limit: 20 });
      setItems(result.items || []);
      setPagination(result.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load category');
    } finally {
      setLoading(false);
    }
  }, [category, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams(searchParams);
    params.set('page', String(newPage));
    setSearchParams(params);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPageRange = () => {
    if (!pagination) return [];
    const total = pagination.totalPages || 1;
    const current = pagination.page || 1;
    const range = [];
    const start = Math.max(1, current - 2);
    const end = Math.min(total, current + 2);
    for (let i = start; i <= end; i++) range.push(i);
    return range;
  };

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />

      <div className="pt-24 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">{meta.icon}</span>
            <h1 className="text-2xl md:text-3xl font-bold text-white">{meta.label}</h1>
          </div>
          <p className="text-netflix-text-2 text-sm">{meta.description}</p>
        </div>

        {/* Items count */}
        {!loading && !error && items.length > 0 && pagination && (
          <div className="mb-6 pb-4 border-b border-netflix-border">
            <p className="text-netflix-text-2 text-sm">
              {pagination.total?.toLocaleString() || items.length} items
            </p>
          </div>
        )}

        {/* Content */}
        {error && <ErrorState message={error} onRetry={fetchItems} />}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {Array.from({ length: 18 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="mt-12">
            <EmptyState
              icon={meta.icon}
              title={`No content in ${meta.label}`}
              description="Content is being added to this category. Check back soon!"
            />
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
              {items.map((item, i) => (
                <ContentCard key={item._id || item.tmdbId || i} item={item} />
              ))}
            </div>

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-10 mb-12">
                <button
                  onClick={() => handlePageChange(page - 1)}
                  disabled={page <= 1}
                  className="w-9 h-9 rounded flex items-center justify-center text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Previous page"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
                  </svg>
                </button>

                {getPageRange().map((p) => (
                  <button
                    key={p}
                    onClick={() => handlePageChange(p)}
                    className={`min-w-[36px] h-9 rounded text-sm font-medium transition-all duration-200 ${
                      p === page
                        ? 'bg-netflix-red text-white shadow-sm scale-105'
                        : 'text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3'
                    }`}
                  >
                    {p}
                  </button>
                ))}

                <button
                  onClick={() => handlePageChange(page + 1)}
                  disabled={page >= (pagination?.totalPages || 1)}
                  className="w-9 h-9 rounded flex items-center justify-center text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Next page"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
                  </svg>
                </button>
              </div>
            )}

            {pagination && (
              <p className="text-center text-netflix-text-3 text-xs mb-8">
                Page {pagination.page} of {pagination.totalPages?.toLocaleString() || '?'}
                {pagination.total && ` · ${pagination.total.toLocaleString()} total items`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
