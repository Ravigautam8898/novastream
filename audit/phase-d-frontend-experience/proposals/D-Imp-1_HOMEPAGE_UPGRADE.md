# D-Imp-1 — Homepage Experience Upgrade — Remediation Proposal

> **Status:** 🟡 Awaiting user approval
> **Findings:** D-001, D-002, D-003, D-004, D-005, D-008, D-009
> **Created:** July 8, 2026

---

## Finding D-001 — Hero Video Preview / Cinematic Billboard

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `HeroCarousel.jsx`, `HomePage.jsx` |
| **Current Behavior:** | HeroCarousel shows backdrop images with fade transitions. No video playback. |
| **Root Cause:** | HeroCarousel designed as static image slideshow using `backgroundImage` CSS. No video element integrated. |
| **Recommended Fix:** | Add muted autoplay YouTube trailer overlay on active slide when available. `item.videos[].key` already populated from TMDB. Backdrop image fallback when no trailer. |
| **Risk:** | Low |
| **Files Expected to Change:** | `HeroCarousel.jsx` |
| **New Dependencies:** | None |

---

## Finding D-002 — Top 10 Ranking Rail

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `HomePage.jsx`, `ContentCard.jsx` |
| **Current Behavior:** | No numbered ranking rail. Trending is a standard ContentRow. |
| **Root Cause:** | No special "Top 10" section or numbered badge variant exists. |
| **Recommended Fix:** | Add `showRank` prop to ContentCard rendering a large numbered overlay. Create Top 10 section from MetadataManager.getTrending() sorted by voteAverage, limit 10. |
| **Risk:** | Low |
| **Files Expected to Change:** | `HomePage.jsx`, `ContentCard.jsx` |
| **New Dependencies:** | None |

---

## Finding D-003 — Genre / Category Rails

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `HomePage.jsx` or `server/src/services/content.service.js` |
| **Current Behavior:** | Only 4 hardcoded categories. No genre-based rails. |
| **Root Cause:** | Backend `getHomepageSections()` only returns hardcoded categories. Genre discovery not in homepage pipeline. |
| **Recommended Fix:** | (Frontend approach) Fetch trending items, extract unique genres, create client-side genre sections rendered through existing ContentRow. |
| **Risk:** | Low |
| **Files Expected to Change:** | `HomePage.jsx` |
| **New Dependencies:** | None |

---

## Finding D-004 — Continue Watching — "New Episodes" Badge

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `ContentCard.jsx`, backend progress service |
| **Current Behavior:** | Continue Watching shows progress bar. No "New Episodes" badge. |
| **Root Cause:** | No per-series last watch date tracking. No comparison against episode air dates. |
| **Recommended Fix:** | Backend: add `lastEpisodeWatchDate` tracking per series. Frontend: add `hasNewEpisodes` prop to ContentCard with badge overlay. |
| **Risk:** | Medium |
| **Files Expected to Change:** | Backend progress controller + `ContentCard.jsx` |
| **New Dependencies:** | None |

---

## Finding D-005 — Genre Quick Access Chips

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `HomePage.jsx` |
| **Current Behavior:** | No genre quick-access below hero. |
| **Root Cause:** | HomePage has no genre discovery surface below hero. |
| **Recommended Fix:** | Add horizontal genre chip row below hero. Each chip navigates to /search?q={genre}. |
| **Risk:** | Low |
| **Files Expected to Change:** | `HomePage.jsx` |
| **New Dependencies:** | None |

---

## Finding D-008 — Hero Action Buttons Not Functional

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ — critical UX bug |
| **Affected Files:** | `HeroCarousel.jsx` |
| **Current Behavior:** | Play and More Info buttons rendered with zero onClick handlers. Both buttons are purely decorative — clicking does nothing. |
| **Root Cause:** | HeroCarousel receives `items` prop but has no navigation callbacks. Buttons were styled but never wired. Neither `HomePage.jsx` nor `HeroCarousel.jsx` provides click handlers or navigation logic. |
| **Recommended Fix:** | Wire Play button -> navigate(`/watch/${contentType}/${slug}/play`). Wire More Info button -> navigate(`/watch/${contentType}/${slug}`). Both via `useNavigate()` from react-router-dom. Use Nova slug identity from the current item. |
| **Risk:** | Low |
| **Files Expected to Change:** | `HeroCarousel.jsx` (add `useNavigate`, add onClick handlers to both buttons) |
| **New Dependencies:** | None |

---

## Finding D-009 — Navigation Race Condition

| Field | Value |
|-------|-------|
| **Status:** | VERIFIED ✅ |
| **Affected Files:** | `ContentCard.jsx` |
| **Current Behavior:** | Rapidly clicking multiple ContentCards stacks `navigate()` calls. `handleClick` is async — clicking Card B before Card A's navigation completes causes multiple concurrent navigations. React Router queues them, producing unpredictable results. The `registering` flag only protects same-item double-clicks during TMDB registration, not cross-card race conditions. |
| **Root Cause:** | No interaction lock between navigations. Each card independently handles clicks with no coordination. |
| **Recommended Fix:** | Implement Option A (interaction lock). Add a shared navigation lock (via context or a module-level variable). First click sets lock=true. Subsequent clicks are ignored while navigating. Lock resets after navigation completes (or on component re-render after navigation). |
| **Risk:** | Low |
| **Files Expected to Change:** | `ContentCard.jsx` (add navigation lock ref or context) |
| **New Dependencies:** | None |

---

## Implementation Order

| Order | Finding | Risk | Files | Effort |
|:-----:|:-------:|:----:|:-----:|:------:|
| 1 | D-008 — Hero Button Navigation | Low | HeroCarousel.jsx | Small |
| 2 | D-009 — Navigation Race Lock | Low | ContentCard.jsx | Small |
| 3 | D-005 — Genre Quick Access | Low | HomePage.jsx | Small |
| 4 | D-001 — Hero Video Preview | Low | HeroCarousel.jsx | Medium |
| 5 | D-002 — Top 10 Rail | Low | HomePage.jsx, ContentCard.jsx | Small |
| 6 | D-003 — Genre Rails | Low | HomePage.jsx | Medium |
| 7 | D-004 — New Episodes Badge | Medium | Backend + ContentCard.jsx | Medium |

**Total Risk:** Low-Medium
**No new npm packages required**
**No API contract breaking changes**
**All existing tests should remain passing**

---

✋ **Awaiting User Approval**

Reply with **"Approved"** to begin implementation, or specify changes to the above proposals.
