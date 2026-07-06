# NovaStream — Database Schema & API Design

> **Part of:** [NovaStream Server Plan](./README.md)
> **Last Updated:** July 4, 2026

---

## 3. Database Schema Design

### 3.1 Content Collection (Movies + Series)
```javascript
{
  _id: ObjectId,
  tmdbId: Number,
  title: String,
  originalTitle: String,
  slug: String,                  // URL-friendly unique identifier
  overview: String,
  contentType: String,           // "movie" | "series"
  posterPath: String,
  backdropPath: String,
  thumbnailPath: String,
  genre: String,
  genres: [{ id: Number, name: String }],
  categories: [String],
  tags: [String],
  releaseDate: Date,
  firstAirDate: Date,
  lastAirDate: Date,
  runtime: Number,
  numberOfSeasons: Number,
  numberOfEpisodes: Number,
  voteAverage: Number,
  voteCount: Number,
  viewCount: Number,
  isActive: Boolean,
  isFeatured: Boolean,
  isPinned: Boolean,
  isPremium: Boolean,
  cast: [{
    name: String,
    character: String,
    profilePath: String,
    order: Number
  }],
  timestamps: true
}
// Indexes: { slug: 1 } unique, { contentType: 1, isActive: 1 },
//          { categories: 1 }, { title: "text", overview: "text" }
```

### 3.2 Season Collection (Series only)
```javascript
{
  _id: ObjectId,
  contentId: ObjectId,           // ref → Content
  tmdbId: Number,
  seasonNumber: Number,
  name: String,
  overview: String,
  posterPath: String,
  airDate: Date,
  episodeCount: Number,
  timestamps: true
}
// Indexes: { contentId: 1, seasonNumber: 1 } unique
```

### 3.3 Episode Collection
```javascript
{
  _id: ObjectId,
  seasonId: ObjectId,            // ref → Season
  contentId: ObjectId,           // ref → Content
  tmdbId: Number,
  episodeNumber: Number,
  name: String,
  overview: String,
  stillPath: String,
  airDate: Date,
  runtime: Number,
  voteAverage: Number,
  streams: [{
    quality: String,             // "480p" | "720p" | "1080p" | "4K"
    filePath: String,
    playlistUrl: String,
    bitrate: Number,
    resolution: String,
    fileSize: Number,
    isActive: Boolean
  }],
  downloadEnabled: Boolean,
  timestamps: true
}
// Indexes: { seasonId: 1, episodeNumber: 1 } unique
```

### 3.4 User Collection
```javascript
{
  _id: ObjectId,
  username: String,              // Unique login name
  passwordHash: String,          // bcrypt hashed
  displayName: String,
  role: String,                  // "super_admin" | "manager" | "member"
  isActive: Boolean,
  accountStatus: String,         // "active" | "disabled" | "archived" | "soft_deleted"
  
  // Subscription sub-document
  subscription: {
    plan: String,                // Plan ID from config (e.g. 'trial', '30d')
    status: String,              // "active" | "expired" | "suspended" | "disabled"
    flags: {
      trial: Boolean,            // Whether this is a trial subscription
    },
    activationDate: Date,
    expiryDate: Date,
    trialEndDate: Date,
    renewalCount: Number,
    lastRenewedAt: Date,
    version: Number,             // Bumped on every mutation (token invalidation)
    notes: String,
    createdBy: ObjectId,         // Admin who assigned this subscription
    updatedAt: Date,
    
    // Pending plan — queued upgrade (auto-activates when current expires)
    pendingPlan: {
      plan: String,
      startDate: Date,
      durationDays: Number,
      assignedAt: Date,
      assignedBy: ObjectId,
    },
  },
  
  // Manager quota tracking
  quotaUsage: {
    membersCreated: Number,
    renewalsToday: Number,
    passwordResetsToday: Number,
    extensionsToday: Number,
    lastResetDate: Date,
  },
  
  createdBy: ObjectId,           // Admin who created this user
  deletedAt: Date,               // Soft delete timestamp
  deletedBy: ObjectId,           // Who soft-deleted
  lastLoginAt: Date,
  lastLoginIp: String,
  loginHistory: [{
    ip: String,
    userAgent: String,
    loggedInAt: Date
  }],
  watchHistory: [{
    contentId: ObjectId,
    episodeId: ObjectId,
    progress: Number,
    duration: Number,
    watchedAt: Date
  }],
  watchlist: [{
    contentId: ObjectId,
    addedAt: Date
  }],
  timestamps: true
}
// Indexes: { username: 1 } unique, { isActive: 1, role: 1 }
```

