# Phase 6 — Frontend Audit

> **Phase:** phase-06-frontend/FINDINGS.md
> **Audit Date:** July 6, 2026
> **Status:** 🔒 **FROZEN** — All 4 batches certified ✅. FE-014 documented as no-action. 14/15 findings resolved (FE-002 moved to future).

---

## Files Examined

### Pages (12 files)
| File | Purpose |
|------|---------|
| `client/src/App.jsx` | Root component — route definitions, auth guard wiring, error boundary |
| `client/src/main.jsx` | Entry point — StrictMode, BrowserRouter, AuthProvider, Toaster |
| `client/src/pages/LoginPage.jsx` | Auth entry — redirects authenticated users to home |
| `client/src/pages/HomePage.jsx` | Main hub — sections, continue watching, favorites |
| `client/src/pages/DetailPage.jsx` | Content detail — backdrop hero, metadata, cast, trailers, episodes |
| `client/src/pages/WatchPage.jsx` | Video playback — HLS + external source, episode switcher, progress |
| `client/src/pages/SearchPage.jsx` | Full-text search — filters, pagination, sanitized results |
| `client/src/pages/CategoryPage.jsx` | Category browse — Hollywood/Bollywood/Korean/South Indian |
| `client/src/pages/NotFoundPage.jsx` | 404 page — animated entrance, helpful links |
| `client/src/pages/admin/AdminDashboard.jsx` | Admin shell — role-based sidebar, nested routing |
| `client/src/pages/admin/AdminOverview.jsx` | System stats dashboard — stat cards, role-adjusted views |

### Components (11 files)
| File | Purpose |
|------|---------|
| `client/src/components/layout/Header.jsx` | Global header — nav links, search bar, user menu |
| `client/src/components/auth/LoginForm.jsx` | Login form — username/password |
| `client/src/components/auth/ProtectedRoute.jsx` | Auth guard — redirects unauthenticated to /login |
| `client/src/components/auth/SessionExpiredHandler.jsx` | Event-based 401 handler — no full page reload |
| `client/src/components/admin/AdminRoute.jsx` | Admin access guard — checks role |
| `client/src/components/content/ContentCard.jsx` | Netflix-style card — hover preview, progress bar, dismiss |
| `client/src/components/content/ContentRow.jsx` | Horizontal carousel — arrow nav, drag scroll, gradient fades |
| `client/src/components/content/HeroCarousel.jsx` | Billboard slideshow — auto-play, touch/swipe, dot nav |
| `client/src/components/content/EpisodeList.jsx` | Season/episode selector — tabs, grid, playing indicator |
| `client/src/components/content/VideoPlayer.jsx` | ArtPlayer + HLS.js — multi-quality, two-effect architecture |
| `client/src/components/ui/LoadingSkeleton.jsx` | Skeleton screens — card, row, page, detail variants |

### Context & Hooks (4 files)
| File | Purpose |
|------|---------|
| `client/src/context/AuthContext.jsx` | Auth state — token, user, login, logout, admin check |
| `client/src/hooks/useAuth.js` | Re-exports useAuth from AuthContext |
| `client/src/hooks/useContent.js` | Generic fetch + paginated fetch hooks |
| `client/src/hooks/useFavorites.js` | Favorites fetching (if exists) |

### API Modules (4 files)
| File | Purpose |
|------|---------|
| `client/src/api/client.js` | Axios instance — request interceptor (JWT, cache-bust), response interceptor (global error handling) |
| `client/src/api/auth.api.js` | Auth endpoints — login, logout, verify, refresh |
| `client/src/api/content.api.js` | Content endpoints — browse, search, stream, progress, thumbnails |
| `client/src/api/external-source.api.js` | External streaming API — play, refresh, stream-info |
| `client/src/api/admin.api.js` | Admin API — 40+ methods for users, content, subscriptions, security |

### Other (2 files)
| File | Purpose |
|------|---------|
| `client/src/utils/sanitize.js` | XSS sanitization — sanitizeSearchInput, sanitizeHtml |
| `client/src/styles/globals.css` | Global styles — Tailwind + custom utilities |

---

## Architecture Overview

