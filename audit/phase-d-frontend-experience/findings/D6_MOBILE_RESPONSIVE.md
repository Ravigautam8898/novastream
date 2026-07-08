# D6 — Mobile & Responsive Audit

> **Area:** Mobile & Responsive
> **Files:** `globals.css`, `WatchPage.jsx`, `HeroCarousel.jsx`, `ContentRow.jsx`, `Header.jsx`
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Findings

### D-040 — No Bottom Tab Bar for Mobile Navigation

| Field | Value |
|-------|-------|
| **ID** | D-040 |
| **Area** | Mobile & Responsive |
| **Severity** | Medium |
| **Current** | Header navigation links hidden on mobile (`hidden md:flex`). No bottom tab bar, no hamburger menu. Users on mobile can only navigate via search URL or manual path entry. |
| **Expected OTT behavior** | Netflix/Prime/Disney+ mobile apps use a bottom navigation bar with 4-5 icons: Home, Search, My List, Downloads, Account. All core destinations accessible from any screen. |
| **Recommended Fix** | Add sticky bottom tab bar on mobile (`md:hidden` fixed bottom). Icons for: Home, Search, My List, History. Active tab highlighted. |
| **Implementation Phase** | D-Imp-5 Responsive & TV |
| **Status** | OPEN |

### D-041 — No Tablet-Optimized Layout

| Field | Value |
|-------|-------|
| **ID** | D-041 |
| **Area** | Mobile & Responsive |
| **Severity** | Low |
| **Current** | Responsive breakpoints use standard Tailwind breakpoints (sm/md/lg). No tablet-specific layout optimizations. Content row card sizes, grid columns, and hero height are linear interpolations between mobile and desktop. |
| **Expected OTT behavior** | Netflix/Prime tablet apps use a hybrid layout: side-by-side hero + metadata on detail page (tablet landscape), larger cards, and optimized grid (3-4 columns). |
| **Recommended Fix** | Add tablet-specific breakpoint (`md` at 768px, `lg` at 1024px) overrides for: card size (w-[180px] on tablet), hero height (65vh), detail poster size (200px). |
| **Implementation Phase** | D-Imp-5 Responsive & TV |
| **Status** | OPEN |

### D-042 — No Portrait-Mode Landscape Prompt for Video

| Field | Value |
|-------|-------|
| **ID** | D-042 |
| **Area** | Mobile & Responsive |
| **Severity** | Low |
| **Current** | Rotate hint banner exists in WatchPage (`rotate-hint-banner` with phone rotation animation). But it's positioned absolutely and can be dismissed. No full-screen prompt forcing landscape for video. |
| **Expected OTT behavior** | Netflix/Prime show a "Rotate device" overlay that can be dismissed but re-appears on next video. Some apps auto-rotate to landscape on fullscreen. |
| **Recommended Fix** | Improve rotate banner: persist across session (localStorage flag), auto-show when entering fullscreen in portrait, improved animation. |
| **Implementation Phase** | D-Imp-5 Responsive & TV |
| **Status** | OPEN |

### D-043 — No Dark Mode / Light Mode Toggle

| Field | Value |
|-------|-------|
| **ID** | D-043 |
| **Area** | Mobile & Responsive |
| **Severity** | Low |
| **Current** | Dark theme only (`bg-netflix-dark`). No light mode support. No user preference toggle. |
| **Expected OTT behavior** | Netflix has dark mode only. This is acceptable for a streaming platform. Closing as intended design. |
| **Recommended Fix** | None required — dark mode is standard for streaming platforms. |
| **Implementation Phase** | N/A |
| **Status** | CLOSED — Intentional Design |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-040 | No Bottom Tab Bar Mobile | Medium | D-Imp-5 | OPEN |
| D-041 | No Tablet Layout | Low | D-Imp-5 | OPEN |
| D-042 | Portrait Landscape Prompt | Low | D-Imp-5 | OPEN |
| D-043 | Dark/Light Mode Toggle | Low | N/A | CLOSED |
