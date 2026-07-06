# NovaStream — Future Work & Implementation Guide

> **Part of:** [NovaStream Server Plan](./README.md)
> **Last Updated:** July 4, 2026

---

## 17. Admin Dashboard — Web GUI for Server Management

> **Phase:** 7 (Active Planning)
> **Status:** ✅ Fully Implemented — See STATUS.md for details
> **Purpose:** Replace `novactl` CLI for day-to-day server management with a full GUI admin panel + subscription management system

### 17.1 Overview

The current `novactl` CLI manages only the Node.js API server (start/stop/restart/logs). There is no web-based interface for server management. This dashboard will provide a complete GUI for managing both the **API server** and the **UI client** from the browser, accessible at `/admin` route.

```
Current:  novactl health  →  terminal output (text)
Target:   /admin           →  browser dashboard (GUI with charts, tables, live data)
```

### 17.2 Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Browser (/admin)                             │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  AdminDashboard.jsx                                         │   │
│  │  ├─ AdminOverview.jsx      — Status, uptime, memory         │   │
│  │  ├─ AdminUsers.jsx         — CRUD users table               │   │
│  │  ├─ AdminContent.jsx       — Browse/toggle/delete content   │   │
│  │  ├─ AdminLogs.jsx          — Streaming tail log viewer      │   │
│  │  ├─ AdminSecurity.jsx      — IP block/unblock, sessions     │   │
│  │  ├─ AdminHealth.jsx        — CPU, memory, disk gauges       │   │
│  │  ├─ AdminDatabase.jsx      — MongoDB stats, collections     │   │
│  │  ├─ AdminConfig.jsx        — Env var viewer (masked)        │   │
│  │  └── DashboardSidebar.jsx  — Navigation tabs                │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Shared Components:                                                  │
│  ├─ StatCard.jsx            — Reusable stat card widget             │
│  ├─ StatusBadge.jsx         — Online/Offline badge                 │
│  ├─ DataTable.jsx           — Reusable sortable table               │
│  └─ ConfirmDialog.jsx       — Confirmation modal                    │
└─────────────────────────────────┬───────────────────────────────────┘
                                  │