```
main.jsx
  └─ StrictMode
      └─ BrowserRouter
          └─ AuthProvider (context)
              └─ App
                  ├─ SessionExpiredHandler (event listener)
                  └─ ErrorBoundary
                      └─ Routes
                          ├─ /login → LoginPage
                          ├─ / → ProtectedRoute → SubscriptionGuard → HomePage
                          ├─ /search → ProtectedRoute → SubscriptionGuard → SearchPage
                          ├─ /category/:cat → ProtectedRoute → SubscriptionGuard → CategoryPage
                          ├─ /watch/:type/:slug → ProtectedRoute → SubscriptionGuard → DetailPage
                          ├─ /watch/:type/:slug/play → ProtectedRoute → SubscriptionGuard → WatchPage
                          ├─ /my-list → ProtectedRoute → SubscriptionGuard → MyListPage
                          ├─ /history → ProtectedRoute → SubscriptionGuard → HistoryPage
                          ├─ /admin → AdminRoute → AdminDashboard (nested Routes)
                          └─ * → NotFoundPage
```

### Data Flow
```
Pages → API Modules (axios) → Server Routes → Services → Models
          ↑                           ↓
     AuthContext (token)         Response (data.data)
          ↑                           ↓
     localStorage              Pages update state
```

---

## Findings Summary

| ID | Severity | Risk | Category | Title | Suggested Batch |
|----|:--------:|:----:|----------|-------|:---------------:|
| ID | Severity | Risk | Category | Title | Suggested Batch |
|----|:--------:|:----:|----------|-------|:---------------:|
| FE-001 | 🟡 Medium | Medium | Performance | Auth token verification blocks entire app render on mount | ✅ A — Certified |
| FE-002 | 🟡 Low | Low | Architecture | No TypeScript — all client code untyped | 📝 Future |
| FE-003 | 🟡 Medium | High | UX | HomePage fetchSections not in useEffect dependency array | ✅ A — Certified |
| FE-004 | 🟢 Low | Low | Performance | Cache-bust _t=Date.now() on every GET prevents browser caching entirely | ✅ A — Certified |
| FE-005 | 🟢 Low | Medium | Reliability | Admin API .then(r => r.data.data) swallows errors from React boundaries | ✅ A — Certified |
| FE-006 | 🟢 Low | Medium | UX | AuthContext exposes user and token in localStorage — accessible from XSS | ✅ B — Certified |
| FE-007 | 🟢 Low | Low | Accessibility | Loading skeletons lack aria attributes for screen readers | ✅ B — Certified |
| FE-008 | 🟢 Low | Low | Accessibility | ErrorState uses generic div elements instead of role="alert" | ✅ B — Certified |
| FE-009 | 🟢 Low | Medium | Reliability | HomePage parallel fetches have no timeout for individual requests | ✅ B — Certified |
| FE-010 | 🟢 Low | Low | Performance | HeroCarousel creates new Image() on every render cycle for preloading | ✅ B — Certified |
| FE-011 | 🟢 Low | Low | UX | WatchPage orientation change handler creates new timeout on each call | ✅ C — Certified |
| FE-012 | 🟢 Low | Low | Security | SearchPage sanitizes API responses client-side — defense-in-depth but inconsistent | ✅ C — Certified |
| FE-013 | 🟢 Low | Low | UX | ContentCard hover panel clips on edge of screen for rightmost cards | ✅ C — Certified |
| FE-014 | ℹ️ Info | — | Architecture | No React.memo/useMemo on large lists (ContentRow, SearchPage) | ✅ D — No-action (adequate at current scale) |
| FE-015 | ℹ️ Info | — | Architecture | Multiple pages duplicate TMDB_IMAGE_BASE constant | ✅ D — Certified |

---

## Detailed Findings

### FE-001 — Auth Token Verification Blocks Entire App Render (🟡 Medium, Medium Risk)

**Category:** Performance
**Files affected:** `client/src/context/AuthContext.jsx`, `client/src/App.jsx`

**Observation:**
On mount, `AuthProvider` checks for a stored token and calls `authApi.verify()`. While this request is in-flight, `loading` is `true` and `App.jsx` renders a full-screen spinner instead of the route tree:

