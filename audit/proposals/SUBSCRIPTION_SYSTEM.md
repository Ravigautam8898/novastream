# NovaStream — Governance Proposal: User Management & Subscription System

> **Status:** 📋 PROPOSAL v2 — Design Only, No Implementation
> **Author:** AI Agent
> **Date:** 2026-07-02
> **Approval Required:** Yes — user must approve this proposal before any code is written

---

## 1. Executive Summary

NovaStream will evolve from a flat authentication system into a **production-grade user management platform** with three distinct roles, delegated administration, and embedded subscription management.

**Key design constraints:**
- No payment gateway — all subscription management is internal/admin-only
- Subscriptions are **embedded in the User document** (not a separate collection — one subscription per user)
- Subscription history is a **separate immutable collection** (full auditability)
- Two admin tiers: **Super Admin** (owner, unrestricted) and **Manager** (delegated operator)
- Members are **owned** by their creator via the existing `createdBy` relationship
- All admin roles bypass subscription checks — only Members require validation
- Subscription `version` field enables **immediate stream token invalidation** on any change

---

## 2. Architecture Design

### Data Model Architecture

```
┌─────────────────────────────────────────────────┐
│                   User Document                  │
│                                                   │
│  {                                                 │
│    _id, username, passwordHash, role, displayName, │
│    createdBy, isActive, ...                        │
│    subscription: {                ◄── EMBEDDED    │
│      plan, status, activationDate, expiryDate,     │
│      renewalCount, lastRenewedAt, version,         │
│      notes, createdBy, updatedAt                   │
│    }                                               │
│  }                                                 │
└─────────────────────────────────────────────────┘
                           │
                           │ (references by userId)
                           ▼
┌─────────────────────────────────────────────────┐
│            SubscriptionHistory Collection         │
│  (immutable — every action appends a record)     │
│                                                   │
│  { _id, userId, action, previousValues,          │
│    newValues, adminId, adminIp, reason, notes,    │
│    source, correlationId, ownershipValidated,     │
│    createdAt }                                    │
└─────────────────────────────────────────────────┘
```

**Rationale for embedded subscription:** Exactly one subscription exists per user. No billing, no invoices, no multiple plans, no organizations, no teams. An embedded document eliminates a separate read — one database query fetches both user and subscription state.

**Rationale for separate history collection:** History must be immutable and append-only. Embedding history would bloat the User document and make audit queries expensive. Separate collection with proper indexes keeps both fast.

### Request Flow

```
Client Request
    │
    ▼
┌──────────────────────┐
│  1. IP Blocker       │
│  2. Sanitize         │
│  3. Auth (JWT)       │
│  4. Session Check    │
└──────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  5. Subscription Check (middleware)   │
│     Super Admin  ───▶ BYPASS (always) │
│     Manager      ───▶ BYPASS (always) │
│     Member       ───▶ Check required  │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  6. Stream Token Generation           │
│     Includes: subscriptionVersion     │
│     Token invalidated on version bump │
└──────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────┐
│  7. Route Handler (content served)   │
└──────────────────────────────────────┘
```

---

## 3. User Roles

Three roles with strict permission boundaries.

### Role 1 — Super Admin

The owner of NovaStream. **Never requires a subscription.** Always has unrestricted access.

| Permission | Granted |
|------------|:--------:|
| Create Super Admin | ✅ |
| Create Manager | ✅ |
| Create Member | ✅ |
| Delete any user | ✅ |
| Modify any user | ✅ |
| Reset any password | ✅ |
| Assign any subscription | ✅ |
| Renew any subscription | ✅ |
| Suspend any account | ✅ |
| Activate any account | ✅ |
| Convert to Lifetime | ✅ |
| Remove Lifetime | ✅ |
| View all users | ✅ |
| View all subscriptions | ✅ |
| View all logs | ✅ |
| View all audit history | ✅ |
| Manage settings | ✅ |
| Manage content | ✅ |
| Manage security | ✅ |
| Manage system config | ✅ |
| View global dashboard | ✅ |
| Transfer ownership *(future)* | ✅ |
| Bypass subscription checks | ✅ |

### Role 2 — Manager

Operational administrator. **Never requires a subscription.** Always has dashboard access. Operates exclusively on Members they own.

| Permission | Granted | Notes |
|------------|:-------:|-------|
| Login | ✅ | |
| Create Members | ✅ | Only `role: 'member'` |
| Renew subscriptions | ✅ | Own Members only |
| Assign subscriptions | ✅ | Own Members only |
| Extend subscriptions | ✅ | Own Members only |
| Suspend Members | ✅ | Own Members only |
| Activate Members | ✅ | Own Members only |
| Reset passwords | ✅ | Own Members only |
| View own Members | ✅ | Filtered by `createdBy` |
| View own Member stats | ✅ | Scoped to own users |
| View renewal history | ✅ | Own Members only |
| Create another Manager | ❌ | |
| Create Super Admin | ❌ | |
| Promote users | ❌ | Cannot change roles |
| Manage system settings | ❌ | |
| View global statistics | ❌ | |
| View logs | ❌ | |
| View other Managers' users | ❌ | Ownership boundary |
| Modify Super Admin | ❌ | |
| Modify another Manager | ❌ | |
| Bypass subscription checks | ✅ | As an admin role |

### Role 3 — Member

The streaming customer. **Requires a valid subscription.**

