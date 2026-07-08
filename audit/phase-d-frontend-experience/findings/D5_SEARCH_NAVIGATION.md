# D5 — Search & Navigation Audit

> **Area:** Search & Navigation
> **Files:** `SearchPage.jsx`, `Header.jsx`, `CategoryPage.jsx`, `App.jsx`
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Findings

### D-030 — No Instant Search / Autocomplete

| Field | Value |
|-------|-------|
| **ID** | D-030 |
| **Area** | Search & Navigation |
| **Severity** | High |
| **Current** | Search is a standard form submission. User types query, presses Enter, navigates to `/search?q=...`. No instant results, no autocomplete dropdown, no search suggestions as user types. SearchPage uses a 300ms debounce on input but still navigates on submit. |
| **Expected OTT behavior** | Netflix/Prime show an instant search overlay when user clicks the search icon. Results appear as you type (debounced ~300ms). Categories, genres, and recent searches shown before query. |
| **Recommended Fix** | Add search overlay/dropdown that appears when user focuses the search input. Show trending searches, recent searches (from localStorage), and genre suggestions. On typing, fetch results with debounce and show inline dropdown. Full search page remains for detailed results. |
| **Implementation Phase** | D-Imp-4 Search & Navigation Upgrade |
| **Status** | OPEN |

### D-031 — No Search Filters (Genre, Year, Rating)

| Field | Value |
|-------|-------|
| **ID** | D-031 |
| **Area** | Search & Navigation |
| **Severity** | Medium |
| **Current** | Type filter exists (All/Movies/Series). No genre, year range, rating, or language filters on the search page. |
| **Expected OTT behavior** | Netflix/Prime have rich filter panels: Genre dropdown, Year range slider, Rating filter, Language selector. Results update immediately on filter change. |
| **Recommended Fix** | Add filter sidebar/drawer on SearchPage. Filters: genre (multi-select), year range, min rating, language. Pass filter params to backend search API. |
| **Implementation Phase** | D-Imp-4 Search & Navigation Upgrade |
| **Status** | OPEN |

### D-032 — No Mobile Navigation Drawer

| Field | Value |
|-------|-------|
| **ID** | D-032 |
| **Area** | Search & Navigation |
| **Severity** | Medium |
| **Current** | Desktop header has nav links (Home, Browse, Search, My List, History). Mobile shows a collapsed header with no hamburger menu or drawer. Nav links are hidden on mobile. |
| **Expected OTT behavior** | Netflix mobile app uses a hamburger menu or bottom tab bar for navigation. All navigation items accessible in 1-2 taps. |
| **Recommended Fix** | Add hamburger menu button on mobile (`md:hidden`). Slide-out drawer with all nav items, user info, logout. Alternatively, add a bottom tab bar with the 5 main destinations (Home, Search, My List, History, Account). |
| **Implementation Phase** | D-Imp-4 Search & Navigation Upgrade |
| **Status** | OPEN |

### D-033 — Category Pages Are Static Grids — No Hero or Curated Content

| Field | Value |
|-------|-------|
| **ID** | D-033 |
| **Area** | Search & Navigation |
| **Severity** | Low |
| **Current** | Category pages show a simple grid with header icon, label, and paginated grid. No hero item, no curated sub-sections, no featured items within the category. |
| **Expected OTT behavior** | Netflix/Prime category pages have a hero feature (most popular item in category), followed by sub-category rails (e.g., "Action & Adventure", "Superhero", "Martial Arts" under Action). |
| **Recommended Fix** | Add hero item to category pages (most popular by voteAverage). Add sub-category rails (extracted from genre tags within the category). |
| **Implementation Phase** | D-Imp-4 Search & Navigation Upgrade |
| **Status** | OPEN |

## Summary

| ID | Title | Severity | Phase | Status |
|:--:|-------|:--------:|:-----:|:------:|
| D-030 | No Instant Search / Autocomplete | High | D-Imp-4 | OPEN |
| D-031 | No Search Filters | Medium | D-Imp-4 | OPEN |
| D-032 | No Mobile Navigation Drawer | Medium | D-Imp-4 | OPEN |
| D-033 | Category Pages Static | Low | D-Imp-4 | OPEN |
