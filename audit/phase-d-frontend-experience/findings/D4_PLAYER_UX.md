# D4 — Player UX Audit

> **Area:** Player UX
> **Files:** `WatchPage.jsx`, `VideoPlayer.jsx`, `SourceSelector.jsx`
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Findings

### D-020 — No Settings Menu (Quality/Audio/Subtitles)

| Field | Value |
|-------|-------|
| **ID** | D-020 |
| **Area** | Player UX |
| **Severity** | High |
| **Current** | Quality selector exists in VideoPlayer via ArtPlayer settings panel (gear icon). But no organized "Settings" menu with audio track, subtitle track, or playback speed controls unified under one panel. Playback speed exists as separate control. |
| **Expected OTT behavior** | Netflix/Prime have a unified Settings panel: Quality (Auto/1080p/720p/480p), Audio track selection, Subtitle track selection, Playback speed. Accessible from a single gear icon. |
| **Recommended Fix** | Consolidate quality selector into a top-level settings menu. Add audio and subtitle track selector stubs (populated from provider data when available). Use ArtPlayer custom setting to build a hierarchical menu. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

### D-021 — No Next Episode Auto-Play

| Field | Value |
|-------|-------|
| **ID** | D-021 |
| **Area** | Player UX |
| **Severity** | High |
| **Current** | After an episode finishes, video stops at end. No auto-play countdown, no "Next Episode" button, no up-next card. User must manually navigate back to episode list and click the next episode. |
| **Expected OTT behavior** | Netflix shows a "Next episode in 10s" countdown overlay (5-10s) at 85-90% of episode duration. User can "Play Next" or "Cancel". Episode automatically advances on timer expiry. |
| **Recommended Fix** | Add "Next Episode Up Next" overlay at episode end. Show episode thumbnail + title + countdown. Auto-play next episode if not cancelled. Wire `handleSelectEpisode` to advance season/episode numbers. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

### D-022 — No Skip Intro / Skip Recap

| Field | Value |
|-------|-------|
| **ID** | D-022 |
| **Area** | Player UX |
| **Severity** | Medium |
| **Current** | No skip intro button. Player plays through the full episode without any skip markers. |
| **Expected OTT behavior** | Netflix/Prime/Disney+ detect intro sequences (via timestamp markers or analysis) and show "Skip Intro" button. Disney+ also has "Skip Recap". |
| **Recommended Fix** | Add intro/recap timestamp fields to Episode model (introStart, introEnd, recapStart, recapEnd). Show "Skip Intro" button when player time enters the intro window. Skip markers can be seeded from TMDB data or manually configured. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

### D-023 — Recovery UX — No Debug Recovery Details Displayed

| Field | Value |
|-------|-------|
| **ID** | D-023 |
| **Area** | Player UX |
| **Severity** | Low |
| **Current** | Recovery flow tracks `recoveryDetails` (from, to, reason, success) but only shows "Recovering playback..." and "Playback restored" toast. Debug/admin users see no expanded recovery info. |
| **Expected OTT behavior** | Admin/debug mode should display: `Recovered: Source 1 → Source 2 | Reason: expired URL` in a subtle debug overlay. |
| **Recommended Fix** | Add debug overlay (clickable or always-visible in admin mode) showing last recovery attempt details. Use `isAdmin` from auth context to toggle visibility. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

### D-024 — Source Selector — No Immediate Stream Re-Fetch on Manual Change

| Field | Value |
|-------|-------|
| **ID** | D-024 |
| **Area** | Player UX |
| **Severity** | Medium |
| **Current** | When user switches from Auto to a specific source, the source preference is stored in state but the stream URL does NOT change until the next error or refresh cycle. User must wait for expiry or cause an error to see the new source take effect. |
| **Expected OTT behavior** | Changing source should immediately re-resolve the stream from the selected provider and update the playback URL. |
| **Recommended Fix** | When `selectedSourceId` changes and is not null, trigger a new stream fetch with the preferred provider. Show a brief "Switching source..." indicator. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

### D-025 — Quality Menu "Auto" Selection Not Reported to Parent

| Field | Value |
|-------|-------|
| **ID** | D-025 |
| **Area** | Player UX |
| **Severity** | Low |
| **Current** | When user selects "Auto" quality, `onQualityChange` is not called because `hlsRef.current.currentLevel` is -1 (the "Auto" state). The dead branch in the selector `onSelect` handler skips the call. |
| **Expected OTT behavior** | "Auto" selection should either preserve the current known quality or report the detected HLS level height. |
| **Recommended Fix** | When "Auto" is selected, report the current HLS level height to parent (`hlsRef.current.levels[hlsRef.current.currentLevel]?.height + 'p'`). If no level is active yet, do not report. |
| **Implementation Phase** | D-Imp-3 Player Upgrade |
| **Status** | OPEN |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-020 | No Settings Menu | High | D-Imp-3 | OPEN |
| D-021 | No Next Episode Auto-Play | High | D-Imp-3 | OPEN |
| D-022 | No Skip Intro | Medium | D-Imp-3 | OPEN |
| D-023 | Recovery Debug Details | Low | D-Imp-3 | OPEN |
| D-024 | Source Selector No Immediate Fetch | Medium | D-Imp-3 | OPEN |
| D-025 | Quality Auto Not Reported | Low | D-Imp-3 | OPEN |
