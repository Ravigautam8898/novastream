# D2 — Homepage Audit

> **Area:** Homepage
> **Files:** `HomePage.jsx`, `HeroCarousel.jsx`, `ContentRow.jsx`, `ContentCard.jsx`
> **Status:** 🟡 D-Imp-1 proposal drafted
> **Last Updated:** July 8, 2026

---

## Findings

### D-001 — No Dynamic Hero Video Preview

| Field | Value |
|-------|-------|
| **ID** | D-001 |
| **Area** | Homepage |
| **Severity** | Medium |
| **Current** | HeroCarousel shows backdrop images with fade transitions. Static posters only — no auto-playing trailer previews in the hero slot. |
| **Expected OTT behavior** | Netflix/Prime/Disney+ hero slides auto-play 15-30s video previews (trailer clip) on the active slide. Video auto-mutes, loops, and switches to next slide on completion. Backdrop is fallback when video is unavailable. |
| **Recommended Fix** | Add trailer/preview video support to HeroCarousel. Fetch first trailer from item.videos (already on Content model). Use muted autoplay with loop. Fall back to backdrop image when no trailer. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-002 — No Top 10 / Trending Now Billboard

| Field | Value |
|-------|-------|
| **ID** | D-002 |
| **Area** | Homepage |
| **Severity** | Medium |
| **Current** | Trending section exists as a ContentRow. No special "Top 10" badge or billboard treatment for highly-rated content. |
| **Expected OTT behavior** | Netflix's Top 10 row uses a special numbered badge layout. |
| **Recommended Fix** | Add numbered badge variant to ContentCard. Create a dedicated "Top 10" section on homepage fed by MetadataManager.getTrending(). |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-003 — No Genre / Category Rails

| Field | Value |
|-------|-------|
| **ID** | D-003 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Only 4 hardcoded categories (Hollywood, Bollywood, Korean, South Indian). No genre-based rails. |
| **Expected OTT behavior** | Netflix shows 15-20 genre rails dynamically computed from catalog. |
| **Recommended Fix** | Query genres from Content collection. Feed genre rails through ContentService -> MetadataManager. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-004 — Continue Watching — No "New Episodes" Badge

| Field | Value |
|-------|-------|
| **ID** | D-004 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Continue Watching row shows progress bar. No "New Episodes" badge for series with new episodes. |
| **Expected OTT behavior** | Netflix shows "New Episodes" badge when a series has new episodes after user's last watch. |
| **Recommended Fix** | Track lastWatchDate per series. Compare against episode air dates. Show badge on ContentCard. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-005 — No Trending Search / Genre Quick Access

| Field | Value |
|-------|-------|
| **ID** | D-005 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Search is in header only. No genre quick-access chips or category cards on homepage. |
| **Expected OTT behavior** | Netflix includes genre tiles and curated collection cards on homepage. |
| **Recommended Fix** | Add genre quick-access chips below hero. Each chip navigates to /search?q={genre}. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-006 — ContentCard Hover Panel Position Edge Detection

| Field | Value |
|-------|-------|
| **ID** | D-006 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Already has viewport edge detection (updatePanelPosition). |
| **Expected OTT behavior** | Panel should never clip outside viewport. |
| **Recommended Fix** | None required — already handled. |
| **Implementation Phase** | N/A |
| **Status** | CLOSED |

### D-008 — Hero Action Buttons Not Functional

| Field | Value |
|-------|-------|
| **ID** | D-008 |
| **Area** | Homepage |
| **Severity** | High |
| **Current** | HeroCarousel renders Play and More Info buttons with no onClick handlers. Clicking does nothing. |
| **Expected OTT behavior** | Play navigates to WatchPage with Nova slug. More Info navigates to DetailPage with Nova slug. |
| **Recommended Fix** | Wire Play button to navigate to /watch/{contentType}/{slug}/play. Wire More Info button to navigate to /watch/{contentType}/{slug}. Both use React Router navigate(). |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-009 — Navigation Race Condition / Duplicate Click Handling

| Field | Value |
|-------|-------|
| **ID** | D-009 |
| **Area** | Homepage |
| **Severity** | Medium |
| **Current** | ContentCard handleClick is async. Rapidly clicking multiple cards stacks navigate() calls. No coordination between concurrent navigations. |
| **Expected OTT behavior** | Option A (recommended): Interaction lock — first click disables card interactions, shows loading indicator, ignores duplicate clicks until navigation completes. Option B: Cancel previous request, only final click executes. |
| **Recommended Fix** | Implement Option A: Add a per-card interaction lock via a ref or context-level navigation lock. First click sets a lock flag. Subsequent clicks during navigation are ignored. Lock resets on successful navigation or component unmount. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-010 — Homepage Metadata Deduplication Failure

| Field | Value |
|-------|-------|
| **ID** | D-010 |
| **Area** | Homepage |
| **Severity** | High |
| **Current** | Top 10 rail shows duplicate content items (e.g., FROM, House of the Dragon, The Bear appearing multiple times). Genre rails use a local `_id || tmdbId` check that misses items with only slug or metadataSources identity. |
| **Expected OTT behavior** | A content item can appear in multiple categories/sections, but must appear exactly once inside any single generated rail or list. |
| **Root Cause** | `HomePage.jsx` uses `rawSections.flatMap((s) => s.items || [])` to merge items from ALL sections before sort+slice for Top 10. When the same content appears in multiple sections (e.g., Trending AND Popular), it is counted multiple times. Genre rails had a partial dedup but used a local check instead of a shared identity utility. |
| **Recommended Fix** | 1. Create shared `dedupeContentList()` utility in `client/src/utils/contentIdentity.js` with identity priority: `_id → slug → metadataSources.tmdb.id → tmdbId → imdbId → contentType+title+year fallback`. 2. Apply to Top 10 extraction BEFORE sort. 3. Apply to genre rail item collection. 4. Apply to any future merged metadata lists. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | OPEN |