| Permission | Granted |
|------------|:--------:|
| Login | ✅ |
| Browse content | ✅ |
| Watch content | ✅ *(with active subscription)* |
| Manage profile | ✅ |
| Administrative actions | ❌ |

---

## 4. Permission Matrix

| Action | Super Admin | Manager | Member |
|--------|:-----------:|:-------:|:------:|
| **Login** | ✅ | ✅ | ✅ |
| Browse catalog | ✅ | ✅ | ✅ |
| Watch stream | ✅ | ✅ | ✅ * |
| Create Super Admin | ✅ | ❌ | ❌ |
| Create Manager | ✅ | ❌ | ❌ |
| Create Member | ✅ | ✅ | ❌ |
| Delete any user | ✅ | ❌ | ❌ |
| Delete own Members | ✅ | ✅ | ❌ |
| Modify any user | ✅ | ❌ | ❌ |
| Modify own Members | ✅ | ✅ | ❌ |
| Reset any password | ✅ | ❌ | ❌ |
| Reset own Member passwords | ✅ | ✅ | ❌ |
| Assign any subscription | ✅ | ❌ | ❌ |
| Assign subscription to own Members | ✅ | ✅ | ❌ |
| Renew any subscription | ✅ | ❌ | ❌ |
| Renew own Member subscriptions | ✅ | ✅ | ❌ |
| Suspend any account | ✅ | ❌ | ❌ |
| Suspend own Members | ✅ | ✅ | ❌ |
| Activate any account | ✅ | ❌ | ❌ |
| Activate own Members | ✅ | ✅ | ❌ |
| Convert to Lifetime | ✅ | ❌ | ❌ |
| Remove Lifetime | ✅ | ❌ | ❌ |
| View all users | ✅ | ❌ | ❌ |
| View own Members | ✅ | ✅ | ❌ |
| View all subscriptions | ✅ | ❌ | ❌ |
| View own Member subscriptions | ✅ | ✅ | ❌ |
| View all logs | ✅ | ❌ | ❌ |
| View all audit history | ✅ | ❌ | ❌ |
| View own Member history | ✅ | ✅ | ❌ |
| Manage system settings | ✅ | ❌ | ❌ |
| Manage content | ✅ | ❌ | ❌ |
| Manage security | ✅ | ❌ | ❌ |
| View global dashboard | ✅ | ❌ | ❌ |
| Transfer ownership (future) | ✅ | ❌ | ❌ |

*\* Member requires active subscription for streaming*

---

## 5. Ownership Model

Every Member belongs to exactly one owner, tracked by the existing `createdBy` field on the User model.

### Rules

1. **Super Admin** owns all users they create
2. **Manager** owns only Members they create (`createdBy = managerId`)
3. **Members** have no ownership over other users
4. All ownership validation happens **server-side** — never rely on frontend filtering
5. When a Manager queries Members, the system **automatically filters** `createdBy = loggedInManager._id`
6. A Manager cannot see, modify, or manage users created by another Manager or by Super Admin

### Ownership Transfer

- Ownership transfer is a Super Admin–only action
- When a Manager account is deleted, their Members must be reassigned to another Manager or to Super Admin
- Transfer is recorded in SubscriptionHistory with `action: 'ownership_transferred'`

---

## 6. User Creation

### Super Admin Creates
- Super Admin (`role: 'super_admin'`)
- Manager (`role: 'manager'`)
- Member (`role: 'member'`)

### Manager Creates
- Member only (`role: 'member'`)

### Enforcement
- Attempting to create an elevated role (super_admin, manager) from a Manager account returns:
  ```json
  HTTP 403 Forbidden
  { "success": false, "message": "Insufficient permissions to create this role" }
  ```

### Role Constants

| Role | Enum Value | Requires Subscription | Can Create |
|------|:----------:|:---------------------:|:-----------|
| Super Admin | `super_admin` | Never | super_admin, manager, member |
| Manager | `manager` | Never | member |
| Member | `member` | Yes | none |

---

## 7. Subscription Model (Embedded)

Subscriptions are embedded **directly inside the User document**.

### Embedded Structure

```javascript
subscription: {
  plan:              { type: String, enum: ['trial', '30d', '60d', '90d', '120d',
                         '180d', '365d', '730d', 'lifetime', 'custom'] },
  status:            { type: String, enum: ['trial', 'active', 'expired',
                         'suspended', 'disabled', 'lifetime'] },
  activationDate:    { type: Date },    // When access began/begins
  expiryDate:        { type: Date },    // null for lifetime
  trialEndDate:      { type: Date },    // null if not trial
  renewalCount:      { type: Number, default: 0 },
  lastRenewedAt:     { type: Date },
  version:           { type: Number, default: 1 },  // Incremented on every change
  notes:             { type: String, maxlength: 1000 },
  createdBy:         { type: ObjectId, ref: 'User' },
  updatedAt:         { type: Date }
}
```

### Status Design

**Architecture Decision: Primary State + Flags**

After evaluating two approaches:

| Approach | Pros | Cons |
|----------|------|------|
| **Many mutually exclusive statuses** (trial, active, expired, suspended, disabled, lifetime) | Simple to understand | Cannot express combinations (e.g., expired trial vs expired active); enum gets large |
| **Primary state + flags** ✅ | Clean separation; combinations expressed via flags; extensible | Slightly more logic in middleware |

