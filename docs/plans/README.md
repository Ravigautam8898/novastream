# NovaStream — Server Plan

> **Last Updated:** July 4, 2026
> **Parts:** 5 files covering architecture, database, backend, frontend/security, and future work

The original monolithic `SERVER_PLAN.md` has been split into 5 focused parts for easier maintenance.

---

## 📑 Parts

| # | File | Sections | Description | Size |
|---|------|----------|-------------|------|
| 1 | [Architecture Overview](./01-ARCHITECTURE.md) | 1, 2, 7 | Architecture diagram, tech stack, project file tree | ~12 KB |
| 2 | [Database Schema & API Design](./02-DATABASE_AND_API.md) | 3, 4, 8, 9 | Schema designs, API endpoints, response format, Zod validation | ~12 KB |
| 3 | [Backend Services & Streaming](./03-BACKEND_AND_STREAMING.md) | 5, 6, 10, 11, 19.5 | Video processing, TMDB, logging, stream security, video player | ~11 KB |
| 4 | [Frontend, Security & CLI](./04-SECURITY_AND_CLI.md) | 12, 13, 14, 15, 16 | UI/UX, auth system, browser security, rate limiting, novactl CLI | ~27 KB |
| 5 | [Future Work & Implementation](./05-FUTURE_AND_IMPLEMENTATION.md) | 17, 18, 19, 20, 21, 22 | Admin dashboard, external source, telegram, phases, deployment | ~41 KB |

---

## 🔗 Quick Links

- [Project Status](../STATUS.md) — Live progress tracker
- [API Research](../reference/API_FINDINGS.md) — External API analysis
- [TMDB Research](../research/TMDB_API_RESEARCH.md) — TMDB integration research
- [Environment Reference](../reference/.env.example) — Env var template
