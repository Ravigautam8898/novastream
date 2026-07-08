# D3 — Detail Page Audit

> **Area:** Detail Page
> **Files:** `DetailPage.jsx`, `EpisodeList.jsx`
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Findings

### D-010 — No Trailer Auto-Play on Hero

| Field | Value |
|-------|-------|
| **ID** | D-010 |
| **Area** | Detail Page |
| **Severity** | Medium |
| **Current** | Trailers section is a grid of thumbnail cards below the main content. User must click each to play (expands to YouTube iframe). No autoplay on page load. |
| **Expected OTT behavior** | Netflix/Prime/Disney+ auto-play the first trailer in the hero/backdrop area when user opens a detail page. Trailer is muted, looped, and overlays the backdrop. Play button switches to full trailer. |
| **Recommended Fix** | Add auto-playing trailer overlay (muted, looped) in the hero backdrop area. Fall back to static backdrop when no trailer. Keep existing trailers section below for browsing. |
| **Implementation Phase** | D-Imp-2 Detail Upgrade |
| **Status** | OPEN |

### D-011 — No Recommendations Grid

| Field | Value |
|-------|-------|
| **ID** | D-011 |
| **Area** | Detail Page |
| **Severity** | Medium |
| **Current** | "More Like This" section exists as a single ContentRow. No categorized recommendations (Because you watched X, Trending, Top Picks). |
| **Expected OTT behavior** | Netflix shows multiple recommendation rows: "Because you watched X", "Trending Now", "Top Picks for You", "Critically Acclaimed". Each row pulls from a different algorithm. |
| **Recommended Fix** | Add Multiple recommendation rows on detail page (similar genre, same actors, trending). Feed from MetadataManager recommendations or DB-based genre/actor matching. |
| **Implementation Phase** | D-Imp-2 Detail Upgrade |
| **Status** | OPEN |

### D-012 — No Season Overview / Trailer Section in Season Selector

| Field | Value |
|-------|-------|
| **ID** | D-012 |
| **Area** | Detail Page |
| **Severity** | Low |
| **Current** | Season selector shows tabs only. Selected season shows info panel with overview and poster. No per-season trailer or key episode highlights. |
| **Expected OTT behavior** | Netflix shows season trailers, key episode highlights, and "What to Expect" text per season. |
| **Recommended Fix** | Add per-season trailer playback support. Highlight notable episodes (season premiere, finale) in episode list. |
| **Implementation Phase** | D-Imp-2 Detail Upgrade |
| **Status** | OPEN |

### D-013 — No Content Rating / Maturity Display on Detail

| Field | Value |
|-------|-------|
| **ID** | D-013 |
| **Area** | Detail Page |
| **Severity** | Low |
| **Current** | Maturity rating is displayed in HeroCarousel (simulated via voteAverage). DetailPage has no maturity badge — only year, runtime, rating, genre. |
| **Expected OTT behavior** | Netflix/Prime/Disney+ prominently displays content rating (TV-MA, PG-13, R) on both the hero and detail sections. |
| **Recommended Fix** | Add contentRating badge to the meta badges section on DetailPage (already present on Content model as `contentRating` field). "hidden sm:inline-block" visibility issue on HeroCarousel. |
| **Implementation Phase** | D-Imp-2 Detail Upgrade |
| **Status** | OPEN |

### D-014 — No "Play Trailer" Button in Hero Actions

| Field | Value |
|-------|-------|
| **ID** | D-014 |
| **Area** | Detail Page |
| **Severity** | Low |
| **Current** | Only "Play" and "My List" buttons in hero. No "Play Trailer" or "More Info" secondary action. |
| **Expected OTT behavior** | Netflix/Prime have "Play", "My List", and a tertiary button (trailer or info) in the hero action bar. |
| **Recommended Fix** | Add "Trailer" button when videos[].type === 'Trailer' exists. Click scrolls to trailer section or plays inline. |
| **Implementation Phase** | D-Imp-2 Detail Upgrade |
| **Status** | OPEN |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-010 | No Trailer Auto-Play on Hero | Medium | D-Imp-2 | OPEN |
| D-011 | No Recommendations Grid | Medium | D-Imp-2 | OPEN |
| D-012 | No Season Overview / Trailer | Low | D-Imp-2 | OPEN |
| D-013 | No Content Rating on Detail | Low | D-Imp-2 | OPEN |
| D-014 | No Play Trailer Button | Low | D-Imp-2 | OPEN |
