# Phase 8 — Production Audit

> **Phase:** phase-08-production/FINDINGS.md
> **Audit Date:** July 6, 2026
> **Status:** 🔍 Discovery complete — 14 findings identified across 3 batches.
> **Mode:** 🔍 DISCOVERY ONLY — no code changes implemented.

---

## Audit Scope

| Domain | Coverage | Files Examined |
|--------|----------|----------------|
| **Docker Configuration** | Multi-stage build, image size, layer caching, security | `Dockerfile`, `.dockerignore` |
| **Container Orchestration** | Service topology, network isolation, volumes, health checks | `docker-compose.yml`, `docker-compose.prod.yml` |
| **Reverse Proxy** | SSL/TLS, gzip, caching headers, security headers, upstream config | `docker/nginx.conf` |
| **Process Management** | PM2 cluster mode, memory limits, restart policy, graceful shutdown | `ecosystem.config.js` |
| **Startup & Bootstrap** | Init order, health verification, env seeding, failure handling | `docker/start.sh` |
| **Installation** | Cross-platform installer, dependency management, FFmpeg setup | `install.sh`, `install.ps1` |
| **Environment & Secrets** | Zod validation, secrets generation, env file management | `server/src/config/env.js`, `install.sh` |
| **Health & Monitoring** | Health endpoints, uptime monitoring, logging, alerting | `server/src/routes/health.routes.js` |
| **CI/CD** | Pipeline configuration, automated testing, deployment automation | Repository root |

---

## Findings Summary

| ID | Severity | Risk | Domain | Title | Batch |
|----|:--------:|:----:|--------|-------|:-----:|
| PPR-001 | 🔴 High | High | Reverse Proxy | No SSL/TLS — Nginx serves HTTP only; no port 443, certificates, or ACME challenge | ✅ A — Certified |
| PPR-002 | 🔴 High | Medium | Reverse Proxy | No rate limiting at Nginx level — all traffic reaches Node.js before rate checks | ✅ A — Certified |
| PPR-003 | 🟡 Medium | High | Process Management | PM2 configured as single-instance fork mode — no multi-core utilization | ✅ A — Certified |
| PPR-004 | 🟡 Medium | Medium | Container Security | MongoDB port 27017 exposed to host in production compose file | B |
| PPR-005 | 🟡 Medium | Medium | Logging | No PM2 log rotation or retention policy — logs grow unbounded | B |
| PPR-006 | 🟡 Medium | Medium | Startup | start.sh health check wait (3s) is too short for full stack initialization | B |
| PPR-007 | 🟡 Medium | Medium | CI/CD | No CI/CD pipeline configuration (GitHub Actions, etc.) | B |
| PPR-008 | 🟢 Low | Medium | Operations | No database backup strategy — no backup scripts or volume snapshot guidance | B |
| PPR-009 | 🟢 Low | Low | Configuration | docker-compose.prod.yml hardcodes NODE_ENV and CLIENT_URL instead of .env | C |
| PPR-010 | 🟢 Low | Low | Monitoring | Health endpoints exist but no monitoring/alerting integration configured | C |
| PPR-011 | 🟢 Low | Low | Startup | start.sh copies .env.example over existing .env on every container start | C |
| PPR-012 | 🟢 Low | Low | Configuration | CORS not hardened for production — CLIENT_URL set to localhost in compose | C |
| PPR-013 | 🟢 Low | Low | Docker | Dockerfile copies all source before dependency installation — misses layer cache | C |
| PPR-014 | ℹ️ Info | — | Hardening | CSP in production should be reviewed for domain-specific allowances | C |

---

## Detailed Findings

### Batch A — Critical Production Blockers

---

### PPR-001 — No SSL/TLS — Nginx Serves HTTP Only (🔴 High, High Risk)

**Domain:** Reverse Proxy — SSL/TLS
**Files affected:** `docker/nginx.conf`, `docker-compose.prod.yml`

**Current behavior:**
Nginx is configured to listen on port 80 only (HTTP). There is no port 443 listener, no SSL certificate path, and no `.well-known/acme-challenge` location block for Let's Encrypt:

```nginx
server {
    listen 80;
    server_name _;
    ...
}
```

The Dockerfile does not include SSL certificate generation or Let's Encrypt tooling (e.g., `certbot`). The production docker-compose override only maps port 80.

**Impact:**
- All traffic between users and the server is unencrypted
- Session cookies, JWT tokens, and stream tokens are transmitted in plaintext
- Cannot pass PCI-DSS, GDPR, or basic security compliance
- Browser "Not Secure" warnings on all pages
- No path to production without this fix