**Recommended: Primary State + Flags**

```javascript
status: 'active'  // Primary — always one of: active, expired, suspended, disabled
flags: {
  trial:    Boolean,  // Is this a trial period?
  lifetime: Boolean   // Is this a lifetime subscription?
}
```

**Derived states:**

| status | flags.trial | flags.lifetime | Display |
|--------|:-----------:|:--------------:|---------|
| `active` | `false` | `false` | Active |
| `active` | `true` | `false` | Trial |
| `active` | `false` | `true` | Lifetime |
| `expired` | `false` | `false` | Expired |
| `expired` | `true` | `false` | Trial Expired |
| `suspended` | `any` | `any` | Suspended |
| `disabled` | `any` | `any` | Disabled |

This design is simpler (4 primary states + 2 boolean flags = 8 states via combination, vs 6 mutually exclusive enums that can't combine) and more maintainable (adding a new flag doesn't require enum changes across the codebase).

### Configurable Plans

Plans are **not hardcoded**. They are defined in a configuration object:

```javascript
// server/src/config/plans.js
const PLANS = {
  trial:   { label: 'Trial', durationDays: 7, isTrial: true },
  '30d':   { label: '30 Days', durationDays: 30 },
  '60d':   { label: '60 Days', durationDays: 60 },
  '90d':   { label: '90 Days', durationDays: 90 },
  '120d':  { label: '120 Days', durationDays: 120 },
  '180d':  { label: '180 Days', durationDays: 180 },
  '365d':  { label: '365 Days', durationDays: 365 },
  '730d':  { label: '730 Days', durationDays: 730 },
  'lifetime': { label: 'Lifetime', isLifetime: true },
  'custom':   { label: 'Custom', isCustom: true },
};
```

New plans can be added without changing business logic.

---

## 8. Subscription Statuses & Transitions

### Valid State Transitions

```
NONE ──▶ trial
NONE ──▶ active
NONE ──▶ lifetime

trial   ──▶ active    (subscription assigned during trial)
trial   ──▶ expired   (trial ended, no subscription)
trial   ──▶ lifetime  (upgraded)

active  ──▶ expired    (endDate passed)
active  ──▶ suspended  (admin action)
active  ──▶ disabled   (admin action)
active  ──▶ lifetime   (converted)

expired ──▶ active     (renewed)

suspended ──▶ active   (resumed)

disabled ──▶ active    (re-activated)

lifetime ──▶ disabled  (admin action — rare, audited)
```

**Impossible transitions:** lifetime → trial, expired → lifetime (must renew to active first).

---

## 9. Subscription Service

All subscription business logic lives in a dedicated service. No controller or route handler may manipulate subscription fields directly.

### Required Methods

| Method | Description |
|--------|-------------|
| `create(userId, plan, { activationDate, notes, createdBy })` | Assign initial subscription to a Member |
| `renew(userId, plan, { reason, notes, adminId })` | Renew — auto-calculates new expiry |
| `extend(userId, days, { reason, notes, adminId })` | Extend expiry by N days |
| `activate(userId, { reason, notes, adminId })` | Activate a disabled/suspended account |
| `deactivate(userId, { reason, notes, adminId })` | Deactivate an account |
| `suspend(userId, { reason, notes, adminId })` | Suspend (temporary) |
| `resume(userId, { reason, notes, adminId })` | Resume from suspension |
| `expire(userId, { reason, notes, adminId })` | Expire immediately |
| `convertToLifetime(userId, { reason, notes, adminId })` | Convert to lifetime |
| `removeLifetime(userId, plan, duration, { reason, notes, adminId })` | Remove lifetime, set new plan |
| `remainingDays(userId)` | Returns integer days remaining |
| `canAccess(userId)` | Returns `{ allowed: boolean, reason: string }` |

### Renewal Rule (Simplified)

**Administrator does NOT choose renewal behaviour.** The system applies a single rule:

```
IF subscription IS active AND NOT expired:
    newExpiry = currentExpiry + planDuration
ELSE (already expired):
    newExpiry = now + planDuration
```

This prevents human error — extending from today when the user has unused days, or accidentally extending from an expired date.

### Version Bump

Every mutation to subscription increments `version`:
- `create()` sets version to 1
- `renew()`, `extend()`, `suspend()`, `resume()`, `expire()`, `convertToLifetime()`, `removeLifetime()` increment version
- Any `activate()`/`deactivate()` on a disabled account increments version

This ensures all existing stream tokens are invalidated immediately.

---

## 10. Subscription History (Immutable Collection)

### Collection: `subscription_history`

| Field | Type | Description |
|-------|------|-------------|
| `_id` | ObjectId | Primary key |
| `userId` | ObjectId | Subject user |
| `action` | String | Action performed |
| `previousValues` | Object | Snapshot of user.subscription **before** change |
| `newValues` | Object | Snapshot of user.subscription **after** change |
| `adminId` | ObjectId | Admin who performed action |
| `adminIp` | String | IP address of admin |
| `reason` | String | Why the change was made |
| `notes` | String | Admin notes for this action |
| `source` | String | `dashboard` \| `cli` \| `api` |
| `correlationId` | String | UUID for request tracing |
| `ownershipValidated` | Boolean | Whether ownership was checked before action |
| `createdAt` | Date | Immutable timestamp (UTC) |

### Indexes

