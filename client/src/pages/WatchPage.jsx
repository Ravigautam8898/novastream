import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { contentApi } from '../api/content.api';
import { externalSourceApi } from '../api/external-source.api';
import VideoPlayer from '../components/content/VideoPlayer';
import EpisodeList from '../components/content/EpisodeList';
import ContentRow from '../components/content/ContentRow';
import { PageSkeleton } from '../components/ui/LoadingSkeleton';
import ErrorState from '../components/ui/ErrorState';
import Header from '../components/layout/Header';

import { TMDB_IMAGE_BASE } from '../config/images';

/**
 * WatchPage — Full-screen video playback page with episode selector for series.
 *
 * Layout:
 *   - Minimal header
 *   - Full-width video player (ArtPlayer + HLS.js) with signed stream token auth
 *   - Series: EpisodeList below player (season tabs + episode grid)
 *   - Movie: Title, metadata, and description below player
 *   - Related/similar content suggestions
 *
 * Stream flow (Movies):
 *   1. Fetch movie detail → get _id
 *   2. Request signed stream token → build URL → play
 *
 * Stream flow (Series):
 *   1. Fetch series detail → get seasons + episodes
 *   2. Auto-select first episode of first season
 *   3. Request signed stream token for episode (contentType='episode')
 *   4. Build episode stream URL → play
 *   5. Click another episode → repeat 3-4
 */
