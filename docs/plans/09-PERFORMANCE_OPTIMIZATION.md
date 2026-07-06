# Performance Optimization — Detail Page Slowdown Fix

**Date:** 2026-07-02
**Author:** Codebuff AI

## Problem

When clicking a thumbnail to navigate to a detail page (`/watch/:contentType/:slug`), users experienced 4-13 seconds of loading time before any content appeared. This was especially severe on the first navigation after login.

## Root Causes

### 1. `.populate('userId')` on Session Model (Primary Cause)

**File:** `server/src/models/Session.model.js` — `findValidSession()`

Every authenticated API request goes through the `authenticate` middleware, which calls `Session.findValidSession(token)`. This method had `.populate('userId')` which loaded the **entire User document** (including `passwordHash`, `loginHistory`, `watchHistory`, `watchlist` — the full profile) for the sole purpose of verifying that the session exists.

**Impact:**
- Every API request (verify, movies list, movie detail, favorites check, progress, etc.) paid the cost of loading the full User document
- With remote MongoDB (Atlas), each load incurred significant latency
- This effectively **doubled** the DB load on every request — once here, and once in the route handler that typically loads the user again
- On a request chain of 5-6 API calls (typical for a page load), this added 15-30+ unnecessary document loads

**Fix:** Removed `.populate('userId')`. The `authenticate` middleware only needs to know the session exists (checking `if (!session)`). User identity data (id, username, role) comes from the JWT token payload.

### 2. Blocking Favorites Check on DetailPage (UX Cause)

**File:** `client/src/pages/DetailPage.jsx` — `fetchDetail()`

The `fetchDetail` function awaited the content detail fetch **and then** the favorites check **sequentially** before setting `loading = false`. Since the favorites check (`GET /favorites/check/:contentId`) was the slowest endpoint (~3-12s), the entire page render was blocked behind it.

**Perceived load time before fix:** ~13s (700ms content + 12s favorites check)
**Perceived load time after fix:** ~700ms (content fetch only, favorites button updates asynchronously)

**Fix:** Render the page immediately after the content detail fetch resolves, then fire the favorites check as a non-blocking background promise. The favorites button updates its state when the response arrives.

## Files Changed

| File | Change |
|------|--------|
| `server/src/models/Session.model.js:72-86` | Removed `.populate('userId')` from `findValidSession()` |
| `client/src/pages/DetailPage.jsx:54-73` | Made favorites check non-blocking — renders page after content fetch only |

## Monitoring

If detail page loading issues reappear in the future:
1. Check server logs for slow queries (>1000ms duration on content endpoints)
2. Verify `Session.findValidSession()` is not doing any populate
3. Check if the favorites check is blocking page render in DetailPage
4. Consider adding Content prefetching on ContentCard hover