- `{ userId: 1, createdAt: -1 }` — user history timeline
- `{ adminId: 1, createdAt: -1 }` — admin activity log
- `{ action: 1, createdAt: -1 }` — action-type queries
- `{ correlationId: 1 }` — for distributed tracing

---

## 11. API Changes

### New Route File: `server/src/routes/admin/subscription.routes.js`

All endpoints require `authenticate` + `adminAuth` middleware (Super Admin or Manager). Manager-scoped endpoints perform ownership validation.

| Method | Path | Admin Access | Description |
|--------|------|:------------:|-------------|
| `POST` | `/api/admin/subscriptions` | Super Admin, Manager | Assign subscription to Member |
| `GET` | `/api/admin/subscriptions/:userId` | Super Admin, Manager (own) | Get subscription details |
| `PUT` | `/api/admin/subscriptions/:userId/renew` | Super Admin, Manager (own) | Renew subscription |
| `PUT` | `/api/admin/subscriptions/:userId/extend` | Super Admin, Manager (own) | Extend expiry |
| `PUT` | `/api/admin/subscriptions/:userId/suspend` | Super Admin, Manager (own) | Suspend |
| `PUT` | `/api/admin/subscriptions/:userId/resume` | Super Admin, Manager (own) | Resume |
| `PUT` | `/api/admin/subscriptions/:userId/activate` | Super Admin, Manager (own) | Activate |
| `PUT` | `/api/admin/subscriptions/:userId/deactivate` | Super Admin, Manager (own) | Deactivate |
| `POST` | `/api/admin/subscriptions/:userId/lifetime` | Super Admin only | Convert to lifetime |
| `POST` | `/api/admin/subscriptions/:userId/remove-lifetime` | Super Admin only | Remove lifetime |
| `POST` | `/api/admin/subscriptions/:userId/expire` | Super Admin, Manager (own) | Expire immediately |
| `PUT` | `/api/admin/subscriptions/:userId/dates` | Super Admin only | Change activation/expiry dates |
| `PUT` | `/api/admin/subscriptions/:userId/notes` | Super Admin, Manager (own) | Add notes |
| `GET` | `/api/admin/subscriptions/:userId/history` | Super Admin, Manager (own) | Get audit history |
| `GET` | `/api/admin/subscriptions/stats` | Super Admin only | Global statistics |
| `GET` | `/api/admin/subscriptions/expiring` | Super Admin, Manager (own) | Expiring soon |
| `GET` | `/api/admin/subscriptions/check/:userId` | Super Admin, Manager (own) | Check access status |

### Modified: `server/src/routes/auth.routes.js`

- Login response includes subscription status for Member users
- Example: `{ ..., subscription: { status: 'active', expiryDate: '...', daysRemaining: 45 } }`

### Modified: `server/src/routes/index.js`

- Mount subscription routes at `/api/admin/subscriptions`

### Modified: `server/src/routes/stream.routes.js`

- `POST /api/stream/token` validates subscription before generating token
- Stream token payload includes `subscriptionVersion`
- Segment serving validates stream token + subscription version match

---

## 12. Middleware Changes

### New: `server/src/middleware/subscription.middleware.js`

#### `requireActiveSubscription`

```javascript
// Pseudocode
function requireActiveSubscription(req, res, next) {
  const user = await User.findById(req.user._id).select('role subscription');

  // Bypass for admin roles
  if (user.role === 'super_admin' || user.role === 'manager') {
    return next();
  }

  // Check subscription exists
  if (!user.subscription) {
    return next(ApiError.forbidden('No subscription found'));
  }

  // Check status
  if (user.subscription.status === 'suspended') {
    return next(ApiError.forbidden('Account suspended'));
  }
  if (user.subscription.status === 'disabled') {
    return next(ApiError.forbidden('Account disabled'));
  }
  if (user.subscription.status === 'expired') {
    return next(ApiError.forbidden('Subscription expired', {
      expiredAt: user.subscription.expiryDate
    }));
  }

  // Check expiry date (for non-lifetime)
  if (!user.subscription.flags?.lifetime) {
    if (user.subscription.expiryDate && new Date() > user.subscription.expiryDate) {
      return next(ApiError.forbidden('Subscription expired'));
    }
  }

  // Check activation date (future activation)
  if (user.subscription.activationDate && new Date() < user.subscription.activationDate) {
    return next(ApiError.forbidden('Subscription not yet active', {
      activatesAt: user.subscription.activationDate
    }));
  }

  // Attach subscription version to request
  req.subscriptionVersion = user.subscription.version;
  next();
}
```

#### `requireOwnership`

Validates the target user belongs to the requesting admin:

```javascript
function requireOwnership(targetUserId) {
  return async (req, res, next) => {
    // Super Admin bypasses ownership checks
    if (req.user.role === 'super_admin') return next();

    const target = await User.findById(targetUserId).select('createdBy role');
    if (!target) return next(ApiError.notFound('User not found'));

    // Manager can only act on their own Members
    if (target.createdBy?.toString() !== req.user._id.toString()) {
      return next(ApiError.forbidden('This user is not under your management'));
    }

    next();
  };
}
```

### Modified: `server/src/middleware/auth.middleware.js`

- Add `role` field to `req.user` with full role name (super_admin, manager, member)
- Add `subscriptionVersion` to `req.user` (if Member)

