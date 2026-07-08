# D2 — Homepage Audit

> **Area:** Homepage
> **Files:** `HomePage.jsx`, `HeroCarousel.jsx`, `ContentRow.jsx`, `ContentCard.jsx`
> **Status:** 🟡 Draft
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
| **Recommended Fix** | Add trailer/preview video support to HeroCarousel. Fetch first trailer from item.videos (already on Content model). Use muted autoplay with loop. Fall back to backdrop image when no trailer. Consider: `heroVideo` field on Content, or inline YouTube iframe muted autoplay. |
| **Implementation Phase** | D-Imp-1 Homepage Upgrade |
| **Status** | OPEN |

### D-002 — No Top 10 / Trending Now Billboard

| Field | Value |
|-------|-------|
| **ID** | D-002 |
| **Area** | Homepage |
| **Severity** | Medium |
| **Current** | Trending section exists as a ContentRow. No special "Top 10" badge or billboard treatment for highly-rated content. No auto-generated "Top 10 in Your Region" list. |
| **Expected OTT behavior** | Netflix's Top 10 row uses a special numbered badge layout. Prime Video has a "Top 10" billboard. Apple TV+ highlights featured content differently. |
| **Recommended Fix** | Add numbered badge variant to ContentCard (for top-ranked items). Create a dedicated "Top 10" section on homepage fed by MetadataManager.getTrending(). |
| **Implementation Phase** | D-Imp-1 Homepage Upgrade |
| **Status** | OPEN |

### D-003 — No Genre / Category Rails

| Field | Value |
|-------|-------|
| **ID** | D-003 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Homepage shows only hardcoded categories (Hollywood, Bollywood, Korean, South Indian). No genre-based rails (Action, Comedy, Drama, etc.) dynamically generated from content metadata. |
| **Expected OTT behavior** | Netflix shows 15-20 genre rails (Action, Comedy, Horror, Sci-Fi, etc.) dynamically computed from the content catalog. Each rail shows the top N items for that genre. |
| **Recommended Fix** | Query genres from Content collection metadata after seeding. Feed genre rails through ContentService → MetadataManager. Generate rails dynamically instead of hardcoding. |
| **Implementation Phase** | D-Imp-1 Homepage Upgrade |
| **Status** | OPEN |

### D-004 — Continue Watching — No "New Episodes" Badge

| Field | Value |
|-------|-------|
| **ID** | D-004 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Continue Watching row shows progress bar. No indication when a series has new episodes since last watch. |
| **Expected OTT behavior** | Netflix shows "New Episodes" badge when a followed series has new episodes released after the user's last watch date. |
| **Recommended Fix** | Track lastWatchDate per series. Compare against lastSynced airDate of episodes. Show "New Episodes" badge on ContentCard overlay. |
| **Implementation Phase** | D-Imp-1 Homepage Upgrade |
| **Status** | OPEN |

### D-005 — No Trending Search / Genre Quick Access

| Field | Value |
|-------|-------|
| **ID** | D-005 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | Search is in header only. No genre quick-access, trending search tags, or category cards on homepage. |
| **Expected OTT behavior** | Netflix homepage includes genre tiles, trending search suggestions, and curated collection cards as part of the content grid. |
| **Recommended Fix** | Add genre quick-access chips below hero. Add "Popular Searches" or "Trending Now" section to homepage. |
| **Implementation Phase** | D-Imp-1 Homepage Upgrade |
| **Status** | OPEN |

### D-006 — ContentCard Hover Panel Position Edge Detection

| Field | Value |
|-------|-------|
| **ID** | D-006 |
| **Area** | Homepage |
| **Severity** | Low |
| **Current** | FE-013: ContentCard already has viewport edge detection (`updatePanelPosition`) that checks space above/below and repositions the hover panel. This is a strength — already handled. |
| **Expected OTT behavior** | Panel should never clip outside viewport on any screen size. |
| **Recommended Fix** | None required — already handled. |
| **Implementation Phase** | N/A |
| **Status** | CLOSED — Already Implemented |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-001 | No Dynamic Hero Video Preview | Medium | D-Imp-1 | OPEN |
| D-002 | No Top 10 / Trending Billboard | Medium | D-Imp-1 | OPEN |
| D-003 | No Genre / Category Rails | Low | D-Imp-1 | OPEN |
| D-004 | Continue Watching — New Episodes Badge | Low | D-Imp-1 | OPEN |
| D-005 | No Trending Search / Genre Quick Access | Low | D-Imp-1 | OPEN |
| D-006 | ContentCard Edge Detection | Low | N/A | CLOSED |
