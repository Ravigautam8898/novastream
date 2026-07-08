# D1 — Current UI Discovery

> **Phase:** D1 — Current UI Discovery
> **Status:** 🟡 Draft
> **Last Updated:** July 8, 2026

---

## Overview

Complete audit of all frontend source files in `client/src/`. 74 files discovered: 10 pages, 40 components (content, admin, auth, layout, ui), 8 API modules, 3 hooks/context, config, styles.

**Breakdown:**

| Category | Count | Files |
|----------|:-----:|-------|
| Pages | 10 | HomePage, DetailPage, WatchPage, SearchPage, CategoryPage, MyListPage, HistoryPage, NotFoundPage, LoginPage, SubscriptionRequiredPage |
| Content Components | 6 | ContentCard, ContentRow, HeroCarousel, EpisodeList, VideoPlayer, SourceSelector |
| Admin Components | 16 | AdminRoute, DataTable, StatCard, StatusBadge, SubscriptionCard, QuotaCard, QuotaEditor, PlanSelector, AssignDialog, ConfirmDialog, OwnershipDialog, OwnershipLabel, RenewalDialog, SubscriptionHistoryTable, StatusChip, ExpiryCountdown |
| Auth Components | 4 | LoginForm, ProtectedRoute, SubscriptionGuard, SessionExpiredHandler |
| Layout | 1 | Header |
| UI Components | 4 | EmptyState, ErrorBoundary, ErrorState, LoadingSkeleton |
| API Modules | 8 | client, auth, content, external-source, favorites, history, admin |
| Config/Utils | 3 | images.js, sanitize.js, globals.css |

## OTT Baseline Comparison Summary

| Feature | Netflix | NovaStream | Gap |
|---------|:-------:|:----------:|:----|
| Dynamic hero rotation | ✅ | ✅ HeroCarousel | Autoplay video preview missing |
| Continue Watching row | ✅ | ✅ | No "New Episodes" badge |
| Top 10 row | ✅ | ❌ | Missing |
| Genre rails | ✅ | ❌ | Category pages are static grids |
| Recommendations | ✅ | ❌ | "More Like This" only on detail |
| Hover preview (video) | ✅ | ❌ | Only poster/backdrop preview |
| Search with suggestions | ✅ | ⚠️ Basic | No instant suggestions, no filters |
| Full settings menu (quality/audio/subtitles) | ✅ | ⚠️ Partial | Quality selector exists, no audio/subtitle |
| Next episode auto-play | ✅ | ❌ | Missing |
| Skip intro | ✅ | ❌ | Missing |
| Resume/CW sync across devices | ✅ | ✅ | Works |
| Trailers in hero/detail | ✅ | ✅ | Detail page trailers section |
| Cast grid | ✅ | ✅ | Scrolling cast grid |
| Responsive mobile | ✅ | ⚠️ Partial | Mobile portrait mode handled, tablet gaps |
| Skeleton loading | ✅ | ✅ | PageSkeleton, CardSkeleton, DetailSkeleton |

## Architecture Compliance

| Rule | Status | Notes |
|------|:------:|-------|
| MetadataManager for homepage/search/detail | ✅ | ContentService delegates to MetadataManager |
| No stream provider names on detail pages | ✅ | No YupFlix/CastleTV exposure |
| ProviderManager activates only after Play | ✅ | Providers[] checked at play time via ProviderManager |
| Source selector uses safe labels | ✅ | Fast Source / Backup Source for normal users |
