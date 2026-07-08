# OTT Baseline — Reference Patterns

> **Purpose:** Reference patterns from Netflix, Prime Video, Disney+, and Apple TV+ for comparison.
> **Last Updated:** July 8, 2026

---

## Homepage Layout

### Netflix
- **Hero:** Full-width billboard with auto-playing video trailer (muted, looped). Static backdrop fallback. Title overlay, Play/More Info buttons.
- **Rows:** "Continue Watching", "Trending Now", "Top 10 in {Region}", genre rails (15-20), "New Releases", "My List"
- **Card:** Poster image → hover expands to show backdrop + title + rating + genres + overview + action buttons
- **Skeleton:** Shimmer that matches exact card aspect ratio

### Prime Video
- **Hero:** Similar to Netflix but with "Rent/Buy" pricing shown for non-subscription content
- **Rows:** "Continue Watching", "Recommended", genre channels, "Movies included with Prime", "TV Shows"
- **Card:** Similar to Netflix but with "Prime" badge

### Disney+
- **Hero:** Full-bleed artwork, centered title. No autoplay trailer on hero load.
- **Rows:** "Continue Watching", "Disney+ Originals", "Marvel", "Star Wars", "National Geographic", genre rows
- **Card:** Poster thumbnail, hover shows title + year + rating badges

---

## Detail Page

### Netflix
- **Hero:** Backdrop image with gradient overlay. Auto-playing trailer on page load (muted, looped). Title, year, rating, runtime, genre badges. Play/My List/Like/Audio/Subtitles buttons.
- **Content:** Overview, cast grid (horizontal scroll), trailers section, episode selector (series), recommendations ("More Like This", "Because You Watched X", "Trending Now")
- **Episodes:** Season tabs, episode list with still, number, title, duration, overview. "Play" button on each episode.

### Prime Video
- **Hero:** Backdrop image. Title, year, rating, runtime. Play/Watch Trailer/Rent buttons.
- **Content:** Overview, cast, genres, "Customers also watched" recommendations
- **Episodes:** Season dropdown, episode grid with thumbnails

---

## Player UX

### Netflix
- **Settings:** Quality (Auto/1080p/720p/480p), Audio track, Subtitle track, Playback speed
- **Next Episode:** "Next episode in 10s" countdown overlay at episode end. Auto-plays. Can cancel.
- **Skip Intro:** "Skip Intro" button appears when intro detected (usually 15-30s marker). Skip Recap for returning episodes.
- **Resume:** Modal on return: "Continue watching from X:XX?" or "Start from beginning"
- **Controls:** Play/pause, 10s skip back/forward, volume, fullscreen, PiP, episode selector

### Disney+
- **Settings:** Quality, Audio, Subtitles
- **Next Episode:** Similar countdown to Netflix. "Skip Recap" available for returning episodes.
- **Extras:** Grouped with episodes in a separate tab

---

## Search

### Netflix
- **Instant Search:** Overlay appears on search focus. Shows trending searches, recent searches. Results appear inline as user types (debounced). Full results page on Enter.
- **Filters:** Genre, year, rating, language. Applied via sidebar/dropdown.
- **Categories:** Rich category pages with hero, sub-categories, and curated collections.

### Prime Video
- **Search:** Similar instant search. Channels filter (Prime, Freevee, MGM+). Genre/top categories in sidebar.

---

## Mobile Experience

### Netflix Mobile
- **Nav:** Bottom tab bar with Home, Search, My List, Downloads, More
- **Player:** Full-screen portrait mode with controls overlay. Rotate to landscape for widescreen. Swipe up/down to dismiss.
- **Tablet:** Hybrid layout — more columns, side-by-side detail views. Full navigation visible.

### Disney+ Mobile
- **Nav:** Bottom tab bar with Home, Search, Downloads, Profile
- **Player:** Tap to show controls, swipe to dismiss, double-tap sides to skip 10s

---

## Performance Patterns

- **Images:** WebP format, responsive srcset, blur-up placeholders
- **Caching:** React Query or equivalent for API response caching
- **Skeleton:** Shimmer screens that match actual layout dimensions (avoid CLS)
- **Lazy Loading:** Route-level code splitting, image lazy loading, infinite scroll for grids
- **Preload:** Hero image preload, next episode preload
