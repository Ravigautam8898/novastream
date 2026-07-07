import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { contentApi } from '../api/content.api';
import { favoritesApi } from '../api/favorites.api';
import Header from '../components/layout/Header';
import ContentRow from '../components/content/ContentRow';
import EpisodeList from '../components/content/EpisodeList';
import { DetailSkeleton } from '../components/ui/LoadingSkeleton';
import ErrorState from '../components/ui/ErrorState';

import { TMDB_IMAGE_BASE } from '../config/images';

/**
 * DetailPage — Full detail view for movies and series.
 *
 * Sections:
 *   - Full-width backdrop hero with gradient overlays
 *   - Poster + metadata (title, year, runtime, rating, genres, tagline)
 *   - Overview + action buttons
 *   - Cast grid (scrollable)
 *   - Trailers section (YouTube embeds)
 *   - Series: Season selector with episode list
 *   - Similar/related content row
 */
export default function DetailPage() {
  const { contentType, slug } = useParams();
  const navigate = useNavigate();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedSeason, setSelectedSeason] = useState(null);
  const [expandedVideo, setExpandedVideo] = useState(null);
  const [isFavorited, setIsFavorited] = useState(false);
  const [favToggling, setFavToggling] = useState(false);

  const isMovie = contentType === 'movie';

  // Navigate to WatchPage with episode pre-selected
  const handlePlayEpisode = useCallback((episode) => {
    navigate(`/watch/${contentType}/${slug}/play`, {
      state: { initialEpisode: episode },
    });
  }, [navigate, contentType, slug]);

  // Sync the Play button label when user switches season tabs in EpisodeList
  const handleSeasonChange = useCallback((season) => {
    setSelectedSeason(season);
  }, []);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // C5c: All content uses Nova slug — no tmdb- bridge
      const data = isMovie
        ? await contentApi.getMovieBySlug(slug)
        : await contentApi.getSeriesBySlug(slug);
      setItem(data);
      // Auto-select first season for series
      if (!isMovie && data.seasons && data.seasons.length > 0) {
        setSelectedSeason(data.seasons[0]);
      }

      // Unblock rendering — page shows immediately with content data.
      // The favorites check fires asynchronously in the background
      // and updates the button state when it resolves.
      // This avoids blocking the entire page render for 3-12 seconds
      // on a non-critical request.
      setLoading(false);

      // Check favorite state (non-blocking — runs after page renders)
      if (data._id) {
        favoritesApi.checkFavorite(data._id).then((favResult) => {
          setIsFavorited(favResult.isFavorited);
        }).catch(() => {
          // Favorites check failed — non-critical
        });
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load details');
      setLoading(false);
    }
  }, [contentType, slug, isMovie]);

  const handleToggleFavorite = useCallback(async () => {
    if (!item?._id || favToggling) return;
    setFavToggling(true);
    try {
      const result = await favoritesApi.toggleFavorite(item._id);
      setIsFavorited(result.isFavorited);
      toast.success(result.isFavorited ? 'Added to My List' : 'Removed from My List');
    } catch (err) {
      toast.error('Failed to update favorites');
    } finally {
      setFavToggling(false);
    }
  }, [item?._id, favToggling]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  if (loading) return <DetailSkeleton />;

  if (error) {
    return (
      <div className="min-h-screen bg-netflix-dark">
        <Header />
        <div className="pt-24 px-6">
          <ErrorState message={error} onRetry={fetchDetail} />
        </div>
      </div>
    );
  }

  if (!item) return null;

  const backdropUrl = item.backdropPath
    ? `${TMDB_IMAGE_BASE}/w1280${item.backdropPath}`
    : null;

  const posterUrl = item.posterPath
    ? `${TMDB_IMAGE_BASE}/w342${item.posterPath}`
    : null;

  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : item.firstAirDate
      ? new Date(item.firstAirDate).getFullYear()
      : null;

  // Filter videos to prioritize Trailers
  const sortedVideos = item.videos
    ? [...item.videos].sort((a, b) => {
        const typeOrder = { Trailer: 0, Teaser: 1, Featurette: 2, Clip: 3 };
        return (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
      })
    : [];

  // Format runtime
  const formatRuntime = (minutes) => {
    if (!minutes) return null;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  return (
    <div className="min-h-screen bg-netflix-dark">
      <Header />

      {/* ── Backdrop Hero ── */}
      <div className="relative w-full h-[50vh] md:h-[65vh] lg:h-[70vh] min-h-[350px]">
        {backdropUrl ? (
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${backdropUrl})` }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-netflix-dark-2 via-netflix-dark to-netflix-dark-3" />
        )}

        {/* Gradient overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark via-netflix-dark/40 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-netflix-dark/90 via-netflix-dark/30 to-transparent" />

        {/* Content overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 lg:p-16">
          <div className="flex items-start gap-6 md:gap-8">
            {/* Poster (visible on tablet+) */}
            <div className="hidden md:block flex-shrink-0 w-[180px] lg:w-[220px] rounded-lg overflow-hidden shadow-2xl -mb-24 relative z-10">
              {posterUrl ? (
                <img src={posterUrl} alt={item.title} className="w-full aspect-[2/3] object-cover" />
              ) : (
                <div className="w-full aspect-[2/3] bg-netflix-dark-3 flex items-center justify-center">
                  <span className="text-3xl">🎬</span>
                </div>
              )}
            </div>

            {/* Text content */}
            <div className="flex-1 min-w-0 pb-4">
              {/* Back button */}
              <button
                onClick={() => navigate(-1)}
                className="flex items-center gap-1.5 text-netflix-text-2 hover:text-white text-sm mb-3 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
                </svg>
                Back
              </button>

              {/* Title */}
              <h1 className="text-2xl md:text-4xl lg:text-5xl font-bold text-white mb-2 drop-shadow-lg">
                {item.title}
              </h1>

              {/* Tagline */}
              {item.tagline && (
                <p className="text-netflix-text-2 text-sm md:text-base italic mb-3">
                  &ldquo;{item.tagline}&rdquo;
                </p>
              )}

              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm mb-3">
                {year && (
                  <span className="text-netflix-text font-medium">{year}</span>
                )}
                {isMovie && item.runtime && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-netflix-text-3" />
                    <span className="text-netflix-text-2">{formatRuntime(item.runtime)}</span>
                  </>
                )}
                {!isMovie && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-netflix-text-3" />
                    <span className="text-netflix-text-2">
                      {item.numberOfSeasons} Season{item.numberOfSeasons !== 1 ? 's' : ''}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-netflix-text-3" />
                    <span className="text-netflix-text-2">
                      {item.numberOfEpisodes} Episode{item.numberOfEpisodes !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
                {item.voteAverage > 0 && (
                  <>
                    <span className="w-1 h-1 rounded-full bg-netflix-text-3" />
                    <span className="flex items-center gap-1 text-netflix-green font-semibold">
                      <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                      </svg>
                      {item.voteAverage.toFixed(1)}
                    </span>
                  </>
                )}
                <span className="bg-netflix-red/90 text-white text-[11px] font-semibold px-2 py-0.5 rounded uppercase">
                  {isMovie ? 'Movie' : 'Series'}
                </span>
              </div>

              {/* Genres */}
              {item.genres && item.genres.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {item.genres.map((genre) => (
                    <span
                      key={genre.id || genre.name}
                      className="text-xs text-netflix-text-2 border border-netflix-border/60 rounded-full px-2.5 py-0.5
                        hover:border-netflix-text-2 hover:text-white transition-colors duration-200 cursor-pointer"
                      onClick={() => navigate(`/search?q=${encodeURIComponent(genre.name)}`)}
                    >
                      {genre.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 mt-4">
                <button
                  onClick={() => {
                    if (!isMovie && selectedSeason?.episodes?.length > 0) {
                      // Pass the first episode so WatchPage auto-selects it and shows "Playing" badge
                      handlePlayEpisode(selectedSeason.episodes[0]);
                    } else {
                      navigate(`/watch/${contentType}/${slug}/play`);
                    }
                  }}
                  className="flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold px-6 py-2.5 rounded text-sm md:text-base transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Play{!isMovie && selectedSeason?.episodes?.length > 0 ? ` S${selectedSeason.seasonNumber} · E${selectedSeason.episodes[0].episodeNumber}` : ''}
                </button>
                <button
                  onClick={handleToggleFavorite}
                  disabled={favToggling}
                  className={`flex items-center gap-2 px-6 py-2.5 rounded text-sm md:text-base transition-all duration-200 active:scale-95 border ${
                    isFavorited
                      ? 'bg-netflix-red text-white border-netflix-red hover:bg-netflix-red/90'
                      : 'bg-netflix-dark-3/80 hover:bg-netflix-dark-3 text-white border-white/10 hover:scale-105'
                  }`}
                >
                  {favToggling ? (
                    <svg className="w-5 h-5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12a9 9 0 11-6.219-8.56" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill={isFavorited ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={isFavorited ? '0' : '2'}>
                      <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                    </svg>
                  )}
                  {isFavorited ? 'In My List' : 'My List'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="px-6 md:px-12 lg:px-16 max-w-7xl mx-auto">
        {/* Spacer for poster overlap on desktop */}
        <div className="hidden md:block h-16" />

        {/* Overview */}
        <div className="max-w-3xl mb-8">
          <h2 className="text-lg font-semibold text-white mb-3">Overview</h2>
          <p className="text-netflix-text-2 text-sm md:text-base leading-relaxed">
            {item.overview || 'No overview available.'}
          </p>

          {/* Additional metadata */}
          <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4 text-sm">
            {item.categories && item.categories.length > 0 && (
              <div>
                <span className="text-netflix-text-3">Categories: </span>
                <span className="text-netflix-text-2">{item.categories.join(', ')}</span>
              </div>
            )}
            {item.languages && item.languages.length > 0 && (
              <div>
                <span className="text-netflix-text-3">Languages: </span>
                <span className="text-netflix-text-2">{item.languages.join(', ')}</span>
              </div>
            )}
            {item.homepage && (
              <div>
                <a
                  href={item.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-netflix-red hover:underline"
                >
                  Official Website →
                </a>
              </div>
            )}
            {item.productionCompanies && item.productionCompanies.length > 0 && (
              <div>
                <span className="text-netflix-text-3">Production: </span>
                <span className="text-netflix-text-2">
                  {item.productionCompanies.map((c) => c.name).join(', ')}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Series: Episode List (inline, like Netflix/Prime Video) ── */}
        {!isMovie && item.seasons && item.seasons.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
              <svg className="w-4 h-4 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Episodes
            </h2>
            <EpisodeList
              seasons={item.seasons}
              slug={slug}
              onSelectEpisode={handlePlayEpisode}
              onSeasonChange={handleSeasonChange}
            />
          </div>
        )}

        {/* ── Cast Grid ── */}
        {item.cast && item.cast.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">Cast</h2>
            <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-none -mx-6 md:-mx-12 lg:-mx-16 px-6 md:px-12 lg:px-16">
              {item.cast.map((actor) => {
                const profileUrl = actor.profilePath
                  ? `${TMDB_IMAGE_BASE}/w185${actor.profilePath}`
                  : null;
                return (
                  <div
                    key={actor.tmdbId || actor.name}
                    className="flex-shrink-0 w-[120px] group"
                  >
                    <div className="w-[120px] h-[120px] rounded-full overflow-hidden bg-netflix-dark-3 mb-2 mx-auto">
                      {profileUrl ? (
                        <img
                          src={profileUrl}
                          alt={actor.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-netflix-text-3 text-2xl">
                          {actor.name.charAt(0)}
                        </div>
                      )}
                    </div>
                    <p className="text-white text-xs font-medium text-center truncate">{actor.name}</p>
                    {actor.character && (
                      <p className="text-netflix-text-3 text-[11px] text-center truncate">{actor.character}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Trailers / Videos ── */}
        {sortedVideos.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-3">
              {sortedVideos.some((v) => v.type === 'Trailer') ? 'Trailers' : 'Videos'}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sortedVideos.slice(0, 6).map((video) => {
                const isExpanded = expandedVideo === video._id;
                return (
                  <div
                    key={video._id || video.key}
                    className="relative aspect-video rounded-lg overflow-hidden bg-netflix-dark-2 group cursor-pointer"
                    onClick={() => setExpandedVideo(isExpanded ? null : video._id)}
                  >
                    {isExpanded ? (
                      <iframe
                        src={`https://www.youtube.com/embed/${video.key}?autoplay=1`}
                        title={video.name}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    ) : (
                      <>
                        <img
                          src={`https://img.youtube.com/vi/${video.key}/mqdefault.jpg`}
                          alt={video.name}
                          loading="lazy"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/30 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                          <div className="w-12 h-12 rounded-full bg-netflix-red/90 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          </div>
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
                          <p className="text-white text-xs font-medium truncate">{video.name}</p>
                          <p className="text-netflix-text-3 text-[10px]">{video.type}</p>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Similar Content ── */}
        {item.similarContent && item.similarContent.length > 0 && (
          <div className="mb-8 -mx-6 md:-mx-12 lg:-mx-16">
            <ContentRow
              title="More Like This"
              items={item.similarContent
                .filter((s) => s.slug)
                .slice(0, 20)}
            />
          </div>
        )}
      </div>

      {/* Bottom padding */}
      <div className="h-16" />
    </div>
  );
}
