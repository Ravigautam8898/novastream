#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Production Readiness Check
 * ═══════════════════════════════════════════════════════════
 *
 * Run before production deployment to verify:
 *   - Environment configuration
 *   - Database connectivity
 *   - Storage permissions
 *   - JWT/stream secret strength
 *   - Backup path writability
 *   - Upload path existence
 *   - Health endpoint responses
 *
 * Usage:
 *   node scripts/production-check.js
 *   node scripts/production-check.js --verbose
 *
 * Exit codes:
 *   0 — All checks passed
 *   1 — Errors found (not ready for production)
 *
 * ═══════════════════════════════════════════════════════════
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');
const http = require('http');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PROJECT_ROOT = path.resolve(__dirname, '..');

const isVerbose = process.argv.includes('--verbose');

// ── Load .env ──
require('dotenv').config({ path: path.join(PROJECT_ROOT, '.env') });

// ── Results ──
const results = { pass: 0, warn: 0, fail: 0, info: 0 };

function pass(check, detail) { results.pass++; output('PASS', GREEN, '✓', check, detail); }
function warn(check, detail) { results.warn++; output('WARN', YELLOW, '⚠', check, detail); }
function fail(check, detail) { results.fail++; output('FAIL', RED, '✗', check, detail); }
function info(check, detail) { results.info++; output('INFO', CYAN, 'ℹ', check, detail); }

function output(status, color, symbol, check, detail) {
  console.log(`  ${color}${symbol} ${status}${RESET}  ${check.padEnd(32)} ${DIM}${detail}${RESET}`);
}

// ═══════════════════════════════════════════════════════════
//  CHECKS
// ═══════════════════════════════════════════════════════════

