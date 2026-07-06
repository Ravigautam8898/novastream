# Phase 5 — Streaming & Media Pipeline Audit

> **Phase:** phase-05-streaming/FINDINGS.md
> **Audit Date:** July 6, 2026
> **Status:** Batch A (ST-001, ST-002, ST-006) — Certified ✅ | Batch B (ST-003, ST-005, ST-010) — Certified ✅ | Batch C (ST-004, ST-007, ST-008, ST-009) — Certified ✅ | **Phase 5 Complete — 10/11** findings certified. ST-011 is informational (no action needed).

---

## Files Examined

### Backend (7 files)
| File | Purpose |
|------|---------|
| `server/src/services/stream.service.js` | HLS playlist/segment serving, token generation/validation, content resolution, stream info |
| `server/src/services/thumbnail.service.js` | Seek preview sprite generation (FFmpeg + canvas placeholder fallback) |
| `server/src/services/content-source.service.js` | External streaming provider proxy, in-memory stream cache, multi-source abstraction |
| `server/src/routes/stream.routes.js` | HLS streaming endpoints — token generation, playlist/segment serving, stream info |
| `server/src/routes/thumbnail.routes.js` | Thumbnail sprite endpoint — generate and serve sprite sheets |
| `server/src/routes/external-source.routes.js` | External source proxy endpoints — play, refresh, stream-info, cache admin |
| `server/src/middleware/streamAuth.middleware.js` | Stream token validation middleware — `requireStreamToken` + rate limiter combo |

### Frontend (2 files)
| File | Purpose |
|------|---------|
| `client/src/components/content/VideoPlayer.jsx` | ArtPlayer + HLS.js player with custom quality selector, two-effect architecture |
| `client/src/pages/WatchPage.jsx` | Full watch page — stream orchestration, episode selector, progress tracking, PiP |

---

## Architecture Overview

```
Frontend
  WatchPage.jsx
    ├── External source (CDN): POST /api/external/play → external-source.routes.js → ContentSourceService → external API
    │                              └── Returns CDN URL → VideoPlayer (HLS.js)
    │
    └── Local HLS: POST /api/stream/token → stream.routes.js → stream.service.js (generateStreamToken)
                    └── GET /api/stream/:type/:slug/*.m3u8 → stream.routes.js → stream.service.js (servePlaylist)
                    └── GET /api/stream/:type/:slug/:quality/segments/:segment → stream.routes.js → stream.service.js (serveSegment)

Token Security:
  generateStreamToken() → JWT { sub: contentId, type: contentType, ip, iat, exp }
  validateStreamToken() → verify JWT + check IP binding + check expiry
  requireStreamToken middleware → validates ?token= on every stream request

Thumbnails:
  GET /api/thumbnails/:type/:id → thumbnail.routes.js → thumbnail.service.js
    ├── FFmpeg (preferred): execSync() to extract frames and tile into sprite
    └── Canvas (fallback): node-canvas generates placeholder sprites with colored blocks
```

---

## Findings Summary

| ID | Severity | Risk | Category | Title | Suggested Batch |
|----|:--------:|:----:|----------|-------|:---------------:|
| ST-001 | 🟡 Medium | High | Security | Stream token exposed in query string — Referer leakage | ✅ A — Certified |
| ST-002 | 🟡 Medium | High | Security | No token-content binding validation in route handlers | ✅ A — Certified |
| ST-003 | 🟡 Medium | Medium | Performance | Synchronous file I/O blocks event loop during HLS streaming | ✅ B — Certified |
| ST-004 | 🟢 Low | Medium | Production | No CDN origin-pull support — every segment hits Node.js | C |
| ST-005 | 🟡 Medium | Medium | Performance | `execSync()` FFmpeg blocks event loop for up to 2 minutes | ✅ B — Certified |
| ST-006 | 🟢 Low | Low | Security | No stream token revocation mechanism | ✅ A — Certified |
| ST-007 | 🟢 Low | Low | Reliability | External source fetch has no retry logic | C |
| ST-008 | 🟢 Low | Low | Reliability | `video.onerror` handler leak in VideoPlayer on URL changes | C |
| ST-009 | 🟢 Low | Low | Architecture | Hardcoded external source base URL — no fallback source support | C |
| ST-010 | 🟢 Low | Low | Performance | No HLS playlist caching — M3U8 files read from disk on every request | ✅ B — Certified |
| ST-011 | ℹ️ Info | — | Architecture | Thumbnail route intentionally unauthenticated | — |

---

## Detailed Findings

### ST-001 — Stream Token Exposed in Query String (🟡 Medium, High Risk)