┌─────────────────────────────────▼───────────────────────────────────┐
│  Backend API Endpoints (Admin)                                      │
│                                                                     │
│  Existing (9 endpoints in admin.routes.js):                         │
│    GET/POST/DELETE /api/admin/users                                 │
│    POST   /api/admin/users/:id/reset                                │
│    GET/PUT/DELETE /api/admin/content                                │
│    GET    /api/admin/stats                                          │
│    GET    /api/admin/logs                                           │
│                                                                     │
│  New endpoints needed (7):                                          │
│    GET    /api/admin/system/health   — CPU, memory, disk, uptime    │
│    GET    /api/admin/system/process  — PID, PM2 status              │
│    GET    /api/admin/database        — MongoDB stats, collections   │
│    GET    /api/admin/sessions        — Active sessions with user    │
│    DELETE /api/admin/sessions/:id    — Force-invalidate a session   │
│    GET    /api/admin/config          — Server .env (masked)         │
│    POST   /api/admin/config/validate — Validate .env integrity      │
└─────────────────────────────────────────────────────────────────────┘
```

### 17.3 Dashboard Sections

#### 17.3.1 Server Overview (`/admin` landing)
- **Status badge** — Green (online) / Red (offline) / Yellow (degraded)
- **Uptime** — Live counter: days/hours/minutes
- **Node.js** — Version, environment tag (dev/prod)
- **Active Users** — Count badge
- **Active Sessions** — Currently valid JWT sessions
- **Total Content** — Movies + Series count
- **Memory Usage** — Heap used / Total / RSS (bar)
- **Disk Usage** — Media + thumbnails storage size

#### 17.3.2 User Management (`/admin/users`)
- **Columns:** Username, Display Name, Role (admin/user badge), Status (active/inactive toggle), Last Login, Created
- **Actions:** Create (inline form), Toggle role, Toggle active, Reset password, Delete (with confirmation)
- **Search** — Filter by username
- **Pagination** — 20 per page

#### 17.3.3 Content Manager (`/admin/content`)
- **Table:** Title, Type (movie/series badge), Status, Featured, View Count, Rating, Created
- **Filters:** Type (movie/series/all), Status (active/inactive/all)
- **Actions:** Toggle featured, Toggle active (soft delete), View detail (link)
- **Search** — By title
- **Quick stats** — Total / movies / series count

#### 17.3.4 System Health (`/admin/health`)
- **CPU** — Usage gauge (via `os` module)
- **Memory** — Bar chart: RSS / Heap Used / Heap Total
- **Uptime** — Live counter
- **Node.js** — Version, event loop
- **Disk** — Media + thumbnails size
- **MongoDB** — Ping status indicator

#### 17.3.5 Log Viewer (`/admin/logs`)
- **Tail mode** — Auto-refresh every 3s
- **Line count** — 50 / 100 / 200 / 500
- **Log level filter** — Info / Warn / Error / All
- **Search within logs** — Client-side filter
- **Highlighting** — Error = red, Warn = yellow
- **Auto-scroll toggle** — Follow new lines

#### 17.3.6 Security (`/admin/security`)
- **Blocked IPs** — Table with IP, Reason, Blocked By, Expires, Unblock action
- **Active Sessions** — Table with Username, IP, User Agent, Created, Force Logout action
- **Block IP Form** — IP input + reason selector + duration

#### 17.3.7 Database (`/admin/database`)
- **Connection Status** — Green/Red indicator
- **Collections** — List with document counts
- **Database Size** — Data size, storage size, indexes

#### 17.3.8 Configuration (`/admin/config`)
- **Key-value display** — All env vars with masked secrets
- **Config file path** — Displayed for reference
- **Last modified** — Timestamp

#### 17.3.9 Process Manager (`/admin/process`)
- **PID**, **Uptime**, **Memory** (live MB), **CPU** (%)
- **Restart count** — PM2 restart history
- **Actions** — Restart server button (via PM2)

### 17.4 Files to Create

**Frontend (new files):**
```
client/src/
├── pages/
│   └── admin/
│       ├── AdminDashboard.jsx       # Main dashboard page (tabbed navigation)
│       ├── AdminOverview.jsx        # Server overview cards
│       ├── AdminUsers.jsx           # User management
│       ├── AdminContent.jsx         # Content manager
│       ├── AdminHealth.jsx          # System health
│       ├── AdminLogs.jsx            # Log viewer
│       ├── AdminSecurity.jsx        # Security panel
│       ├── AdminDatabase.jsx        # Database panel
│       ├── AdminConfig.jsx          # Configuration viewer
│       └── AdminProcess.jsx         # Process manager
├── components/
│   └── admin/
│       ├── StatCard.jsx             # Reusable stat card widget
│       ├── StatusBadge.jsx          # Online/Offline badge
│       ├── DataTable.jsx            # Reusable sortable table
│       ├── ConfirmDialog.jsx        # Confirmation modal
│       ├── ActivityTimeline.jsx     # Recent activity feed
│       └── MiniChart.jsx            # Simple sparkline chart
├── api/
│   └── admin.api.js                 # NEW: All admin API methods
```

**Backend (new/modified files):**
```
server/src/
├── routes/
│   └── admin.routes.js              # EXPAND: Add 7 new endpoints
├── services/
│   └── system.service.js            # NEW: OS-level stats (CPU, mem, disk)
```

### 17.5 New API Endpoints

| Method | Path | Description | Data Source |
|--------|------|-------------|-------------|
| `GET` | `/api/admin/system/health` | CPU, memory, disk, uptime, Node.js info | `os` + `process` |
| `GET` | `/api/admin/system/process` | PID, PM2 status, resource usage | `process` + PM2 |
| `GET` | `/api/admin/database` | MongoDB collections, sizes, counts | `db.stats()` |
| `GET` | `/api/admin/sessions` | Active sessions with user info | Session + User |
| `DELETE` | `/api/admin/sessions/:id` | Force-invalidate a session | Session model |
| `GET` | `/api/admin/config` | Server env vars (masked secrets) | `process.env` |
| `POST` | `/api/admin/config/validate` | Validate .env file integrity | File read + Zod |

**Total admin endpoints: 16 (existing 9 + 7 new)**

### 17.6 Data Flow

```
1. Admin logs in via normal /login (must be admin role)
2. AuthContext provides JWT token
3. ProtectedRoute checks isAuthenticated
4. AdminDashboard checks user.role === 'admin' OR renders 403 error
5. Dashboard mounts → Parallel data fetch:
   ├── GET /api/admin/stats              → Overview cards
   ├── GET /api/admin/system/health      → Health panel
   ├── GET /api/admin/system/process     → Process panel
   └── (Tab-specific fetches on navigation)
6. Each panel fetches its own data when tab is active
7. Periodic auto-refresh:
   ├── Health panel (every 10s)
   ├── Log viewer (every 3s)
   └── Overview stats (every 30s)
