# Component Map — Frontend Inventory

> **Last Updated:** July 8, 2026
> **Total Components:** 40 (excluding API modules, hooks, context)

---

## Pages (10)

| Component | File | Purpose | Problems | Phase |
|-----------|------|---------|----------|:-----:|
| HomePage | `pages/HomePage.jsx` | Main homepage with hero, content rows, continue watching, favorites | No hero video preview, no Top 10, no genre rails | D-Imp-1 |
| DetailPage | `pages/DetailPage.jsx` | Movie/series detail with backdrop, poster, cast, trailers, episodes | No trailer autoplay, no recommendations grid | D-Imp-2 |
| WatchPage | `pages/WatchPage.jsx` | Full-screen video player with episode selector, recovery UI | No next episode, no skip intro, settings menu | D-Imp-3 |
| SearchPage | `pages/SearchPage.jsx` | Search results with type filter, pagination | No instant search, no filters | D-Imp-4 |
| CategoryPage | `pages/CategoryPage.jsx` | Category grid (Hollywood, Bollywood, Korean, South Indian) | Static grid, no hero, no sub-categories | D-Imp-4 |
| MyListPage | `pages/MyListPage.jsx` | User's favorite items grid | No search/sort/filter within list | D-Imp-2 |
| HistoryPage | `pages/HistoryPage.jsx` | Watch history timeline with grouped dates | No search within history | D-Imp-2 |
| NotFoundPage | `pages/NotFoundPage.jsx` | 404 page with animated entrance | None — well-designed | N/A |
| LoginPage | `pages/LoginPage.jsx` | Login form wrapper | None — minimal auth UI | N/A |
| SubscriptionRequiredPage | `pages/SubscriptionRequiredPage.jsx` | Subscription error states | None | N/A |

## Content Components (6)

| Component | File | Purpose | Problems | Phase |
|-----------|------|---------|----------|:-----:|
| ContentCard | `components/content/ContentCard.jsx` | Poster card with hover preview | No video preview on hover, no "new episodes" badge | D-Imp-1 |
| ContentRow | `components/content/ContentRow.jsx` | Horizontal scrolling row with arrows | None — well-implemented | N/A |
| HeroCarousel | `components/content/HeroCarousel.jsx` | Full-width billboard slideshow | No video autoplay on active slide | D-Imp-1 |
| EpisodeList | `components/content/EpisodeList.jsx` | Season tabs + episode grid | No "Select All" playback, no season trailer | D-Imp-2 |
| VideoPlayer | `components/content/VideoPlayer.jsx` | ArtPlayer + HLS.js with quality selector | No audio/subtitle tracks, no skip intro | D-Imp-3 |
| SourceSelector | `components/content/SourceSelector.jsx` | Auto ⭐ dropdown with Fast/Backup labels | No immediate re-fetch on source change | D-Imp-3 |

## Admin Components (16)

| Component | File | Purpose |
|-----------|------|---------|
| AdminRoute | `components/admin/AdminRoute.jsx` | Admin permission guard |
| AssignDialog | `components/admin/AssignDialog.jsx` | Subscription assignment dialog |
| ConfirmDialog | `components/admin/ConfirmDialog.jsx` | Confirmation dialog |
| DataTable | `components/admin/DataTable.jsx` | Sortable data table |
| ExpiryCountdown | `components/admin/ExpiryCountdown.jsx` | Subscription expiry timer |
| OwnershipDialog | `components/admin/OwnershipDialog.jsx` | Transfer ownership dialog |
| OwnershipLabel | `components/admin/OwnershipLabel.jsx` | Ownership badge |
| PlanSelector | `components/admin/PlanSelector.jsx` | Plan picker dropdown |
| QuotaCard | `components/admin/QuotaCard.jsx` | Usage quota display |
| QuotaEditor | `components/admin/QuotaEditor.jsx` | Quota configuration |
| RenewalDialog | `components/admin/RenewalDialog.jsx` | Subscription renewal |
| StatCard | `components/admin/StatCard.jsx` | Metric display card |
| StatusBadge | `components/admin/StatusBadge.jsx` | Status indicator |
| StatusChip | `components/admin/StatusChip.jsx` | Small status pill |
| SubscriptionBadge | `components/admin/SubscriptionBadge.jsx` | Subscription level badge |
| SubscriptionCard | `components/admin/SubscriptionCard.jsx` | Subscription detail card |
| SubscriptionHistoryTable | `components/admin/SubscriptionHistoryTable.jsx` | Subscription audit log |

## Auth Components (4)

| Component | File | Purpose |
|-----------|------|---------|
| LoginForm | `components/auth/LoginForm.jsx` | Username/password login |
| ProtectedRoute | `components/auth/ProtectedRoute.jsx` | Auth guard — redirects to /login |
| SubscriptionGuard | `components/auth/SubscriptionGuard.jsx` | Subscription status guard |
| SessionExpiredHandler | `components/auth/SessionExpiredHandler.jsx` | 401 interceptor UI |

## Layout (1)

| Component | File | Purpose | Problems | Phase |
|-----------|------|---------|----------|:-----:|
| Header | `components/layout/Header.jsx` | Top nav with search, user menu, nav links | No mobile menu/drawer | D-Imp-4 |

## UI Components (4)

| Component | File | Purpose | Problems | Phase |
|-----------|------|---------|----------|:-----:|
| EmptyState | `components/ui/EmptyState.jsx` | Empty state with icon, title, description | None | N/A |
| ErrorBoundary | `components/ui/ErrorBoundary.jsx` | Error boundary for React tree | None | N/A |
| ErrorState | `components/ui/ErrorState.jsx` | Error display with retry | None | N/A |
| LoadingSkeleton | `components/ui/LoadingSkeleton.jsx` | CardSkeleton, RowSkeleton, PageSkeleton, DetailSkeleton | None | N/A |

## API Modules (8)

| Module | File | Purpose |
|--------|------|---------|
| client | `api/client.js` | Axios instance with interceptors |
| auth | `api/auth.api.js` | Login, logout, verify token |
| content | `api/content.api.js` | Homepage, movies, series, search, stream, progress |
| external-source | `api/external-source.api.js` | External stream play/refresh/recover/sources |
| favorites | `api/favorites.api.js` | Favorites CRUD |
| history | `api/history.api.js` | Watch history CRUD |
| admin | `api/admin.api.js` | Admin dashboard APIs |

## Config & Utils (4)

| File | Purpose |
|------|---------|
| `config/images.js` | TMDB image base URLs |
| `utils/sanitize.js` | Input sanitization |
| `styles/globals.css` | Global styles, Tailwind extensions, animations |
| `context/AuthContext.jsx` | Auth state provider |
| `hooks/useAuth.js` | Auth hook |
| `hooks/useContent.js` | Content data hook |
