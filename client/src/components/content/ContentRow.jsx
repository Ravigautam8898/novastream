import { useRef, useState, useCallback, useEffect } from 'react';
import ContentCard from './ContentCard';

/**
 * ContentRow — Horizontal scrolling row of content cards with arrow navigation.
 *
 * Features:
 *   - Left/right arrow buttons with smooth scroll
 *   - Arrow peek on hover (Netflix-style)
 *   - Gradient edge fade indicators
 *   - Scroll snap per card
 *   - Responsive sizing
 *   - Accessible keyboard navigation
 *
 * Props:
 *   - title: Section title
 *   - items: Array of content items
 *   - layout: 'row' or 'hero'
 *   - onDismiss: Callback(item) — fired when user removes item from continue watching
 */
export default function ContentRow({ title, items, layout = 'row', onDismiss, favoriteIds, onToggleFavorite }) {
  const scrollRef = useRef(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, scrollLeft: 0 });

  if (!items || items.length === 0) return null;

  // Check scroll position to toggle arrows
  const updateArrows = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 10);
    setShowRightArrow(el.scrollLeft < el.scrollWidth - el.clientWidth - 10);
  }, []);

  // Update arrows on scroll and resize
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateArrows, { passive: true });
    window.addEventListener('resize', updateArrows);
    // Initial check
    updateArrows();
    return () => {
      el.removeEventListener('scroll', updateArrows);
      window.removeEventListener('resize', updateArrows);
    };
  }, [items, updateArrows]);

  // Scroll by a card width (with some overlap for smooth feel)
  const scrollByAmount = () => {
    const el = scrollRef.current;
    if (!el) return 300;
    const cardWidth = 160; // card width + gap
    const visibleWidth = el.clientWidth;
    return Math.min(cardWidth * 2, visibleWidth * 0.75);
  };

  const scrollLeft = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: -scrollByAmount(), behavior: 'smooth' });
  };

  const scrollRight = () => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: scrollByAmount(), behavior: 'smooth' });
  };

  // ── Mouse drag scrolling ──
  const handleMouseDown = (e) => {
    const el = scrollRef.current;
    if (!el) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.pageX - el.offsetLeft,
      scrollLeft: el.scrollLeft,
    };
    el.style.cursor = 'grabbing';
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const el = scrollRef.current;
    if (!el) return;
    const x = e.pageX - el.offsetLeft;
    const walk = (x - dragStartRef.current.x) * 1.5;
    el.scrollLeft = dragStartRef.current.scrollLeft - walk;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
    }
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.style.cursor = 'grab';
    }
  };

  return (
    <section
      className="relative group mb-6 md:mb-8"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      {/* Section title */}
      <div className="px-6 md:px-12 mb-2 md:mb-4">
        <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-white hover:text-white transition-colors inline-block">
          {title}
        </h2>
      </div>

      {/* Carousel container */}
      <div className="relative">
        {/* Left arrow */}
        {(showLeftArrow || isHovering) && (
          <button
            onClick={scrollLeft}
            className={`absolute left-0 top-0 bottom-0 z-20 w-12 md:w-16 flex items-center justify-start pl-2
              bg-gradient-to-r from-netflix-dark/90 to-transparent
              transition-opacity duration-300 ease-out
              ${showLeftArrow && isHovering ? 'opacity-100' : 'opacity-0'}
              focus:opacity-100 focus:outline-none`}
            aria-label="Scroll left"
            tabIndex={0}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center transition-all duration-200 hover:scale-110">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" />
              </svg>
            </div>
          </button>
        )}

        {/* Scrollable content */}
        <div
          ref={scrollRef}
          className="flex gap-1 md:gap-2 overflow-x-auto px-6 md:px-12 pb-2 scrollbar-none cursor-grab select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          style={{
            scrollSnapType: 'x mandatory',
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
          role="list"
          aria-label={`${title} content row`}
        >
          {items.map((item, index) => (
            <div
              key={item._id || item.tmdbId || index}
              className="flex-shrink-0"
              style={{ scrollSnapAlign: 'start' }}
              role="listitem"
            >
              <ContentCard
                item={item}
                onDismiss={onDismiss ? () => onDismiss(item) : undefined}
                isFavorited={favoriteIds?.has(item._id) || favoriteIds?.has(item.tmdbId)}
                onToggleFavorite={onToggleFavorite}
              />
            </div>
          ))}
        </div>

        {/* Right arrow */}
        {(showRightArrow || isHovering) && (
          <button
            onClick={scrollRight}
            className={`absolute right-0 top-0 bottom-0 z-20 w-12 md:w-16 flex items-center justify-end pr-2
              bg-gradient-to-l from-netflix-dark/90 to-transparent
              transition-opacity duration-300 ease-out
              ${showRightArrow && isHovering ? 'opacity-100' : 'opacity-0'}
              focus:opacity-100 focus:outline-none`}
            aria-label="Scroll right"
            tabIndex={0}
          >
            <div className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-black/50 hover:bg-black/70 backdrop-blur-sm flex items-center justify-center transition-all duration-200 hover:scale-110">
              <svg className="w-4 h-4 md:w-5 md:h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z" />
              </svg>
            </div>
          </button>
        )}
      </div>

      {/* Gradient edge fades (subtle indicators) */}
      <div
        className={`absolute top-8 bottom-2 left-6 w-8 bg-gradient-to-r from-netflix-dark to-transparent pointer-events-none transition-opacity duration-300 ${
          showLeftArrow ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`absolute top-8 bottom-2 right-6 w-8 bg-gradient-to-l from-netflix-dark to-transparent pointer-events-none transition-opacity duration-300 ${
          showRightArrow ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </section>
  );
}
