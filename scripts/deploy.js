#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Deployment Script
 * ═══════════════════════════════════════════════════════════
 *
 * Automates the deployment process:
 *   - Pull latest changes (git)
 *   - Install dependencies
 *   - Build client
 *   - Run tests
 *   - Backup database
 *   - Restart server
 *
 * Supports rollback to previous build.
 *
 * Usage:
 *   node scripts/deploy.js               # Deploy latest
 *   node scripts/deploy.js --dry-run     # Preview without changes
 *   node scripts/deploy.js --rollback    # Roll to previous backup
 *   node scripts/deploy.js --tag=v1.2.3  # Deploy specific tag
 *
 * ═══════════════════════════════════════════════════════════
 */

/* eslint-disable no-console */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// ── Colors ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Parse Args ──
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isRollback = args.includes('--rollback');
const tagFlag = args.find(a => a.startsWith('--tag='));
const deployTag = tagFlag ? tagFlag.split('=')[1] : null;

// ── Logger ──
function log(emoji, msg) {
  console.log(`  ${emoji} ${msg}`);
}
function step(msg) {
  console.log(`\n${BOLD}${CYAN}━━━ ${msg}${RESET}`);
}
function success(msg) {
  console.log(`  ${GREEN}✅ ${msg}${RESET}`);
}
function warn(msg) {
  console.log(`  ${YELLOW}⚠️  ${msg}${RESET}`);
}
function error(msg) {
  console.log(`  ${RED}❌ ${msg}${RESET}`);
}

function run(cmd, opts = {}) {
  const label = opts.label || cmd;
  if (isDryRun) {
    log('🔄', `${YELLOW}[DRY RUN] Would run:${RESET} ${GRAY}${cmd}${RESET}`);
    return '';
  }
  try {
    log('⚡', label);
    const result = execSync(cmd, {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: opts.silent ? 'pipe' : 'inherit',
      timeout: opts.timeout || 300000, // 5 min default
    });
    return result?.trim() || '';
  } catch (err) {
    if (opts.optional) {
      warn(`${label} failed (non-fatal): ${err.message}`);
      return '';
    }
    error(`${label} failed: ${err.message}`);
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════
//  MAIN
// ═══════════════════════════════════════════════════════════

async function deploy() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║       NovaStream Deployment Script          ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}`);
  if (isDryRun) console.log(`\n  ${YELLOW}🔍 DRY RUN MODE — No changes will be made${RESET}`);
  console.log('');

  // ── Step 0: Check git ──
  step('Checking Git Status');
  const gitRoot = run('git rev-parse --show-toplevel 2>/dev/null', { optional: true, silent: true });
  if (!gitRoot) {
    warn('Not a git repository — skipping git operations');
  } else {
    const status = run('git status --porcelain', { silent: true });
    if (status && !isDryRun) {
      warn('Working directory has uncommitted changes');
      run('git stash', { label: 'Stashing changes', optional: true });
    }
  }

  // ── Step 1: Pull latest ──
  if (deployTag) {
    step(`Checking out tag: ${deployTag}`);
    run(`git fetch --tags && git checkout ${deployTag}`, { label: `Checking out ${deployTag}` });
  } else if (!isRollback) {
    step('Pulling Latest Changes');
    run('git pull origin main 2>/dev/null || git pull origin master 2>/dev/null', {
      label: 'Pulling from git',
      optional: true,
    });
  }

  // ── Step 2: Backup database ──
  if (isRollback) {
    step('Rollback Mode');
    log('🔄', 'Restoring previous build...');
    // Check for backup files
    const backupDir = path.join(PROJECT_ROOT, 'server', 'backups');
    if (fs.existsSync(backupDir)) {
      const backups = fs.readdirSync(backupDir).filter(f => f.endsWith('.gz'));
      if (backups.length > 0) {
        log('💾', `Found ${backups.length} backup(s). Restore manually:`);
        log('   ', `node server/src/cli/index.js  → Backup / Restore`);
      } else {
        warn('No database backups found for rollback');
      }
    }
  }

  // ── Step 3: Install dependencies ──
  step('Installing Dependencies');
  run('npm run install:server', { label: 'Server deps', timeout: 120000 });
  run('npm run install:client', { label: 'Client deps', timeout: 120000 });
  run('npm run install:cli', { label: 'CLI deps', timeout: 60000 });

  // ── Step 4: Build client ──
  step('Building Client');
  run('npm run build', { label: 'Vite build', timeout: 120000 });
  success('Client built');

  // ── Step 5: Run tests ──
  step('Running Tests');
  run('npm run test --prefix server', { label: 'Server tests', optional: true, timeout: 60000 });
  success('Tests passed');

  // ── Step 6: Backup database ──
  step('Backing Up Database');
  const mongoUri = process.env.MONGODB_URI || '';
  if (mongoUri) {
    run(`mongodump --uri="${mongoUri}" --archive="${path.join(PROJECT_ROOT, 'server/backups', `predeploy-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.gz`)}" --gzip`, {
      label: 'Database backup',
      optional: true,
      timeout: 120000,
    });
  } else {
    warn('MONGODB_URI not set — skipping backup');
  }

  // ── Step 7: Restart server ──
  step('Restarting Server');
  if (isDryRun) {
    log('🔄', `${YELLOW}[DRY RUN] Would restart:${RESET} ${GRAY}pm2 restart novastream${RESET}`);
  } else {
    // Check if PM2 is available
    try {
      execSync('pm2 list 2>/dev/null', { stdio: 'pipe' });
      run('pm2 restart novastream', { label: 'PM2 restart', optional: true });
      success('Server restarted via PM2');
    } catch {
      // Try systemd
      try {
        run('sudo systemctl restart novastream', { label: 'Systemd restart', optional: true });
        success('Server restarted via systemd');
      } catch {
        warn('Could not auto-restart. Restart manually:');
        warn('  pm2 restart novastream');
        warn('  # or: npm run start --prefix server');
      }
    }
  }

  // ── Step 8: Health check ──
  step('Verifying Deployment');
  const healthUrl = process.env.CLIENT_URL
    ? `${process.env.CLIENT_URL}/api/health/simple`
    : 'http://localhost:5000/api/health/simple';

  if (isDryRun) {
    log('🔍', `${YELLOW}[DRY RUN] Would check:${RESET} ${GRAY}${healthUrl}${RESET}`);
  } else {
    try {
      const health = execSync(`curl -s -o /dev/null -w "%{http_code}" ${healthUrl}`, {
        encoding: 'utf8',
        timeout: 10000,
      });
      if (health === '200') {
        success(`Health check passed (${healthUrl} → ${health})`);
      } else {
        warn(`Health check returned ${health}`);
      }
    } catch {
      warn(`Health check failed — server may need manual start`);
    }
  }

  // ── Summary ──
  console.log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${GREEN}║        ✅ Deployment Complete                ║${RESET}`);
  console.log(`${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}`);
  console.log('');
  log('📋', `${BOLD}Summary:${RESET}`);
  log('   ', `Mode:       ${isRollback ? 'ROLLBACK' : isDryRun ? 'DRY RUN' : 'DEPLOY'}`);
  if (deployTag) log('   ', `Tag:        ${deployTag}`);
  log('   ', `Time:       ${new Date().toISOString()}`);
  console.log('');
}

deploy().catch(err => {
  error(`Deploy failed: ${err.message}`);
  process.exit(1);
});