**Suggested remediation:**
- Add port 443 listener with SSL certificate paths in `nginx.conf`
- Add `.well-known/acme-challenge` location for Let's Encrypt automated renewal
- Add `certbot` or a Let's Encrypt sidecar container to the docker-compose production override
- Add HTTP→HTTPS redirect (301) in the port 80 server block
- Or: document that SSL termination is handled externally (e.g., AWS ALB, Cloudflare) and remove the gap

---

### PPR-002 — No Rate Limiting at Nginx Level (🔴 High, Medium Risk)

**Domain:** Reverse Proxy — DDoS Protection
**Files affected:** `docker/nginx.conf`

**Current behavior:**
All rate limiting is implemented in the Express middleware layer (`rateLimiter.middleware.js`). Nginx has no `limit_req_zone` or `limit_conn_zone` directives. Requests pass through Nginx to Node.js before any rate check occurs.

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:5000;
    # No rate limiting directives
}
```

**Impact:**
- Under DDoS or aggressive scraping, all requests reach the Node.js process memory
- Node.js event loop is occupied parsing and rate-limiting requests that Nginx could have rejected
- The Express rate limiter uses in-memory store — PM2 workers have independent counters
- Nginx's `limit_req` module is more efficient at rejecting bad traffic before it reaches the application

**Suggested remediation:**
- Add `limit_req_zone` and `limit_conn_zone` directives in the `http` block of `nginx.conf`
- Apply rate limits to `/api/` location, especially `/api/auth/` and `/api/search/`
- Set generous limits (e.g., 100 req/s per IP on general API, 5 req/min on auth) — Nginx rejects before Node.js
- This is defense-in-depth alongside the existing Express rate limiter

---

### PPR-003 — PM2 Single-Instance Fork Mode (🟡 Medium, High Risk)

**Domain:** Process Management — Scalability
**Files affected:** `ecosystem.config.js`

**Current behavior:**
PM2 is configured with a single instance in fork mode:

```javascript
instances: 1,
exec_mode: 'fork',
```

This means only one CPU core is utilized by the Node.js process. On multi-core production servers, 75%+ of CPU capacity is unused.

**Impact:**
- Cannot handle concurrent request load beyond what one Node.js event loop can process
- Multi-core servers (typical production) are underutilized
- Request latency increases under moderate load as the single event loop queues up work
- No horizontal scaling within the process manager

**Suggested remediation:**
- Change to `exec_mode: 'cluster'` and `instances: 'max'` (or a fixed count matching CPU cores)
- Set `max_memory_restart: '1G'` to restart workers that exceed memory
- Ensure the app is stateless for cluster mode compatibility (already is — no in-process session data)
- Note: `MemoryCache` per-instance caches will be less effective with more workers (see PF-006)

---

### Batch B — Deployment Reliability

---

### PPR-004 — MongoDB Port Exposed to Host in Production (🟡 Medium, Medium Risk)

**Domain:** Container Security — Network Isolation
**Files affected:** `docker-compose.yml`

**Current behavior:**
MongoDB port 27017 is mapped to the host in the base docker-compose.yml:

```yaml
mongodb:
    ports:
      - "27017:27017"
