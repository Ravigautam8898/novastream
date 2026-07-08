# Track D — Design Rules

> **Purpose:** Design system rules and conventions for NovaStream frontend.
> **Last Updated:** July 8, 2026

---

## Layout Rules

1. **Hero** — Full-width billboard with gradient overlays, auto-rotating, optional video preview
2. **Content Rows** — Horizontal scrolling with arrow navigation, Netflix-style peek arrows on hover
3. **Content Cards** — 2:3 aspect ratio poster, expandable hover panel with backdrop, metadata, actions
4. **Detail Page** — Backdrop hero at 50-70vh, poster offset overlap below, scrollable content

## Color System

| Token | Value | Usage |
|-------|-------|-------|
| `bg-netflix-dark` | `#141414` | Page background |
| `bg-netflix-dark-2` | `#1f1f1f` | Card, row, panel backgrounds |
| `bg-netflix-dark-3` | `#2a2a2a` | Hover, elevated surfaces |
| `bg-netflix-red` | `#e50914` | Primary action, brand |
| `text-netflix-text` | `#ffffff` | Primary text |
| `text-netflix-text-2` | `#b3b3b3` | Secondary text |
| `text-netflix-text-3` | `#808080` | Tertiary text, metadata |
| `text-netflix-green` | `#46d369` | Rating, positive indicators |

## Component Conventions

1. **Loading State** — Always show skeleton (shimmer) matching the component's final layout
2. **Empty State** — Use `EmptyState` component with icon, title, description, optional action
3. **Error State** — Use `ErrorState` component with message and retry button
4. **Error Boundary** — Wrap route trees with `ErrorBoundary` to prevent blank white pages
5. **Optimistic Updates** — Apply state changes immediately, revert on API failure (favorites, continue watching)
6. **Fire-and-Forget** — Non-critical operations (progress save) use direct fetch with `keepalive: true`

## Performance Rules

1. **Lazy Loading** — Route-level code splitting via `React.lazy()` (PF-001)
2. **Image Loading** — `loading="lazy"` on all non-hero images. Hero images preloaded.
3. **Debounce** — Search input debounced at 300ms. Orientation change debounced at 100ms.
4. **Progress Save** — Throttled to every 15s. `keepalive: true` for navigation-surviving requests.

## Accessibility Rules

1. All interactive elements have `aria-label` or accessible text
2. Loading states use `role="status"` with `aria-busy="true"`
3. Error states use `role="alert"` with `aria-live="assertive"`
4. Touch targets minimum 44px on mobile
5. `prefers-reduced-motion` support (via Tailwind's `motion-safe:`)
