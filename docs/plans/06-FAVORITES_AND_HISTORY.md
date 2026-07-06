# NovaStream — Favorites, Watch History & User Activity

> **Part of:** [NovaStream Server Plan](./README.md)
> **Status:** ✅ Implemented

---

## 1. Overview

### What We're Building

| Feature | Description | Visibility |
|---------|-------------|------------|
| **My List (Favorites)** | Users can add/remove content to a personal watchlist | Per-user, shown on homepage |
| **Watch History** | Track what users watched with timestamps | Per-user, dedicated page |
| **User Activity Timeline (Admin)** | Admin dashboard panel showing user watching activity | Admin only |

### Current State

- ✅ `User.model.js` already has `watchlist[]` and `watchHistory[]` (used by Continue Watching)
- ✅ Continue Watching endpoints work (`progress.routes.js`)
- ✅ `watchHistory` capped at 200 (write-time + read-time defensive trim)
- ✅ `watchlist` (favorites) capped at 200 (write-time + read-time defensive trim)
- ✅ Defensive trimming on all read endpoints
- ✅ Rate limiting on POST /favorites/:contentId (30 req/min)
- ✅ "+" button on `ContentCard.jsx` wired with optimistic toggle
- ✅ `favorites.routes.js` API (list, toggle, check, remove)
- ✅ `history.routes.js` API (list, recent, clear)
- ✅ `MyListPage.jsx` with grid + pagination
- ✅ `HistoryPage.jsx` with timeline grouped by date
- ✅ `AdminActivity.jsx` panel with user detail drill-down

---

## 2. Anti-Abuse & Database Growth Prevention

### 2.1 Hard Caps (200)

Every user-facing array gets a **hard cap of 200 entries**. This prevents database bloat regardless of user behavior.

| Array | Current Max | New Max | Enforcement Points |
|-------|-------------|---------|--------------------|
| `watchHistory` | 100 (only on save) | **200** | On push (POST /save), on read (GET /, GET /recent, GET /continue-watching) |
| `watchlist` (favorites) | Unlimited | **200** | On push (POST /favorites/:id), on read (GET /favorites) |

### 2.2 Enforcement Strategy — Two Layers

**Layer 1: Write-time enforcement** (on push/add)

When a new entry is added to an array that's already at capacity, the oldest entry is removed first. This happens inside a single `$push` operation or array manipulation before `user.save()`.

```
IF watchlist.length >= 200:
    Sort by addedAt ascending (oldest first)
    Remove first (oldest) item
    THEN push new item
```

**Layer 2: Read-time defensive trim** (on GET)

Even if the array somehow exceeds 200 (race condition, direct DB manipulation, future code changes), every read endpoint trims it silently:

```
IF watchHistory.length > 210:  // Buffer of 10
    Sort by watchedAt descending
    Slice to 200
    Save user silently (await user.save() with no error)
```

The 10-entry buffer prevents save loops — the trim only fires when the array is >5% over capacity.

### 2.3 Rate Limiting

| Endpoint | Method | Rate Limit | Where |
|----------|--------|------------|-------|
| `POST /api/favorites/:contentId` | Toggle toggle | **10 req/min per user** | Apply `streamLimiter` or dedicated limiter |
| `POST /api/progress/save` | Save progress | **30 req/min per user** | Already has `streamLimiter` middleware |
| `DELETE /api/history` | Clear items | **5 req/min per user** | Apply rate limiter |

### 2.4 Duplicate Prevention

| Scenario | Prevention |
|----------|-----------|
| Favorites: user toggles same contentId twice rapidly | Toggle is idempotent — toggling twice returns to original state. Consecutive identical requests are harmless. |
| Favorites: user calls POST with same contentId in parallel | `findIndex` checks before push — second request finds it already exists and removes it (back to original state) |
| Watch history: progress save for same contentId twice in parallel | Uses `findIndex` with upsert pattern — updates existing entry instead of creating duplicate |

### 2.5 Concurrency Safety

All mutations use **find-then-save** pattern (not `$push` raw). Mongoose's `user.save()` is atomic at the document level. For parallel requests:

1. Request A: `findById` → reads array at length 199
2. Request B: `findById` → reads array at length 199 (same data)
3. Request A: pushes → length 200 → saves (version: 1)
4. Request B: checks → `findIndex` finds existing → updates → saves (version: 2) ← Updates, doesn't add duplicate

This is safe because:
- The toggle endpoint always does `findIndex` first (never blind push)
- The progress save endpoint always does `findIndex` first
- `save()` uses Mongoose versioning — concurrent saves are serialized

### 2.6 Edge Cases Matrix

| # | Edge Case | Handling | Abuse Risk |
|---|-----------|----------|------------|
| 1 | User toggles same contentId 200+ times rapidly | Idempotent — toggles between add/remove. Array never exceeds 200. | Low — each toggle is a valid action |
| 2 | User calls POST /favorites for 200 different contentIds | Hard cap at 200. Item 201 silently replaces oldest. | Medium — capped at 200 by design |
| 3 | User watches 200+ different movies | History capped at 200. Oldest watched entries are dropped. | Low — natural behavior |
| 4 | User writes a script to spam POST /progress/save | Rate limited (30/min). Each save updates existing or pushes new. If array at 200, old entries trimmed. | High — rate limiter is first defense |
| 5 | User deletes content while another user has it in favorites | Read-time population filters out null content. Favorites with deleted contentId are cleaned up on next GET /favorites. | Low — handled gracefully |
| 6 | Two parallel toggle requests for same contentId | Both find it → first removes, second finds it removed → adds back. End state: favorited. Atomic save prevents corruption. | Low — at worst, toggles twice |
| 7 | Admin deletes a user's account with 200 favorites | User model handles cleanup via `user.remove()` cascade in future. No current cascade — favorites die with the user document. | Low — admin action |
| 8 | User adds 200 movies, then removes 1, then adds 1 new | New item is pushed since length is 199 (< 200). No trimming needed. | Low — normal usage |
| 9 | Content's `_id` in favorites gets deleted from Content collection | GET /favorites populates — returns null for missing refs. `filter(Boolean)` removes them. User's array is silently cleaned. | Low — passive cleanup |
| 10 | Server crashes mid-save during cap enforcement | Mongoose's atomic `save()` either completes fully or not at all. If crash happens before save, data remains in previous state. | Low — ACID guarantee |