**Category:** Security
**Files affected:** `server/src/routes/stream.routes.js`, `server/src/middleware/streamAuth.middleware.js`, `client/src/pages/WatchPage.jsx`

**Observation:**
Stream tokens are appended as query parameters to all HLS URLs:

```
GET /api/stream/movie/inception-abc123/index.m3u8?token=eyJhbGciOiJIUzI1NiJ9...
GET /api/stream/movie/inception-abc123/720p/segments/segment-001.ts?token=eyJhbGciOiJIUzI1NiJ9...
```

Query parameters can leak through multiple channels:
1. **Referer header** — When the browser loads a `.ts` segment, the Referer header (which includes the full URL with token) is sent to any external resources loaded by the page
2. **Browser history** — If the URL is ever displayed in the address bar or logged
3. **Server access logs** — All query parameters are logged by Nginx/reverse proxy
4. **CDN logs** — If a CDN is placed in front, tokens appear in CDN access logs
5. **HLS manifest** — The master playlist (served by the route) contains child playlist URLs with tokens; child playlists contain segment URLs with tokens. If the client is compromised, these tokens are readable.

**Risk:** A leaked stream token grants access to stream the content for up to 24 hours (token expiry). Combined with the lack of per-content binding (ST-002), a leaked token could be used to stream other content.

**Recommended remediation:**
- Option A (preferred): Validate token on first request, then issue a short-lived session cookie or signed cookie for subsequent segment requests. Tokens remain in query params only for the initial playlist request.
- Option B (simpler): Add `SameSite=Strict` cookies for token transport. On first validated token request, set an httpOnly signed cookie. Segment routes check the cookie instead of the query param.
- Option C (partial mitigation): Add `Referrer-Policy: no-referrer` header to all stream responses to prevent Referer leakage. Add `no-cache, no-store, must-revalidate` to Cache-Control to prevent browser caching of URLs.

---

### ST-002 — No Token-Content Binding Validation (🟡 Medium, High Risk)

**Category:** Security
**Files affected:** `server/src/routes/stream.routes.js`, `server/src/services/stream.service.js`

**Observation:**
The `requireStreamToken` middleware validates that the token is cryptographically valid, not expired, and IP-bound. However, the token's `sub` claim (which contains the `contentId`) is **never verified** against the actual content being requested in the route params:

```javascript
// stream.routes.js — all 6 segment/playlist routes
router.get('/movie/:slug/:quality/segments/:segment', requireStreamToken, async (req, res, next) => {
    // req.streamToken.sub contains contentId, but it's never checked
    // against req.params.slug or the resolved content
    const resolved = await resolveMovieContent(slug);
    // ... serves segment without verifying token was issued for this content
});
```

A token generated for content A can be used to stream content B's segments, as long as:
1. The token hasn't expired
2. The IP matches (if IP-bound)
3. The token's `sub` is ignored

**Risk:** If a token is leaked (ST-001), it can be used to stream any content on the platform, not just the originally requested content.

**Recommended remediation:**
In each route handler (6 total — 3 movie + 3 episode), add a check:

```javascript
// After resolving content, verify token.sub matches
if (req.streamToken.sub !== resolved.content._id.toString() &&
    req.streamToken.sub !== resolved.episode?._id.toString()) {
  throw ApiError.forbidden('Stream token does not match requested content');
}
```

---

### ST-003 — Synchronous File I/O Blocks Event Loop (🟡 Medium, Medium Risk)

**Category:** Performance
**Files affected:** `server/src/services/stream.service.js`

**Observation:**
All HLS file operations use synchronous Node.js APIs:

```javascript
// servePlaylist — blocks event loop
const content = fs.readFileSync(streamInfo.playlistPath, 'utf8');

// serveSegment — blocks event loop for EVERY segment request
const content = fs.readFileSync(resolvedPath);
// ...and in range request handler:
const file = fs.openSync(resolvedPath, 'r');
const buffer = Buffer.alloc(chunkSize);
fs.readSync(file, buffer, 0, chunkSize, start);
fs.closeSync(file);

// generateMasterPlaylist — blocks event loop
const dirs = fs.readdirSync(streamDir, { withFileTypes: true });

// resolveStreamPath — blocks event loop on EVERY segment request
fs.existsSync(qualityDir)  // Called multiple times per segment
fs.readdirSync(streamDir, { withFileTypes: true }) // Scans directory listing
```