```

### 17.7 Security

| Layer | Protection |
|-------|-----------|
| **Route guard** | `<AdminRoute>` component checks `user.role === 'admin'`, shows 403 error if not |
| **Backend guard** | All 16 admin endpoints use `authenticate` + `adminOnly` + `streamLimiter` (30/min) |
| **Data masking** | Config panel masks secrets (same pattern as `novactl config show`) |
| **Sensitive actions** | Delete user, reset password, force logout all require confirmation dialog |
| **Rate limiting** | Admin API calls limited to 30 req/min to prevent abuse |
| **Audit logging** | All admin actions logged via Pino with username and action type |

### 17.8 Implementation Phases

#### Phase 1: Foundation (Day 1)
- [ ] Create `admin.api.js` with all existing admin API methods
- [ ] Create `StatCard.jsx`, `StatusBadge.jsx`, `DataTable.jsx` base components
- [ ] Create `AdminDashboard.jsx` with sidebar navigation + routing
- [ ] Add `/admin` and `/admin/*` routes to `App.jsx`

#### Phase 2: Overview + Health (Day 2)
- [ ] Create `AdminOverview.jsx` — Stat cards grid, uptime display
- [ ] Create `AdminHealth.jsx` — CPU, memory, disk gauges
- [ ] Add `GET /api/admin/system/health` endpoint
- [ ] Add `GET /api/admin/system/process` endpoint
- [ ] Create `server/src/services/system.service.js` — OS stats service

#### Phase 3: User Management (Day 2-3)
- [ ] Create `AdminUsers.jsx` — User table with CRUD
- [ ] Wire `GET/POST/DELETE /api/admin/users` + `POST /api/admin/users/:id/reset`
- [ ] Add inline form for user creation + password reset

#### Phase 4: Content Management (Day 3)
- [ ] Create `AdminContent.jsx` — Content table with filters
- [ ] Wire `GET/PUT/DELETE /api/admin/content`
- [ ] Add toggle switches for featured/active

#### Phase 5: Logs + Security + DB + Config (Day 3-4)
- [ ] Create `AdminLogs.jsx` with auto-refresh, level filter, search
- [ ] Create `AdminSecurity.jsx` — IP management + sessions table
- [ ] Create `AdminDatabase.jsx` — MongoDB stats display
- [ ] Create `AdminConfig.jsx` — Env var viewer
- [ ] Create `AdminProcess.jsx` — PM2 process display
- [ ] Add remaining 7 backend endpoints

#### Phase 6: Polish + Error Handling (Day 4-5)
- [ ] Loading states for all panels (skeleton placeholders)
- [ ] Empty states (no users, no blocked IPs, no logs)
- [ ] Error states with retry button per panel
- [ ] Responsive design (sidebar collapses to hamburger on mobile)
- [ ] Dark theme matching existing Netflix-style app design
- [ ] Confirmation dialogs for all destructive actions
- [ ] Toast notifications on success/failure
- [ ] Configurable refresh intervals

### 17.9 Edge Case Handling

| Edge Case | Handling |
|-----------|----------|
| **Non-admin user accesses `/admin`** | Backend returns 403, frontend shows error + "Go Home" button |
| **API call fails (network)** | Retry button per panel, cached data shown if available, toast notification |
| **MongoDB is down** | Status shows "Disconnected", panels show "Unavailable" gracefully |
| **Log file doesn't exist** | Show empty state with "No logs yet" + instructions |
| **Config file missing** | Show warning with path + setup instructions |
| **Lots of content (1000+)** | Server-side pagination on all table endpoints (already implemented) |
| **Auto-refresh causes visual jitter** | Smooth transitions, loading skeleton for updated sections only |
| **User deletes themselves** | Prevented by backend (self-deletion blocked) |
| **Last admin account deletion** | Prevented by backend (admin count check) |
| **Dashboard initial load time** | Lazy load panel components, show skeleton for overview first |
| **Browser tab hidden (logs auto-refresh)** | Pause refresh when tab hidden, resume on visibility change |
| **Very long usernames/URLs** | Truncate with tooltip, CSS overflow handling |
| **Concurrent admin actions** | Optimistic updates with rollback on failure |
| **PM2 not installed** | Process panel shows "PM2 not available" with fallback info |
| **Server is offline** | Shows last known data + timestamp, indicates stale data |

---



## 18. External Content Source Integration — Catalog Sync & Streaming

> **Phase:** 8
> **Status:** ✅ Fully Implemented — See `docs/STATUS.md` §Phase 8 for details
> **Purpose:** Periodically sync external content catalog into NovaStream, stream videos directly from CDN, and manage token expiry with smart caching

### 18.1 Design Principles (From User Decisions)

1. **Dynamic homepage** — NovaStream fetches YupFlix's homepage every 6 hours at aligned times (00:00, 06:00, 12:00, 18:00). Whatever YupFlix shows is what NovaStream shows — always fresh
2. **Only playable content** — Only content that exists in YupFlix's catalog is displayed. No TMDB data for content that can't actually be played
3. **YupFlix's own poster URLs** — Use `posterPath` and `backdropPath` directly from YupFlix API (no TMDB dependency for display)
4. **Direct CDN streaming** — Video NEVER flows through our server. Browser plays `.m3u8` URLs directly from streamraiwind.stream CDN
5. **Lazy fetch + smart caching** — Video URLs are fetched ONLY when a user clicks "Play" for the first time. No periodic pre-fetching of all content. In-memory cache with TTL = token expiry minus **10 min** safety buffer. Cache serves all subsequent users until near-expiry, then silently refreshes in the background

### 18.2 Architecture Overview

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                        EVERY 6 HOURS (00:00, 06:00, 12:00, 18:00)                  │
│                                                                                      │
│  NovaStream Server (Cron Job)                                                        │
│       │                                                                              │
│       ▼                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  YupflixSyncService                                                          │   │
│  │                                                                                │   │
│  │  1. Fetch GET /api/views/homepage/sections from YupFlix API                   │   │
│   │  2. For each section's items:                                                  │   │
│   │     ├── New item (not in DB) → INSERT into YupflixContent collection          │   │
│   │     │     - Store _id, tmdbId, title, posterPath, backdropPath, etc.          │   │
│   │     │     - Store contentType (movie/series) & categories (Hollywood/etc.)    │   │
│   │     │     - Store sections[] this item appears in                              │   │
│   │     ├── Existing item → UPDATE fields (voteAverage, viewCount, etc.)          │   │
│   │     └── Item from previous sync NOT in response → MARK as inactive            │   │
│   │  3. Update sections structure (order, titles, section types)                   │   │
│   │  4. Log sync summary: X new, Y updated, Z removed                              │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
│                                                                                      │
│                        ON USER PLAYBACK (Real-time)                                   │
│                                                                                      │
│  User clicks "Play"                                                                  │
│       │                                                                              │
│       ▼                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  YupflixStreamService                                                         │   │
│  │                                                                                │   │
│  │  1. Lookup yupflixId from local YupflixContent db                             │   │
│   │  2. Check in-memory stream cache:                                              │   │
│   │     ├── HIT (valid URL) → Return immediately                                  │   │
│   │     └── MISS → Fetch from YupFlix API:                                        │   │
│   │           ├── Movie: GET /api/movies/public/{id}  → streamingLinks[].url      │   │
│   │           └── Series: GET /api/series/public/{id} → seasons[].episodes[]      │   │
│   │    3. Cache result with TTL = expires - 600 secs (10 min safety buffer)                               │
│   │    4. Return URL to frontend                                                   │   │
│  └──────────────────────────────────────────────────────────┬───────────────────┘   │
│                                                              │                       │
│                                                              ▼                       │
│  ┌──────────────────────────────────────────────────────────────────────────────┐   │
│  │  Browser: ArtPlayer + HLS.js plays .m3u8 directly from streamraiwind.stream  │   │
│  │  No video data passes through NovaStream server (only ~2KB JSON response)     │   │
│  └──────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────────┘
```

### 18.3 Cache Design

#### Cache Key Format
```
{contentType}:{yupflixId}:{quality}

Examples:
"movie:6a37de555f5543dc5c4794d3:720p"
"series:6a27dcc4433e06549fe9fac9:season1:episode3:1080p"
```

#### Cache Entry Structure
```javascript
{
  url: "https://cdn5.streamraiwind.stream/img/.../nasty.m3u8?token=...&expires=1782911387",
  quality: "720p",
  expiresAt: 1782911387,          // Unix timestamp from URL
  fetchedAt: 1782910000,          // When we fetched it
  ttl: 3600,                      // expiresAt - now (auto-computed)
  hitCount: 1,                    // Stats tracking
}
```

#### TTL Strategy

| Scenario | TTL | Behavior |
|----------|-----|----------|
| **Cache entry fresh** | `> 10 min to expiry` | Return cached URL immediately. **0 API calls.** User gets instant response |
| **Near expiry** | `≤ 10 min to expiry` | Return OLD URL to user **immediately** (no delay). Silently fetch FRESH URL in background. Update cache when done — next user gets fresh URL |
| **Expired** | `now > expiresAt` | Discard, fetch fresh on next request. First play after expiry incurs ~200-500ms latency |
| **Forced refresh** | N/A | `/api/stream/yupflix/refresh` bypasses cache. Used by frontend expiry timer during active playback |

#### Cache Eviction

- **TTL-based:** Entries auto-evict **10 min** before the token expires (conservative safety margin). The URL is still usable for those 10 min while a fresh one is fetched
- **Memory limit:** Max 1,000 entries (configurable). LRU eviction when exceeded
- **Server restart:** Cache is lost gracefully — next request fetches fresh

### 18.4 Data Flow Scenarios

#### Scenario A1: Cache Hit — URL Fresh (>10 min to expiry)
```
1. User A requests stream URL for "Cocktail 2" 720p
2. Backend checks cache: Key "movie:6a37...:720p"
3. Cache HIT → URL expires in 18h (>> 10 min threshold)
4. Return URL immediately (~1ms)
5. Server load: ZERO external API calls

Later: User B requests same movie
→ Same cache hit, instant response
→ Both users play from CDN directly
```

#### Scenario A2: Cache Hit — Near Expiry (≤10 min to expiry)
```
1. User A requests stream URL for "Cocktail 2" 720p at 11:55 PM
2. Backend checks cache: HIT — but URL expires at 12:00 AM (5 min left)
3. Return OLD URL to User A IMMEDIATELY — no delay for user
4. In background: start async fetch from YupFlix
   → GET /api/movies/public/{id}
   → Extract new streamingLinks[].url with fresh token
   → Update cache with new TTL
5. Next user (User B, 1 second later) gets the FRESH URL already cached
6. If background fetch fails: old URL still works for 5 min, retry on next request
7. Server load: ONE YupFlix API call (background, non-blocking)
   Zero impact on user's playback start time
```

#### Scenario B: Cache Miss (First ever request, or fully expired)
```
1. User A requests stream URL for "House of the Dragon S01E01" 720p
2. Backend checks cache: MISS (never fetched before)
3. Backend marks key as "in-flight" in Pending Set
4. Backend calls YupFlix API: GET /api/series/public/{id}
5. Extracts streamingLinks[1].url for episode 1
6. Stores in cache with TTL = expires - 600
7. Returns URL to User A (~200-500ms — one-time latency)
8. Server load: ONE YupFlix API call (~2KB JSON)
```

#### Scenario C: Concurrent Requests (10 users click "Play" at same time)
```
1. 10 users request the same movie simultaneously
2. User 1: Cache MISS → starts fetching from YupFlix
3. User 2-10: Cache MISS, but key IS in "in-flight" Set
4. User 2-10: Wait for User 1's fetch to complete (up to 3s timeout)
5. User 1's fetch completes → cache populated → all 10 receive the URL
6. Server load: ONE YupFlix API call for 10 concurrent users
```

#### Scenario D: Token Expiry During Playback
```
1. User A starts watching "Cocktail 2" at 10:00 AM
2. Frontend extracts expiresAt from URL → e.g., expires at 10:00 AM tomorrow
3. Frontend sets timer: at 9:50 AM (10 min before expiry), call refresh endpoint
4. Frontend POST /api/stream/yupflix/refresh
   → Triggers fresh fetch from YupFlix (cache bypass)
5. Returns new URL with new expiry
6. HLS.js switches to new source URL seamlessly (no interruption)
7. If user is NOT watching (browser closed) → no unnecessary refresh calls
   Only refreshes when user is actively playing
```

#### Scenario E: User Watches 10 Episodes in One Sitting
```
1. User plays "Breaking Bad S01E01" → Cache MISS → 1 YupFlix API call
2. "Breaking Bad S01E02" → Cache MISS → 1 YupFlix API call
3. "Breaking Bad S01E03" → Cache MISS → 1 YupFlix API call
4. User re-watches S01E01 → Cache HIT → 0 API calls

Total: 3 API calls for 10 episodes watched by any number of users
Each episode is fetched ONCE, cached for all users until expiry
```

### 18.5 API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| `GET` | `/api/stream/yupflix/url` | JWT + streamLimiter | Get streaming URL for content. Query params: `contentType=movie&yupflixId=6a37...&quality=720p&season=1&episode=3` (episode for series) |
| `POST` | `/api/stream/yupflix/refresh` | JWT + streamLimiter | Force-refresh expiring URL during playback. Same query params as url endpoint |
| `GET` | `/api/stream/yupflix/info` | JWT | Get available qualities for content. Query: `contentType=movie&yupflixId=6a37...` |

### 18.6 Cache Configuration

```env
# .env additions for Phase 8
YUPFLIX_CACHE_MAX_SIZE=1000       # Max cache entries
YUPFLIX_CACHE_TTL_SAFETY=600      # Seconds before expiry to trigger background refresh (10 min)
YUPFLIX_REQUEST_TIMEOUT=5000      # Timeout for YupFlix API calls (5s)
YUPFLIX_RATE_LIMIT=60             # Max req/min to YupFlix API
```

### 18.7 Content ID Mapping

The existing NovaStream Content model uses `slug` (e.g., "cocktail-2"). The YupFlix API uses MongoDB `_id` (e.g., `6a37de555f5543dc5c4794d3`). We need a mapping layer:

#### Option A: YupFlixId Collection (Recommended)
```javascript
// server/src/models/YupflixMapping.model.js
{
  _id: ObjectId,
  novastreamSlug: String,         // "cocktail-2"
  yupflixId: String,              // "6a37de555f5543dc5c4794d3"
  contentType: String,            // "movie" | "series"
  tmdbId: Number,                 // 1392469 (for cross-reference)
  lastSyncedAt: Date,
  isValid: Boolean
}
// Indexes: { novastreamSlug: 1 } unique, { tmdbId: 1 }
```

#### Option B: Embed in Content Model (Simpler)
```javascript
// Add to existing Content.model.js
{
  // ... existing fields ...
  yupflix: {
    id: String,                    // "6a37de555f5543dc5c4794d3"
    lastSyncedAt: Date,
    isValid: Boolean
  }
}
```

#### Populating the Mapping

A new CLI command / admin action syncs content IDs:
```
novactl yupflix sync          # Match NovaStream content with YupFlix IDs
novactl yupflix status        # Show sync status
```

Sync logic:
1. Fetch all homepage sections from YupFlix API → get all content IDs + titles
2. For each NovaStream content item, search YupFlix by title
3. If TMDB ID matches → link the YupFlix ID
4. If no match → mark as unmapped (manual mapping possible)

### 18.8 Frontend Changes

#### VideoPlayer.jsx — Expiry Monitor Hook
```javascript
// New hook: useStreamUrlExpiry()
function useStreamUrlExpiry(streamUrl, onRefresh) {
  useEffect(() => {
    if (!streamUrl) return;

    // Extract expiresAt from URL
    const urlObj = new URL(streamUrl);
    const expiresAt = parseInt(urlObj.searchParams.get('expires'));
    if (!expiresAt) return;

    // Calculate refresh time: 10 minutes before expiry
    const now = Math.floor(Date.now() / 1000);
    const timeToRefresh = (expiresAt - 600 - now) * 1000;

    if (timeToRefresh <= 0) {
      // Already near or past expiry — refresh immediately
      onRefresh();
      return;
    }

    // Set timer to refresh before expiry
    const timer = setTimeout(onRefresh, timeToRefresh);

    // Also check when tab becomes visible (user returns after hours)
    const handleVisibility = () => {
      if (!document.hidden) {
        const newNow = Math.floor(Date.now() / 1000);
        if (newNow >= expiresAt - 600) {
          onRefresh();
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [streamUrl]);
}
```

#### HLS.js Source Switch on Refresh
```javascript
// When new URL arrives from refresh:
async function handleStreamRefresh() {
  const { url } = await api.refreshStreamUrl({ /* params */ });
  
  // HLS.js: switch to new source seamlessly
  if (hlsInstance) {
    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoElement);
  }
}
```

### 18.9 Files to Create / Modify

**Backend (6 files):**
```
server/src/
├── services/
│   └── yupflix.service.js          # NEW: YupFlix API client + caching
├── routes/
│   └── yupflix.routes.js           # NEW: /api/stream/yupflix/* endpoints
├── models/
│   └── YupflixMapping.model.js     # NEW: Content ID mapping (optional)
├── middleware/
│   └── yupflixRateLimiter.js       # NEW: Rate limiter for YupFlix API calls
└── src/routes/index.js             # MODIFY: Mount yupflix routes
```

**Frontend (2 files):**
```
client/src/
├── api/
│   └── yupflix.api.js              # NEW: Frontend API methods
├── hooks/
│   └── useStreamUrlExpiry.js       # NEW: Expiry monitoring hook
└── components/content/
    └── VideoPlayer.jsx             # MODIFY: Integrate expiry hook + refresh
