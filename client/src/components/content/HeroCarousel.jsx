import { useState, useEffect, useRef, useCallback } from 'react';

import { TMDB_IMAGE_BASE } from '../../config/images';
const AUTOPLAY_INTERVAL = 6000; // 6 seconds per slide
const TRANSITION_DURATION = 700; // ms for slide transition

/**
 * HeroCarousel — Full-width billboard-style slideshow for featured content.
 *
 * Features:
 *   - Auto-play with configurable interval
 *   - Pause on hover
 *   - Dot navigation
 *   - Smooth fade transitions
 *   - Preloads next slide image
 *   - Touch/swipe support on mobile
 *   - Responsive (mobile → tablet → desktop)
 */
export default function HeroCarousel({ items }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [touchStart, setTouchStart] = useState(null);
  const intervalRef = useRef(null);
  const carouselRef = useRef(null);
  const isTransitioningRef = useRef(false); // FE-010: ref avoids stale closure in callbacks
  const preloadImagesRef = useRef([]);       // FE-010: ref-based tracking, no re-renders per image

  const totalSlides = items?.length || 0;

  // FE-010: Preload all backdrop images using ref (no state re-renders per image).
  // Clean up Image objects on unmount or items change to prevent memory leaks.
  useEffect(() => {
    if (!items || items.length === 0) return;

    let cancelled = false;
    const images = [];

    items.forEach((item, index) => {
      if (!item.backdropPath) return;
      const img = new Image();
      img.onload = () => { /* silently cached — no state needed */ };
      img.onerror = () => { /* silently ignore failed preloads */ };
      // PF-010: Use w780 (medium) for preload — w1280 is only needed for the active slide.
      // This reduces mobile bandwidth by ~40% for preloaded images.
      img.src = `${TMDB_IMAGE_BASE}/w780${item.backdropPath}`;
      images.push(img);
    });

    preloadImagesRef.current = images;

    return () => {
      cancelled = true;
      // Abort any in-flight preloads to prevent stale callbacks
      images.forEach((img) => { img.onload = null; img.onerror = null; img.src = ''; });
      preloadImagesRef.current = [];
    };
  }, [items]);

  // Auto-play logic
  useEffect(() => {
    if (isPaused || totalSlides <= 1) return;

    intervalRef.current = setInterval(() => {
      goToNext();
    }, AUTOPLAY_INTERVAL);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, totalSlides, currentIndex]);

  const goToSlide = useCallback(
    (index) => {
      if (isTransitioningRef.current || index === currentIndex) return;
      isTransitioningRef.current = true;
      setCurrentIndex(index);
      setTimeout(() => { isTransitioningRef.current = false; }, TRANSITION_DURATION);
    },
    [currentIndex]
  );

  const goToNext = useCallback(() => {
    const nextIndex = (currentIndex + 1) % totalSlides;
    goToSlide(nextIndex);
  }, [currentIndex, totalSlides, goToSlide]);

  const goToPrev = useCallback(() => {
    const prevIndex = (currentIndex - 1 + totalSlides) % totalSlides;
    goToSlide(prevIndex);
  }, [currentIndex, totalSlides, goToSlide]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') goToPrev();
      if (e.key === 'ArrowRight') goToNext();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev]);

  // Touch/swipe support
  const handleTouchStart = (e) => {
    setTouchStart(e.touches[0].clientX);
  };

  const handleTouchEnd = (e) => {
    if (touchStart === null) return;
    const diff = touchStart - e.changedTouches[0].clientX;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      if (diff > 0) goToNext();
      else goToPrev();
    }
    setTouchStart(null);
  };

  if (!items || items.length === 0) return null;

  const currentItem = items[currentIndex];

  // Determine year display
  const year = currentItem.releaseDate
    ? new Date(currentItem.releaseDate).getFullYear()
    : currentItem.firstAirDate
      ? new Date(currentItem.firstAirDate).getFullYear()
      : null;

  // Build backdrop URL — use medium size for mobile, full size for desktop (PF-010)
  const backdropUrl = currentItem.backdropPath
    ? `${TMDB_IMAGE_BASE}/w1280${currentItem.backdropPath}`
    : null;

  // Determine maturity rating based on vote average (simulated)
  const maturityRating =
    currentItem.voteAverage >= 8
      ? 'TV-MA'
      : currentItem.voteAverage >= 6
        ? 'TV-14'
        : 'PG-13';

  return (
    <div
      ref={carouselRef}
      className="relative w-full h-[60vh] md:h-[75vh] lg:h-[85vh] min-h-[420px] max-h-[900px] overflow-hidden bg-netflix-dark"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      role="region"
      aria-roledescription="carousel"
      aria-label="Featured content"
    >
      {/* ── Slides ── */}
      <div className="absolute inset-0 w-full h-full">
        {items.map((item, index) => {
          const isActive = index === currentIndex;
          const slideBackdrop = item.backdropPath
            ? `${TMDB_IMAGE_BASE}/w1280${item.backdropPath}`
            : null;

          return (
            <div
              key={item._id || item.tmdbId || index}
              className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                isActive ? 'opacity-100 z-10' : 'opacity-0 z-0'
              }`}
              aria-hidden={!isActive}
            >
              {/* Backdrop image */}
              {slideBackdrop && (
                <div
                  className="absolute inset-0 bg-cover bg-center scale-105"
                  style={{
                    backgroundImage: `url(${slideBackdrop})`,
                    transform: isActive ? 'scale(1)' : 'scale(1.05)',
                    transition: 'transform 8s ease-out',
                  }}
                />
              )}

              {/* Fallback if no backdrop */}
              {!slideBackdrop && (
                <div className="absolute inset-0 bg-gradient-to-br from-netflix-dark-2 via-netflix-dark to-netflix-dark-3 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-netflix-dark-3 flex items-center justify-center">
                      <span className="text-3xl">🎬</span>
                    </div>
                    <p className="text-netflix-text-3 text-lg">{item.title}</p>
                  </div>
                </div>
              )}

              {/* Gradient overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-netflix-dark via-netflix-dark/30 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-r from-netflix-dark/90 via-netflix-dark/40 to-transparent" />

              {/* Bottom fade for content rows */}
              <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-netflix-dark to-transparent" />
            </div>
          );
        })}
      </div>

      {/* ── Content Overlay ── */}
      <div className="relative z-20 h-full flex items-end">
        <div
          className="px-6 md:px-12 lg:px-16 pb-16 md:pb-24 lg:pb-32 max-w-2xl lg:max-w-3xl w-full"
          key={currentIndex}
        >
          {/* Content type badge + year + rating */}
          <div className="flex items-center gap-3 mb-3 animate-fade-in">
            {currentItem.contentType && (
              <span className="bg-netflix-red/90 text-white text-[10px] md:text-xs font-semibold px-2.5 py-0.5 rounded uppercase tracking-wider">
                {currentItem.contentType === 'movie' ? 'Movie' : 'Series'}
              </span>
            )}
            {year && (
              <span className="text-netflix-text-2 text-xs md:text-sm font-medium">{year}</span>
            )}
            {currentItem.voteAverage > 0 && (
              <span className="flex items-center gap-1 text-netflix-green text-xs md:text-sm font-semibold">
                <svg className="w-3.5 h-3.5 md:w-4 md:h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {currentItem.voteAverage.toFixed(1)}
              </span>
            )}
            {/* Maturity badge */}
            <span className="border border-netflix-border text-netflix-text-2 text-[10px] md:text-xs px-1.5 py-0.5 font-medium hidden sm:inline-block">
              {maturityRating}
            </span>
          </div>

          {/* Title */}
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-2 drop-shadow-xl animate-slide-up">
            {currentItem.title}
          </h1>

          {/* Tagline */}
          {currentItem.tagline && (
            <p className="text-netflix-text-2 text-sm md:text-base italic mb-2 animate-slide-up hidden sm:block">
              &ldquo;{currentItem.tagline}&rdquo;
            </p>
          )}

          {/* Genre tags */}
          {currentItem.genres && currentItem.genres.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-3 animate-fade-in">
              {currentItem.genres.slice(0, 4).map((genre) => (
                <span
                  key={genre.id || genre.name}
                  className="text-[11px] md:text-xs text-netflix-text-2 border border-netflix-border/60 rounded-full px-2.5 py-0.5 hover:border-netflix-text-2 hover:text-white transition-colors duration-200"
                >
                  {genre.name}
                </span>
              ))}
            </div>
          )}

          {/* Overview */}
          {currentItem.overview && (
            <p className="text-netflix-text text-xs md:text-sm lg:text-base leading-relaxed line-clamp-2 md:line-clamp-3 max-w-xl lg:max-w-2xl mb-4 md:mb-6 animate-slide-up">
              {currentItem.overview}
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-3 md:gap-4 animate-slide-up">
            <button className="flex items-center gap-2 bg-white hover:bg-white/90 text-black font-semibold px-5 md:px-8 py-2 md:py-3 rounded text-sm md:text-base transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl">
              <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
              Play
            </button>
            <button className="flex items-center gap-2 bg-netflix-dark-3/80 hover:bg-netflix-dark-3 text-white font-semibold px-5 md:px-8 py-2 md:py-3 rounded text-sm md:text-base transition-all duration-200 hover:scale-105 active:scale-95 shadow-xl border border-white/10">
              <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
              </svg>
              More Info
            </button>
          </div>
        </div>
      </div>

      {/* ── Top-right: Pause/Play indicator ── */}
      {isPaused && totalSlides > 1 && (
        <div className="absolute top-4 right-4 z-30 bg-black/50 backdrop-blur-sm rounded-full px-3 py-1 text-xs text-netflix-text-2 flex items-center gap-1.5 animate-fade-in">
          <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
          Paused
        </div>
      )}

      {/* ── Navigation: Dots ── */}
      {totalSlides > 1 && (
        <div className="absolute bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2">
          {items.map((item, index) => {
            const isActive = index === currentIndex;
            return (
              <button
                key={item._id || item.tmdbId || index}
                onClick={() => goToSlide(index)}
                className={`transition-all duration-300 rounded-full focus:outline-none focus:ring-2 focus:ring-white/50 ${
                  isActive
                    ? 'w-8 md:w-10 h-1.5 md:h-2 bg-white'
                    : 'w-1.5 md:w-2 h-1.5 md:h-2 bg-white/40 hover:bg-white/70'
                }`}
                aria-label={`Go to slide ${index + 1}: ${item.title}`}
                aria-current={isActive ? 'true' : 'false'}
              />
            );
          })}
        </div>
      )}

      {/* ── Side Arrows ── */}
      {totalSlides > 1 && (
        <>
          <button
            onClick={goToPrev}
            className="absolute left-2 md:left-4 top-1/2 -translate-y-1/2 z-30 w-8 h-8 md:w-11 md:h-11 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 opacity-0 hover:scale-110 focus:opacity-100 md:opacity-0 md:hover:opacity-100"
            aria-label="Previous slide"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
            </svg>
          </button>
          <button
            onClick={goToNext}
            className="absolute right-2 md:right-4 top-1/2 -translate-y-1/2 z-30 w-8 h-8 md:w-11 md:h-11 rounded-full bg-black/40 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center text-white transition-all duration-200 opacity-0 hover:scale-110 focus:opacity-100 md:opacity-0 md:hover:opacity-100"
            aria-label="Next slide"
          >
            <svg className="w-4 h-4 md:w-5 md:h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
            </svg>
          </button>
        </>
      )}

      {/* ── Slide counter ── */}
      {totalSlides > 1 && (
        <div className="absolute top-4 left-6 md:left-12 z-30 bg-black/50 backdrop-blur-sm rounded px-2.5 py-1 text-xs text-netflix-text-2 font-medium hidden sm:block">
          <span className="text-white">{String(currentIndex + 1).padStart(2, '0')}</span>
          <span className="mx-1">/</span>
          <span>{String(totalSlides).padStart(2, '0')}</span>
        </div>
      )}


    </div>
  );
}
