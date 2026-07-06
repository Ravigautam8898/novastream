# NovaStream

A Netflix-style media streaming platform with multi-quality HLS support, external content source integration, and a full admin dashboard.

> **Stack:** Node.js + Express · React + Vite · MongoDB · HLS.js + ArtPlayer

---

## 📋 Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | ≥ 18 (≥ 20 recommended) | [Download](https://nodejs.org) |
| **npm** | ≥ 9 | Included with Node.js |
| **MongoDB** | 7+ | [Atlas (free)](https://cloud.mongodb.com) or local install |
| **FFmpeg** | latest | Required for thumbnails/video processing |
| **PM2** | latest | Optional — for production process management |

---

## 🚀 Quick Start

### Linux / macOS

```bash
# 1. Clone the project
git clone <repo-url> novastream
cd novastream

# 2. (Optional) Use the right Node version
nvm use            # reads .nvmrc → Node 20

# 3. Run the install script
chmod +x install.sh
./install.sh

# 4. Edit the environment file
nano .env          # Set MONGODB_URI (required)

# 5. Start development
npm run dev        # Server :5000 + Client :5173
```

### Windows (PowerShell)

```powershell
# 1. Clone the project
git clone <repo-url> novastream
cd novastream

# 2. Run the install script
.\install.ps1

# 3. Edit the environment file
notepad .env       # Set MONGODB_URI (required)

# 4. Start development
npm run dev        # Server :5000 + Client :5173
```

---

## ⚡ One-Line Setup

If you already have Node.js 20+ and MongoDB:

```bash
# Linux / macOS
git clone <repo-url> && cd novastream && ./install.sh && npm run dev

# Windows (PowerShell)
git clone <repo-url>; cd novastream; .\install.ps1; npm run dev
```

---

## 🐳 Docker Setup (Alternative — no Node.js needed)

```bash
# Start all services (MongoDB + Server + Client)
docker compose up -d

# For production (includes Nginx)
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check logs
docker compose logs -f server
```

The server will be available at `http://localhost:5000` and the client at `http://localhost:5173` (dev) or `http://localhost` (Docker production).

---

## 🔧 Environment Variables

The `.env` file is created automatically by the install script from `docs/reference/.env.example`.

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGODB_URI` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | auto-generated | JWT signing secret (64-char hex) |
| `STREAM_SECRET` | ✅ | auto-generated | HLS stream token secret (64-char hex) |
| `TMDB_API_KEY` | ✅ | — | TMDB API v3 key |
| `TMDB_ACCESS_TOKEN` | ✅ | — | TMDB API v4 access token |
| `PORT` | ❌ | `5000` | Server port |
| `NODE_ENV` | ❌ | `development` | `development` / `production` |
| `CORS_ORIGIN` | ❌ | `http://localhost:5173` | Allowed CORS origin |
| `LOG_LEVEL` | ❌ | `info` | Pino log level |

> **Getting a TMDB API key:** Create a free account at [themoviedb.org](https://www.themoviedb.org/signup), go to Settings → API, and request a Developer API Key.

---

## 📖 Available Commands

### From project root

| Command | Description |
|---------|-------------|
| `npm run dev` | Start server + client in parallel |
| `npm run server` | Start server only (port 5000) |
| `npm run client` | Start client only (port 5173) |
| `npm run setup` | Run the install script |
| `npm run build` | Build client for production |
| `npm run install:all` | npm ci in server + cli + client |
| `npm run clean` | Remove all node_modules |
| `npm run reset` | Clean + reinstall |
| `npm run health` | Quick health check |
| `npm run logs` | Tail server logs |

### From the CLI (novactl)

```bash
novactl start              # Start server with PM2
novactl stop               # Stop server
novactl status             # Server status
novactl logs --lines=50    # Last 50 log lines
novactl health             # Full health check

novactl user add           # Create a user (interactive)
novactl user list          # List all users
novactl user delete <user> # Delete a user

novactl ip block <ip>      # Block an IP address
novactl ip list            # List blocked IPs
```

---

## 🖥️ Admin Dashboard

The admin dashboard is available at **`/admin`** after login (requires admin role).

| Section | Route | Description |
|---------|-------|-------------|
| Overview | `/admin` | Server stats, uptime, memory |
| Users | `/admin/users` | Create, delete, reset passwords |
| Content | `/admin/content` | Browse, toggle featured/active |
| Health | `/admin/health` | CPU, memory, disk gauges |
| Process | `/admin/process` | PID, heap usage, runtime |
| Database | `/admin/database` | Collections, sizes, indexes |
| Config | `/admin/config` | Environment variables (masked) |
| Activity | `/admin/activity` | User activity feed + timeline drill-down |
| Logs | `/admin/logs` | Live log viewer with auto-refresh |
| Security | `/admin/security` | IP blocking, active sessions |

> **Note:** Users are created via `novactl user add` (CLI) or the admin dashboard. There is no public registration.

---

## 📁 Project Structure

```
novastream/
├── server/          # Express API (port 5000)
│   └── src/
│       ├── config/  # Env, DB, Logger
│       ├── models/  # Mongoose schemas (6)
│       ├── routes/  # API endpoints (46+)
│       ├── controllers/
│       ├── services/ # Business logic (8)
│       ├── middleware/ # Request pipeline (10)
│       └── validators/ # Zod schemas
├── client/          # React SPA (port 5173)
│   └── src/│   ├── pages/       # 20 pages (9 main + 11 admin)
│   ├── components/  # 17 reusable components
│       ├── api/         # API client modules
│       ├── hooks/       # Custom React hooks
│       └── context/     # Auth context
├── cli/             # novactl CLI tool
├── docs/            # Plans, research, audit index
└── docker/          # Nginx config, start script
```

---

## 🔐 API Endpoints

**Total: 57+ endpoints** across 11 route modules.

| Area | Endpoints | Auth |
|------|-----------|------|
| **Health** | `GET /api/health` | Public |
| **Auth** | Login, Logout, Verify, Refresh | JWT |
| **Content** | Homepage, Movies, Series, Search, Categories | JWT |
| **Stream** | Token, Playlists, Segments (HLS) | Stream Token |
| **Progress** | Save, Get, Continue Watching | JWT |
| **Thumbnails** | Seek preview sprites | JWT |
| **Admin** | Users, Content, Stats, Health, Logs, Security, Config (16) | Admin |
| **External** | YupFlix streaming proxy | JWT |

---

## 📚 Documentation

| Document | Description |
|----------|-------------|
| [Architecture Plan](docs/plans/01-ARCHITECTURE.md) | Tech stack, project structure, architecture diagram |
| [Database & API](docs/plans/02-DATABASE_AND_API.md) | Schema designs, API endpoints, response format |
| [Backend Services](docs/plans/03-BACKEND_AND_STREAMING.md) | Video processing, TMDB, logging, stream security |
| [Frontend & CLI](docs/plans/04-SECURITY_AND_CLI.md) | UI/UX, auth, security, novactl CLI |
| [Future Work](docs/plans/05-FUTURE_AND_IMPLEMENTATION.md) | Admin dashboard, external sources, deployment |
| [Status](docs/reference/STATUS.md) | Live project progress tracker |
| [Audit Index](docs/AUDIT_INDEX.md) | Complete file-by-file audit |

---

## License

Private project.