```

**CLI (1 file):**
```
cli/commands/
└── yupflix.commands.js             # NEW: novactl yupflix sync|status
```

### 18.10 Implementation Phases

#### Phase 1: Backend Foundation (Day 1)
- [ ] Create `server/src/services/yupflix.service.js`
  - [ ] YupFlix API HTTP client (base URL, headers, timeout)
  - [ ] `getMovieStreamUrl(yupflixId, quality)` method
  - [ ] `getEpisodeStreamUrl(yupflixId, seasonNum, epNum, quality)` method
  - [ ] `getHomepage()` method (proxy to YupFlix)
  - [ ] `search(query)` method
- [ ] Implement in-memory cache (Map with TTL and max size)
  - [ ] get(key), set(key, value, ttl), has(key), delete(key)
  - [ ] LRU eviction when max size exceeded
  - [ ] Pending Set for deduplication
- [ ] Implement automatic expiry check (skip expired before returning)
- [ ] Create `server/src/routes/yupflix.routes.js`
  - [ ] `GET /api/stream/yupflix/url` — Main streaming URL endpoint
  - [ ] `POST /api/stream/yupflix/refresh` — Force refresh endpoint
  - [ ] `GET /api/stream/yupflix/info` — Available qualities
- [ ] Mount routes in `routes/index.js`

#### Phase 2: Content ID Mapping (Day 1-2)
- [ ] Create `YupflixMapping.model.js` (or add to Content model)
- [ ] Create sync script: match NovaStream content ↔ YupFlix content by TMDB ID / title
- [ ] Create `novactl yupflix sync` CLI command
- [ ] Create `novactl yupflix status` CLI command
- [ ] Run sync for existing content

#### Phase 3: Frontend Integration (Day 2)
- [ ] Create `client/src/api/yupflix.api.js` — getStreamUrl(), refreshStreamUrl(), getStreamInfo()
- [ ] Create `client/src/hooks/useStreamUrlExpiry.js` — Expiry monitor + auto-refresh
- [ ] Modify `VideoPlayer.jsx` to:
  - [ ] Call yupflix API to get streaming URL when "Play" is clicked
  - [ ] Show quality selector (from stream info)
  - [ ] Monitor expiry and auto-refresh
  - [ ] Handle refresh gracefully (HLS source switch)
  - [ ] Show error state if YupFlix is unreachable

#### Phase 4: Polish + Edge Cases (Day 3)
- [ ] Add YupFlix rate limiter middleware (prevent spamming YupFlix API)
- [ ] Add cache stats endpoint (`GET /api/admin/yupflix/cache-stats`)
- [ ] Add health check: `GET /api/admin/yupflix/health` — test YupFlix API connectivity
- [ ] Add YupFlix integration status to Admin Dashboard overview
- [ ] Handle all edge cases (see 18.11)
- [ ] Add Pino logging for all YupFlix API calls + cache operations
- [ ] Add monitoring: cache hit rate, API call count, avg response time

### 18.11 Edge Case Handling

| Edge Case | Handling |
|-----------|----------|
| **YupFlix API is down** | Return cached URL (even if near expiry ≤10 min) — better than nothing. Show warning to user. Log alert. Retry on next request. |
| **YupFlix API returns 404** | Return error: "Content not available on external source". Mark mapping as invalid. |
| **Token expired mid-playback** | Frontend detects via visibility change + timer. Auto-refresh **10 min** before expiry. User experiences zero interruption — refresh happens in background. |
| **Multiple users, same content** | Cache hit for all after first fetch. Zero additional API calls. |
| **Multiple users, different content** | Separate cache keys. Each content fetched once. |
| **Server restart** | Cache is empty. Graceful: first request after restart fetches fresh. |
| **Browser tab hidden during playback** | Visibility change listener checks expiry when tab becomes visible again. |
| **User watches for 6+ hours** | Refresh timer fires at **10 min** before each expiry. Multiple refreshes during long session. User never sees a buffering/expiry interruption. |
| **Concurrent refresh requests** | Pending Set prevents duplicate API calls. Other requests wait for in-flight fetch. |
| **Rate limited by YupFlix** | YupFlix returns 429. Backend waits, retries with exponential backoff (1s, 2s, 4s). |
| **Very old content (no match)** | YupFlix search may not find it. Mark as "unmapped" in sync status. Manual mapping via admin UI. |
| **YupFlix changes IDs** | Periodic re-sync (daily via cron). TMDB ID is the stable cross-reference. |
| **Quality not available** | YupFlix may not have 1080p for old content. Fallback to next available quality (720p → 480p). |
| **Network timeout** | YupFlix request fails. Return cached URL if available, otherwise return error. |
| **Memory exhaustion** | Cache has hard limit (1,000 entries). LRU eviction. Logged via Pino. |
| **User resumes next day** | Old URL expired. Backend detects cache miss → fetches fresh → new URL. Seamless. |

### 18.12 Performance Characteristics

| Metric | Expected Value |
|--------|---------------|
| **Cache hit latency** | < 1ms (in-memory Map lookup)
| **Cache miss latency** | ~200-500ms (YupFlix API call ~2KB JSON)
| **Server memory per cache entry** | ~500 bytes (URL string + metadata)
| **Max memory at 1,000 entries** | ~500 KB (negligible)
| **YupFlix API calls per 1000 play requests** | ~10 (99% cache hit rate)
| **Bandwidth saved by not proxying** | ~3-6 Mbps per stream (we only do 2KB JSON)

---



## 19. Telegram Bot Provision (Phase 7)

### 19.1 Planned Commands
```
/start           — Welcome message with available commands
/status          — Server health (uptime, CPU, memory, disk)
/restart         — Restart the server (admin only)
/stop            — Stop the server (admin only)
/uptime          — Server uptime
/users           — List active users (admin only)
/user_add <u:p>  — Create a new user (admin only)
/user_del <u>    — Delete a user (admin only)
/ip_block <ip>   — Block an IP address (admin only)
/ip_unblock <ip> — Unblock an IP address (admin only)
/ip_list         — List blocked IPs (admin only)
/logs <lines>    — View recent server logs (admin only)
/alert <message> — Send broadcast alert to all users
```

### 18.2 Architecture
```
Telegram User → Bot API → NovaStream Server
                               │
                               ▼
                         Express API
                        (Admin endpoints)
                               │
                               ▼
                           MongoDB
