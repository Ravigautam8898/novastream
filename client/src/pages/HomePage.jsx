import { useEffect, useState, useCallback } from 'react';
import { contentApi } from '../api/content.api';
import { favoritesApi } from '../api/favorites.api';
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
  const [sections, setSections] = useState([]);
  const [continueWatching, setContinueWatching] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
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
        setSections(Array.isArray(sectionResult.value) ? sectionResult.value : []);
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

        {sections.map((section) => {
          // Skip hero section (already rendered above)
          if (section.layout === 'hero') return null;

          return (
            <ContentRow
              key={section.id}
              title={section.title}
              items={section.items}
              layout={section.layout}
            />
          );
        })}
      </div>
    </div>
  );
}