### Modified: `server/src/services/stream.service.js`

- `generateStreamToken()` includes `subscriptionVersion` in token payload
- `validateStreamToken()` compares token's `subscriptionVersion` against current DB value
- Version mismatch → token rejected (forces client to request new token)

---

## 13. CLI Changes

### New: `cli/commands/subscription.commands.js`

| Command | Description | Requires |
|---------|-------------|----------|
| `novactl subscription create <username> --plan <plan>` | Assign subscription | Super Admin, Manager |
| `novactl subscription renew <username> --plan <plan>` | Renew | Super Admin, Manager |
| `novactl subscription extend <username> --days <N>` | Extend expiry | Super Admin, Manager |
| `novactl subscription expire <username>` | Expire immediately | Super Admin, Manager |
| `novactl subscription suspend <username>` | Suspend | Super Admin, Manager |
| `novactl subscription activate <username>` | Activate | Super Admin, Manager |
| `novactl subscription lifetime <username>` | Convert to lifetime | Super Admin only |
| `novactl subscription remove-lifetime <username> --plan <plan>` | Remove lifetime | Super Admin only |
| `novactl subscription info <username>` | Show subscription details | Super Admin, Manager (own) |
| `novactl subscription expiring --days <N>` | List expiring in N days | Super Admin, Manager (own) |
| `novactl subscription history <username>` | Show audit history | Super Admin, Manager (own) |

### Modified: `cli/bin/novactl`
- Register subscription command group

### CLI Ownership
- CLI performs ownership validation server-side (Manager scoped to `createdBy`)
- Super Admin sees all users; Manager sees only their Members

---

## 14. UI Changes

### New Page: `client/src/pages/admin/AdminSubscriptions.jsx`
Route: `/admin/subscriptions`

Subscription statistics dashboard:
- Cards: Active, Expired, Expiring in 7 days, Trial Ending, Lifetime, Recently Renewed
- Charts: Renewal activity over time (last 30 days)
- Table: Expiring soon list with quick-renew actions
- Table: Recently expired list with quick-renew actions

**Scoping:**
- Super Admin: Global statistics across all users
- Manager: Scoped to own Members only

### New Page: `client/src/pages/admin/AdminSubscriptionUser.jsx`
Route: `/admin/subscriptions/:userId`

Single user subscription management:
- User info header (username, role, displayName, createdBy)
- Current subscription card (plan, status, activation, expiry, days remaining)
- Action buttons (context-sensitive based on current status)
- Renewal dialog
- Audit history timeline

### New Dialog: `client/src/components/admin/RenewalDialog.jsx`
- Plan selector (from configurable plans list)
- Duration display (auto-calculated based on plan)
- New expiry preview (shown before confirmation)
- Reason field (required)
- Notes field (optional)
- Lifetime toggle (Super Admin only)

### New Component: `client/src/components/admin/SubscriptionBadge.jsx`
- Color-coded badge: trial (blue), active (green), expired (red), suspended (orange), disabled (gray), lifetime (gold)

### New Component: `client/src/components/admin/OwnershipLabel.jsx`
- Shows `createdBy` username for admin user table
- Useful for Managers to identify their Members

### Modified: `client/src/api/admin.api.js`
- Add all subscription API methods

### Modified: `client/src/App.jsx`
- Add `/admin/subscriptions` routes
- Add `/admin/subscriptions/:userId` route

### Modified: `client/src/context/AuthContext.jsx`
- Add subscription status to user context (for Members)

---

## 15. Security & Access Control

### Stream Token Security (Key Improvement)

Current stream tokens have a fixed 24h expiry. With subscription versioning:

1. Token is generated with the current `subscription.version` in its payload
2. Each stream segment request validates the token's version against the DB
3. On subscription change (renew, suspend, expire, etc.), version increments
4. **Old tokens are immediately invalid** — no need to wait for 24h expiry

This enables:
- **Immediate suspension** — user cannot watch 1 second after suspend
- **Immediate deactivation** — access revoked instantly
- **Immediate expiry** — no grace period gap
- **Immediate lifetime conversion** — user can watch immediately without re-authenticating

### Access Control Summary

| Layer | What | Blocked For |
|-------|------|-------------|
| **Login** | `POST /api/auth/login` | Never blocked (all roles login) |
| **Browse** | `GET /api/movies`, `GET /api/series` | Never blocked (browsing allowed) |
| **Detail** | `GET /api/movies/:slug` | Never blocked |
| **Stream Token** | `POST /api/stream/token` | ❌ Blocked for expired/suspended/disabled Members |
| **HLS Playlist** | `GET /api/stream/*/index.m3u8` | ❌ Blocked via stream token + version check |
| **HLS Segment** | `GET /api/stream/*/segments/*` | ❌ Blocked via stream token + version check |
| **Thumbnails** | `GET /api/thumbnails/*` | Never blocked (low-risk, low-cost) |
| **Admin API** | `GET /api/admin/*` | ❌ Blocked for Members (via adminAuth middleware) |

### Security Mitigations

