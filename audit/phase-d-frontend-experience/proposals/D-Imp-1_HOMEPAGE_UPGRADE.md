# D-Imp-1 — Homepage Experience Upgrade — Remediation Proposal

> **Status:** 🟡 Awaiting user approval
> **Findings:** D-001, D-002, D-003, D-004, D-005
> **Created:** July 8, 2026

---

## Finding D-001 — Hero Video Preview / Cinematic Billboard

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — exists in source |
| **Affected Files:** | `HeroCarousel.jsx`, `HomePage.jsx`, `content.service.js` (backend) |
| **Current Behavior:** | HeroCarousel shows backdrop images with fade transitions. No video playback. "More Info" button has no navigation handler. |
| **Root Cause:** | HeroCarousel was designed as a static image slideshow. It uses `backgroundImage` CSS for backdrops. No video element or trailer integration was implemented. "More Info" button is a `<button>` with no `onClick`. |
| **Recommended Fix:** | 
1. Add `trailerKey` prop to HeroCarousel (YouTube video key from `item.videos`)
2. Add muted autoplay video overlay on the active slide when trailer is available
3. Use YouTube iframe with `mute=1&autoplay=1&loop=1&playlist=KEY` for the video
4. Keep backdrop image as fallback when no trailer
5. Wire "More Info" button to navigate to detail page (`/watch/{contentType}/{slug}`)
6. Add play button to navigate to watch page (`/watch/{contentType}/{slug}/play`)
| **Risk:** | Low — YouTube embeds are already used on DetailPage. No new packages needed. |
| **Files Expected to Change:** | `client/src/components/content/HeroCarousel.jsx` |
| **API Contract Changes?** | None — `item.videos[].key` already available from TMDB data |
| **New Dependencies?** | None |

---

## Finding D-002 — Top 10 Ranking Rail

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — confirmed missing |
| **Affected Files:** | `HomePage.jsx`, `ContentCard.jsx`, `ContentRow.jsx` |
| **Current Behavior:** | No top 10 / numbered ranking rail exists on the homepage. Trending section is a standard ContentRow with no numbered badges. |
| **Root Cause:** | Homepage only renders `sections` from the backend + favorites + continue watching. No special "Top 10" section is generated. |
| **Recommended Fix:** | 
1. Add `getTopRated({ limit: 10 })` to `content.api.js` (hits `GET /api/trending` already available)
2. Render a new "Top 10" section: `ContentRow` with a numbered badge variant
3. Add optional `showRank` prop to ContentCard that renders a large numbered overlay
4. Pull top 10 items from MetadataManager.getTrending(), sorted by voteAverage, limit 10
| **Risk:** | Low — reuses existing API and component patterns |
| **Files Expected to Change:** | `HomePage.jsx`, `ContentCard.jsx` (add rank badge), `content.api.js` (optional helper) |
| **API Contract Changes?** | None — `GET /api/trending` already returns sorted by popularity |
| **New Dependencies?** | None |

---

## Finding D-003 — Genre / Category Rails

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — confirmed missing |
| **Affected Files:** | `HomePage.jsx`, `content.api.js` |
| **Current Behavior:** | Only 4 hardcoded categories appear (from backend sections). No genre-based rails dynamically generated. |
| **Root Cause:** | HomePage iterates `sections` returned by backend `ContentService.getHomepageSections()`. The backend only returns hardcoded categories. Genre discovery is not part of the homepage pipeline. |
| **Recommended Fix:** | 
1. Backend: Add genre-based sections to `ContentService.getHomepageSections()` using genre tags from the DB Content collection
2. Frontend: No changes needed — `sections.map()` in HomePage already renders any ContentRow
3. Alternative (frontend-only): Fetch trending items, extract unique genres, create client-side genre sections
| **Risk:** | Low — backend `getHomepageSections()` already returns arbitrary sections. Adding genre sections is additive. |
| **Files Expected to Change:** | `server/src/services/content.service.js` (backend), or `HomePage.jsx` (frontend-only approach) |
| **API Contract Changes?** | None — sections array format unchanged |
| **New Dependencies?** | None |

---

## Finding D-004 — Continue Watching — "New Episodes" Badge

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — badge missing |
| **Affected Files:** | `ContentCard.jsx`, `HomePage.jsx`, backend progress service |
| **Current Behavior:** | Continue Watching row shows progress bar. No indicator for series with new episodes since last watch. |
| **Root Cause:** | No `lastWatchDate` tracking for series. Progress model tracks per-episode, not per-series. No comparison against episode air dates. |
| **Recommended Fix:** | 
1. Backend: Add `lastEpisodeWatchDate` field to progress tracking for series
2. When fetching continue watching items, compare last watch date against episode air dates in the same series
3. Frontend: Add optional `hasNewEpisodes` prop to ContentCard, show "New Episodes" badge overlay
| **Risk:** | Medium — requires backend schema change to progress model |
| **Files Expected to Change:** | `server/src/controllers/progress.controller.js`, `ContentCard.jsx` |
| **API Contract Changes?** | Add `hasNewEpisodes` boolean to continue watching API response |
| **New Dependencies?** | None |

---

## Finding D-005 — Trending Search / Genre Quick Access

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — quick access missing |
| **Affected Files:** | `HomePage.jsx`, `Header.jsx` |
| **Current Behavior:** | No genre quick-access, trending search tags, or category cards on homepage. Category pages require navigating through the Browse dropdown. |
| **Root Cause:** | HomePage only shows content rows. No genre discovery surface below the hero. Header has Browse dropdown with categories. |
| **Recommended Fix:** | 
1. Add genre quick-access chips below the hero section on HomePage
2. Fetch top genres from Content DB or hardcode a curated set
3. Each chip navigates to `/search?q={genre}` via genre badge
4. Add trending search tags section (optional)
| **Risk:** | Low — purely additive UI component |
| **Files Expected to Change:** | `HomePage.jsx` |
| **API Contract Changes?** | None |
| **New Dependencies?** | None |

---

## Implementation Order

| Order | Finding | Risk | Files | Effort |
|:-----:|:-------:|:----:|:-----:|:------:|
| 1 | D-005 — Genre Quick Access | Low | HomePage.jsx | Small |
| 2 | D-001 — Hero Video Preview | Low | HeroCarousel.jsx | Medium |
| 3 | D-002 — Top 10 Rail | Low | HomePage.jsx, ContentCard.jsx | Small |
| 4 | D-003 — Genre Rails | Low | HomePage.jsx or content.service.js | Medium |
| 5 | D-004 — New Episodes Badge | Medium | Backend + ContentCard.jsx | Medium |

**Total Risk:** Low-Medium
**No new npm packages required**
**No API contract breaking changes**
**All existing tests should remain passing**

---

## ✋ Awaiting User Approval

Reply with **"Approved"** to begin implementation, or specify changes to the above proposals.