```

Since docker-compose.prod.yml extends the base file without overriding ports, MongoDB is also exposed on the host in production deployments.

**Impact:**
- MongoDB is accessible from any host on the same network (or internet if the host firewall allows)
- If MongoDB has weak credentials (or default), this is a data breach vector
- In production, the database should only be accessible from the server container via the internal Docker network

**Suggested remediation:**
- In `docker-compose.prod.yml`, override the MongoDB ports to not expose to host: `ports: []` or remove the port mapping
- MongoDB should only be accessible via the internal `novastream_default` network
- Add `MONGO_INITDB_ROOT_USERNAME` and `MONGO_INITDB_ROOT_PASSWORD` for authentication

---

### PPR-005 — No PM2 Log Rotation or Retention Policy (🟡 Medium, Medium Risk)

**Domain:** Logging — Operational Maintenance
**Files affected:** `ecosystem.config.js`

**Current behavior:**
PM2 logs are written to three files (`err.log`, `out.log`, `combined.log`) in `./logs/` with no rotation or retention:

```javascript
error_file: './logs/err.log',
out_file: './logs/out.log',
log_file: './logs/combined.log',
```

There is no `log_date_format`, `max_size`, `retain`, or `logrotate` configuration.

**Impact:**
- Log files grow unbounded — a busy production server could generate gigabytes of logs per day
- Disk space exhaustion is a silent production outage risk
- No log retention policy means old logs are never pruned
- PM2 has a built-in `pm2-logrotate` module that handles this but it's not configured

**Suggested remediation:**
- Install and configure `pm2-logrotate` module:
  ```bash
  pm2 install pm2-logrotate
  pm2 set pm2-logrotate:max_size 100M
  pm2 set pm2-logrotate:retain 7
  pm2 set pm2-logrotate:compress true
  ```
- Or add `logrotate` configuration in `ecosystem.config.js`:
  ```javascript
  log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
  error_file: './logs/err.log',
  out_file: './logs/out.log',
  merge_logs: true,
  ```

---

### PPR-006 — Health Check Wait Time Too Short (🟡 Medium, Medium Risk)

**Domain:** Startup — Reliability
**Files affected:** `docker/start.sh`

**Current behavior:**
After starting Nginx and PM2, the script waits only 3 seconds before declaring success:

```bash
# Health check wait
sleep 3
```

**Impact:**
- In the Dockerfile, the HEALTHCHECK has `start_period: 15s`, which is reasonable
- But the start.sh script reports "NovaStream is running" after only 3 seconds, even if the server hasn't finished initializing
- If the container restarts, monitoring systems may see a false "healthy" status while the app is still booting
- MongoDB connection, cache pre-warm, and sync scheduler startup take longer than 3 seconds

**Suggested remediation:**
- Increase the wait to 10-15 seconds, or add a polling loop that checks `/api/health/simple` before declaring success
- Or remove the artificial sleep and rely on Docker's HEALTHCHECK (which has `start_period: 15s`)

---

### PPR-007 — No CI/CD Pipeline Configuration (🟡 Medium, Medium Risk)

**Domain:** CI/CD — Automation
**Files affected:** Repository root (missing `.github/workflows/` or similar)

**Current behavior:**
There is no CI/CD pipeline configuration in the repository. No GitHub Actions workflows, no Jenkinsfile, no GitLab CI config. Deployment is done manually via `install.sh` or `docker compose up`.

**Impact:**
- No automated testing on pull requests or merges
- No automated build or deployment
- Manual deployment is error-prone — no consistent, repeatable process
- No automated security scanning (Docker image, dependencies)
- New team members have no deployment automation to follow

**Suggested remediation:**
- Add a GitHub Actions workflow with:
  - `npm ci` for server, client, and CLI
  - Client build validation
  - Server test suite run
  - Docker image build (no push until tagged)
  - Security audit (`npm audit`)
- Add a deploy workflow for tagged releases (e.g., `v*` tags)

---

### PPR-008 — No Database Backup Strategy (🟢 Low, Medium Risk)

**Domain:** Operations — Disaster Recovery
**Files affected:** Repository (missing `scripts/backup.sh` or similar)

**Current behavior:**
There are no database backup scripts, no `mongodump` commands, and no volume snapshot guidance in the repository. The only data persistence mechanism is Docker volumes (`mongodb_data`), which would be destroyed if the volume is deleted or corrupted.

**Impact:**
- Complete data loss if the Docker volume is corrupted or accidentally removed
- No point-in-time recovery capability
- No automated backup schedule
- No documented restore procedure

**Suggested remediation:**
- Add a backup script (`scripts/backup-db.sh`) using `mongodump`
- Document how to restore from backup
- Add a cron job or scheduled task (could be a sidecar container) for periodic backups
- Recommend Docker volume backups or cloud provider snapshot strategy

---

### Batch C — Hardening / Maintainability

---

### PPR-009 — docker-compose.prod.yml Hardcodes Environment Variables (🟢 Low, Low Risk)

**Domain:** Configuration Management
**Files affected:** `docker-compose.prod.yml`

**Current behavior:**
Production environment variables are hardcoded inline instead of coming from `.env`:

```yaml
environment:
  - NODE_ENV=production
  - CLIENT_URL=http://localhost
```

The `.env` file is loaded in docker-compose.yml via `env_file: .env`, but the production override replaces NODE_ENV with a hardcoded value.

**Impact:**
- `CLIENT_URL=http://localhost` means CORS only allows `http://localhost` in production — a real domain would be rejected
- Overriding NODE_ENV via the production override defeats the purpose of having it in `.env`
- If the production domain changes, `docker-compose.prod.yml` must be edited rather than just updating `.env`