| Threat | Mitigation |
|--------|------------|
| **Expired JWT** | JWT expiry independent (default 7d). Subscription checked at request time, not in JWT. |
| **Expired Session** | Session checked independently. Subscription checked after session validation. |
| **Expired subscription** | Subscription middleware checks `expiryDate` against server UTC clock. |
| **Concurrent admin updates** | MongoDB `$set` on embedded doc is atomic. History append is separate. |
| **Clock drift** | All comparisons use server UTC clock. NTP sync assumed. |
| **Timezone** | All dates stored in UTC. Frontend converts for display only. |
| **DST** | UTC is DST-agnostic. No DST-related bugs. |
| **Future activation** | Middleware checks `activationDate <= now()`. Access denied if future. |
| **Manual backdating** | Allowed but logged with `action: 'dates_modified'` and old/new value snapshots. |
| **Playback during expiry** | Token validates subscription at generation. Version bump invalidates token immediately. |
| **Renewal during playback** | Version bumps → old token invalid → client must get new token. No disruption after refresh. |
| **Version mismatch** | Stream middleware checks token version against DB. Forces re-auth. |
| **Race conditions** | MongoDB atomic `$inc: { version: 1 }` on every mutation. |
| **Server restart** | All state in DB — survives restart. |
| **Duplicate requests** | Correlation ID prevents double-processing. |
| **Manager accessing another Manager's user** | `requireOwnership()` middleware blocks with 403. |
| **Manager modifying Super Admin** | `requireOwnership()` — Super Admin has no `createdBy` match → blocked. |
| **Deleted user** | User.deleteOne → cleanup script removes history references (optional). |
| **Cache invalidation** | Subscription middleware is uncached (always fresh DB read). |

---

## 16. Migration Strategy

### Phase A: Schema Migration
1. Add embedded `subscription` field to User model (nullable)
2. Add `role` enum values `super_admin` and `manager` (keeping existing `admin` mapped to `super_admin`)
3. Create `subscription_history` collection
4. Migration script: backfill `subscription` for existing users (all default to `active` with `{ plan: 'legacy', flags: { lifetime: true } }`)
5. No downtime — existing users retain full access

### Phase B: Feature Flag Enablement
1. Deploy SubscriptionService + middleware (disabled by `SUBSCRIPTION_ENABLED=false`)
2. Deploy admin subscription API routes
3. Deploy admin UI pages
4. Enable on stream token generation (validate subscription)
5. Enable subscription middleware globally

### Phase C: Enforcement
1. Remove feature flag
2. Ensure no access leaks
3. Document procedures for Super Admin and Manager roles

### Rollback Plan
- Set `SUBSCRIPTION_ENABLED=false` — all subscription checks disabled
- Users regain full access immediately
- No data loss — subscriptions remain in DB

---

## 17. Edge Case Matrix

| Edge Case | Behavior |
|-----------|----------|
| **Subscription expires while watching** | Token version check fails on next segment request. Player shows "Subscription expired" overlay. |
| **Renew before expiry** | `expiryDate` extended from current `expiryDate`. User keeps full remaining + new duration. |
| **Renew after expiry** | `expiryDate` = `now() + planDuration`. Previous period lost. |
| **Negative duration** | Rejected by Zod validation (`z.number().positive()`). |
| **Zero duration** | Rejected by Zod validation (`z.number().min(1)`). |
| **Future activation** | `activationDate > now()` → status is `active` but access blocked until date. Middleware checks `activationDate <= now`. |
| **Lifetime downgrade** | Not possible natively. Remove lifetime → set new plan + duration. |
| **Disabled lifetime** | `status = 'disabled'`. Flags intact. Re-activate restores lifetime. |
| **Deleted user** | Subscription data deleted with user. History records remain (orphaned). |
| **Deleted user with history** | History records remain for audit purposes. Admin can identify which user was deleted. |
| **Manager attempts to modify another Manager's users** | `requireOwnership()` returns 403. |
| **Manager attempts to modify Super Admin** | Super Admin has no `createdBy` matching Manager → 403. |
| **Manager creating elevated role** | Admin middleware checks requested role against requester role → 403. |
| **Manager ownership transfer** | Super Admin reassigns `createdBy` on Member documents. History records transfer. |
| **Deleting Manager with Members** | Super Admin must reassign Members first. System prevents deletion if `createdBy` count > 0. |
| **Reassigning Members** | Super Admin updates `createdBy` to another Manager. New Manager gains full access. |
| **Bulk renewals** | Not in scope v1. Future enhancement. |
| **Concurrent renewals** | MongoDB atomic `$inc: { version: 1 }` + `$set` on embedded doc prevents conflicts. |
| **Subscription downgrade** | Allowed. Set new plan + `expiryDate`. Version bumps. |
| **Version mismatch** | Token `subscriptionVersion` !== DB `subscription.version` → token rejected. |
| **Invalid stream token after renewal** | Same as version mismatch — client requests new token with updated version. |
| **Clock skew > 5 minutes** | Warning logged. Admin notified. System continues with server clock. |
| **Cache invalidation** | Subscription middleware always reads fresh from DB. No cache. |
| **MongoDB rollback** | History collection is append-only. Rollback can be reconstructed from history. |
| **Recovery after crash during renewal** | Either `findOneAndUpdate` completed (persisted) or it didn't. No partial state. History may miss record if crash occurs after User save but before History insert — mitigated by correlation ID. |
| **Admin mistake (wrong expiry)** | Previous values snapshotted in history. Admin can correct and log. |
| **Duplicate requests** | Correlation ID (`X-Correlation-ID` header) prevents double-processing within 5 minutes. |
| **Expired sessions** | Independent of subscription. Session expires per TTL (default 7d). |
| **Trial expiry** | Background job checks `trialEndDate`. Sets `status: 'expired'`, `flags.trial: false`. |
| **User with no subscription (Member)** | Subscription is `null`. Middleware returns `{ reason: 'no_subscription', message: 'No subscription assigned. Contact support.' }`. |
| **User with no subscription (Super Admin/Manager)** | Bypasses subscription check entirely. Full access. |
| **Admin creating user with subscription** | `POST /api/admin/users` accepts optional subscription fields. Creates user + subscription in one request. |

