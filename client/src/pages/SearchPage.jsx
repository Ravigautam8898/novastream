import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { contentApi } from '../api/content.api';
import { sanitizeSearchInput } from '../utils/sanitize';
import Header from '../components/layout/Header';
import ContentCard from '../components/content/ContentCard';
import { CardSkeleton } from '../components/ui/LoadingSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

const TYPE_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'series', label: 'Series' },
];

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const type = searchParams.get('type') || 'all';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = useState(query ? sanitizeSearchInput(query) : '');
  // PF-008/PF-009: Debounce input state updates so keystrokes don't re-render the results grid.
  // Keep a controlled `value` for the input so programmatic clears still work,
  // but use a separate display value that only updates after 300ms of inactivity.
  const [displayValue, setDisplayValue] = useState(searchInput);
  const debounceTimerRef = useRef(null);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const doSearch = useCallback(async (q, pageNum = 1) => {
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await contentApi.search({ q: q.trim(), type, page: pageNum, limit: 20 });
      setItems(result.items || []);
      setPagination(result.pagination || null);
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Search failed');
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    if (query) {
      doSearch(query, page);
      setSearchInput(query);
    }
  }, [query, type, page, doSearch]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const sanitized = sanitizeSearchInput(searchInput);
    if (sanitized) {
      const params = { q: sanitized };
      if (type !== 'all') params.type = type;
      setSearchParams(params);
    }
  };

  const updateFilter = (filter) => {
    const params = new URLSearchParams();
    if (query) params.set('q', sanitizeSearchInput(query));
    if (filter !== 'all') params.set('type', filter);
    setSearchParams(params);
  };

  const handlePageChange = (newPage) => {
    const params = new URLSearchParams();
    params.set('q', query);
    if (type !== 'all') params.set('type', type);
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

  // Group results by contentType for categorized display
  // React's JSX escaping already provides XSS protection for text content;
  // per-item sanitizeHtml is unnecessary overhead (FE-012).
  const groupedItems = useMemo(() =>
    items.reduce((acc, item) => {
      const ct = item.contentType === 'movie' ? 'Movies' : 'Series';
      if (!acc[ct]) acc[ct] = [];
      acc[ct].push(item);
      return acc;
    }, {}),
    [items]
  );

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />

      <div className="pt-24 px-6 md:px-12 max-w-7xl mx-auto">
        {/* Search Bar */}
        <form onSubmit={handleSubmit} className="mb-6">
          <div className="flex gap-3 max-w-2xl mx-auto">
            <div className="relative flex-1">
              <svg
                className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-netflix-text-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              {/* PF-008/PF-009: Debounced input — searchInput state only updates after 300ms of
                  inactivity, preventing full-page re-renders on each keystroke. The input uses a
                  controlled `value` (displayValue) that updates immediately on keystroke so the
                  UI remains responsive, while the actual search state is debounced. */}
              <input
                type="text"
                value={displayValue}
                onChange={(e) => {
                  const val = e.target.value;
                  setDisplayValue(val); // Update display immediately
                  if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
                  debounceTimerRef.current = setTimeout(() => {
                    setSearchInput(val); // Debounce the actual state update
                  }, 300);
                }}
                placeholder="Search movies, series, actors..."
                className="input-field flex-1 text-lg py-3 pl-12 rounded-xl"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="btn-primary px-8 rounded-xl"
              disabled={loading || !searchInput.trim()}
            >
              {loading ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin block" />
              ) : (
                'Search'
              )}
            </button>
          </div>
        </form>

        {/* Type Filter Tabs */}
        {query && (
          <div className="flex items-center justify-center gap-1 mb-6">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => updateFilter(f.value)}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
                  type === f.value
                    ? 'bg-netflix-red text-white shadow-sm'
                    : 'text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Results */}
        {error && (
          <div className="mt-8">
            <ErrorState message={error} onRetry={() => doSearch(query, page)} />
          </div>
        )}

        {loading && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 mt-4">
            {Array.from({ length: 18 }).map((_, i) => (
              <CardSkeleton key={i} />
            ))}
          </div>
        )}

        {!loading && !error && query && items.length === 0 && (
          <div className="mt-12">
            <EmptyState
              icon="🔍"
              title={`No results for "${query}"`}
              description="Try a different search term or adjust the content type filter."
              action={
                <button
                  onClick={() => {
                    setSearchInput('');
                    setDisplayValue('');
                    setSearchParams({});
                  }}
                  className="btn-secondary mt-4"
                >
                  Clear search
                </button>
              }
            />
          </div>
        )}

        {!loading && !error && items.length > 0 && (
          <>
            {/* Results count */}
            <div className="text-center mb-6">
              <p className="text-netflix-text-2 text-sm">
                {pagination?.total
                  ? `${pagination.total.toLocaleString()} results`
                  : `${items.length} results`}
                {query && (
                  <> for "<span className="text-netflix-text font-medium">{query}</span>"</>
                )}
              </p>
            </div>

            {/* Categorized Results */}
            {Object.entries(groupedItems).map(([groupName, groupItems]) => (
              <div key={groupName} className="mb-8">
                {Object.keys(groupedItems).length > 1 && (
                  <h3 className="text-lg font-semibold text-white mb-4">{groupName}</h3>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2 md:gap-3">
                  {groupItems.map((item, i) => (
                    <ContentCard key={item._id || item.tmdbId || i} item={item} />
                  ))}
                </div>
              </div>
            ))}

            {/* Pagination */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8 mb-12">
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

            {/* Page info */}
            {pagination && pagination.totalPages > 1 && (
              <p className="text-center text-netflix-text-3 text-xs mb-8">
                Page {pagination.page} of {pagination.totalPages?.toLocaleString() || '?'}
              </p>
            )}
          </>
        )}

        {/* Initial state — no query */}
        {!query && !loading && (
          <div className="mt-20">
            <EmptyState
              icon="🔍"
              title="Search NovaStream"
              description="Find your favorite movies and series from our library of thousands of titles."
            >
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                {['Action', 'Comedy', 'Drama', 'Horror', 'Sci-Fi', 'Thriller'].map((genre) => (
                  <button
                    key={genre}
                    onClick={() => {
                      setSearchInput(genre);
                      setSearchParams({ q: genre });
                    }}
                    className="px-4 py-2 bg-netflix-dark-2 hover:bg-netflix-dark-3 border border-netflix-border rounded-full
                      text-netflix-text-2 hover:text-white text-sm transition-all duration-200"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  );
}