### 3.5 Session Collection
```javascript
{
  _id: ObjectId,
  userId: ObjectId,
  token: String,                 // JWT token hash
  ip: String,
  userAgent: String,
  isActive: Boolean,
  expiresAt: Date,
  createdAt: Date
}
// Indexes: { userId: 1 }, { token: 1 }
```

### 3.6 Blocked IP Collection
```javascript
{
  _id: ObjectId,
  ip: String,
  reason: String,                // "abuse" | "bruteforce" | "scraping" | "manual"
  blockedBy: String,             // "system" | "admin"
  blockedAt: Date,
  expiresAt: Date,               // Auto unblock time (null = permanent)
  attemptCount: Number,
  isActive: Boolean
}
// Indexes: { ip: 1, isActive: 1 }
```

### 3.7 Rate Limit Log Collection
```javascript
{
  _id: ObjectId,
  ip: String,
  endpoint: String,
  method: String,
  statusCode: Number,
  userAgent: String,
  timestamp: Date
}
// Indexes: { ip: 1, timestamp: -1 }
```

---



## 4. API Endpoints Design

### 4.1 Auth Endpoints (No auth required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login with username/password, returns JWT |
| `POST` | `/api/auth/logout` | Invalidate current session |
| `GET` | `/api/auth/verify` | Verify token is still valid |

> **Note:** There is NO public registration. All users are created via the admin CLI (`novactl user add`).

### 4.2 Content Endpoints (Auth required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/homepage/sections` | Get all homepage sections (featured, trending, etc.) |
| `GET` | `/api/movies` | Browse movies with pagination & filters |
| `GET` | `/api/movies/:slug` | Get movie details |
| `GET` | `/api/series` | Browse series with pagination & filters |
| `GET` | `/api/series/:slug` | Get series details with seasons & episodes |
| `GET` | `/api/series/:slug/seasons` | Get seasons for a series |
| `GET` | `/api/episode/:id` | Get episode details & stream URLs |
| `GET` | `/api/trending` | Get trending content |
| `GET` | `/api/categories/:category` | Get content by category |
| `GET` | `/api/search?q=&type=&page=` | Search with filters |

### 4.3 Stream Endpoints (Token-protected HLS)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/stream/token` | ✅ Generate signed JWT stream token (24h expiry, IP binding) |
| `GET` | `/api/stream/movie/:slug/index.m3u8?token=` | ✅ Movie master playlist (token required) |
| `GET` | `/api/stream/movie/:slug/:quality/index.m3u8?token=` | ✅ Movie quality variant playlist |
| `GET` | `/api/stream/movie/:slug/:quality/segments/:segment?token=` | ✅ Movie TS segment with range support |
| `GET` | `/api/stream/episode/:id/index.m3u8?token=` | ✅ Episode master playlist |
| `GET` | `/api/stream/episode/:id/:quality/index.m3u8?token=` | ✅ Episode quality variant |
| `GET` | `/api/stream/episode/:id/:quality/segments/:segment?token=` | ✅ Episode TS segment |
| `GET` | `/api/stream/info/:type/:slug` | ✅ Get stream metadata (qualities available) |

