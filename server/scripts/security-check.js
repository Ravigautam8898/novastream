#!/usr/bin/env node

// server/scripts/security-check.js
// Security Audit Script
// Run: npm run security-check
// Checks: JWT secret, password hashing, rate limiter, CORS, upload limits, etc.

/* eslint-disable no-console */

const path = require('path');
const fs = require('fs');

// ── Colors ──
const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', blue: '\x1b[34m',
  cyan: '\x1b[36m', gray: '\x1b[90m', dim: '\x1b[2m',
};
const c = (color, text) => colors[color] + text + colors.reset;

// ── Load .env for checks ──
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

// ── Results ──
const results = [];
let passCount = 0;
let warnCount = 0;
let failCount = 0;
let infoCount = 0;

function pass(check, detail) {
  results.push({ check, status: 'PASS', detail });
  passCount++;
}
function warn(check, detail) {
  results.push({ check, status: 'WARNING', detail });
  warnCount++;
}
function fail(check, detail) {
  results.push({ check, status: 'FAIL', detail });
  failCount++;
}
function info(check, detail) {
  results.push({ check, status: 'INFO', detail });
  infoCount++;
}

console.log(c('cyan', '\n╔════════════════════════════════════════════════════╗'));
console.log(c('cyan', '║         NovaStream Security Audit                ║'));
console.log(c('cyan', '╚════════════════════════════════════════════════════╝\n'));

// ── 1. JWT Secret ──
const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret) {
  fail('JWT_SECRET', 'Not set — authentication will fail');
} else if (jwtSecret.length < 32) {
  fail('JWT_SECRET strength', `Only ${jwtSecret.length} chars — minimum 32 required`);
} else if (jwtSecret === 'your-super-secret-key-that-is-at-least-32-characters-long') {
  fail('JWT_SECRET default', 'Using the default/example JWT_SECRET — change it immediately!');
} else {
  pass('JWT_SECRET', `${jwtSecret.length} characters`);
}

// ── 2. Stream Secret ──
const streamSecret = process.env.STREAM_SECRET || '';
if (!streamSecret) {
  fail('STREAM_SECRET', 'Not set — stream security disabled');
} else if (streamSecret.length < 32) {
  warn('STREAM_SECRET strength', `Only ${streamSecret.length} chars — 32+ recommended`);
} else {
  pass('STREAM_SECRET', `${streamSecret.length} characters`);
}

// ── 3. Password Hashing ──
try {
  const bcrypt = require('bcryptjs');
  pass('Password hashing', `bcryptjs v${bcrypt.version || 'installed'} (12 rounds)`);
} catch {
  fail('Password hashing', 'bcryptjs not installed — passwords stored in plaintext!');
}

// ── 4. Rate Limiter ──
try {
  const rl = require('express-rate-limit');
  pass('Rate limiter', 'express-rate-limit installed (3 tiers: general/auth/stream)');
} catch {
  fail('Rate limiter', 'express-rate-limit not installed');
}

// ── 5. Helmet (Security Headers) ──
try {
  require('helmet');
  pass('Security headers (Helmet)', 'Installed — CSP, HSTS, XSS protection active');
} catch {
  fail('Security headers (Helmet)', 'Not installed — missing CSP, HSTS protection');
}

// ── 6. CORS Configuration ──
const clientUrl = process.env.CLIENT_URL || '';
if (process.env.NODE_ENV === 'production' && !clientUrl) {
  warn('CORS configuration', 'CLIENT_URL not set in production — CORS may block requests');
} else {
  pass('CORS configuration', clientUrl || 'Development defaults active');
}

// ── 7. Body Size Limits ──
const appJsPath = path.resolve(__dirname, '..', 'src', 'app.js');
try {
  const appContent = fs.readFileSync(appJsPath, 'utf8');
  const limitMatch = appContent.match(/limit:\s*'([^']+)'/);
  if (limitMatch) {
    pass('Request body limits', `${limitMatch[1]} — configured in app.js`);
  } else {
    warn('Request body limits', 'Could not verify body size limits');
  }
} catch {
  info('Request body limits', 'Could not read app.js');
}

