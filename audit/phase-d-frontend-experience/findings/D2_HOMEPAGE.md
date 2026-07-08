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

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-001 | No Dynamic Hero Video Preview | Medium | D-Imp-1 | OPEN |
| D-002 | No Top 10 / Trending Billboard | Medium | D-Imp-1 | OPEN |
| D-003 | No Genre / Category Rails | Low | D-Imp-1 | OPEN |
| D-004 | Continue Watching — New Episodes Badge | Low | D-Imp-1 | OPEN |
| D-005 | No Trending Search / Genre Quick Access | Low | D-Imp-1 | OPEN |
| D-006 | ContentCard Edge Detection | Low | N/A | CLOSED |
| D-008 | Hero Action Buttons Not Functional | High | D-Imp-1 | OPEN |
| D-009 | Navigation Race Condition | Medium | D-Imp-1 | OPEN |