For a typical HLS stream with 6-second segments and 10 concurrent viewers, this generates ~10 `fs.readFileSync()` calls per second. Each call blocks the event loop for 1-10ms (depending on disk speed and file size), leading to:
- Degraded API response times during active streaming
- Delayed auth checks and DB queries for other users
- Poor performance under load

The `resolveStreamPath()` function also calls `fs.existsSync()` and `fs.readdirSync()` on **every segment request**, even though the stream directory structure doesn't change during playback. This is repeated work on every segment.

**Recommended remediation:**
- Priority 1: Replace `fs.readFileSync()` → `fs.promises.readFile()` or use `res.sendFile()` for segments (Express can stream the file directly)
- Priority 2: Cache the result of `resolveStreamPath()` for the duration of a playback session (the stream directory structure doesn't change during playback)
- Priority 3: Cache directory scans (`fs.readdirSync`) with a short TTL (30-60s) since the filesystem structure rarely changes

---

### ST-004 — No CDN Origin-Pull Support (🟢 Low, Medium Risk)

**Category:** Production
**Files affected:** `server/src/routes/stream.routes.js`, `server/src/routes/thumbnail.routes.js`

**Observation:**
Stream files (playlists and segments) are served directly from the Node.js application server with no CDN integration. Every segment request hits the Express process. There's no support for:

1. **X-Accel-Redirect** (Nginx internal redirect) — Nginx can serve static files directly without involving Node.js
2. **Surrogate-Control / CDN-Cache-Control** headers — Would allow CDNs to cache segments
3. **Content-Disposition** headers — Would allow CDN origin-pull with proper cache keys

**Impact:**
- Every concurrent HLS stream (potentially dozens of segment requests per second) consumes Node.js event loop time
- No ability to offload static segment serving to Nginx or a CDN
- Thumbnail sprites could be cached at CDN edge but lack proper cache-control headers (`public, max-age=86400` is set but no ETag/Last-Modified)

**Recommended remediation:**
- Option A (Nginx): Configure `X-Accel-Redirect` header in stream routes. Nginx serves the file from disk directly, freeing Node.js completely.
- Option B (CDN): Add `Surrogate-Control: max-age=3600` and `CDN-Cache-Control: max-age=3600` headers to segment responses.
- Option C (minimal): Add `ETag` and `Last-Modified` headers to support conditional requests (304 Not Modified).

---

### ST-005 — `execSync()` FFmpeg Blocks Event Loop for Up to 2 Minutes (🟡 Medium, Medium Risk)

**Category:** Performance
**Files affected:** `server/src/services/thumbnail.service.js`

**Observation:**
Thumbnail sprite generation uses `execSync()` with a 120-second timeout:

```javascript
function generateSpriteWithFFmpeg(videoPath, outputPath, config = {}) {
    // ...
    execSync(cmd, { stdio: 'pipe', timeout: 120000 }); // 2 min timeout
    // ...
}

function getIntervalFromDuration(videoPath, totalFrames) {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { stdio: 'pipe', timeout: 10000 }
    );
    // ...
}
```

On the **first request** to any content's thumbnail (cache miss), the server becomes completely unresponsive for up to 2 minutes while FFmpeg processes the video. This affects:
- All other API calls (auth, content browsing, search)
- All concurrent stream segment requests
- Health check endpoints

The `hasFFmpeg()` check also uses `execSync()`:

```javascript
function hasFFmpeg() {
    execSync('ffmpeg -version', { stdio: 'ignore', timeout: 5000 });
    // ...
}
```

This runs on every thumbnail generation failure (sync).

**Recommended remediation:**
- Priority 1: Replace `execSync()` → `exec()` (asynchronous child process) for sprite generation. The response can return a "generating" status and the frontend can poll or retry.
- Priority 2: Move sprite generation to a background job queue (or at minimum, use `child_process.exec()` with promise wrapper)
- Priority 3: Cache the `hasFFmpeg()` result — it only needs to be checked once at startup or on first use, not on every failure
- Priority 4: Use `util.promisify(exec)` or `child_process.execFile()` for better async handling

---

### ST-006 — No Stream Token Revocation (🟢 Low, Low Risk)

**Category:** Security
**Files affected:** `server/src/middleware/streamAuth.middleware.js`

**Observation:**
Once a stream token is issued, it cannot be revoked. Tokens have a 24-hour expiry but remain valid for the full duration. There is no:
- Token blocklist/deny list
- Per-session token tracking
- Token binding to a specific user session

This means:
- If a user reports a compromised account, existing stream tokens remain valid
- If content is removed/deactivated mid-stream, active tokens still grant access
- No way to force token re-issuance (e.g., on password change)

**Risk:** Low. Stream tokens only grant access to stream content (not admin functions). Combined with IP binding (always on since S-004 fix) and short 24h expiry, the blast radius of a compromised token is limited.

**Recommended remediation:**
- Option A (minimal): Add an optional `tokenVersion` field to the User model. Include `tokenVersion` in the JWT payload. On logout/password reset, increment the field. Validate in `requireStreamToken`.
- Option B (simple): Prepend a short prefix to tokens that can be checked against a Redis allowlist for high-value content (premium/restricted).
- Option C (defer): Accept the current design. Tokens are IP-bound, short-lived (24h), and only grant streaming access. This is acceptable risk.

---

### ST-007 — External Source Fetch Has No Retry Logic (🟢 Low, Low Risk)

**Category:** Reliability
**Files affected:** `server/src/services/content-source.service.js`

**Observation:**
The `fetchFromSource()` function makes a single HTTP request with a 5-second timeout. If the external source returns a transient error (network hiccup, 502, 503, DNS failure), the error is immediately propagated to the frontend as a playback failure:

```javascript
async function fetchFromSource(sourceKey, path) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), source.timeout);
    try {
        const response = await fetch(url, { headers: source.headers, signal: controller.signal });
        if (!response.ok) {
            // ... throws immediately on any non-ok status
        }
        return await response.json();
    } catch (err) {
        // ... throws immediately on AbortError or other errors
    }
}
```

On the playback path (`/api/external/play`), this causes a failed play attempt for the user. The frontend WatchPage shows a "Stream Unavailable" error state.

**Risk:** Low. Transient failures are relatively rare. If the external source is genuinely down, retries won't help. But for brief network interruptions, a retry could save the user from seeing an error state.

**Recommended remediation:**
- Add a retry wrapper with 1-2 retries and exponential backoff (200ms, 500ms) for transient errors (network errors, 502, 503). Do NOT retry 4xx errors (404, 429).
- Log retry attempts for observability.
- Consider showing a "retrying..." state in the frontend rather than immediately showing an error.

---

### ST-008 — `video.onerror` Handler Leak in VideoPlayer (🟢 Low, Low Risk)

**Category:** Reliability
**Files affected:** `client/src/components/content/VideoPlayer.jsx`

**Observation:**
In Effect B (URL changes), a `video.onerror` handler is assigned directly:

```javascript
useEffect(() => {
    // ...
    video.onerror = () => {
        onErrorRef.current?.(new Error('Video element playback error'));
    };
    // No cleanup — on each URL change, old handler is overwritten but never removed
}, [url, qualities]);
```

While this doesn't cause a memory leak in the traditional sense (the old function reference is garbage collected), it has two issues:
1. If the component unmounts while a URL change is in progress, the handler could fire after unmount
2. The `video.onerror` assignment uses the inline `onerror` property, which only supports one handler. If ArtPlayer internally sets its own `video.onerror`, our assignment replaces it

**Risk:** Low. In practice, the effect runs only when `url` or `qualities` changes (episode switches), which is infrequent. The handler references the component safely via `onErrorRef.current`.

**Recommended remediation:**
- Use `video.addEventListener('error', handler)` in the effect
- Return a cleanup function that calls `video.removeEventListener('error', handler)`
- This ensures proper cleanup on unmount or URL change

---

### ST-009 — Hardcoded External Source URL (🟢 Low, Low Risk)

**Category:** Architecture
**Files affected:** `server/src/services/content-source.service.js`

**Observation:**
The primary external source's base URL is hardcoded in the `SOURCES` configuration:

```javascript
const SOURCES = {
  primary: {
    baseUrl: 'https://jolly-mouse-f41c.annierane.workers.dev',
    headers: { ... },
    timeout: 5000,
    parsers: { ... },
  },
};
```

If this service becomes unavailable:
1. All external streaming breaks immediately (`/api/external/play` and `/api/external/refresh`)
2. Content sync (D-008 area) would fail
3. No mechanism to switch to a backup/alternative source without a code deploy
4. No monitoring/health check for source availability

Additionally, the `User-Agent` and `Referer` headers are hardcoded. If the external provider changes their requirements, these must be updated in code.

**Risk:** Low. This is the only source configured and has been stable. The architecture supports adding more sources to `SOURCES` map.

**Recommended remediation:**
- Make the source base URL configurable via environment variable (e.g., `EXTERNAL_SOURCE_BASE_URL`)
- Add optional `EXTERNAL_SOURCE_FALLBACK_URL` for high availability
- Move headers into config or env vars for easier maintenance
- Add basic health check endpoint to monitor source availability

---

### ST-010 — No HLS Playlist Caching (🟢 Low, Low Risk)

**Category:** Performance
**Files affected:** `server/src/services/stream.service.js`

**Observation:**
HLS playlist files (.m3u8) are read from disk on every request:

```javascript
function servePlaylist(resolved, quality) {
    const streamInfo = resolveStreamPath(resolved, quality);
    // ...
    const content = fs.readFileSync(streamInfo.playlistPath, 'utf8');
    return { content, mimeType, statusCode: 200 };
}
```

Playlist files:
- Are small (typically 1-5 KB)
- Rarely change (only when content is re-encoded or new qualities added)
- Are requested frequently (once per quality level per viewer on each page load)
- Contain the list of segment URLs and their durations

Each playlist read adds:
- A synchronous `fs.readFileSync()` call (blocking event loop)
- A fresh file system read (not cached by OS if files are large and actively streaming)

Additionally, `resolveStreamPath()` re-scans the directory structure on every playlist AND segment request, even though it doesn't change during playback.

**Recommended remediation:**
- Option A (in-memory cache): Add a simple `Map` cache for resolved stream paths and playlist content, keyed by content ID + quality. TTL of 5 minutes (playlists rarely change).
- Option B (ETag): Add ETag headers to playlist responses. If the file hasn't changed, return 304 Not Modified. The client/browser will reuse its cached copy.
- Option C (both): Cache resolved paths in-memory AND add ETag headers for browsers/proxies.

---

### ST-011 — Thumbnail Route Unauthenticated (ℹ️ Informational)

**Category:** Architecture
**Files affected:** `server/src/routes/thumbnail.routes.js`

**Observation:**
The thumbnail sprite endpoint intentionally has no authentication:

```javascript
// Note: This route does NOT require authentication because thumbnails are fetched
// natively by the browser via <img> tags (ArtPlayer's seek preview), which cannot
// send JWT tokens. Thumbnails are public renderings (no sensitive data).
router.get('/:type/:id', streamLimiter, async (req, res, next) => {
```

This is a documented design decision. Thumbnail sprites are generated from video content but contain only low-resolution frame thumbnails (160×90 px). They:
- Are not sensitive (no audio, no readable text)
- Cannot be reconstructed into the original video
- Are rate-limited via `streamLimiter` (30 req/min)

**No remediation needed.** This is an intentional, well-documented design choice. The `streamLimiter` provides adequate protection against abuse.

---

## Key Positive Observations

| Area | Assessment |
|------|:----------:|
| **Stream token crypto** | ✅ HS256, IP binding (`ip` claim), expiry (`exp`), `sub` claim for content ID |
| **Path traversal protection** | ✅ `path.basename()` defense + filename whitelist regex (F-013 fix) — double layer |
| **Range request support** | ✅ HTTP Range headers for seeking (206 partial content) |
| **Quality fallback chain** | ✅ Requested → 1080p → 720p → first available |
| **StreamCache** | ✅ In-memory TTL-based cache with LRU eviction (1K max) and request deduplication via pending promises |
| **Provider abstraction** | ✅ `SOURCES` map supports multiple external sources; source-specific parsers |
| **VideoPlayer architecture** | ✅ Two-effect design (mount/unmount + URL switch) — no ArtPlayer destroy/recreate on episode change = no black flash |
| **Progress saving** | ✅ Silent fire-and-forget fetch with `keepalive: true`, 15s throttle |
| **Thumbnail fallback** | ✅ FFmpeg preferred, canvas-generated placeholder as graceful degradation |
| **Stream rate limiting** | ✅ `streamLimiter` (30 req/min) on all stream and thumbnail routes |

---

## Risk Assessment

| Severity | Count | Batch |
|:--------:|:-----:|-------|
| 🟡 Medium | 3 | Batch A (Security — ST-001, ST-002, ST-006) ✅ |
| 🟡 Medium | 2 | Batch B (Performance — ST-003, ST-005, ST-010) ✅ |
| 🟢 Low | 4 | Batch C (Production — ST-004, ST-007, ST-008, ST-009) ✅ |
| ℹ️ Info | 1 | No action needed (ST-011) |

## Phase 5 Completion

| Batch | Findings | Status |
|:-----:|:--------:|:------:|
| **A** | ST-001, ST-002, ST-006 | ✅ Certified |
| **B** | ST-003, ST-005, ST-010 | ✅ Certified |
| **C** | ST-004, ST-007, ST-008, ST-009 | ✅ Certified |
| **—** | ST-011 (Info) | ℹ️ No action needed |
