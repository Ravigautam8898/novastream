# NovaStream — Architecture Overview

> **Part of:** [NovaStream Server Plan](./README.md)
> **Last Updated:** July 4, 2026

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Browser                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  React SPA (Vite) + ArtPlayer/HLS.js                        │   │
│  │  + Anti-Debug Scripts + Client Security Layer               │   │
│  └────────────────────────┬──────────────────┬─────────────────┘   │
│                           │                  │                       │
│                    Login Required       HLS Streams                  │
│                    (JWT Token)          (Signed URLs)                │
└───────────────────────────┼──────────────────┼───────────────────────┘
                            │                  │
┌───────────────────────────▼──────────────────▼───────────────────────┐
│                   🔐 Security Gateway (Middleware Stack)              │
│  ┌────────────┐  ┌────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ JWT Auth   │  │ Rate       │  │ IP Reputation│  │ Request      │ │
│  │ Required   │  │ Limiter    │  │ & Blocklist  │  │ Validation   │ │
│  └────────────┘  └────────────┘  └──────────────┘  └───────┬──────┘ │
└─────────────────────────────────────────────────────────────┼───────┘
                                                               │
┌───────────────────────────────▼───────────────────────────────┐
│                   Express API Server (Layered Architecture)    │
│                                                                │
│   ┌───────────┐    ┌──────────────┐    ┌─────────────────┐    │
│   │  Routes   │───▶│ Controllers  │───▶│   Services      │    │
│   │ (wiring)  │    │ (thin HTTP)  │    │ (business logic)│    │
│   └───────────┘    └──────────────┘    └────────┬────────┘    │
│                                                  │              │
│                                                  ▼              │
│                                      ┌──────────────────┐      │
│                                      │  External APIs   │      │
│                                      │  - TMDB Service  │      │
│                                      │  - Transcoder    │      │
│                                      └──────────────────┘      │
│                                                                │
│   ┌────────────────────────────────────────────────────┐       │
│   │              Mongoose Models / Repositories        │       │
│   │  (Content, Season, Episode, User, Session, Block)  │       │
│   └──────────────────────┬─────────────────────────────┘       │
└──────────────────────────┼─────────────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────────────┐
│                    MongoDB Atlas (Cloud)                        │
└────────────────────────────────────────────────────────────────┘
            │                              │
┌───────────▼──────────┐    ┌──────────────▼──────────────────────┐
│   Media Storage      │    │   Server Management CLI (novactl)   │
│  ┌────────────────┐  │    │  ┌──────────────────────────────┐  │
│  │ HLS Video Files│  │    │  │ Node.js CLI (Commander.js)   │  │
│  │ (.m3u8 + .ts)  │  │    │  │  ├─ server start|stop       │  │
│  │ Thumbnails     │  │    │  │  ├─ user add|list|del|pass  │  │
│  │ Posters        │  │    │  │  ├─ ip block|unblock|list   │  │
│  └────────────────┘  │    │  │  ├─ health|logs|config      │  │
└──────────────────────┘    │  │  └─ telegram (future)        │  │
                            │  └──────────────────────────────┘  │
                            │                                     │
                            │  ┌──────────────────────────────┐  │
                            │  │ Telegram Bot (Phase 7)       │  │
                            │  │  ├─ /status — server health  │  │
                            │  │  ├─ /users — list users      │  │
                            │  │  ├─ /block — block IP        │  │
                            │  │  └─ /restart — restart server│  │
                            │  └──────────────────────────────┘  │
                            └────────────────────────────────────┘