---

## 18. Performance Considerations

| Concern | Impact | Mitigation |
|---------|--------|------------|
| Subscription version check on every segment request | ~5ms (indexed lookup, projection `{ subscription: { version: 1 } }` only) | Acceptable. Version field is tiny. |
| History collection growth | ~1KB per action. 10,000 actions = ~10MB | Indexed. Optional TTL archive. |
| Expiry sweep | ~50ms for 100K users (indexed on `subscription.expiryDate`) | Background job every hour. |
| Admin stats queries | ~100ms for 100K users | Aggregation pipeline with indexes. Super Admin only. |
| Embedded subscription read | **Zero additional queries** — subscription data is in the User document already fetched by auth middleware | This is the key performance advantage of embedding. |

**Performance verdict:** The embedded design is strictly faster than a separate collection. Every protected request already fetches the User document (for auth/session). Subscription data comes free with that read.

---

## 19. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|:----------:|:------:|------------|
| **User gets free access after expiry** | Low | High | Version check on every segment. Middleware on every API call. |
| **Admin accidentally expires all users** | Very Low | Critical | No bulk operations in v1. History allows undo. |
| **Clock drift breaks access** | Low | Medium | All comparisons use server UTC clock. NTP sync. |
| **Race condition on renewal** | Low | Medium | MongoDB atomic `$inc: { 'subscription.version': 1 }` prevents conflicts. |
| **Data loss during migration** | Very Low | High | Backfill is optional. Rollback plan exists. |
| **Performance regression** | Very Low | Low | Embedded = zero additional queries. |
| **Manager misusing permissions** | Medium | Medium | Ownership validation at middleware level. Server-enforced scope. |
| **Lifetime accidentally removed** | Low | Medium | Requires explicit `removeLifetime()` call. History snapshots allow recovery. |
| **Deleted Manager with active Members** | Low | High | Prevention check before deletion. Reassignment workflow required. |

**Overall Risk: LOW** — Embedding removes the most significant performance concern. Ownership validation is enforced at the middleware level, not in application code. The version-based token invalidation is the strongest security mechanism in the design.

---

## 20. Implementation Phases

| Phase | Scope | Effort | Dependencies |
|-------|-------|:------:|--------------|
| **P1 — Foundation** | Add `role` enum values, embedded `subscription` to User model, `subscription_history` model, `plans.js` config, `SubscriptionService` | M | None |
| **P2 — Role Enforcement** | Middleware updates for 3-role system, ownership validation, user creation restrictions | S | P1 |
| **P3 — Subscription Middleware** | `requireActiveSubscription`, `requireOwnership`, stream token version integration | S | P1 |
| **P4 — Admin API** | All subscription CRUD endpoints, validators, ownership-scoped queries | M | P1, P2 |
| **P5 — Admin UI** | Subscription pages, dialogs, components, API integration | L | P1, P4 |
| **P6 — CLI** | Subscription commands, ownership-scoped queries | S | P1 |
| **P7 — Security Hardening** | Edge case handling, correlation IDs, idempotency, rate limiting for admin actions | S | P2, P3, P4 |
| **P8 — Migration & Testing** | Migration script, unit + integration tests for subscription flow, role enforcement test | M | P1-P4 |
| **P9 — Go Live** | Feature flag removal, monitoring dashboards, admin documentation | S | P1-P8 |

**Total estimated effort:** M+ (roughly 4-6 days for a single developer)

---

## 21. File Impact List

### New Files (12)

| File | Estimate |
|------|:--------:|
| `server/src/services/subscription.service.js` | ~250 lines |
| `server/src/middleware/subscription.middleware.js` | ~80 lines |
| `server/src/routes/admin/subscription.routes.js` | ~300 lines |
| `server/src/validators/subscription.validator.js` | ~120 lines |
| `server/src/config/plans.js` | ~40 lines |
| `server/src/models/SubscriptionHistory.model.js` | ~60 lines |
| `cli/commands/subscription.commands.js` | ~180 lines |
| `client/src/pages/admin/AdminSubscriptions.jsx` | ~250 lines |
| `client/src/pages/admin/AdminSubscriptionUser.jsx` | ~350 lines |
| `client/src/components/admin/RenewalDialog.jsx` | ~180 lines |
| `client/src/components/admin/SubscriptionBadge.jsx` | ~40 lines |
| `client/src/components/admin/OwnershipLabel.jsx` | ~30 lines |
| `scripts/migrate-subscriptions.js` | ~100 lines |

### Modified Files (9)