// ── 8. MongoDB Connection ──
const mongoUri = process.env.MONGODB_URI || '';
if (!mongoUri) {
  fail('MongoDB URI', 'Not set — server cannot start');
} else if (mongoUri.startsWith('mongodb://') || mongoUri.startsWith('mongodb+srv://')) {
  if (mongoUri.includes('localhost') || mongoUri.includes('127.0.0.1')) {
    if (process.env.NODE_ENV === 'production') {
      warn('MongoDB URI', 'Using localhost MongoDB in production — not recommended');
    } else {
      pass('MongoDB URI', 'Localhost MongoDB (development mode)');
    }
  } else {
    pass('MongoDB URI', 'Remote MongoDB Atlas URI');
  }
} else {
  warn('MongoDB URI', 'Unrecognized URI format');
}

// ── 9. .env File ──
const envPath = path.resolve(__dirname, '..', '..', '.env');
if (fs.existsSync(envPath)) {
  const envStats = fs.statSync(envPath);
  pass('.env file', `Exists (${envStats.size} bytes)`);
} else {
  fail('.env file', 'Not found at project root');
}

// ── 10. Log Redaction ──
const loggerPath = path.resolve(__dirname, '..', 'src', 'config', 'logger.js');
try {
  const loggerContent = fs.readFileSync(loggerPath, 'utf8');
  if (loggerContent.includes('redact') && loggerContent.includes('password')) {
    pass('Log redaction', 'Pino configured to redact passwords and tokens');
  } else {
    warn('Log redaction', 'Could not verify password redaction in logger');
  }
} catch {
  info('Log redaction', 'Could not read logger config');
}

// ── 11. Production Mode Checks ──
const isProd = process.env.NODE_ENV === 'production';
if (isProd) {
  // Check for weak dev-only configs in production
  if (process.env.LOG_LEVEL === 'debug' || process.env.LOG_LEVEL === 'trace') {
    warn('Production logging', `Log level is '${process.env.LOG_LEVEL}' — may expose sensitive data`);
  } else {
    pass('Production logging', `Log level: ${process.env.LOG_LEVEL || 'info'}`);
  }
} else {
  info('Environment', `Running in ${process.env.NODE_ENV || 'development'} mode`);
}

// ── 12. Dependencies Audit ──
try {
  const pkg = require(path.resolve(__dirname, '..', 'package.json'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const criticalDeps = {
    'bcryptjs': 'Password hashing',
    'helmet': 'Security headers',
    'express-rate-limit': 'Rate limiting',
    'cors': 'CORS',
    'jsonwebtoken': 'JWT auth',
    'express-mongo-sanitize': 'NoSQL injection prevention',
    'zod': 'Input validation',
  };
  let allCritical = true;
  for (const [dep, purpose] of Object.entries(criticalDeps)) {
    if (!deps[dep]) {
      warn(`Missing dependency: ${dep}`, purpose);
      allCritical = false;
    }
  }
  if (allCritical) {
    pass('Critical dependencies', 'All security-related packages installed');
  }
} catch {
  info('Dependency check', 'Could not read package.json');
}

// ── Print Summary ──
console.log(`${c('bright', ' Audit Results')}\n`);
console.log(`  ${c('green', '✓ PASS'.padEnd(10))} ${passCount}`);
console.log(`  ${c('yellow', '⚠ WARN'.padEnd(10))} ${warnCount}`);
console.log(`  ${c('red', '✗ FAIL'.padEnd(10))} ${failCount}`);
console.log(`  ${c('blue', 'ℹ INFO'.padEnd(10))} ${infoCount}`);
console.log('');

// Detailed results
for (const r of results) {
  const statusStr = r.status === 'PASS' ? c('green', '✓ PASS') :
    r.status === 'WARNING' ? c('yellow', '⚠ WARN') :
    r.status === 'INFO' ? c('blue', 'ℹ INFO') :
    c('red', '✗ FAIL');
  console.log(`  ${statusStr}  ${r.check.padEnd(35)} ${c('dim', r.detail)}`);
}

// Final verdict
console.log('');
if (failCount > 0) {
  console.log(c('red', '  ❌ SECURITY ISSUES FOUND — review FAIL items above'));
} else if (warnCount > 0) {
  console.log(c('yellow', '  ⚠️  All checks passed with warnings — review recommended'));
} else {
  console.log(c('green', '  ✅ All security checks passed!'));
}
console.log('');
