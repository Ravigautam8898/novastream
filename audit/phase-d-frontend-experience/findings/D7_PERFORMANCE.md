# D7 — Performance Audit

> **Area:** Performance
> **Files:** `client/src/` (all frontend files)
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Observations

### D-050 — Route-Level Code Splitting (PF-001) ✅

| Field | Value |
|-------|-------|
| **ID** | D-050 |
| **Area** | Performance |
| **Severity** | Low |
| **Current** | All pages are lazy-loaded via `React.lazy()` + `Suspense` in `App.jsx`. LoginPage is the only page loaded synchronously (common first visit). Heavy admin dashboard is lazy. |
| **Expected OTT behavior** | OTT platforms split by route, with critical pages (homepage) in initial bundle. |
| **Recommended Fix** | None required — already implemented (PF-001). |
| **Status** | CLOSED — Already Implemented |

### D-051 — Image Optimization

| Field | Value |
|-------|-------|
| **ID** | D-051 |
| **Area** | Performance |
| **Severity** | Medium |
| **Current** | Images use TMDB URLs with configurable sizes (w92, w185, w300, w342, w780, w1280). `loading="lazy"` on all poster/backdrop images. HeroCarousel uses `w780` for preload, `w1280` for active (PF-010). HeroCarousel preloads images via `new Image()`. Fallback placeholders for missing images. |
| **Expected OTT behavior** | OTT platforms use WebP/AVIF formats, responsive srcset, and blur-up low-res placeholders. |
| **Recommended Fix** | Add `srcSet` with multiple TMDB sizes for responsive image loading. Consider WebP format if TMDB supports it. Add blur-up placeholder (tiny image blurred as background while full loads). |
| **Implementation Phase** | D-Imp-6 Performance |
| **Status** | OPEN |

### D-052 — Bundle Size Warning

| Field | Value |
|-------|-------|
| **ID** | D-052 |
| **Area** | Performance |
| **Severity** | Low |
| **Current** | Vite build outputs a warning about chunks exceeding 500 kB. Current bundle is built but some chunks are large (primarily admin panel with many components). |
| **Expected OTT behavior** | OTT platforms keep initial bundle under 200 kB. All heavy items lazy-loaded. |
| **Recommended Fix** | Split admin components into separate lazy chunks. Use dynamic imports for heavy admin sub-pages. Consider code-splitting admin routes further. |
| **Implementation Phase** | D-Imp-6 Performance |
| **Status** | OPEN |

### D-053 — API Call Deduplication

| Field | Value |
|-------|-------|
| **ID** | D-053 |
| **Area** | Performance |
| **Severity** | Low |
| **Current** | HomePage fires 3 parallel API calls (homepage sections, continue watching, favorites) using `Promise.allSettled`. Frontend uses optional chaining and defensive array checks. No API response caching at the frontend level. |
| **Expected OTT behavior** | OTT platforms cache API responses (React Query / SWR / RTK Query) to avoid redundant re-fetches on re-render or navigation. |
| **Recommended Fix** | Consider adding a lightweight caching layer (React Query or simple in-memory cache) for repeated API calls (e.g., user navigating back and forth between homepage and detail). |
| **Implementation Phase** | D-Imp-6 Performance |
| **Status** | OPEN |

### D-054 — Skeleton Loading UX

| Field | Value |
|-------|-------|
| **ID** | D-054 |
| **Area** | Performance |
| **Severity** | Low |
| **Current** | `PageSkeleton`, `CardSkeleton`, `DetailSkeleton` implemented with shimmer animation. HomePage uses `PageSkeleton` for initial load, ContentRow shows grid of `CardSkeleton` items during search/category loading. |
| **Expected OTT behavior** | OTT platforms use skeleton screens that match the actual layout to minimize CLS (Cumulative Layout Shift). |
| **Recommended Fix** | None required — skeletons already match the grid layout. Verify skeleton dimensions match actual card dimensions to prevent layout shift. |
| **Status** | CLOSED — Already Implemented |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-050 | Route-Level Code Splitting | Low | N/A | CLOSED |
| D-051 | Image Optimization | Medium | D-Imp-6 | OPEN |
| D-052 | Bundle Size Warning | Low | D-Imp-6 | OPEN |
| D-053 | API Call Caching | Low | D-Imp-6 | OPEN |
| D-054 | Skeleton Loading | Low | N/A | CLOSED |