```

### 18.3 Implementation Stub (for Phase 7)
```javascript
// telegram/bot.js — Placeholder for Phase 7
// const TelegramBot = require('node-telegram-bot-api');
// const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
```

---



## 20. Implementation Phases

### Phase 1: Foundation (Days 1-3) — ✅ Complete
- [x] Project scaffolding (`server/`, `client/`, `cli/` directories)
- [x] Express server setup with layered structure
- [x] ✅ Zod-validated env config (`config/env.js`)
- [x] ✅ Pino logger setup (`config/logger.js`)
- [x] MongoDB Atlas connection with Mongoose models
- [x] ✅ Standardized API response utilities (ApiResponse, ApiError)
- [x] ✅ Global error handler middleware
- [x] PM2 ecosystem configuration (`ecosystem.config.js`)
- [ ] Video upload endpoint + FFmpeg transcoding service _(deferred to Phase 7)_
- [x] TMDB API integration (`services/tmdb.service.js`)
- [x] HLS streaming infrastructure (`services/stream.service.js` + `routes/stream.routes.js`)

### Phase 2: Security & Auth System (Days 4-6) — ✅ Complete
- [x] JWT authentication (login, logout, verify) — `auth.service.js`
- [x] User model + bcrypt password hashing — `User.model.js`
- [x] Session management (single session per user) — `Session.model.js`
- [x] Rate limiting middleware (general, auth, stream) — `rateLimiter.middleware.js`
- [x] IP reputation & blocking system — `ipBlocker.middleware.js`
- [x] Admin middleware (role-based access) — `adminAuth.middleware.js`
- [x] ✅ Zod validation schemas for all endpoints
- [x] **novactl user add/list/delete/pass** commands
- [x] **novactl ip block/unblock/list** commands
- [x] Login page UI (dark themed, no registration) — `LoginPage.jsx` + `LoginForm.jsx`

### Phase 3: Content API (Days 7-9) — ✅ Complete
- [x] Homepage sections API (featured, trending, categories)
- [x] Movies browsing API with pagination
- [x] Series browsing API with seasons/episodes
- [x] Search API with pagination
- [x] Category-based filtering API
- [x] Image proxy/caching for TMDB images
- [x] Seed script with sample content (`scripts/seed-content.js`)

### Phase 4: Frontend Core (Days 10-14) — ✅ Complete
- [x] React app with Vite + Tailwind CSS
- [x] Login page with form validation + error handling
- [x] ProtectedRoute component (auth guard)
- [x] SessionProvider (auth context) — `AuthContext.jsx`
- [x] Hero Carousel with auto-play + dot navigation — `HeroCarousel.jsx`
- [x] Content Cards with hover preview — `ContentCard.jsx`
- [x] Content Rows with horizontal scroll + arrows — `ContentRow.jsx`
- [x] Category section pages — `CategoryPage.jsx`
- [x] Search page with categorized results — `SearchPage.jsx`
- [x] Movie/Series detail pages — `DetailPage.jsx`
- [x] Loading skeletons + empty states — `LoadingSkeleton.jsx`, `EmptyState.jsx`, `ErrorState.jsx`
- [x] Responsive design (mobile-first)

### Phase 5: Video Player (Days 15-18) — ✅ Complete (8/8)
- [x] ArtPlayer integration with HLS.js — `VideoPlayer.jsx` (quality selector, error recovery, Netflix theme)
- [x] Backend HLS streaming endpoint — `stream.service.js` + `stream.routes.js` + `streamAuth.middleware.js` (JWT token auth, playlist/segment serving, range support)
- [x] Multi-quality selector integration (480p/720p/1080p) — Dual-mode: ArtPlayer native quality array + HLS.js fallback
- [x] Episode selector UI for series navigation — `EpisodeList.jsx` with season tabs, episode grid, playing indicator
- [x] Thumbnail generation + seek preview — `thumbnail.service.js` (FFmpeg sprite + node-canvas placeholder)
- [x] Continue watching progress tracking — `progress.routes.js` (throttled saves, race-free fetch on load)
- [x] Mobile/iOS optimizations — 100dvh, AirPlay, orientation lock, rotate hint, safe areas
- [x] Picture-in-picture support — Auto-PiP on tab switch, PiP state tracking, content hides in PiP

### Post-Phase 5 Enhancements
- [x] Continue Watching Row on HomePage — `GET /api/progress/continue-watching` endpoint + progress bars on ContentCard
- [x] Remove from Continue Watching — Dismiss button with optimistic removal, DELETE endpoint

### Phase 6: Security Hardening (Days 19-21) — ✅ Complete
- [x] NoSQL injection prevention — `sanitize.middleware.js` (express-mongo-sanitize strips `$` and `.`)
- [x] HTTP Parameter Pollution protection — `sanitize.middleware.js` (hpp, rejects duplicate params)
- [x] Content-Type enforcement — `contentType.middleware.js` (415 for invalid POST/PUT/PATCH types)
- [x] Enhanced CSP + security headers — Helmet + Permissions-Policy (camera=(), mic=(), geo=(), etc.)
- [x] Client-side XSS prevention — `utils/sanitize.js` (DOMPurify) integrated into SearchPage and LoginForm
- [x] Honeypot form fields — hidden `website` field in LoginForm, auto-blocks IP server-side
- [x] Security audit npm scripts — `npm run security:audit` and `security:check`
- [x] **novactl health** command ✅ | **novactl start/stop/restart/status/logs** ✅

### Phase 7: Future (Telegram Bot + Polish) — 🔮 Planned
- [ ] **novactl telegram setup/status/test** commands _(CLI placeholders exist)_
- [ ] Telegram bot integration (server health, user mgmt)
- [ ] Error pages & 404 handling
- [ ] Analytics dashboard
- [ ] Docker configuration
- [ ] Caching & CDN setup
- [ ] Performance optimization

---



## 21. Deployment Architecture

```
                          ┌─────────────────┐
                          │  Cloudflare DNS  │
                          └────────┬────────┘
                                   │
                          ┌────────▼────────┐
                          │  Nginx Reverse  │
                          │  Proxy / CDN    │
                          │  + Rate Limiting│
                          └────────┬────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                    │
     ┌────────▼────────┐  ┌───────▼────────┐  ┌───────▼────────┐
     │   Node.js API   │  │   HLS Media    │  │   React SPA    │
     │   (PM2)         │  │   (Signed URLs)│  │   (Static)     │
     └────────┬────────┘  └───────┬────────┘  └────────────────┘
              │                    │
     ┌────────▼────────┐  ┌───────▼────────┐
     │    MongoDB      │  │  File Storage  │
     │   (Atlas)       │  │  (S3 / Local)  │
     └─────────────────┘  └────────────────┘
```

---



## 22. Future Enhancements

- [ ] **Adaptive Bitrate (ABR)**: Master playlist with automatic quality switching
- [ ] **Subtitle Support**: SRT/VTT subtitle upload and display
- [ ] **Multiple Audio Tracks**: Language selection
- [ ] **Download Support**: Offline viewing capability
- [ ] **Recommendations**: ML-based content suggestions
- [ ] **Admin Dashboard**: Web UI for content & user management
- [ ] **Analytics Dashboard**: View counts, user engagement
- [ ] **Telegram Bot**: Full management via Telegram
- [ ] **DRM Support**: Widevine/PlayReady for premium content
- [ ] **Live Streaming**: Live event support
- [ ] **Mobile Apps**: React Native / Flutter native apps



---

**← Previous:** [Part 4: Security & CLI](./04-SECURITY_AND_CLI.md)