**Suggested remediation:**
- Remove hardcoded `NODE_ENV` from docker-compose.prod.yml (it comes from `.env`)
- Reference CLIENT_URL from `.env`: remove the hardcoded value or use `${CLIENT_URL:-http://localhost}` as fallback
- Ensure `.env` has correct production values before deployment

---

### PPR-010 — No Monitoring or Alerting Integration (🟢 Low, Low Risk)

**Domain:** Monitoring — Observability
**Files affected:** Repository root (missing monitoring config)

**Current behavior:**
Health endpoints exist at `/api/health`, `/api/health/simple`, and `/api/health/full`, but there is:
- No uptime monitoring configuration (UptimeRobot, Pingdom, etc.)
- No application performance monitoring (APM) integration (New Relic, Datadog, Sentry)
- No structured error tracking
- No metric collection or dashboard

**Impact:**
- Production outages may go undetected until users report them
- No visibility into request latency, error rates, or throughput
- No performance regression detection after deployments
- Debugging production issues requires accessing server logs directly

**Suggested remediation:**
- Integrate Sentry for error tracking (free tier available)
- Add uptime monitoring via a free service like UptimeRobot (checks `/api/health/simple`)
- Consider Prometheus metrics endpoint for future observability
- At minimum, document recommended monitoring tools and configuration

---

### PPR-011 — start.sh Overwrites .env on Container Restart (🟢 Low, Low Risk)

**Domain:** Startup — Configuration Safety
**Files affected:** `docker/start.sh`

**Current behavior:**
If `/app/.env` does not exist, `start.sh` copies `.env.example` over it:

```bash
if [ ! -f /app/.env ]; then
    if [ -f /app/.env.example ]; then
        cp /app/.env.example /app/.env
    fi
fi
```

The `.env.example` contains placeholder values like `your-jwt-secret-here`. If the `.env` file is deleted or the volume is ephemeral, the server would start with placeholder secrets.

**Impact:**
- If a Docker volume mount for `.env` fails or is misconfigured, the server starts with known placeholder secrets
- JWT tokens signed with a known secret could be forged
- This is a defense-in-depth issue — proper volume mounting is the real solution

**Suggested remediation:**
- Add a validation step: after copying `.env.example`, check if any placeholder values remain and warn
- Or fail the startup if `.env` contains placeholder secrets
- Document that `.env` must be provided via Docker volume mount or bind mount

---

### PPR-012 — CORS Not Hardened for Production Domains (🟢 Low, Low Risk)

**Domain:** Configuration — Security Hardening
**Files affected:** `server/src/app.js`, `docker-compose.prod.yml`

**Current behavior:**
CORS origin in production falls back to `false` if `CLIENT_URL` is not set:

```javascript
origin: config.server.isProduction
    ? process.env.CLIENT_URL || false
    : ['http://localhost:5173', 'http://localhost:4173', 'http://localhost:3000'],
```

In `docker-compose.prod.yml`, `CLIENT_URL` is set to `http://localhost` — which only works for local testing.

**Impact:**
- When deployed with a real domain, `CLIENT_URL` must be set correctly or CORS will block all requests
- The production docker-compose defaults to `http://localhost`, which is incorrect for any real deployment
- No documentation about setting `CLIENT_URL` for production deployments

**Suggested remediation:**
- Document the `CLIENT_URL` requirement in deployment docs
- Remove the hardcoded `http://localhost` from docker-compose.prod.yml — require it in `.env`
- Consider allowing multiple origins via a comma-separated env var for staging+production support

---

### PPR-013 — Dockerfile Layer Cache Bypassed for All Source Files (🟢 Low, Low Risk)

**Domain:** Docker — Build Performance
**Files affected:** `Dockerfile`

**Current behavior:**
The client-builder stage copies all source files before building:

```dockerfile
COPY client/ .
RUN npm run build
```

The `COPY client/ .` instruction copies the entire client source tree — including node_modules on some systems and test files. This invalidates the Docker layer cache every time any source file changes, even though the dependencies haven't changed.

**Impact:**
- Every client source change triggers a full dependency install + build, even if only CSS changes
- Docker build times are ~2-3 minutes per change instead of ~30 seconds with proper layer caching
- Not a production runtime issue — only affects CI/CD build performance

**Suggested remediation:**
- Add a `.dockerignore` in the `client/` directory (or rely on the root `.dockerignore`) to exclude `node_modules/`, `test/`, `__tests__/`
- The root `.dockerignore` already handles this. Verify it's working correctly.
- Consider splitting `COPY` into dependency-only and source-only layers:
  ```dockerfile
  COPY package.json package-lock.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  ```

