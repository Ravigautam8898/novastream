import { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { TMDB_IMAGE_BASE } from '../../config/images';

/**
 * ContentCard — Netflix-style content card with hover preview.
 *
 * Features:
 *   - Poster image with lazy loading
 *   - Scale-up + overlay on hover with play button
 *   - Expanded info panel on hover (title, year, rating, genres, overview)
 *   - Smooth animations, fixed-width container (no layout shift)
 *   - Responsive sizing
 *   - Optional progress bar (for continue watching items)
 *
 * Props:
 *   - item: Content item object
 *   - progressPercent: Number 0-100 for progress bar display
 *   - onDismiss: Callback — fired when user clicks dismiss button (e.g. remove from continue watching)
 */
export default function ContentCard({ item, progressPercent, onDismiss, isFavorited, onToggleFavorite }) {
  const navigate = useNavigate();
  const [isHovered, setIsHovered] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [panelPosition, setPanelPosition] = useState('below'); // 'below' | 'above' | 'left' | 'right'
  const cardRef = useRef(null);

  const posterUrl = item.posterPath
    ? `${TMDB_IMAGE_BASE}/w342${item.posterPath}`
    : null;

  const backdropUrl = item.backdropPath
    ? `${TMDB_IMAGE_BASE}/w780${item.backdropPath}`
    : null;

  const year = item.releaseDate
    ? new Date(item.releaseDate).getFullYear()
    : item.firstAirDate
      ? new Date(item.firstAirDate).getFullYear()
      : null;

  const contentType = item.contentType || 'movie';
  const slug = item.slug;
  const tmdbId = item.tmdbId;

  const handleClick = () => {
    if (slug) {
      // Standard navigation: content exists in MongoDB
      navigate(`/watch/${contentType}/${slug}`);
    } else if (tmdbId) {
      // TMDB-only navigation: not seeded yet, use TMDB ID
      navigate(`/watch/${contentType}/tmdb-${tmdbId}`);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  // FE-013: Detect viewport edges on hover and reposition panel accordingly
  // Prevents the hover info panel from clipping outside the visible area
  // on mobile/tablet where cards may be near screen edges.
  const updatePanelPosition = useCallback(() => {
    if (!cardRef.current) return 'below';
    const rect = cardRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    const spaceRight = window.innerWidth - rect.right;
    const spaceLeft = rect.left;

    // Panel height estimate: ~280px on mobile, ~320px on desktop
    const panelHeight = window.innerWidth < 768 ? 260 : 320;
    // Panel width same as card (150-160px) — no horizontal overflow concern

    if (spaceBelow < panelHeight && spaceAbove > spaceBelow) {
      return 'above';
    }
    return 'below';
  }, []);

  const handleMouseEnter = () => {
    setIsHovered(true);
    setPanelPosition(updatePanelPosition());
  };

  const handleMouseLeave = () => setIsHovered(false);

  return (
    <div
      ref={cardRef}
      className="relative flex-shrink-0 w-[150px] md:w-[160px] cursor-pointer"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={() => setIsHovered(true)}
      onBlur={() => setIsHovered(false)}
      role="button"
      tabIndex={0}
      aria-label={`View ${item.title}`}
    >
      {/* ── Hover wrapper (pops out with scale + z-index) ── */}
      <div
        className={`transition-all duration-300 ease-out cursor-pointer ${
          isHovered
            ? 'scale-[1.02] z-20 shadow-2xl relative'
            : ''
        }`}
      >
        {/* ── Main Card ── */}
        <div
          className={`relative rounded-md overflow-hidden bg-netflix-dark-2 transition-all duration-300`}
          style={{
            aspectRatio: '2/3',
            width: '100%',
          }}
        >
          {/* Poster image (default state) */}
          {!isHovered && posterUrl && !imageError && (
            <img
              src={posterUrl}
              alt={item.title}
              loading="lazy"
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
              className={`w-full h-full object-cover transition-opacity duration-300 ${
                imageLoaded ? 'opacity-100' : 'opacity-0'
              }`}
            />
          )}

          {/* ── Dismiss button (e.g. remove from continue watching) ── */}
          {onDismiss && (
            <div className="absolute top-1 right-1 z-20">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(item);
                }}
                className="w-6 h-6 rounded-full bg-black/60 hover:bg-netflix-red/90 backdrop-blur-sm
                  flex items-center justify-center transition-all duration-200
                  opacity-0 group-hover:opacity-100 hover:scale-110"
                aria-label={`Remove ${item.title} from continue watching`}
                title="Remove"
              >
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
          )}

          {/* ── Progress bar (continue watching) ── */}
          {((progressPercent || item.progressPercent) > 0) && ((progressPercent || item.progressPercent) < 100) && !isHovered && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-netflix-text-3/50 z-10">
              <div
                className="h-full bg-netflix-red transition-all duration-500 ease-out"
                style={{ width: `${Math.min(100, progressPercent || item.progressPercent)}%` }}
              />
            </div>
          )}

          {/* Backdrop image (hover state) */}
          {isHovered && backdropUrl && (
            <img
              src={backdropUrl}
              alt={item.title}
              className="w-full h-full object-cover"
            />
          )}

          {/* Fallback when no poster/backdrop */}
          {(!posterUrl || imageError) && !isHovered && (
            <div className="w-full h-full flex flex-col items-center justify-center bg-netflix-dark-3 p-4">
              <span className="text-2xl mb-2">🎬</span>
              <span className="text-netflix-text-3 text-xs text-center line-clamp-2">
                {item.title}
              </span>
            </div>
          )}

          {/* Hover overlay with play button */}
          {isHovered && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent flex items-center justify-center">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-netflix-red/90 hover:bg-netflix-red flex items-center justify-center transition-all duration-200 hover:scale-110 shadow-lg">
                <svg className="w-5 h-5 md:w-6 md:h-6 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* ── Expanded Info Panel (hover state) ── */}
        {isHovered && (
          <div
            className={`absolute w-full bg-netflix-dark-2 rounded-b-md shadow-2xl p-3 animate-fade-in z-30 ${
              panelPosition === 'above'
                ? 'bottom-full rounded-t-md rounded-b-none'
                : 'top-full'
            }`}
          >
            {/* Action buttons */}
            <div className="flex items-center gap-2 mb-2">
              <button className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors" aria-label="Play">
                <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onToggleFavorite?.(item); }}
                className={`w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                  isFavorited
                    ? 'bg-netflix-red/20 border-netflix-red text-netflix-red'
                    : 'border-white/40 hover:border-white text-white'
                }`}
                aria-label={isFavorited ? 'Remove from My List' : 'Add to My List'}
                title={isFavorited ? 'Remove from My List' : 'Add to My List'}
              >
                {isFavorited ? (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z" />
                  </svg>
                )}
              </button>

            </div>

            {/* Title + Rating */}
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-white text-sm font-semibold truncate flex-1">{item.title}</h3>
              {item.voteAverage > 0 && (
                <span className="text-netflix-green text-xs font-semibold flex-shrink-0">
                  ★ {item.voteAverage.toFixed(1)}
                </span>
              )}
            </div>

            {/* Year + Content Type + Maturity */}
            <div className="flex items-center gap-2 text-[11px] text-netflix-text-2 mb-1.5">
              {year && <span>{year}</span>}
              <span className="text-[10px] px-1 py-0.5 border border-netflix-border rounded">
                {item.contentType === 'movie' ? 'Movie' : 'Series'}
              </span>
              {item.voteAverage >= 7 && (
                <span className="text-netflix-green text-[10px] font-semibold">Top Rated</span>
              )}
            </div>

            {/* Genres */}
            {item.genres && item.genres.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-1.5">
                {item.genres.slice(0, 3).map((genre) => (
                  <span key={genre.id || genre.name} className="text-[10px] text-netflix-text-3">
                    {genre.name}
                    {item.genres.indexOf(genre) < Math.min(item.genres.length, 3) - 1 ? ',' : ''}
                  </span>
                ))}
              </div>
            )}

            {/* Overview snippet */}
            {item.overview && (
              <p className="text-netflix-text-3 text-[11px] leading-relaxed line-clamp-2">
                {item.overview}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Compact title (non-hover state) */}
      {!isHovered && (
        <div className="mt-1.5">
          <p className="text-sm text-netflix-text truncate">{item.title}</p>
          {item.voteAverage > 0 && (
            <p className="text-xs text-netflix-green">★ {item.voteAverage.toFixed(1)}</p>
          )}
        </div>
      )}
    </div>
  );
}