---

## 3. Changes Summary

### 3.1 Backend: Cap Enforcement (5 files modified)

| File | Change |
|------|--------|
| `progress.routes.js` | Raise cap in POST `/save` from **100 → 200**. Add defensive trim on GET `/continue-watching`. |
| `favorites.routes.js` | Add **200 cap** in POST `/:contentId` (trim oldest when full). Add defensive trim on GET `/`. Add duplicate prevention (already handled by toggle logic). |
| `history.routes.js` | Add **defensive trim** on GET `/` and GET `/recent` (if > 210, trim to 200 and save). |
| `sync-scheduler.service.js` | **Skip initial sync** in `start()` if `Content.countDocuments({ isActive: true }) > 0`. Still schedule 6-hour sync. |

### 3.2 Backend: Rate Limiting (1 file modified)

| File | Change |
|------|--------|
| `favorites.routes.js` | Apply existing `streamLimiter` to POST `/:contentId` (10 req/min) and GET `/` (30 req/min). |

---

## 4. Implementation Phases

### Phase 1: Watch History Cap (200) — ✅ Complete

**Files:** `progress.routes.js`

- [x] In POST `/save`: Change `100 → 200`
- [x] In GET `/continue-watching`: Add defensive trim before filtering
- [x] In POST `/save`: Ensure the existing cap sorts by `watchedAt` desc (already does)

### Phase 2: Favorites Cap (200) — ✅ Complete

**Files:** `favorites.routes.js`

- [x] In POST `/:contentId`: Cap at 200 (sort oldest first, shift oldest, push new)
- [x] In GET `/`: Defensive trim (>210→200) before populating
- [x] Apply `streamLimiter` to POST and DELETE routes

### Phase 3: Defensive Trims on History Reads — ✅ Complete

**Files:** `history.routes.js`

- [x] In GET `/`: Defensive trim (>210→200, sort desc, slice to 200, save silently)
- [x] In GET `/recent`: Same defensive trim

### Phase 4: Sync Initial Check — ✅ Complete

**Files:** `sync-scheduler.service.js`

- [x] In `start()`: Check `Content.countDocuments({ isActive: true })` before initial sync
- [x] If count > 0: Skip initial sync, just schedule next aligned time
- [x] If count == 0: Run initial sync as before (fresh server, no data)

### Phase 5: Documentation Updates — ✅ Complete

**Files:** `docs/reference/STATUS.md`

- [x] Mark Phase 8 items as complete
- [x] Add Phase 9: Anti-Abuse & Data Capping
- [x] Add AdminActivity to frontend pages list
- [x] Fix metrics (endpoints, pages, components)

---

## 5. File Changes Summary

### No New Files — 5 Modified Files

| File | Changes |
|------|---------|
| `server/src/routes/progress.routes.js` | 100→200 cap, defensive trim on read |
| `server/src/routes/favorites.routes.js` | 200 cap on add, defensive trim on read |
| `server/src/routes/history.routes.js` | Defensive trim on read |
| `server/src/services/sync-scheduler.service.js` | Skip initial sync if data exists |
| `docs/reference/STATUS.md` | Mark Phase 8 changes |

### No Frontend Changes

All changes are backend-only — no UI modifications needed for caps.

---

## 6. Testing Checklist

Before deployment, verify:

- [ ] Add 201 items to favorites → oldest item is automatically removed
- [ ] Add 201 items to watch history → oldest entry is automatically removed
- [ ] POST /progress/save with cap at 200 → oldest trimmed
- [ ] GET /favorites with 210 items → defensive trim saves to 200
- [ ] GET /history with 210 items → defensive trim saves to 200
- [ ] Rate limit POST /favorites/:contentId at 10 req/min
- [ ] Server restart with existing data → no initial sync HTTP call
- [ ] Server restart with empty DB → initial sync runs normally
- [ ] Parallel toggles of same contentId → no duplicate entries
- [ ] Content deleted while in favorites → GET /favorites returns empty item (filtered out)

---

## 7. Edge Cases (Already Covered)

| # | Edge Case | Status |
|---|-----------|--------|
| 1 | Click "+" when offline | Optimistic update, revert on error (already implemented in HomePage.jsx) |
| 2 | Content deleted after added to favorites | `filter(Boolean)` in GET /favorites — null items removed |
| 3 | User adds same content twice | Toggle logic handles this — second click removes |
| 4 | Rapid toggle clicks | Idempotent — no debounce needed, toggle is safe |
| 5 | History shows deleted content | Population returns null → filtered out |
| 6 | Admin views deleted user's activity | User ID 404 check in admin endpoint |
| 7 | Empty states everywhere | Every list view has dedicated empty state with CTA |
| 8 | Large arrays (200+) | Hard cap at 200, defensive trim on read |
| 9 | Race conditions on parallel API calls | Mongoose atomic save + findIndex pattern prevents duplicates |
| 10 | Server restart with populated DB | Initial sync skipped — unnecessary HTTP call eliminated |