```javascript
// AuthContext.jsx — verify on mount
useEffect(() => {
  const storedToken = localStorage.getItem('novastream_token');
  if (storedToken) {
    authApi.verify()  // Can take 3-12 seconds
      .then(...)
      .catch(...)
      .finally(() => setLoading(false));
  }
}, []);

// App.jsx — blocks all rendering
if (loading) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-netflix-dark">
      <div className="w-10 h-10 border-2 border-netflix-red border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
```

**Impact:**
- Every page navigation causes a 3-12 second visible spinner on hard refresh
- Users with slow connections see a blank page with a spinner for extended periods
- The login page (which doesn't require auth) is blocked until verification completes
- No timeout is set on the verify request — a hung network request keeps the page locked indefinitely

**Root cause:** Auth verification is treated as a blocking operation for the entire app, even though most pages don't require auth.

**Recommended remediation:**
- Option A (preferred): Render the app immediately with `loading=false`. Let `ProtectedRoute` handle the auth check for guarded routes. Show a skeleton on the login page while verifying.
- Option B (simple): Add a timeout (5s) to the verify request. If it hangs, clear the token and render unauthenticated.
- Option C (minimal): At minimum, render the login page immediately without waiting for verification.

---

### FE-002 — No TypeScript — All Client Code Untyped (🟡 Medium, Medium Risk)

**Category:** Architecture
**Files affected:** All `client/src/` files (.jsx/.js extensions)

**Observation:**
The entire client codebase uses JavaScript (JSX/JS), not TypeScript. This means:
- No type checking on API responses — `data.data` is `any`
- No compile-time validation of prop shapes
- No IDE autocomplete for complex nested objects (e.g., `item.seasons[0].episodes[0].stillPath`)
- Runtime errors from undefined nesting (`item?.seasons?.[0]?.episodes?.[0]?.stillPath`) are common

**Impact:**
- Common runtime errors: `Cannot read property 'map' of undefined` when API shape changes
- No type safety for API parameters — `contentApi.getStreamToken(contentId, contentType)` accepts any strings
- `admin.api.js` has 40+ methods all returning `r.data.data` — none typed

**Root cause:** Project started without TypeScript. Adding it now would require significant migration.

**Recommended remediation:**
- Not a quick fix — TypeScript migration is a separate project
- At minimum: Add JSDoc type annotations to critical API boundary files (api/client.js, context/AuthContext.jsx, useContent.js)
- Create shared type definition files for key domain objects (Content, Episode, User, Pagination)

---

### FE-003 — HomePage useEffect Has Missing Dependency (🟡 Medium, High Risk)

**Category:** UX
**Files affected:** `client/src/pages/HomePage.jsx`

**Observation:**
The `fetchSections` function is defined inside the component and used in `useEffect`, but not included in the dependency array:

```javascript
const fetchSections = async () => { ... };

useEffect(() => {
  fetchSections();
}, []); // Missing: fetchSections
```

This works because `fetchSections` is a stable function reference on mount (it's re-created on every render but the effect only runs once). However, if any state variable used inside `fetchSections` changes (e.g., `loading`, `error`), the function captures old values.

**Impact:**
- The effect is intended to run once on mount. Currently works correctly because:
  1. No props are used in fetchSections
  2. The effect intentionally runs once (no re-fetch needed)
- However, if the component ever needs to re-fetch based on a prop change, this pattern breaks silently
- The eslint-disable comment is a warning sign that the pattern is fragile

**Root cause:** The `fetchSections` function is defined outside the effect, making the dependency relationship non-obvious.

**Recommended remediation:**
- Move `fetchSections` inside the `useEffect` to make the dependency explicit
- OR use `useCallback` with stable deps and include `fetchSections` in the dependency array
- Pattern used in other pages (SearchPage, CategoryPage) does this correctly with `useCallback`

---

### FE-004 — Cache-Busting _t Prevents All Browser Caching (🟢 Low, Low Risk)

**Category:** Performance
**Files affected:** `client/src/api/client.js`

**Observation:**
The request interceptor adds a timestamp to every GET request:

```javascript
if (config.method === 'get') {
  config.params = { ...config.params, _t: Date.now() };
}
```

This prevents the browser from caching responses. While this guarantees fresh data after mutations, it also:
- Prevents caching of truly immutable responses (e.g., images proxied through `/api/images/`)
- Prevents caching of slowly-changing data (e.g., category lists, content metadata)
- Adds a cache-busting parameter to EVERY GET, including internal API calls that don't need it

**Impact:**
- All GET requests hit the server every time — no 304 Not Modified support
- Content like homepage sections (which changes rarely) is re-fetched on every page load
- Browser back/forward navigation re-fetches all content
- The cache-bust doesn't distinguish between mutable and immutable resources

**Root cause:** Heavy-handed cache prevention. The `_t` parameter was added to fix a specific bug (stale cache after user deletion — F-004 side effect) but was applied globally.

**Recommended remediation:**
- Only add `_t` to mutation-aware requests (POST, PUT, DELETE responses redirect to GET)
- OR rely on proper `Cache-Control: no-cache` headers from the server
- OR use ETag/If-None-Match for conditional requests instead of query parameter cache-busting

---

### FE-005 — Admin API .then() Chains Swallow Errors from React Boundaries (🟢 Low, Medium Risk)

**Category:** Reliability
**Files affected:** `client/src/api/admin.api.js`

**Observation:**
All admin API methods use `.then(r => r.data.data)`:

```javascript
getUsers: () => apiClient.get('/admin/users').then(r => r.data.data),
```

If the `.then()` throws (e.g., `r.data` is undefined because the server returned an unexpected shape), the error becomes an unhandled promise rejection. React error boundaries do NOT catch promise rejections by default — they only catch render-time errors.

**Impact:**
- A malformed server response causes silent failures instead of showing the error boundary UI
- Debugging requires catching the unhandled rejection globally
- Some admin pages (AdminDashboard, AdminOverview) use silent try/catch on these calls, masking errors

**Root cause:** The `.then(r => r.data.data)` pattern was used for brevity but breaks React's error handling model.

**Recommended remediation:**
- Move `r.data.data` extraction into the API function body with proper try/catch
- Or use an Axios response interceptor to normalize `data.data` to `data`
- Or add `.catch()` handlers to each admin API method

---

### FE-006 — Token and User Data in localStorage Accessible from XSS (🟢 Low, Medium Risk)

**Category:** Security
**Files affected:** `client/src/context/AuthContext.jsx`, `client/src/api/client.js`

**Observation:**
JWT tokens and user data are stored in `localStorage`:

```javascript
localStorage.setItem('novastream_token', result.token);
localStorage.setItem('novastream_user', JSON.stringify(result.user));
```

The token is then attached to every request via the Axios interceptor:

```javascript
const token = localStorage.getItem('novastream_token');
if (token) {
  config.headers.Authorization = `Bearer ${token}`;
}
```

**Impact:**
- Any XSS vulnerability in the application can steal the token
- Third-party scripts injected via compromised CDNs can access localStorage
- The token persists until explicitly cleared — no browser session boundary

**Root cause:** localStorage is the simplest persistence mechanism but lacks the httpOnly protection of cookies.

**Risk factor:** Low because:
1. The token has a 7-day expiry
2. Server-side session validation (S-002 fix) prevents replay of revoked tokens
3. Stream tokens are IP-bound and content-bound (Phase 5 Batch A fixes)
4. No sensitive PII is stored in the user object

**Recommended remediation:**
- Option A (httpOnly cookie): Store the auth JWT in an httpOnly cookie instead of localStorage. The cookie is automatically sent with same-origin requests and is inaccessible to JavaScript. This eliminates the XSS exfiltration vector entirely.
- Option B (memory): Store the token only in React state (AuthContext). Persist only a session identifier. On refresh, the server issues a new token. Higher UX friction (brief loading on each refresh).
- Option C (minimal): Add Content-Security-Policy headers to limit script execution. This is defense-in-depth, not a solution.

---

### FE-007 — Loading Skeletons Lack ARIA Attributes (🟢 Low, Low Risk)

**Category:** Accessibility
**Files affected:** `client/src/components/ui/LoadingSkeleton.jsx`, all pages using skeletons

**Observation:**
Skeleton components use CSS shimmer animations with no ARIA attributes:

```javascript
export function CardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[150px] md:w-[160px]">
      <div className="aspect-[2/3] rounded shimmer" />
      <div className="mt-2 h-3 w-3/4 rounded shimmer" />
      <div className="mt-1 h-2 w-1/2 rounded shimmer" />
    </div>
  );
}
```

Screen readers:
- Cannot identify these elements as loading placeholders
- Announce nothing during the loading state
- Transition from "nothing" to "content" without context

**Impact:**
- Users relying on screen readers experience a silent gap during content loading
- ARIA live regions (`aria-busy`, `aria-label`) are not set
- The shimmer is purely visual with no semantic meaning

**Root cause:** Accessibility was not considered during skeleton component creation.

**Recommended remediation:**
- Add `aria-busy="true"` to container elements during loading
- Add `aria-label="Loading content..."` to skeleton containers
- Mark skeleton elements with `aria-hidden="true"` to hide from screen readers
- Consider adding `role="status"` with a live region for loading states

---

### FE-008 — ErrorState Uses Generic Divs Instead of role="alert" (🟢 Low, Low Risk)

**Category:** Accessibility
**Files affected:** `client/src/components/ui/ErrorState.jsx`

**Observation:**
The ErrorState component renders plain divs with no ARIA role:

```javascript
export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <span className="text-5xl mb-4">⚠️</span>
      <h3 className="text-xl font-semibold text-netflix-text mb-2">Error</h3>
      <p className="text-netflix-text-2 max-w-md mb-6">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-primary">Try Again</button>
      )}
    </div>
  );
}
```

**Impact:**
- Screen readers may not announce the error state immediately
- The error message is not associated with the retry button via aria-describedby
- No role="alert" or aria-live="assertive" to notify assistive technology

**Root cause:** Accessibility was not considered during error state component creation.

**Recommended remediation:**
- Add `role="alert"` to the container
- Add `aria-live="assertive"` for dynamic error announcements
- Consider `aria-describedby` from error message to retry button

---

### FE-009 — HomePage Parallel Fetches Have No Individual Timeouts (🟢 Low, Medium Risk)

**Category:** Reliability
**Files affected:** `client/src/pages/HomePage.jsx`

**Observation:**
HomePage fires three API requests in sequence (sections, continue watching, favorites). The secondary requests (continue watching, favorites) are wrapped in try/catch and silently ignored on failure:

```javascript
try {
  const sectionData = await contentApi.getHomepageSections();
  // ...
  try {
    const progressData = await contentApi.getContinueWatching();
    // ...
  } catch { /* Continue watching unavailable — homepage still works */ }
  // ...
} catch (err) {
  setError(err.response?.data?.message || err.message || 'Failed to load homepage');
}
```

**Impact:**
- If the sections request hangs (no timeout), the entire homepage never renders
- The 60s Axios timeout is the only protection — 60 seconds of blank loading
- Secondary requests are sequential (not parallel), increasing total load time
- No way to cancel a hung sections request

**Root cause:** Sequential fetching without timeout customization per request.

**Recommended remediation:**
- Use `Promise.allSettled` for parallel fetching of independent data
- Add per-request timeouts (5s for secondary, 10s for primary)
- Consider `AbortController` for request cancellation on unmount

---

### FE-010 — HeroCarousel Image Preloading Creates New Image Objects on Every Render (🟢 Low, Low Risk)

**Category:** Performance
**Files affected:** `client/src/components/content/HeroCarousel.jsx`

**Observation:**
The image preloading effect runs whenever `items` changes and creates new `Image()` objects:

```javascript
useEffect(() => {
  if (!items || items.length === 0) return;
  items.forEach((item, index) => {
    if (!item.backdropPath) return;
    const img = new Image();
    img.onload = () => setImagesLoaded((prev) => ({ ...prev, [index]: true }));
    img.onerror = () => setImagesLoaded((prev) => ({ ...prev, [index]: false }));
    img.src = `${TMDB_IMAGE_BASE}/w1280${item.backdropPath}`;
  });
}, [items]);
```

**Impact:**
- If `items` is a new array reference on every render (common with API responses), this effect re-runs and re-downloads all images
- No cleanup — abandoned Image objects continue loading in memory
- `imagesLoaded` state is never cleaned up when items change (stale entries accumulate)
- The state update with spread operator creates a new object on each image load, re-rendering the component

**Root cause:** The effect lacks cleanup for abandoned Image objects and doesn't handle reference instability.

**Recommended remediation:**
- Only preload next/prev slides (not all slides) — Netflix-style
- Add cleanup that aborts in-flight Image loads on effect re-run
- Use `useMemo` to stabilize the items array reference
- Consider using IntersectionObserver for lazy loading instead of eager preloading

---

### FE-011 — WatchPage Orientation Handler Creates New Timeout on Each Call (🟢 Low, Low Risk)

**Category:** UX
**Files affected:** `client/src/pages/WatchPage.jsx`

**Observation:**
The orientation change handler wraps resize in a setTimeout but doesn't track the timeout:

```javascript
const handleOrientationChange = () => setTimeout(handleResize, 100);
window.addEventListener('orientationchange', handleOrientationChange);
```

Each orientation change creates a new timer. If the user rapidly rotates the device, multiple timers accumulate and all fire, causing rapid resize state updates.

**Impact:**
- Rapid device rotation causes multiple queued resize handlers
- No cleanup for the timeout — if the component unmounts during rotation, the timeout still fires
- The `isPortrait` state update may cause unnecessary re-renders

**Root cause:** Missing debounce/throttle and timeout cleanup.

**Recommended remediation:**
- Use a debounced resize handler instead of a delayed orientation handler
- Or: track the timeout reference and clear it before creating a new one
- Or: use `matchMedia('(orientation: portrait)')` listener directly

---

### FE-012 — Client-Side API Response Sanitization (🟢 Low, Low Risk)

**Category:** Security
**Files affected:** `client/src/pages/SearchPage.jsx`, `client/src/utils/sanitize.js`

**Observation:**
SearchPage sanitizes API responses before rendering:

```javascript
const safeItem = {
  ...item,
  title: item.title ? sanitizeHtml(item.title) : item.title,
  overview: item.overview ? sanitizeHtml(item.overview) : item.overview,
  tagline: item.tagline ? sanitizeHtml(item.tagline) : item.tagline,
};
```

**Impact:**
- This is defense-in-depth (good!) but inconsistent
- Only SearchPage sanitizes — DetailPage, WatchPage, HomePage render API responses directly
- The sanitization adds per-item processing overhead for every search result
- If the API is trusted (proper output encoding), this is unnecessary

**Root cause:** Partial implementation — sanitization was added to one page but not consistently applied.

**Recommended remediation:**
- Either: Apply sanitization at the API client level (response interceptor) for all responses
- Or: Trust the server's output encoding and remove client-side sanitization
- Key insight: React already escapes JSX values by default — the sanitizeHtml function only protects against dangerouslySetInnerHTML usage, which isn't used anywhere

---

### FE-013 — ContentCard Hover Panel Clips on Screen Edge (🟢 Low, Low Risk)

**Category:** UX
**Files affected:** `client/src/components/content/ContentCard.jsx`

**Observation:**
The hover info panel (`absolute top-full left-0`) extends below the card:

```javascript
{isHovered && (
  <div className="absolute top-full left-0 w-full bg-netflix-dark-2 rounded-b-md shadow-2xl p-3 animate-fade-in z-30">
    {/* Action buttons, title, rating, genres, overview */}
  </div>
)}
```

For items at the bottom of a row (when the row is near the bottom of the viewport), the panel extends below the visible area with no repositioning logic. Similarly, the panel is anchored to the left of the card (`left: 0`), so for rightmost cards, the panel may extend beyond the screen edge.

**Impact:**
- Cards in the last row: hover panel clips below viewport
- Rightmost cards: hover panel content may overflow horizontally
- No fallback positioning (e.g., flip direction)

**Root cause:** Fixed positioning assumption that the card is always in the top-left of the viewport.

**Recommended remediation:**
- Use a portal with position calculation (flip panel direction based on viewport space)
- Or: Use CSS container queries with `position: fixed` and manual position adjustment
- Or: Detect viewport edges and apply offset classes

---

### FE-014 — No React.memo/useMemo on Large Lists (ℹ️ Informational)

**Category:** Architecture
**Files affected:** `client/src/components/content/ContentRow.jsx`, `client/src/pages/SearchPage.jsx`

**Observation:**
ContentRow maps over potentially large item arrays without memoization:

```javascript
{items.map((item, index) => (
  <ContentCard key={item._id || item.tmdbId || index} item={item} />
))}
```

SearchPage re-renders all results on every keystroke (due to `useMemo` on groupedItems, but the individual ContentCard instances still re-render).

**Impact:**
- Low impact currently (~20-50 items per row, manageable)
- Becomes impactful with 100+ items (search results could reach 200+)
- Each scroll/state change re-renders all cards in all rows

**Recommended remediation:**
- Wrap ContentCard in React.memo (prop comparison on item._id)
- Use virtualized lists (react-window or similar) if item counts exceed 100
- Apply useMemo to filtered/sorted arrays in SearchPage

---

### FE-015 — TMDB_IMAGE_BASE Duplicated Across Files (ℹ️ Informational)

**Category:** Architecture
**Files affected:** `client/src/pages/DetailPage.jsx`, `client/src/pages/WatchPage.jsx`, `client/src/components/content/HeroCarousel.jsx`, `client/src/components/content/ContentCard.jsx`, `client/src/components/content/EpisodeList.jsx`

**Observation:**
The TMDB image base URL is hardcoded in at least 5 files:

```javascript
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';
```

This duplicates a constant that should be sourced from a single location (e.g., the API or a config file). If the TMDB image CDN URL ever changes, all 5 files need updating.

**Impact:**
- Low — the URL is stable and unlikely to change
- But it violates DRY and makes the codebase harder to maintain
- The API already provides image URL capabilities via `contentApi.getImageUrl()`, but this function is only used in some places

**Root cause:** Each component independently defines the constant for convenience.

**Recommended remediation:**
- Move `TMDB_IMAGE_BASE` to a shared config file (e.g., `client/src/config/images.js`)
- OR: Consolidate all image URL construction into `contentApi.getImageUrl()` and use it everywhere
- OR: Have the server return fully-qualified image URLs (preferred — avoids client-side URL construction)

---

## Key Positive Observations

| Area | Assessment |
|------|:----------:|
| **Error handling** | ✅ Consistent ErrorState with retry on all pages |
| **Loading states** | ✅ Dedicated skeleton components per page type |
| **Auth flow** | ✅ Event-based token expiry (no full page reload), SessionExpiredHandler |
| **Optimistic updates** | ✅ Favorites toggle on HomePage — instant UI, rollback on failure |
| **Stream token security** | ✅ No tokens in URLs (Phase 5 Batch A), httpOnly cookie |
| **Progress saving** | ✅ Fire-and-forget with keepalive: true, 15s throttle |
| **Props via refs** | ✅ VideoPlayer uses refs for callbacks (no stale closures in effects) |
| **Cancel patterns** | ✅ WatchPage uses `cancelled` flags for cleanup of async operations |
| **Component composition** | ✅ Well-structured with clear separation of concerns |
| **UI animations** | ✅ Framer Motion + CSS transitions for polished feel |
| **Mobile responsiveness** | ✅ Adaptive layouts, touch/swipe, orientation handling |
| **Admin role-based UI** | ✅ Dynamic sidebar, role-adjusted views, conditional routes |

---

## Risk Assessment

| Severity | Count | Suggested Batch |
|:--------:|:-----:|----------------|
| 🟡 Medium | 3 | Batch A — Performance + Architecture (FE-001, FE-002, FE-003) |
| 🟢 Low | 7 | Batch B — UX + Reliability + Security (FE-004→FE-010) |
| 🟢 Low | 3 | Batch C — Edge cases + polish (FE-011→FE-013) |
| ℹ️ Info | 2 | Batch D — Future improvements (FE-014, FE-015) |

## Suggested Batch Order

| Batch | Findings | Focus |
|:-----:|:--------:|-------|
| **A** | FE-001, FE-002, FE-003 | Auth render blocking, TypeScript gap, dependency stability |
| **B** | FE-004→FE-010 | Caching, error handling, accessibility, reliability, security |
| **C** | FE-011→FE-013 | Orientation handler, sanitization consistency, card overflow |
| **D** | FE-014, FE-015 | Memoization, config deduplication |