export default function WatchPage() {
  const { contentType, slug } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Stream state
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamLoading, setStreamLoading] = useState(false);
  const [playbackError, setPlaybackError] = useState(null);
  const [availableQualities, setAvailableQualities] = useState(null);

  // Episode selector state (series only)
  const [selectedEpisode, setSelectedEpisode] = useState(null);

  // External source stream state (for content from external providers)
  const [externalStream, setExternalStream] = useState(null); // { url, expiresAt }
  const [externalStreamLoading, setExternalStreamLoading] = useState(false);
  const refreshTimerRef = useRef(null);

  // Continue watching / progress tracking
  const [savedProgress, setSavedProgress] = useState(0);
  const lastSaveRef = useRef(0);

  // Mobile orientation state
  const [isPortrait, setIsPortrait] = useState(
    typeof window !== 'undefined' && window.innerHeight > window.innerWidth
  );
  const orientationTimerRef = useRef(null); // FE-011: track timeout for cleanup

  const isMovie = contentType === 'movie';

  // ── Fetch Content Detail ──
  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelectedEpisode(null);
    setStreamUrl(null);
    setPlaybackError(null);
    try {
      const data = isMovie
        ? await contentApi.getMovieBySlug(slug)
        : await contentApi.getSeriesBySlug(slug);
      setItem(data);

      // Check if an episode was pre-selected from DetailPage (via location.state)
      const initialEpisode = location.state?.initialEpisode;
      if (!isMovie && initialEpisode && data.seasons) {
        // Find the matching episode in the freshly fetched data
        for (const season of data.seasons) {
          const match = (season.episodes || []).find(
            (ep) => ep._id === initialEpisode._id ||
                   (ep.seasonNumber === initialEpisode.seasonNumber &&
                    ep.episodeNumber === initialEpisode.episodeNumber)
          );
          if (match) {
            setSelectedEpisode(match);
            break;
          }
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [contentType, slug, location.state?.initialEpisode]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ── External Source Stream (primary for content with sourceId) ──
  // If the content has a sourceId from an external provider, use direct CDN streaming.
  // Falls back to local HLS (stream token) if external source is not available.
  useEffect(() => {
    if (!item) return;

    const hasExternalSource = !!(item.sourceId);

    // If content has no external source, fall through to local HLS
    if (!hasExternalSource) {
      // Trigger local HLS stream fetch
      setPlaybackError('STREAM_NOT_AVAILABLE');
      return;
    }

    let cancelled = false;

    const fetchExternalStream = async () => {
      setExternalStreamLoading(true);
      setExternalStream(null);

      try {
        const contentType = isMovie ? 'movie' : 'series';
        const seasonNum = selectedEpisode?.seasonNumber;
        const episodeNum = selectedEpisode?.episodeNumber;

        const result = await externalSourceApi.play({
          slug,
          contentType,
          quality: '720p',
          ...(!isMovie && seasonNum && episodeNum ? { season: seasonNum, episode: episodeNum } : {}),
        });

        if (cancelled) return;

        if (result && result.url) {
          // Don't null out externalStream before setting the new URL.
          // Keeping the previous stream URL in state keeps the player mounted
          // with the old episode's video while the new one loads.
          setExternalStream({
            url: result.url,
            expiresAt: result.expiresAt,
          });

          if (result.qualities) {
            setAvailableQualities(result.qualities.map(q => ({
              quality: q.quality,
              url: q.url,
            })));
          }

          // Fetch saved progress for resume playback
          try {
            const progressResult = await contentApi.getProgress(
              isMovie ? 'movie' : 'episode',
              isMovie ? item._id : selectedEpisode._id
            );
            if (!cancelled && progressResult.hasProgress) {
              setSavedProgress(progressResult.progress);
            }
          } catch {
            // No saved progress — start from beginning
          }
        } else {
          // External source returned no URL — show unavailable message
          setPlaybackError('STREAM_NOT_AVAILABLE');
        }
      } catch (err) {
        if (!cancelled) {
          console.info('External stream unavailable:', err.message);
          // Fall back to local HLS
          setPlaybackError('STREAM_NOT_AVAILABLE');
        }
      } finally {
        if (!cancelled) setExternalStreamLoading(false);
      }
    };

    fetchExternalStream();
    return () => { cancelled = true; };
  }, [item, selectedEpisode, isMovie, slug]);

  // ── Expiry Refresh Timer for External Stream ──
  // Refreshes the streaming URL ~10 min before token expiry
  useEffect(() => {
    if (!externalStream?.expiresAt) return;

    const expiresAtMs = externalStream.expiresAt * 1000;
    const now = Date.now();
    const timeUntilRefresh = expiresAtMs - now - (10 * 60 * 1000); // 10 min before expiry

    // If the token is already within 10 min of expiry, refresh immediately
    if (timeUntilRefresh <= 0) {
      handleRefresh();
      return;
    }

    // Schedule refresh at 10 min before expiry
    refreshTimerRef.current = setTimeout(() => {
      handleRefresh();
    }, timeUntilRefresh);

    return () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
        refreshTimerRef.current = null;
      }
    };
  }, [externalStream?.expiresAt]);

  const handleRefresh = useCallback(async () => {
    if (!item || !slug) return;

    try {
      const contentType = isMovie ? 'movie' : 'series';
      const seasonNum = selectedEpisode?.seasonNumber;
      const episodeNum = selectedEpisode?.episodeNumber;

      const result = await externalSourceApi.refresh({
        slug,
        contentType,
        quality: '720p',
        ...(!isMovie && seasonNum && episodeNum ? { season: seasonNum, episode: episodeNum } : {}),
      });

      if (result && result.url) {
        setExternalStream(prev => ({
          url: result.url,
          expiresAt: result.expiresAt,
        }));

        if (result.qualities) {
          setAvailableQualities(result.qualities.map(q => ({
            quality: q.quality,
            url: q.url,
          })));
        }
      }
    } catch (err) {
      console.warn('Failed to refresh stream URL:', err.message);
      // Silently retry in 30 seconds if refresh fails
      refreshTimerRef.current = setTimeout(handleRefresh, 30000);
    }
  }, [item, slug, isMovie, selectedEpisode]);

  // ── Request Stream Token + Quality Info (Local HLS fallback) ──
  // Only fires if content has NO external source or if external source failed
  useEffect(() => {
    if (!item || playbackError !== 'STREAM_NOT_AVAILABLE') return;

    // If content has an external source but we haven't tried it yet, don't run fallback
    if (item.sourceId && !externalStreamLoading && !externalStream) return;

    let cancelled = false;

    const fetchStreamData = async () => {
      setStreamLoading(true);
      setStreamUrl(null);
      setAvailableQualities(null);
      try {
        let contentId;
        let streamContentType;

        if (isMovie) {
          contentId = item._id;
          streamContentType = 'movie';
        } else if (selectedEpisode) {
          contentId = selectedEpisode._id;
          streamContentType = 'episode';
        } else {
          setStreamLoading(false);
          return;
        }

        // 1. Get stream token — also sets httpOnly cookie for same-origin
        //    segment requests (ST-001: no token in segment URLs)
        const tokenData = await contentApi.getStreamToken(contentId, streamContentType);
        if (cancelled) return;

        // 2. Get available qualities from stream info endpoint
        let qualities = null;
        try {
          const infoType = isMovie ? 'movie' : 'series';
          const infoSlug = isMovie ? slug : item.slug || slug;
          const streamInfo = await contentApi.getStreamInfo(infoType, infoSlug);
          if (streamInfo && streamInfo.hasStreams && streamInfo.qualities) {
            // Build per-quality URLs WITHOUT token — httpOnly cookie handles auth (ST-001)
            qualities = streamInfo.qualities.map((q) => ({
              quality: q.quality,
              url: isMovie
                ? `/api/stream/movie/${slug}/${q.quality}/index.m3u8`
                : `/api/stream/episode/${contentId}/${q.quality}/index.m3u8`,
            }));
          }
        } catch {
          // Stream info not available — fall through to single-URL playback
        }

        if (cancelled) return;

        // 3. Build the main stream URL WITHOUT token in query string (ST-001)
        const url = isMovie
          ? contentApi.getMovieStreamUrl(slug)
          : contentApi.getEpisodeStreamUrl(contentId);

        // 4. Fetch saved progress BEFORE setting streamUrl so initialSeek
        //    is available when VideoPlayer mounts (avoids race condition)
        let resumeProgress = 0;
        try {
          const progressResult = await contentApi.getProgress(
            isMovie ? 'movie' : 'episode',
            isMovie ? item._id : selectedEpisode._id
          );
          if (!cancelled && progressResult.hasProgress) {
            resumeProgress = progressResult.progress;
          }
        } catch {
          // No saved progress — start from beginning
        }

        if (cancelled) return;

        setStreamUrl(url);
        setAvailableQualities(qualities);
        setSavedProgress(resumeProgress);
      } catch (err) {
        if (!cancelled) {
          console.info('Stream token unavailable:', err.message);
          setPlaybackError('STREAM_NOT_AVAILABLE');
        }
      } finally {
        if (!cancelled) setStreamLoading(false);
      }
    };

    fetchStreamData();
    return () => { cancelled = true; };
  }, [item, selectedEpisode, isMovie, slug, playbackError, externalStreamLoading, externalStream]);

  // ── Silent Progress Save (truly fire-and-forget) ──
  // Uses fetch() directly instead of axios to bypass interceptor, timeout, and error surfacing.
  // The `keepalive: true` flag ensures the request completes even if the user navigates away.
  const progressSaveRef = useRef(null);
  if (!progressSaveRef.current) {
    progressSaveRef.current = (contentId, contentType, currentTime, duration) => {
      const token = localStorage.getItem('novastream_token');
      fetch('/api/progress/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ contentId, contentType, progress: currentTime, duration }),
        keepalive: true,
      }).catch(() => {}); // Silently ignore all errors (network, timeout, 4xx, 5xx)
    };
  }

  // ── Playback Progress Handler (throttled to every 15s) ──
  const handleTimeUpdate = useCallback((currentTime, duration) => {
    const now = Date.now();
    if (now - lastSaveRef.current < 15000) return;

    lastSaveRef.current = now;

    const contentId = isMovie ? item?._id : selectedEpisode?._id;
    if (!contentId) return;

    // Fire-and-forget: no timeout, no interceptor, no UI impact
    progressSaveRef.current(contentId, isMovie ? 'movie' : 'episode', currentTime, duration);
  }, [item, selectedEpisode, isMovie]);

  // ── Track Mobile Orientation ──
  // FE-011: Debounce orientation changes. Clear any pending timeout
  // before creating a new one to prevent stale callbacks from accumulating
  // during rapid device rotation.
  useEffect(() => {
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };

    // Debounced orientation change: clear previous timeout, create new one
    const handleOrientationChange = () => {
      if (orientationTimerRef.current) {
        clearTimeout(orientationTimerRef.current);
      }
      orientationTimerRef.current = setTimeout(handleResize, 100);
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleOrientationChange);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      // FE-011: Clean up pending timeout on unmount
      if (orientationTimerRef.current) {
        clearTimeout(orientationTimerRef.current);
        orientationTimerRef.current = null;
      }
    };
  }, []);

  // ── PiP State Tracking ──
  const [isPiP, setIsPiP] = useState(false);
  const handlePiPChange = useCallback((pipActive) => {
    setIsPiP(pipActive);
  }, []);

  // ── Episode Selection Handler ──
  // When switching episodes, DON'T null out streamUrl/externalStream.
  // Keeping the previous stream visible while the new one loads prevents
  // the player from unmounting/replacing with a loading spinner, which
  // looks like a full page reload on mobile.
  // The useEffect that fetches new streams will naturally produce a new
  // URL and the VideoPlayer re-initializes internally (no unmount flash).
  const handleSelectEpisode = useCallback((episode) => {
    setSelectedEpisode(episode);
    setPlaybackError(null); // Reset any previous playback error
    setSavedProgress(0);    // Reset saved progress; will re-fetch
  }, []);

  // ── Render ──

  if (loading) return <PageSkeleton />;

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

  // Determine what's currently playing
  const currentTitle = (!isMovie && selectedEpisode)
    ? selectedEpisode.name || `Episode ${selectedEpisode.episodeNumber}`
    : item.title;

  const currentSubtitle = (!isMovie && selectedEpisode)
    ? `${item.title} — ${selectedEpisode.name ? `Season ${selectedEpisode.seasonNumber || ''}`.trim() : ''}`
    : null;

  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : item.firstAirDate
      ? new Date(item.firstAirDate).getFullYear()
      : null;

  const backdropUrl = item.backdropPath
    ? `${TMDB_IMAGE_BASE}/w1280${item.backdropPath}`
    : null;

  // Determine which stream source to use: external (CDN) or local (HLS + token)
  // Show the player if we have ANY stream URL (previous or current).
  // Don't require loading to be false — keeping the player mounted during
  // episode switches avoids the jarring player → spinner → player transition.
  const useExternalStream = externalStream?.url && !externalStreamLoading;
  const actualStreamUrl = useExternalStream ? externalStream.url : streamUrl;
  const actualQualities = useExternalStream ? availableQualities : availableQualities;
  const hasStreamUrl = !!(externalStream?.url || streamUrl);
  const showPlayer = hasStreamUrl && !playbackError;
  // Only show loading spinner on initial load (no stream URL yet).
  // During episode switches, the old stream keeps the player alive;
  // ArtPlayer's built-in loading indicator handles the brief transition.
  const showPlayerLoading = !hasStreamUrl && (streamLoading || externalStreamLoading) && !playbackError;

  // Hide header when player is in full-viewport mobile mode
  const isMobileFullscreen = showPlayer && isPortrait;

  return (
    <div className="min-h-screen bg-netflix-dark">
      {/* Minimal header */}
      <header className={`fixed top-0 left-0 right-0 z-50 bg-netflix-dark/90 backdrop-blur-sm safe-area-top ${isMobileFullscreen ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between px-4 md:px-8 h-14">
          <div className="flex items-center gap-4 min-w-0">
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1.5 text-netflix-text-2 hover:text-white text-sm transition-colors flex-shrink-0"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" />
              </svg>
              Back
            </button>
            <Link to="/" className="text-netflix-red text-lg font-bold tracking-tight flex-shrink-0">
              NovaStream
            </Link>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <div className="text-right truncate">
              <p className="text-white text-sm font-medium truncate max-w-[200px] md:max-w-[300px]">
                {currentTitle}
              </p>
              {currentSubtitle && (
                <p className="text-netflix-text-3 text-[11px] truncate max-w-[200px] md:max-w-[300px]">
                  {currentSubtitle}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Video Player Area ── */}
      {/* On desktop: consistent 16:9 aspect ratio constrained to max 85vh.
          The player does NOT resize between loading and playing states,
          eliminating the jarring visual jump.
          On mobile portrait: full-width 16:9 box below header.
          The outer div handles sizing; the inner spinner/player fill it. */}
      <div className={`w-full bg-black relative ${showPlayer && isPortrait ? 'mobile-player-full' : ''}`}
        style={showPlayer && isPortrait
          ? { aspectRatio: '16/9', width: '100%', marginTop: '0' }
          : { aspectRatio: '16 / 9', maxHeight: '85vh', width: '100%', marginTop: '56px' }}>
        {showPlayerLoading && (
          <div className="w-full h-full flex flex-col items-center justify-center bg-netflix-dark text-center px-6">
            <div className="w-10 h-10 border-2 border-netflix-red border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-netflix-text-2 text-sm">
              {selectedEpisode ? 'Loading episode...' : 'Preparing stream...'}
            </p>
          </div>
        )}

        {playbackError === 'STREAM_NOT_AVAILABLE' && (
          <div className="w-full h-full flex flex-col items-center justify-center bg-netflix-dark text-center px-6">
            <div className="w-16 h-16 rounded-full bg-netflix-dark-3 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-netflix-text-3" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
            </div>
            <h3 className="text-white text-lg font-semibold mb-2">Stream Unavailable</h3>
            <p className="text-netflix-text-2 text-sm max-w-md mb-4">
              {item?.sourceId
                ? 'This content is from an external source that is currently unavailable. Please try again later.'
                : 'Stream source unavailable. A provider will be connected in a future update.'}
            </p>
            <button onClick={() => navigate(-1)} className="btn-primary">
              Go Back
            </button>
          </div>
        )}

        {showPlayer && (
          <>
            {/* Episode info overlay in top-left of player */}
            {selectedEpisode && (
              <div className="episode-overlay-mobile absolute top-4 left-4 z-10 max-w-[60%] pointer-events-none">
                <p className="text-white text-sm font-semibold drop-shadow-lg">
                  S{selectedEpisode.seasonNumber || '?'} · E{selectedEpisode.episodeNumber}
                </p>
                <p className="text-white text-xs opacity-90 drop-shadow truncate">
                  {selectedEpisode.name || `Episode ${selectedEpisode.episodeNumber}`}
                </p>
              </div>
            )}

            <VideoPlayer
              url={actualStreamUrl}
              qualities={actualQualities}
              thumbnails={{
                url: contentApi.getThumbnailUrl(
                  selectedEpisode ? 'episode' : 'movie',
                  selectedEpisode ? selectedEpisode._id : item._id
                ),
                number: 25,
                column: 5,
              }}
              initialSeek={savedProgress}
              poster={backdropUrl}
              title={currentTitle}
              autoplay
              onError={(err) => setPlaybackError(err.message || 'Playback failed')}
              onTimeUpdate={handleTimeUpdate}
              onPiPChange={handlePiPChange}
            />
          </>
        )}
      </div>

      {/* ── Rotate Hint Banner (portrait mobile, non-blocking) ── */}
      {isPortrait && showPlayer && (
        <div className="rotate-hint-banner md:hidden">
          <div className="animate-rotate-pulse flex-shrink-0">
            <svg className="w-6 h-6 text-netflix-text-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.5 2H8.5C7.12 2 6 3.12 6 4.5v15C6 20.88 7.12 22 8.5 22h7c1.38 0 2.5-1.12 2.5-2.5v-15C18 3.12 16.88 2 15.5 2zm0 17h-7V5h7v14z" />
              <path d="M12 18c.83 0 1.5-.67 1.5-1.5S12.83 15 12 15s-1.5.67-1.5 1.5S11.17 18 12 18z" />
            </svg>
          </div>
          <p className="text-xs text-netflix-text-2 flex-1">
            Rotate your device for a better viewing experience
          </p>
          <button
            onClick={() => {
              try {
                screen.orientation?.lock?.('landscape').catch(() => {});
              } catch {}
              // Dismiss banner on click
              document.querySelector('.rotate-hint-banner')?.classList.add('hidden');
            }}
            className="text-netflix-text-3 hover:text-white text-xs flex-shrink-0 ml-2"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Content Below Player (hidden when PiP is active for cleaner view) ── */}
      {!isPiP && (
      <div className="px-4 md:px-8 lg:px-12 max-w-7xl mx-auto py-6 safe-area-bottom">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Left Column: Metadata / Details */}
          <div className="flex-1 min-w-0">
            {/* Series: Episode List */}
            {!isMovie && item.seasons && item.seasons.length > 0 && (
              <div className="mb-8">
                <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
                  <svg className="w-4 h-4 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Episodes
                </h2>
                <EpisodeList
                  seasons={item.seasons}
                  slug={slug}
                  selectedEpisodeId={selectedEpisode?._id}
                  onSelectEpisode={handleSelectEpisode}
                />
              </div>
            )}

            {/* Movie / Series Info */}
            <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
              {item.title}
            </h1>

            {item.tagline && (
              <p className="text-netflix-text-2 text-sm italic mb-3">
                &ldquo;{item.tagline}&rdquo;
              </p>
            )}

            {/* Meta badges */}
            <div className="flex flex-wrap items-center gap-2 md:gap-3 text-sm mb-4">
              {year && <span className="text-netflix-text font-medium">{year}</span>}
              {isMovie && item.runtime && (
                <>
                  <span className="w-1 h-1 rounded-full bg-netflix-text-3" />
                  <span className="text-netflix-text-2">
                    {Math.floor(item.runtime / 60)}h {item.runtime % 60}m
                  </span>
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
                  <span className="text-netflix-green font-semibold">
                    ★ {item.voteAverage.toFixed(1)}
                  </span>
                </>
              )}
              <span className="bg-netflix-red/90 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase">
                {isMovie ? 'Movie' : 'Series'}
              </span>
            </div>

            {/* Overview */}
            {item.overview && (
              <p className="text-netflix-text-2 text-sm leading-relaxed max-w-2xl mb-4">
                {item.overview}
              </p>
            )}

            {/* Genres */}
            {item.genres && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {item.genres.map((genre) => (
                  <Link
                    key={genre.id || genre.name}
                    to={`/search?q=${encodeURIComponent(genre.name)}`}
                    className="text-xs text-netflix-text-2 border border-netflix-border/60 rounded-full px-2.5 py-0.5
                      hover:border-netflix-text-2 hover:text-white transition-colors"
                  >
                    {genre.name}
                  </Link>
                ))}
              </div>
            )}

            {/* Cast */}
            {item.cast && item.cast.length > 0 && (
              <div className="mb-4">
                <span className="text-netflix-text-3 text-xs">Starring: </span>
                <span className="text-netflix-text-2 text-sm">
                  {item.cast.slice(0, 5).map((a) => a.name).join(', ')}
                  {item.cast.length > 5 && ' and more'}
                </span>
              </div>
            )}

            {/* Categories & Languages */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-netflix-text-3">
              {item.categories && item.categories.length > 0 && (
                <span>Categories: {item.categories.join(', ')}</span>
              )}
              {item.languages && item.languages.length > 0 && (
                <span>Languages: {item.languages.join(', ')}</span>
              )}
            </div>
          </div>

          {/* Right Column: Poster (desktop) */}
          {item.posterPath && (
            <div className="hidden md:block flex-shrink-0 w-[160px]">
              <img
                src={`${TMDB_IMAGE_BASE}/w342${item.posterPath}`}
                alt={item.title}
                className="w-full rounded-lg"
              />
            </div>
          )}
        </div>

        {/* Similar Content */}
        {item.similarContent && item.similarContent.length > 0 && (
          <div className="mt-8 -mx-4 md:-mx-8 lg:-mx-12">
            <ContentRow
              title="More Like This"
              items={item.similarContent.filter((s) => s.slug).slice(0, 20)}
            />
          </div>
        )}
      </div>
      )}
    </div>
  );
}