### D-011 — Homepage Genre Navigation Placement Issue

| Field | Value |
|-------|-------|
| **ID** | D-011 |
| **Area** | Homepage / Navigation |
| **Severity** | Medium |
| **Current** | D-005 genre quick access chips render directly between Continue Watching and Top 10 on the homepage. Genre filters are navigation/discovery controls, not content rails. They interrupt the curated homepage flow. |
| **Expected OTT behavior** | Netflix/Prime/Disney+: Discovery filtering (genres, categories) lives in the navigation, not on the homepage. The homepage remains a curated browsing experience: Hero → Continue Watching → Top 10 → Trending → Popular → Recommended. |
| **Root Cause** | D-Imp-1 placed genre chips inline on HomePage.jsx as a content row. They have no business being in the content flow — they're navigation controls. |
| **Recommended Fix** | 1. Rename "Browse" → "Discover" in Header.jsx. 2. Add genre sub-navigation to the Discover dropdown (Action, Adventure, Comedy, Drama, Horror, Mystery, Sci-Fi, Thriller). 3. Add Trending and New Releases links to the dropdown. 4. Remove genre chips from HomePage.jsx. 5. Keep existing hardcoded categories (Hollywood, Bollywood, Korean, South Indian). |
| **Implementation Phase** | D-Imp-1 |
| **Status** | 🟡 Fixed |

### D-012 — Metadata Cache Lifecycle Hardening

| Field | Value |
|-------|-------|
| **ID** | D-012 |
| **Area** | Backend / Caching |
| **Severity** | Medium |
| **Current** | MetadataRefreshScheduler uses 30-min relative intervals from server start. No retry on failure. Cache can be overwritten with empty results if TMDB is down. No health visibility. |
| **Expected OTT behavior** | Hourly wall-clock aligned refreshes (HH:00:00). Transient failures never clear cache — old data serves. Exponential backoff retry. Health status endpoint for operators. |
| **Root Cause** | Scheduler used setInterval relative to server start time. No resilience logic in cache rebuild path. |
| **Recommended Fix** | 1. Align to HH:00:00 via `msUntilNextHour()` calculation. 2. Add 3-retry exponential backoff (10s, 30s, 60s). 3. Preserve existing cache on rebuild failure. 4. Track health state (lastSuccessAt, failureCount, lastError). 5. Integrate metadata lifecycle visibility into existing Super Admin `System Health` tab — extend `GET /api/admin/system/health` response, extend `AdminHealth.jsx` frontend. No new standalone endpoints or pages. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | 🟡 Fix applied |

### D-013 — TMDB Certification Rating Integration

| Field | Value |
|-------|-------|
| **ID** | D-013 |
| **Area** | Backend / TMDB Integration |
| **Severity** | Medium |
| **Current** | TMDB service only checks `adult` boolean flag. All non-adult content gets `contentRating: null`, losing PG, PG-13, TV-14, TV-MA certifications. |
| **Expected OTT behavior** | Movies: fetch `release_dates` endpoint, extract US certification. Series: fetch `content_ratings` endpoint, extract US rating. Store in existing `Content.contentRating` field. |
| **Root Cause** | `syncMovie()`/`syncSeries()` never called TMDB's dedicated certification endpoints. |
| **Recommended Fix** | 1. Add `fetchMovieCertification()` — calls `movieReleaseDates`, priority: US → first available → adult flag fallback. 2. Add `fetchSeriesCertification()` — calls `tvContentRatings`, priority: US → first available → adult flag fallback. 3. Store through existing `MetadataManager` → `ContentRegistry.registerOrUpdate()` pipeline. |
| **Implementation Phase** | D-Imp-1 |
| **Status** | 🟡 Fix applied |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-001 | No Dynamic Hero Video Preview | Medium | D-Imp-1 | 🟡 Fixed |
| D-002 | No Top 10 / Trending Billboard | Medium | D-Imp-1 | 🟡 Fixed |
| D-003 | No Genre / Category Rails | Low | D-Imp-1 | 🟡 Fixed |
| D-004 | Continue Watching — New Episodes Badge | Low | D-Imp-1 | 🟡 Fixed |
| D-005 | No Trending Search / Genre Quick Access | Low | D-Imp-1 | 🟡 Fixed |
| D-006 | ContentCard Edge Detection | Low | N/A | ✅ CLOSED |
| D-008 | Hero Action Buttons Not Functional | High | D-Imp-1 | 🟡 Fixed |
| D-009 | Navigation Race Condition | Medium | D-Imp-1 | 🟡 Fixed |
| D-010 | Homepage Metadata Deduplication Failure | High | D-Imp-1 | 🟡 Fix applied |
| D-011 | Homepage Genre Navigation Placement Issue | Medium | D-Imp-1 | 🟡 Fix applied |
| D-012 | Metadata Cache Lifecycle Hardening | Medium | D-Imp-1 | 🟡 Fix applied |
| D-013 | TMDB Certification Rating Integration | Medium | D-Imp-1 | 🟡 Fix applied |
