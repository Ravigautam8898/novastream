import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { contentApi } from '../api/content.api';
import { favoritesApi } from '../api/favorites.api';
import { dedupeContentList } from '../utils/contentIdentity';
import Header from '../components/layout/Header';
import HeroCarousel from '../components/content/HeroCarousel';
import ContentRow from '../components/content/ContentRow';
import { PageSkeleton } from '../components/ui/LoadingSkeleton';
import EmptyState from '../components/ui/EmptyState';
import ErrorState from '../components/ui/ErrorState';

/** Fetch wrapper with AbortController timeout */
function fetchWithTimeout(promiseFactory, timeoutMs = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return promiseFactory(controller.signal).finally(() => clearTimeout(timeoutId));
}

export default function HomePage() {
  const navigate = useNavigate();
  const [sections, setSections] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [topTenItems, setTopTenItems] = useState([]);
  const [genreSections, setGenreSections] = useState([]);
  const [allGenres, setAllGenres] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);

      // Fire all independent requests in parallel via Promise.allSettled
      // so a slow or failing section fetch doesn't block the entire homepage.
      const [sectionResult, progressResult, favResult] = await Promise.allSettled([
        fetchWithTimeout((signal) => contentApi.getHomepageSections({ signal })),
        fetchWithTimeout((signal) => contentApi.getContinueWatching({ signal })),
        fetchWithTimeout((signal) => favoritesApi.getFavorites({ signal })),
      ]);

      if (cancelled) return;

      // Sections — primary data source
      if (sectionResult.status === 'fulfilled') {
        const rawSections = Array.isArray(sectionResult.value) ? sectionResult.value : [];
        setSections(rawSections);

        // D-002: Extract Top 10 items — weighted sort by voteAverage + popularity
        // D-010: Must deduplicate BEFORE sort+slice to avoid duplicates from
        // items appearing in multiple sections (e.g., FROM in Trending + Popular).
        const trendingItems = dedupeContentList(
          rawSections.flatMap((s) => s.items || [])
        )
          .filter((item) => item.voteAverage || item.popularity)
          .sort((a, b) => {
            const scoreA = (a.voteAverage || 0) * 10 + Math.min((a.popularity || 0) / 10, 10);
            const scoreB = (b.voteAverage || 0) * 10 + Math.min((b.popularity || 0) / 10, 10);
            return scoreB - scoreA;
          })
          .slice(0, 10);
        if (trendingItems.length >= 3) {
          setTopTenItems(trendingItems);
        }

        // D-003: Extract unique genres from all items for genre rails
        // D-010: Uses dedupeContentList to ensure no duplicate items per genre
        const genreMap = new Map();
        const allFlatItems = dedupeContentList(
          rawSections.flatMap((s) => s.items || [])
        );
        allFlatItems.forEach((item) => {
          (item.genres || []).forEach((genre) => {
            const genreName = genre.name || genre;
            if (!genreMap.has(genreName)) {
              genreMap.set(genreName, []);
            }
            genreMap.get(genreName).push(item);
          });
        });
        // Only include genres with at least 4 items
        const validGenres = [];
        genreMap.forEach((items, name) => {
          if (items.length >= 4) {
            validGenres.push({ name, items: items.slice(0, 20) });
          }
        });
        setGenreSections(validGenres.slice(0, 4)); // Max 4 genre rails

        // D-005: Extract unique flat genre list for quick access chips
        const allGenres = [];
        const seenGenres = new Set();
        rawSections.forEach((section) => {
          (section.items || []).forEach((item) => {
            (item.genres || []).forEach((genre) => {
              const genreName = genre.name || genre;
              if (!seenGenres.has(genreName)) {
                seenGenres.add(genreName);
                allGenres.push({ name: genreName, id: genre.id || genreName });
              }
            });
          });
        });
        setAllGenres(allGenres);
      } else {
        setError(
          sectionResult.reason?.response?.data?.message
            || sectionResult.reason?.message
            || 'Failed to load homepage'
        );
        setLoading(false);
        return;
      }

      // Continue watching — non-critical, silently ignored on failure
      if (progressResult.status === 'fulfilled') {
        const data = progressResult.value;
        setContinueWatching(
          Array.isArray(data?.items) ? data.items : []
        );
      }

      // Favorites — non-critical, silently ignored on failure
      if (favResult.status === 'fulfilled') {
        const data = favResult.value;
        // Handle both array and { items: [...] } response formats defensively
        let items = [];
        if (Array.isArray(data)) {
          items = data;
        } else if (data && Array.isArray(data.items)) {
          items = data.items;
        }
        setFavorites(items);
        setFavoriteIds(new Set(items.map(i => i._id)));
      }

      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, []);

  const handleToggleFavorite = useCallback(async (item) => {
    const contentId = item._id;
    const wasFavorited = favoriteIds.has(contentId);

    // Optimistic update
    setFavoriteIds(prev => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(contentId); else next.add(contentId);
      return next;
    });
    if (wasFavorited) {
      setFavorites(prev => prev.filter(f => f._id !== contentId));
    } else {
      setFavorites(prev => [item, ...prev]);
    }

    try {
      const result = await favoritesApi.toggleFavorite(contentId);
      if (!result.isFavorited) {
        // Removed — ensure it's gone from state
        setFavorites(prev => prev.filter(f => f._id !== contentId));
        setFavoriteIds(prev => { const n = new Set(prev); n.delete(contentId); return n; });
      }
    } catch {
      // Revert on failure
      setFavoriteIds(prev => {
        const next = new Set(prev);
        if (wasFavorited) next.add(contentId); else next.delete(contentId);
        return next;
      });
      if (wasFavorited) {
        setFavorites(prev => [item, ...prev]);
      } else {
        setFavorites(prev => prev.filter(f => f._id !== contentId));
      }
    }
  }, [favoriteIds]);

  if (loading) return <PageSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <ErrorState message={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <div className="pt-20">
          <EmptyState
            icon="🏠"
            title="Welcome to NovaStream"
            description="Content is being populated. Check back soon!"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />

      {/* Hero carousel (first section with hero layout) */}
      {sections[0]?.layout === 'hero' && sections[0]?.items?.length > 0 && (
        <HeroCarousel items={sections[0].items} />
      )}

      {/* D-005: Genre Quick Access Chips */}
      {allGenres.length > 0 && (
        <div className={sections[0]?.layout === 'hero' ? 'pt-4 md:pt-6' : 'pt-20'}>
          <div className="px-6 md:px-12 overflow-x-auto scrollbar-none" style={{ scrollbarWidth: 'none' }}>
            <div className="flex gap-2 md:gap-3 pb-2">
              <span className="flex-shrink-0 text-netflix-text-2 text-xs md:text-sm font-medium py-1.5 px-1">
                Genres:
              </span>
              {allGenres.map((genre) => (
                <button
                  key={genre.id}
                  onClick={() => navigate(`/category/${encodeURIComponent(genre.name.toLowerCase())}`)}
                  className="flex-shrink-0 text-xs md:text-sm text-netflix-text-2 border border-netflix-border/50
                    hover:border-netflix-red/60 hover:text-white hover:bg-netflix-red/10
                    rounded-full px-3 md:px-4 py-1.5 transition-all duration-200 active:scale-95"
                >
                  {genre.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Content rows */}
      <div className={sections[0]?.layout === 'hero' ? '-mt-16 md:-mt-20 relative z-10' : 'pt-20'}>
        {/* My List (Favorites) — only shown when user has items */}
        {favorites.length > 0 && (
          <ContentRow
            title="My List"
            items={favorites}
            layout="row"
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {/* Continue Watching (most recent first) */}
        {continueWatching.length > 0 && (
          <ContentRow
            title="Continue Watching"
            items={continueWatching}
            layout="row"
            onDismiss={(item) => {
              // Use episodeId for episode entries, content _id for movies
              const dismissId = item.episodeId || item._id;
              const contentType = item.episodeId ? 'episode' : 'movie';

              // Remove from local state immediately for instant feedback
              setContinueWatching((prev) =>
                prev.filter((cw) => (cw.episodeId || cw._id) !== dismissId)
              );

              // Fire-and-forget API call
              contentApi.removeFromContinueWatching(dismissId, contentType)
                .catch(() => {
                  // Revert on failure
                  setContinueWatching((prev) => [...prev, item]);
                });
            }}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {/* D-002: Top 10 Ranking Rail */}
        {topTenItems.length >= 3 && (
          <ContentRow
            title="Top 10 Today"
            items={topTenItems}
            layout="row"
            showRank={true}
            showNewBadge={false}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
          />
        )}

        {sections.map((section) => {
          // Skip hero section (already rendered above)
          if (section.layout === 'hero') return null;

          return (
            <ContentRow
              key={section.id}
              title={section.title}
              items={section.items}
              layout={section.layout}
              showNewBadge={true}
              favoriteIds={favoriteIds}
              onToggleFavorite={handleToggleFavorite}
            />
          );
        })}

        {/* D-003: Genre Rails — group items by genre */}
        {genreSections.map((genreSection) => (
          <ContentRow
            key={`genre-${genreSection.name}`}
            title={`${genreSection.name} Movies`}
            items={genreSection.items}
            layout="row"
            showNewBadge={true}
            favoriteIds={favoriteIds}
            onToggleFavorite={handleToggleFavorite}
          />
        ))}
      </div>
    </div>
  );
}