```

---



## 2. Technology Stack

### Backend
| Technology | Purpose |
|------------|---------|
| **Node.js** | Runtime |
| **Express.js** | HTTP server framework |
| **MongoDB + Mongoose** | Database + ODM |
| **PM2** | Process manager (uptime, auto-restart) |
| **TMDB API + moviedb-promise** | External metadata (posters, cast, genres) |
| **FFmpeg** | Video transcoding → HLS + thumbnail generation |
| **JWT (jsonwebtoken)** | Authentication tokens |
| **bcrypt** | Password hashing |
| **Multer** | File upload handling |
| **Helmet** | Security headers (CSP, XSS, clickjacking) |
| **CORS** | Cross-origin support |
| **express-rate-limit** | Rate limiting middleware |
| **express-slow-down** | Slow down repeated offenders |
| **Zod** | ✅ Request validation schemas (replaces manual validation) |
| **Pino** | ✅ Structured JSON logging (replaces console.log) |
| **node-telegram-bot-api** | Telegram bot integration (Phase 7) |

### CLI Tool (novactl)
| Technology | Purpose |
|------------|---------|
| **Commander.js** | ✅ CLI framework (command parsing, help, version) |
| **Chalk** | ✅ Colored terminal output |
| **Ora** | ✅ Spinners for long-running operations |
| **Inquirer** | ✅ Interactive prompts (username, password, confirmations) |

### Frontend
| Technology | Purpose |
|------------|---------|
| **React + Vite** | Frontend framework |
| **ArtPlayer** | HTML5 video player (supports HLS) |
| **HLS.js** | HLS playback library |
| **Tailwind CSS** | Styling (mobile-first responsive) |
| **Framer Motion** | Animations & micro-interactions |
| **React Router** | Client-side routing |
| **Axios** | HTTP client |
| **react-hot-toast** | Toast notifications |

---



## 7. Project Structure (Actual State)

```
novastream/
│
├── server/                              # ✅ Express Backend (Active — Phases 1-8)
│   ├── src/
│   │   ├── config/
│   │   │   ├── env.js                   # ✅ Zod-validated environment variables
│   │   │   ├── database.js              # MongoDB connection with retry logic
│   │   │   └── logger.js                # ✅ Pino structured logger
│   │   │
│   │   ├── models/                      # ✅ 6 Mongoose models
│   │   │   ├── Content.model.js         # Updated with streams[], sourceId, sourceSite
│   │   │   ├── Season.model.js
│   │   │   ├── Episode.model.js
│   │   │   ├── User.model.js
│   │   │   ├── Session.model.js
│   │   │   └── BlockedIP.model.js
│   │   │
│   │   ├── routes/                      # ✅ 10 route modules
│   │   │   ├── index.js                 # Route aggregator
│   │   │   ├── auth.routes.js
│   │   │   ├── content.routes.js
│   │   │   ├── search.routes.js
│   │   │   └── stream.routes.js         # ✅ 8 endpoints (token, movie, episode, info)
│   │   │
│   │   ├── controllers/                 # ✅ Thin HTTP handlers
│   │   │   ├── auth.controller.js
│   │   │   └── content.controller.js
│   │   │
│   │   ├── services/                    # ✅ Business logic layer
│   │   │   ├── auth.service.js
│   │   │   ├── content.service.js
│   │   │   ├── tmdb.service.js
│   │   │   └── stream.service.js        # ✅ HLS token generation + playlist/segment serving
│   │   │
│   │   ├── middleware/                  # ✅ 10 middleware modules
│   │   │   ├── auth.middleware.js
│   │   │   ├── adminAuth.middleware.js
│   │   │   ├── rateLimiter.middleware.js
│   │   │   ├── ipBlocker.middleware.js
│   │   │   ├── validate.middleware.js   # ✅ Zod validation runner
│   │   │   ├── errorHandler.middleware.js
│   │   │   ├── imageProxy.middleware.js
│   │   │   ├── sanitize.middleware.js   # ✅ NoSQL injection + HPP protection
│   │   │   ├── contentType.middleware.js # ✅ Content-Type enforcement
│   │   │   └── streamAuth.middleware.js  # ✅ Stream token validation
│   │   │
│   │   ├── validators/                  # ✅ Zod schemas
│   │   │   ├── auth.validator.js
│   │   │   ├── content.validator.js
│   │   │   └── search.validator.js
│   │   │
│   │   ├── utils/                       # ✅ Helpers & shared code
│   │   │   ├── ApiResponse.js           # ✅ Standardized response builder
│   │   │   └── ApiError.js              # ✅ Custom error classes
│   │   │
│   │   └── app.js                       # Express app setup
│   │
│   ├── scripts/
│   │   ├── seed-content.js              # ✅ Fetches TMDB trending → MongoDB
│   │   └── setup-test-hls.js            # ✅ Creates HLS test content (FFmpeg or placeholder)
│   ├── uploads/                         # HLS video files
│   ├── package.json
│   └── .env
│
├── cli/                                 # ✅ Node.js CLI (Active — 7 command files)
│   ├── commands/
│   │   ├── server.commands.js           # start, stop, restart, status, logs
│   │   ├── user.commands.js             # add, list, delete, pass
│   │   ├── ip.commands.js               # block, unblock, list
│   │   ├── config.commands.js           # show, path
│   │   └── telegram.commands.js         # setup, status, test (Phase 7 placeholders)
│   ├── services/
│   │   ├── mongo.service.js             # DB operations
│   │   ├── pm2.service.js              # PM2 wrapper
│   │   └── server-detector.js          # Server process detection
│   ├── utils/
│   │   ├── logger.js
│   │   └── helpers.js
│   ├── bin/
│   │   └── novactl                      # ✅ Node.js entry point
│   ├── package.json
│   └── README.md
│
├── client/                              # ✅ React Frontend (Active)
│   ├── index.html                       # Entry HTML with Noto Sans font
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   └── Header.jsx           # Nav, search, user menu, Browse dropdown
│   │   │   ├── content/
│   │   │   │   ├── HeroCarousel.jsx
│   │   │   │   ├── ContentCard.jsx
│   │   │   │   ├── ContentRow.jsx
│   │   │   │   └── VideoPlayer.jsx      # ArtPlayer + HLS.js
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.jsx
│   │   │   │   └── ProtectedRoute.jsx
│   │   │   └── ui/
│   │   │       ├── LoadingSkeleton.jsx
│   │   │       ├── EmptyState.jsx
│   │   │       └── ErrorState.jsx
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── HomePage.jsx
│   │   │   ├── SearchPage.jsx
│   │   │   ├── CategoryPage.jsx
│   │   │   ├── DetailPage.jsx
│   │   │   ├── WatchPage.jsx
│   │   │   └── NotFoundPage.jsx
│   │   ├── hooks/
│   │   │   ├── useAuth.js
│   │   │   └── useContent.js
│   │   ├── api/
│   │   │   ├── client.js               # Axios instance with interceptors
│   │   │   ├── auth.api.js
│   │   │   └── content.api.js           # Includes getStreamToken()
│   │   ├── utils/
│   │   │   └── sanitize.js             # DOMPurify XSS prevention
│   │   ├── context/
│   │   │   └── AuthContext.jsx
│   │   ├── styles/
│   │   │   └── globals.css
│   │   └── App.jsx
│   ├── package.json
│   └── vite.config.js
│
├── docs/                                # ✅ Documentation
│   ├── index.md
│   ├── STATUS.md
│   ├── reference/
│   │   ├── API_FINDINGS.md
│   │   └── .env.example
│   ├── plans/
│   │   └── SERVER_PLAN.md
│   └── research/
│       └── TMDB_API_RESEARCH.md
│
├── logs/                                # PM2 + Pino logs
├── scripts/
│   └── sync-check.js                    # Governance validation
├── .env                                 # ✅ Configured & verified
├── .gitignore
├── ecosystem.config.js                  # PM2 configuration
├── GOVERNANCE.md                        # Project governance rules
├── requirements.txt                     # Dependency manifest
├── install.sh                           # Linux/Mac
├── install.ps1                          # Windows
└── README.md
```

---




---

**Next:** [Part 2: Database & API](./02-DATABASE_AND_API.md) →