### 4.4 Admin Endpoints (Admin role required)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/users` | List all users |
| `POST` | `/api/admin/users` | Create new user |
| `DELETE` | `/api/admin/users/:id` | Delete user |
| `POST` | `/api/admin/users/:id/reset` | Reset user password |
| `GET` | `/api/admin/content` | Browse content with pagination/filters |
| `PUT` | `/api/admin/content/:id` | Update content (toggle featured, etc.) |
| `DELETE` | `/api/admin/content/:id` | Soft-delete content |
| `GET` | `/api/admin/stats` | Server overview statistics |
| `GET` | `/api/admin/logs` | View server logs |
| `GET` | `/api/admin/system/health` | CPU, memory, disk, uptime |
| `GET` | `/api/admin/system/process` | PID, PM2 status |
| `GET` | `/api/admin/database` | MongoDB stats, collections, sizes |
| `GET` | `/api/admin/sessions` | Active sessions with user info |
| `DELETE` | `/api/admin/sessions/:id` | Force-invalidate a session |
| `GET` | `/api/admin/config` | Server env vars (masked) |
| `POST` | `/api/admin/config/validate` | Validate .env integrity |
| `GET` | `/api/admin/security/blocked-ips` | List blocked IPs |
| `POST` | `/api/admin/security/block-ip` | Block an IP |
| `POST` | `/api/admin/security/unblock-ip/:id` | Unblock IP |
| `GET` | `/api/admin/users/:id/activity` | User activity timeline |
| `GET` | `/api/admin/activity/recent` | Recent activity across all users |

### 4.5 Subscription Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/subscriptions/plans` | List subscription plans |
| `GET` | `/api/admin/subscriptions/plans/:planId` | Get plan details |
| `GET` | `/api/admin/subscriptions/stats` | Global subscription stats (SA only) |
| `GET` | `/api/admin/subscriptions/expiring` | Subs expiring within N days |
| `GET` | `/api/admin/subscriptions/check/:userId` | Check subscription access |
| `POST` | `/api/admin/subscriptions` | Assign initial subscription |
| `GET` | `/api/admin/subscriptions/:userId` | Get subscription details |
| `GET` | `/api/admin/subscriptions/:userId/history` | Audit history |
| `PUT` | `/api/admin/subscriptions/:userId/renew` | Renew subscription |
| `PUT` | `/api/admin/subscriptions/:userId/upgrade` | Queue plan upgrade |
| `PUT` | `/api/admin/subscriptions/:userId/cancel-upgrade` | Cancel pending upgrade |
| `PUT` | `/api/admin/subscriptions/:userId/extend` | Extend by days |
| `PUT` | `/api/admin/subscriptions/:userId/suspend` | Suspend subscription |
| `PUT` | `/api/admin/subscriptions/:userId/resume` | Resume subscription |
| `PUT` | `/api/admin/subscriptions/:userId/activate` | Activate disabled/suspended |
| `PUT` | `/api/admin/subscriptions/:userId/deactivate` | Deactivate (full reset) |
| `POST` | `/api/admin/subscriptions/:userId/expire` | Expire immediately |

### 4.6 Plan Management Endpoints (Super Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/admin/subscription/plans` | List all plans |
| `GET` | `/api/admin/subscription/plans/:planId` | Get a plan |
| `POST` | `/api/admin/subscription/plans` | Create a plan |
| `PUT` | `/api/admin/subscription/plans/:planId` | Update a plan |
| `DELETE` | `/api/admin/subscription/plans/:planId` | Soft-delete a plan |

### 4.7 Ownership Transfer Endpoints (Super Admin only)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `PUT` | `/api/admin/ownership/transfer` | Single user transfer |
| `PUT` | `/api/admin/ownership/transfer-batch` | Batch transfer |
| `PUT` | `/api/admin/ownership/transfer-all` | Transfer all from manager |
| `GET` | `/api/admin/ownership/managers/:id/quota` | Get manager quota |
| `PUT` | `/api/admin/ownership/managers/:id/quota` | Update manager quota |
| `GET` | `/api/admin/ownership/settings` | List system settings |
| `GET` | `/api/admin/ownership/settings/:key` | Get a setting |
| `PUT` | `/api/admin/ownership/settings/:key` | Update a setting |