| File | Change |
|------|--------|
| `server/src/models/User.model.js` | Add `role: ['super_admin', 'manager', 'member']`, embedded `subscription` field |
| `server/src/routes/index.js` | Mount subscription routes |
| `server/src/routes/auth.routes.js` | Return subscription status in login response |
| `server/src/routes/stream.routes.js` | Add subscription middleware, version in token |
| `server/src/services/stream.service.js` | Add version to token generation/validation |
| `server/src/middleware/auth.middleware.js` | Add role + subscriptionVersion to req.user |
| `client/src/App.jsx` | Add admin subscription routes |
| `client/src/api/admin.api.js` | Add subscription API methods |
| `cli/bin/novactl` | Register subscription commands |

---

## 22. New Findings Required

| Proposed ID | Category | Severity | Description |
|-------------|----------|:--------:|-------------|
| F-101 | Security | Critical | Subscription middleware correctly blocks expired Members from streaming |
| F-102 | Security | Critical | Ownership enforcement — Manager cannot access another Manager's Members |
| F-103 | Security | Critical | Version-based stream token invalidation — no playback after suspension |
| F-104 | Security | High | Role enforcement — Manager cannot create elevated roles |
| F-105 | API | Medium | Subscription API follows existing ApiResponse format |
| F-106 | Database | Medium | Subscription history indexes cover all query patterns |
| F-107 | Frontend | Medium | Admin subscription UI has proper loading/error/empty states |
| F-108 | Code Quality | Low | No duplicate subscription validation patterns |
| F-109 | Documentation | Information | User management procedures documented for Super Admin and Manager |

---

## 23. Governance Certification Checklist

- [ ] Proposal v2 approved by user
- [ ] All 23 sections complete
- [ ] Three-role system (Super Admin, Manager, Member) documented
- [ ] Permission matrix covers every action for every role
- [ ] Ownership model finalized (createdBy-based)
- [ ] Embedded subscription design approved
- [ ] Primary state + flags status model approved
- [ ] Configurable plans mechanism approved
- [ ] Stream token version invalidation mechanism approved
- [ ] Simplified renewal rule approved
- [ ] Security mitigations cover all identified threats
- [ ] Edge case matrix reviewed (28 edge cases)
- [ ] Implementation phases agreed
- [ ] Rollback plan documented
- [ ] Migration strategy documented
- [ ] Testing plan agreed
- [ ] Feature flag mechanism agreed (`SUBSCRIPTION_ENABLED`)

---

## 24. Summary of Changes from v1

| Section | v1 (Previous) | v2 (Revised) | Reason |
|---------|---------------|---------------|--------|
| **User Roles** | 2 roles (admin, user) | 3 roles (super_admin, manager, member) | Delegated administration requirement |
| **Subscription storage** | Separate `subscriptions` collection | **Embedded** in User document | One subscription per user; eliminates extra DB read |
| **Admin subscription bypass** | All admins bypass | Super Admin + Manager both bypass; only Members checked | Managers are operational admins |
| **Ownership model** | Not defined | Every Member owned by creator (`createdBy`) | Prevent Manager from accessing other Managers' users |
| **Status model** | 6 mutually exclusive statuses | Primary state + flags (trial, lifetime) | Cleaner state space, extensible |
| **Plans** | Hardcoded in enum | Configurable via `plans.js` | Add plans without code changes |
| **Stream token versioning** | Not present | Version bumped on every subscription change | Immediate invalidation on suspend/expire |
| **Renewal behaviour** | Admin chooses | **Automatic** — extend from expiry if active, from today if expired | Prevents human error |
| **Permission matrix** | Not present | Complete 3-role matrix for all actions | Governance clarity |
| **Ownership validation** | Not present | `requireOwnership()` middleware | Server-enforced scope |
| **User creation restrictions** | Any admin creates any role | Super Admin creates all; Manager creates only Members | Role hierarchy enforcement |
| **Deletion guard for Manager** | Not present | Cannot delete Manager with active Members | Prevents orphaned users |
| **History audit fields** | Basic fields | Extended: source, correlationId, ownershipValidated | Full traceability |
| **Edge cases** | 20 edge cases | 28 edge cases (added: Manager ownership, reassignment, version mismatch, etc.) | Comprehensive coverage |
| **Implementation phases** | 8 phases | 9 phases (added Role Enforcement as separate phase) | Role enforcement is significant enough to warrant its own phase |

### Architectural Decisions Tradeoffs

| Decision | Tradeoff |
|----------|----------|
| **Embedded subscription** | ✅ Zero additional queries; ❌ Slightly larger User document (but subscription is ~200 bytes — negligible) |
| **Primary state + flags** | ✅ Cleaner state space (4 × 2² = 16 possible states with 2 flags); ❌ Slightly more logic in middleware |
| **Version-based token invalidation** | ✅ Immediate security response; ❌ Slightly more complex stream token lifecycle |
| **Automatic renewal** | ✅ Prevents admin errors; ❌ Less flexibility (but admins can always override via separate extend endpoint) |
| **Ownership middleware** | ✅ Server-enforced security; ❌ Extra DB query per admin action (but indexed — negligible cost) |

### Final Recommendation

The revised architecture is **more secure, more maintainable, and better scoped** than v1. The three key improvements are:

1. **Embedded subscription** — eliminates a DB query on every protected request
2. **Version-based token invalidation** — enables immediate access revocation
3. **Ownership model** — provides clean delegation boundaries for the Manager role

The system remains simple (no payment gateway, no billing) while being production-grade and future-proof for expansion.

---

*End of Governance Proposal v2 — No code has been implemented. Awaiting user approval before proceeding.*
