# NovaStream — Deployment Guide

> **Last Updated:** July 4, 2026
> **Version:** 1.0.0

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Fresh Installation](#2-fresh-installation)
3. [Docker Deployment](#3-docker-deployment)
4. [Manual Production Deployment](#4-manual-production-deployment)
5. [Updating an Existing Installation](#5-updating-an-existing-installation)
6. [Database Backup & Restore](#6-database-backup--restore)
7. [Troubleshooting](#7-troubleshooting)
8. [Production Checklist](#8-production-checklist)

---

## 1. Prerequisites

### Required Software

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | ≥ 18 (20+ recommended) | Runtime |
| npm | ≥ 9 | Package manager |
| MongoDB | ≥ 6 (7 recommended) | Database |
| FFmpeg | Latest | Video processing, thumbnail generation |

### Optional Software

| Software | Purpose |
|----------|---------|
| PM2 | Process management (auto-restart, logging) |
| Nginx | Reverse proxy, SSL termination |
| Docker | Containerized deployment |
| mongodump/mongorestore | Database backup (MongoDB Database Tools) |
| Let's Encrypt / Certbot | Free SSL certificates |

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| RAM | 1 GB | 2 GB+ |
| CPU | 2 cores | 4 cores |
| Disk | 10 GB | 50 GB+ (for content) |
| OS | Ubuntu 22.04+, Debian 12+, macOS 13+ | Linux (production) |

---

## 2. Fresh Installation

### 2.1 Quick Install (Linux / macOS)

```bash
# Clone the repository
git clone https://github.com/your-org/novastream.git
cd novastream

# Run the install script (handles everything)
chmod +x install.sh
./install.sh

# Set environment variables (edit .env)
nano .env

# Start development server
npm run dev
```

### 2.2 Manual Installation

```bash
# 1. Install dependencies
npm run install:all

# 2. Create environment file
cp .env.example .env
nano .env

# 3. Set required values
#    - MONGODB_URI (MongoDB connection string)
#    - JWT_SECRET (openssl rand -hex 32)
#    - STREAM_SECRET (openssl rand -hex 32)
#    - TMDB_API_KEY
#    - TMDB_ACCESS_TOKEN

# 4. Create required directories
mkdir -p logs server/uploads server/thumbnails server/backups

# 5. Build client
npm run build

# 6. Start server
npm run server        # Development
# or
npm run start         # Production
```

### 2.3 Initial Setup

```bash
# 1. Create admin user via CLI
cd server && npm run admin
# → User Management → Create User → super_admin role

# 2. Verify health
curl http://localhost:5000/api/health

# 3. Run security check
cd server && npm run security:check

# 4. Run production readiness check
node scripts/production-check.js
```

---

## 3. Docker Deployment

### 3.1 Docker Compose (Development)

```bash
# Start MongoDB + Server
docker compose up -d

# Server at http://localhost:5000
# MongoDB at localhost:27017
```

### 3.2 Docker Compose (Production)

```bash
# Build and start with production config
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Client + API at http://localhost:80
```

### 3.3 Docker Environment Variables

The Docker setup reads from the `.env` file at the project root. Ensure all required variables are set before running.

```bash
# The Docker Compose automatically overrides MONGODB_URI to use the
# internal MongoDB container when running in Docker:
# MONGODB_URI=mongodb://mongodb:27017/novastream
```

### 3.4 Persistent Volumes

Docker Compose creates named volumes for:

| Volume | Purpose | Location |
|--------|---------|----------|
| `novastream-mongodb-data` | Database files | `/data/db` |
| `novastream-uploads` | Uploaded HLS content | `/app/server/uploads` |
| `novastream-thumbnails` | Generated thumbnails | `/app/server/thumbnails` |

---

## 4. Manual Production Deployment

### 4.1 Using PM2

```bash
# Install PM2 globally
sudo npm install -g pm2

# Start server
npm run pm2:start

# Other commands
npm run pm2:restart    # Restart server
npm run pm2:stop       # Stop server
npm run pm2:status     # Check status
npm run pm2:logs       # View logs
```

### 4.2 Using Nginx (Reverse Proxy)

```bash
# 1. Build client
npm run build

# 2. Copy client build to web root
sudo cp -r client/dist /var/www/novastream/

# 3. Customize and install Nginx config
cp deploy/nginx.conf.example /tmp/novastream-nginx.conf
nano /tmp/novastream-nginx.conf  # Edit server_name, paths, SSL
sudo cp /tmp/novastream-nginx.conf /etc/nginx/sites-available/novastream
sudo ln -s /etc/nginx/sites-available/novastream /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 4. Set up SSL with Let's Encrypt
sudo certbot --nginx -d yourdomain.com

# 5. Start Node.js server behind Nginx
npm run pm2:start
```

### 4.3 Using the Deploy Script

```bash
# Deploy latest version
node scripts/deploy.js

# Deploy specific tag
node scripts/deploy.js --tag=v1.0.0

# Dry run (preview only)
node scripts/deploy.js --dry-run
```

---

## 5. Updating an Existing Installation

### 5.1 Standard Update

```bash
# 1. Backup database (via CLI)
cd server && npm run admin
# → Backup / Restore → Create Backup

# 2. Pull latest
git pull origin main

# 3. Install updated dependencies
npm run install:all

# 4. Run database migrations (if any)
# (check server/migrations/README.md)

# 5. Build client
npm run build

# 6. Restart server
npm run pm2:restart
```

### 5.2 Using the Release Script

```bash
# Create a release
node scripts/release.js patch   # Bug fix release
node scripts/release.js minor   # Feature release
node scripts/release.js major   # Breaking change release
```

### 5.3 Rollback

If a deployment fails, roll back to the previous version:

```bash
# 1. Restore database from backup
cd server && npm run admin
# → Backup / Restore → Restore Backup

# 2. Checkout previous version
git checkout v1.0.0

# 3. Rebuild and restart
npm run install:all
npm run build
npm run pm2:restart
```

---

## 6. Database Backup & Restore

### 6.1 Using the Admin CLI (recommended)

```bash
cd server && npm run admin
# → Backup / Restore → Create Backup  (creates timestamped .gz archive)
# → Backup / Restore → List Backups    (shows all available backups)
# → Backup / Restore → Restore Backup   (with double confirmation)
```

> **Note:** The backup feature requires `mongodump` and `mongorestore` to be installed.
> Install: `sudo apt install mongodb-database-tools`

### 6.2 Manual Backup

```bash
# Create backup
mongodump --uri="mongodb+srv://user:pass@cluster.mongodb.net/novastream" \
  --archive="server/backups/manual-$(date +%Y-%m-%d_%H-%M-%S).gz" --gzip

# Restore backup
mongorestore --uri="mongodb+srv://user:pass@cluster.mongodb.net/novastream" \
  --archive="server/backups/backup-file.gz" --gzip --drop
```

### 6.3 Backup Schedule (using cron)

```bash
# Add to crontab (runs daily at 3 AM)
0 3 * * * cd /path/to/novastream && mongodump --uri="$MONGODB_URI" --archive="server/backups/auto-$(date +\%Y-\%m-\%d).gz" --gzip

# Clean up backups older than 30 days
0 4 * * * find /path/to/novastream/server/backups -name "*.gz" -mtime +30 -delete
```

---

## 7. Troubleshooting

### 7.1 Server Won't Start

| Symptom | Cause | Fix |
|---------|-------|-----|
| `EADDRINUSE` | Port already in use | `fuser -k 5000/tcp` or change PORT in .env |
| `MongoNetworkError` | MongoDB not running | `sudo systemctl start mongod` or check MONGODB_URI |
| `JWT_SECRET must be at least 32 characters` | Weak secret | Generate with: `openssl rand -hex 32` |
| `MODULE_NOT_FOUND` | Missing dependencies | Run: `npm run install:all` |

### 7.2 Client Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Blank page / 404 on reload | SPA fallback not configured | Ensure Nginx `try_files $uri $uri/ /index.html;` is set |
| API calls failing in production | CORS or proxy misconfigured | Check CLIENT_URL in .env and Nginx proxy_pass |
| Assets returning 404 | Client not built | Run: `npm run build` |

### 7.3 Stream / Playback Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| Video won't play | Missing HLS segments | Check uploads directory has content files |
| 403 on stream | Invalid stream token | Check STREAM_SECRET matches between server restarts |
| Buffering | Network or encoding issue | Try lower quality, check server bandwidth |

### 7.4 Production Readiness Check

```bash
node scripts/production-check.js
```

This checks:
- Environment variables (secrets, NODE_ENV)
- Database connectivity
- Storage permissions
- Health endpoint responses
- Build artifacts existence

---

## 8. Production Checklist

### Before Going Live

- [ ] All environment variables set (not using defaults)
- [ ] JWT_SECRET is 32+ characters (generated, not example)
- [ ] STREAM_SECRET is 32+ characters (generated, not example)
- [ ] MONGODB_URI points to production database
- [ ] NODE_ENV set to `production`
- [ ] Client built (`npm run build`)
- [ ] Security check passed (`npm run security:check`)
- [ ] Production readiness check passed (`node scripts/production-check.js`)
- [ ] Database backups configured (cron or manual)
- [ ] SSL certificate installed and auto-renewal configured
- [ ] PM2 or systemd service configured for auto-restart
- [ ] Firewall configured (open ports 80/443 only)
- [ ] Log rotation configured (prevent disk full)
- [ ] Monitoring / uptime check configured
- [ ] Load testing performed

### Quick Verification

```bash
# 1. Health endpoint
curl http://localhost:5000/api/health/simple
# Should respond: OK

# 2. Full health check
curl http://localhost:5000/api/health/full | python3 -m json.tool

# 3. Security audit
cd server && npm run security:check

# 4. Production readiness
node scripts/production-check.js
```

> See [STATUS.md](docs/STATUS.md) for project status and [CHANGELOG.md](CHANGELOG.md) for version history.