---



## 8. Standardized API Response Format

Every API response follows a consistent structure for predictable client handling.

### 8.1 Success Response
```javascript
// server/src/utils/ApiResponse.js
class ApiResponse {
  static success(res, data = null, message = 'Success', statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    });
  }

  static paginated(res, data, pagination) {
    return res.status(200).json({
      success: true,
      message: 'Success',
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        totalPages: pagination.totalPages,
        hasNext: pagination.page < pagination.totalPages,
        hasPrev: pagination.page > 1,
      },
      timestamp: new Date().toISOString()
    });
  }

  static created(res, data = null, message = 'Created successfully') {
    return this.success(res, data, message, 201);
  }
}
```

### 8.2 Error Response
```javascript
// server/src/utils/ApiError.js
class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;     // Validation errors or additional context
    this.isOperational = true;  // Distinguishes from programmer bugs
  }

  static badRequest(message, details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Access denied') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, message);
  }

  static tooMany(message = 'Too many requests') {
    return new ApiError(429, message);
  }

  static internal(message = 'Internal server error') {
    return new ApiError(500, message);
  }
}
```

### 8.3 Global Error Handler Middleware
```javascript
// server/src/middleware/errorHandler.middleware.js
function errorHandler(err, req, res, next) {
  const logger = require('../config/logger');

  // Log the error
  logger.error({
    err,
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, err.message);

  // Operational errors (known, expected)
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      details: err.details || null,
      timestamp: new Date().toISOString()
    });
  }

  // Programmer errors (unexpected bugs) — hide details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Something went wrong',
      timestamp: new Date().toISOString()
    });
  }

  // Development: show the actual error
  return res.status(500).json({
    success: false,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString()
  });
}
```

---



## 9. Request Validation with Zod

### 9.1 Validation Middleware
```javascript
// server/src/middleware/validate.middleware.js
const validate = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
    req.validated = parsed;
    next();
  } catch (err) {
    const details = err.errors.map(e => ({
      field: e.path.join('.'),
      message: e.message
    }));
    next(ApiError.badRequest('Validation failed', details));
  }
};
```

### 9.2 Example Validator Schemas
```javascript
// server/src/validators/auth.validator.js
const { z } = require('zod');

const loginSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50),
    password: z.string().min(6).max(100),
  }),
});

const createUserSchema = z.object({
  body: z.object({
    username: z.string().min(3).max(50).regex(/^[a-zA-Z0-9_]+$/),
    password: z.string().min(6).max(100),
    role: z.enum(['admin', 'user']).optional().default('user'),
  }),
});
```

```javascript
// server/src/validators/content.validator.js
const { z } = require('zod');

const searchSchema = z.object({
  query: z.object({
    q: z.string().min(1).max(200),
    type: z.enum(['movie', 'series', 'all']).optional().default('all'),
    page: z.coerce.number().int().min(1).optional().default(1),
    limit: z.coerce.number().int().min(1).max(50).optional().default(20),
  }),
});

const slugParamSchema = z.object({
  params: z.object({
    slug: z.string().min(1).max(200),
  }),
});
```

### 9.3 How Routes Use Validation
```javascript
// server/src/routes/auth.routes.js
router.post('/login',
  validate(loginSchema),    // ← Zod validates before controller
  authController.login
);

router.post('/admin/users',
  authenticate,             // ← JWT check first
  adminOnly,                // ← Admin role check
  validate(createUserSchema),
  adminController.createUser
);
```

---




---

**← Previous:** [Part 1: Architecture](./01-ARCHITECTURE.md) | **Next:** [Part 3: Backend Services & Streaming](./03-BACKEND_AND_STREAMING.md) →
