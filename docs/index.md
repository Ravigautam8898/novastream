# NovaStream Documentation

> **Project:** NovaStream — A Netflix-like streaming platform
> **Stack:** Node.js + Express + MongoDB + HLS Streaming
> **Target:** Desktop, Mobile, iOS Web (all platforms)

---

## 📂 Documentation Structure

```
docs/
├── index.md                  ← You are here — navigation hub
├── STATUS.md                 ← 🆕 Project progress tracker
├── reference/
│   ├── API_FINDINGS.md       ← YupFlix API reverse engineering report
│   └── .env.example          ← Environment template
├── plans/
│   └── SERVER_PLAN.md        ← Full NovaStream server architecture plan
└── research/
    └── TMDB_API_RESEARCH.md  ← TMDB API integration research

### Root
- **GOVERNANCE.md** — Project governance rules, sync matrix, pre-commit checklist
- **scripts/sync-check.js** — Automated governance validation script
```

---

## 📖 Document Quick Links

| Document | Description | Category |
|----------|-------------|----------|
| [Status Tracker →](STATUS.md) | 🆕 Live progress tracker — what's done vs pending across all 7 phases | Tracking |
| [API Findings →](reference/API_FINDINGS.md) | Complete YupFlix API structure, data models, streaming architecture, and technology stack | Reference |
| [Server Plan →](plans/SERVER_PLAN.md) | Full server architecture: DB schemas, API endpoints, FFmpeg pipeline, TMDB integration, deployment | Plans |
| [Governance Rules →](../GOVERNANCE.md) | 🆕 Project governance — sync matrix, BRIDGE workflow, pre-commit checklist, drift recovery | Governance |
| [TMDB Research →](research/TMDB_API_RESEARCH.md) | TMDB API key registration guide, available endpoints, image sizes, Node.js integration | Research |

---

## 🔐 Environment Variables Reference

All API keys and configuration are managed via a **`.env`** file at the project root.

> **⚠️ IMPORTANT:** The `.env` file contains sensitive credentials. **Never commit it to version control.** It is already listed in `.gitignore`.

### Current Required Variables

| Variable | Description | Source |
|----------|-------------|--------|
| `TMDB_API_KEY` | TMDB API Key (v3) for metadata | [TMDB API Settings](https://www.themoviedb.org/settings/api) |
| `TMDB_ACCESS_TOKEN` | TMDB Bearer Token (v4) for authenticated requests | [TMDB API Settings](https://www.themoviedb.org/settings/api) |
| `MONGODB_URI` | MongoDB connection string | Your MongoDB instance |
| `JWT_SECRET` | Secret key for JWT token signing | Generate locally |
| `STREAM_SECRET` | Secret key for HLS stream URL signing | Generate locally |
| `PORT` | Server port (default: 5000) | Configuration |

### Full Template
See [`reference/.env.example`](reference/.env.example) for the complete template with all variables and explanations.

---

## 🚀 Quick Start

```bash
# 1. Clone the repository
git clone <repo-url> novastream
cd novastream

# 2. Copy environment file and fill in your credentials
cp docs/reference/.env.example .env
# → Edit .env with your TMDB API Key, MongoDB URI, etc.

# 3. Install dependencies (cross-platform)
./install.sh              # Linux/Mac
# or .\install.ps1         # Windows

# 4. Seed sample content
node server/scripts/seed-content.js

# 5. Start development
cd server && npm run dev

# 6. In a separate terminal, start frontend
cd client && npm run dev
# → Open http://localhost:5173/
```

---

## 📋 Implementation Status

| Phase | Title | Tasks | Done | Progress | Status |
|-------|-------|-------|------|----------|--------|
| Pre | Infrastructure & Setup | 10 | 10 | ██████████ 100% | ✅ Complete |
| 1 | Foundation | 11 | 11 | ██████████ 100% | ✅ Complete |
| 2 | Security & Auth | 10 | 10 | ██████████ 100% | ✅ Complete |
| 3 | Content API | 7 | 7 | ██████████ 100% | ✅ Complete |
| 4 | Frontend Core | 12 | 12 | ██████████ 100% | ✅ Complete |
| 5 | Video Player | 8 | 8 | ██████████ 100% | ✅ Complete |
| 6 | Security Hardening | 9 | 9 | ██████████ 100% | ✅ Complete |
| 6.5 | Subscription System | 14 | 14 | ██████████ 100% | ✅ Complete |
| 7 | Admin Dashboard | 12 | 12 | ██████████ 100% | ✅ Complete |
| 8 | External Content Source | 12 | 12 | ██████████ 100% | ✅ Complete |
| 9 | Telegram + Polish | 4 | 0 | ░░░░░░░░░░ 0% | 🔮 Future |

> See [Status Tracker →](STATUS.md) for a detailed task-by-task breakdown of all phases.

> See [Audit Index →](AUDIT_INDEX.md) for a comprehensive file-by-file audit of every endpoint, component, model, and middleware.