---

### PPR-014 — Production CSP Should Be Reviewed for Domain Allowances (ℹ️ Informational)

**Domain:** Security Hardening — Content Security Policy
**Files affected:** `server/src/app.js`

**Current behavior:**
The Content Security Policy in `server/src/app.js` includes specific external origins:

```javascript
connectSrc: ["'self'", "https://api.themoviedb.org", "https://img.youtube.com",
    "https://*.streamraiwind.stream", "https://jolly-mouse-f41c.annierane.workers.dev"],
imgSrc: ["'self'", "https://image.tmdb.org", "https://img.youtube.com",
    "https://img1.streamraiwind.stream", "data:", "blob:"],
```

These origins are hardcoded in the source code rather than being configurable via environment variables.

**Impact:**
- Changing external providers requires a code change and rebuild
- In production, these policy origins should match the actual services being used
- If the external source provider changes, CSP would need updating
- No way to lock CSP to production-specific domains without editing source

**Suggested remediation:**
- Consider making CSP external origins configurable via environment variables
- Or audit the current origins for production readiness — remove any that aren't being used
- Add `upgrade-insecure-requests` directive (already present in production mode)

---

## Batch Grouping

| Batch | Findings | Focus | Effort |
|:-----:|:--------:|-------|:------:|
| **A** | PPR-001, PPR-002, PPR-003 | SSL/TLS, Nginx rate limiting, PM2 cluster mode | Medium |
| **B** | PPR-004 → PPR-008 | MongoDB isolation, log rotation, health check timing, CI/CD, backup | Medium |
| **C** | PPR-009 → PPR-014 | Env hardening, monitoring, CSP audit, Docker layer caching | Low |

---

## Positive Observations

| Area | Assessment |
|------|:----------:|
| **Multi-stage Dockerfile** | ✅ Three-stage build (client → server → production) with minimal final image |
| **HEALTHCHECK configured** | ✅ Dockerfile has HEALTHCHECK with proper `start_period`, `interval`, `retries` |
| **Health endpoints** | ✅ Three health endpoints: /api/health (JSON), /simple (plain text), /full (detailed) |
| **gzip enabled in Nginx** | ✅ Compression configured with proper MIME types and minimum length |
| **Security headers in Nginx** | ✅ X-Frame-Options, X-Content-Type-Options, XSS-Protection, Referrer-Policy, Permissions-Policy |
| **Static asset caching** | ✅ `/assets/` cached 1 year with `public, immutable` |
| **SPA fallback with no-cache** | ✅ Index.html served with `no-store, no-cache, must-revalidate` |
| **Hidden files denied** | ✅ `/\.` and `/node_modules` blocked by Nginx |
| **Helmet CSP** | ✅ Comprehensive Content Security Policy with production-specific `upgrade-insecure-requests` |
| **Zod-validated env** | ✅ Fail-fast env var validation at startup with clear error messages |
| **Install scripts** | ✅ Comprehensive cross-platform installers with version checks, FFmpeg setup, secret generation |
| **PM2 graceful shutdown** | ✅ `kill_timeout: 10000`, `listen_timeout: 3000`, `exp_backoff_restart_delay: 100` |
| **Docker volumes** | ✅ Persistent volumes for MongoDB data, uploads, and thumbnails |
| **Startup ordering** | ✅ MongoDB health check → server start (depends_on with condition) |
| **Multi-platform installation** | ✅ Unix install.sh + Windows install.ps1 with feature parity |

---

## Files Examined (14)

| File | Role |
|------|------|
| `Dockerfile` | Multi-stage production Docker build |
| `.dockerignore` | Docker build context exclusions |
| `docker-compose.yml` | Base compose file (MongoDB + server) |
| `docker-compose.prod.yml` | Production compose override (Nginx, PM2) |
| `docker/nginx.conf` | Nginx reverse proxy configuration |
| `docker/start.sh` | Production startup script (Nginx + PM2) |
| `ecosystem.config.js` | PM2 process manager configuration |
| `install.sh` | Unix/Linux installation script |
| `install.ps1` | Windows PowerShell installation script |
| `scripts/sync-check.js` | Governance sync checker |
| `server/src/config/env.js` | Zod-validated environment configuration |
| `server/src/routes/health.routes.js` | Health check endpoints |
| `server/src/routes/index.js` | Route mounting order |
| `server/src/app.js` | Express app (CSP, middleware stack) |
