# Track D — Frontend Experience & OTT UX Audit

> **Track:** D — Frontend Experience
> **Status:** 🟡 Active — Discovery Phase
> **Started:** July 8, 2026
> **Last Updated:** July 8, 2026

---

## Purpose

Audit the NovaStream frontend against real OTT platform standards (Netflix, Prime Video, Disney+, Apple TV) and identify UX gaps without modifying production code or frozen backend architecture.

## Scope

- **In scope:** Pages, components, UI patterns, responsive design, performance
- **Out of scope:** Backend architecture, provider system, subscription system, admin panel (these are covered by Tracks A/B/C)

## Architecture Rules

- MetadataManager (TMDB) owns homepage, search, categories, detail metadata
- ProviderManager (YupFlix, CastleTV) only activates after Play button
- No provider names exposed to normal users
- Stream provider names never appear in detail pages, search results, or browse views

## Phases

| Phase | Name | Status |
|:-----:|------|:------:|
| D0 | Audit Structure Setup | ✅ Complete |
| D1 | Current UI Discovery | 🟡 Active |
| D2 | Homepage Audit | 🟡 Active |
| D3 | Detail Page Audit | 🟡 Active |
| D4 | Player UX Audit | 🟡 Active |
| D5 | Search & Navigation Audit | 🟡 Active |
| D6 | Mobile & Responsive Audit | 🟡 Active |
| D7 | Performance Audit | 🟡 Active |

## Future Implementation (After Audit Approval)

| Phase | Focus |
|:-----:|-------|
| D-Imp-1 | Homepage Upgrade (hero rotation, continue watching, top 10, genre rails) |
| D-Imp-2 | Detail Page Upgrade (trailer autoplay, recommendations grid) |
| D-Imp-3 | Player UX Upgrade (settings menu, next episode, skip intro) |
| D-Imp-4 | Search & Navigation Upgrade (instant search, filters, mobile nav) |
| D-Imp-5 | Responsive & TV Mode |
| D-Imp-6 | Performance Optimization |