async function run() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║     NovaStream Production Readiness Check       ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}`);
  console.log('');

  // ── 1. Environment ──
  console.log(`${BOLD}  Environment${RESET}`);
  const nodeEnv = process.env.NODE_ENV || 'development';
  if (nodeEnv === 'production') {
    pass('NODE_ENV', 'Set to production');
  } else {
    warn('NODE_ENV', `Set to ${nodeEnv} (expected production)`);
  }

  if (process.env.MONGODB_URI) {
    pass('MONGODB_URI', 'Configured');
  } else {
    fail('MONGODB_URI', 'Not set — server cannot start');
  }

  if (process.env.PORT) {
    pass('PORT', process.env.PORT);
  } else {
    info('PORT', 'Default: 5000');
  }

  if (process.env.LOG_LEVEL) {
    if (nodeEnv === 'production' && ['debug', 'trace'].includes(process.env.LOG_LEVEL)) {
      warn('LOG_LEVEL', `Set to ${process.env.LOG_LEVEL} in production — may expose sensitive data`);
    } else {
      pass('LOG_LEVEL', process.env.LOG_LEVEL);
    }
  } else {
    info('LOG_LEVEL', 'Default: info');
  }

  // ── 2. JWT & Secrets ──
  console.log(`\n${BOLD}  Secrets${RESET}`);
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    fail('JWT_SECRET', 'Not set');
  } else if (jwtSecret.length < 32) {
    fail('JWT_SECRET strength', `Only ${jwtSecret.length} chars — minimum 32`);
  } else if (jwtSecret === 'your-jwt-secret-must-be-at-least-32-characters-long') {
    fail('JWT_SECRET default', 'Using default example value — generate a real one!');
  } else {
    pass('JWT_SECRET', `${jwtSecret.length} chars`);
  }

  const streamSecret = process.env.STREAM_SECRET || '';
  if (!streamSecret) {
    fail('STREAM_SECRET', 'Not set');
  } else if (streamSecret.length < 32) {
    warn('STREAM_SECRET strength', `Only ${streamSecret.length} chars — 32+ recommended`);
  } else {
    pass('STREAM_SECRET', `${streamSecret.length} chars`);
  }

  // ── 3. Database ──
  console.log(`\n${BOLD}  Database${RESET}`);
  const mongoUri = process.env.MONGODB_URI || '';
  if (mongoUri) {
    if (mongoUri.startsWith('mongodb+srv://')) {
      pass('MongoDB type', 'Atlas (mongodb+srv)');
    } else if (mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
      if (nodeEnv === 'production') {
        warn('MongoDB location', 'Using localhost database in production');
      } else {
        pass('MongoDB location', 'Localhost database');
      }
    } else {
      pass('MongoDB type', 'Remote URI');
    }
  }

  // ── 4. Storage ──
  console.log(`\n${BOLD}  Storage${RESET}`);
  const uploadPath = process.env.UPLOAD_PATH || 'server/uploads';
  const uploadDir = path.resolve(PROJECT_ROOT, uploadPath);
  if (fs.existsSync(uploadDir)) {
    try {
      fs.accessSync(uploadDir, fs.constants.W_OK);
      pass('Upload path', `${uploadPath} (writable)`);
    } catch {
      fail('Upload path', `${uploadPath} (NOT writable!)`);
    }
  } else {
    warn('Upload path', `${uploadPath} (does not exist)`);
  }

  const backupDir = path.resolve(PROJECT_ROOT, 'server', 'backups');
  if (fs.existsSync(backupDir)) {
    try {
      fs.accessSync(backupDir, fs.constants.W_OK);
      pass('Backup path', `server/backups/ (writable)`);
    } catch {
      warn('Backup path', 'server/backups/ (NOT writable)');
    }
  } else {
    info('Backup path', 'server/backups/ (not created yet)');
  }

  // ── 5. .env file ──
  console.log(`\n${BOLD}  Configuration${RESET}`);
  const envFile = path.join(PROJECT_ROOT, '.env');
  if (fs.existsSync(envFile)) {
    const stats = fs.statSync(envFile);
    pass('.env file', `Exists (${stats.size} bytes)`);
    // Check if it has example values
    const content = fs.readFileSync(envFile, 'utf8');
    if (content.includes('your-jwt-secret') || content.includes('your-tmdb-api-key')) {
      warn('.env values', 'Contains placeholder values — update before production!');
    }
  } else {
    fail('.env file', 'Not found at project root');
  }

  // ── 6. Health endpoints ──
  console.log(`\n${BOLD}  Health Endpoints${RESET}`);
  const port = process.env.PORT || 5000;
  await checkEndpoint(port, '/api/health/simple', 'Simple health', (body) => body === 'OK');
  await checkEndpoint(port, '/api/health/full', 'Full health', (body) => {
    try {
      const data = JSON.parse(body);
      return data.server === true;
    } catch { return false; }
  });

  // ── 7. Build artifacts ──
  console.log(`\n${BOLD}  Build${RESET}`);
  const clientDist = path.join(PROJECT_ROOT, 'client', 'dist');
  if (fs.existsSync(clientDist)) {
    const files = fs.readdirSync(clientDist);
    if (files.some(f => f.startsWith('index'))) {
      pass('Client build', `dist/ exists (${files.length} files)`);
    } else {
      warn('Client build', 'dist/ exists but no index files found');
    }
  } else {
    warn('Client build', 'dist/ not found — run: npm run build');
  }

  // ── 8. Production-specific ──
  console.log(`\n${BOLD}  Production Setup${RESET}`);
  if (nodeEnv === 'production') {
    const ecosystemPath = path.join(PROJECT_ROOT, 'ecosystem.config.js');
    if (fs.existsSync(ecosystemPath)) {
      pass('PM2 config', 'ecosystem.config.js exists');
    } else {
      warn('PM2 config', 'ecosystem.config.js not found');
    }

    const nginxPath = path.join(PROJECT_ROOT, 'deploy', 'nginx.conf.example');
    if (fs.existsSync(nginxPath)) {
      pass('Nginx config', 'deploy/nginx.conf.example exists');
    } else {
      info('Nginx config', 'Not found (optional if using Docker)');
    }
  }

  // ── Summary ──
  console.log(`\n${BOLD}${'═'.repeat(55)}${RESET}`);
  console.log(`  ${GREEN}✓ ${results.pass} passed${RESET}`);
  console.log(`  ${YELLOW}⚠ ${results.warn} warnings${RESET}`);
  console.log(`  ${RED}✗ ${results.fail} failed${RESET}`);
  console.log(`  ${CYAN}ℹ ${results.info} info${RESET}`);
  console.log(`${BOLD}${'═'.repeat(55)}${RESET}`);

  if (results.fail > 0) {
    console.log(`\n${RED}${BOLD}  ❌ PRODUCTION CHECKS FAILED — fix errors above${RESET}\n`);
    process.exit(1);
  }
  if (results.warn > 0) {
    console.log(`\n${YELLOW}${BOLD}  ⚠  All critical checks passed (${results.warn} warnings)${RESET}\n`);
    process.exit(0);
  }
  console.log(`\n${GREEN}${BOLD}  ✅ All checks passed — ready for production!${RESET}\n`);
  process.exit(0);
}

function checkEndpoint(port, path, label, validator) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}${path}`, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 && validator(body)) {
          pass(label, `GET ${path} → 200 OK`);
        } else {
          warn(label, `GET ${path} → ${res.statusCode}`);
        }
        resolve();
      });
    });
    req.on('error', () => {
      info(label, `GET ${path} — server not running (start server first for full check)`);
      resolve();
    });
    req.on('timeout', () => {
      req.destroy();
      info(label, `GET ${path} — timed out`);
      resolve();
    });
  });
}

run().catch(err => {
  console.error(`\n${RED}❌ Production check failed: ${err.message}${RESET}`);
  process.exit(1);
});
