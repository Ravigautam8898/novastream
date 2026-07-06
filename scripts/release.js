#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Release Script
 * ═══════════════════════════════════════════════════════════
 *
 * Automates the release process:
 *   - Bump version in VERSION, server/package.json, root package.json
 *   - Update CHANGELOG.md with new version entry
 *   - Run build verification
 *   - Create git tag
 *
 * Usage:
 *   node scripts/release.js patch   # 1.0.0 → 1.0.1 (bug fixes)
 *   node scripts/release.js minor   # 1.0.0 → 1.1.0 (new features)
 *   node scripts/release.js major   # 1.0.0 → 2.0.0 (breaking changes)
 *   node scripts/release.js --dry-run  # Preview without changes
 *
 * ═══════════════════════════════════════════════════════════
 */

/* eslint-disable no-console */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PROJECT_ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(PROJECT_ROOT, 'VERSION');
const CHANGELOG_FILE = path.join(PROJECT_ROOT, 'CHANGELOG.md');
const ROOT_PKG = path.join(PROJECT_ROOT, 'package.json');
const SERVER_PKG = path.join(PROJECT_ROOT, 'server', 'package.json');

const isDryRun = process.argv.includes('--dry-run');
const bumpType = process.argv.find(a => ['patch', 'minor', 'major'].includes(a)) || 'patch';

function log(msg) { console.log(`  ${msg}`); }
function step(msg) { console.log(`\n${BOLD}${CYAN}━━━ ${msg}${RESET}`); }
function success(msg) { console.log(`  ${GREEN}✅ ${msg}${RESET}`); }
function warn(msg) { console.log(`  ${YELLOW}⚠️  ${msg}${RESET}`); }
function error(msg) { console.log(`  ${RED}❌ ${msg}${RESET}`); }

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function writeFile(p, content) {
  if (isDryRun) {
    log(`  ${YELLOW}[DRY RUN] Would write: ${p}${RESET}`);
    return;
  }
  fs.writeFileSync(p, content, 'utf8');
}

function bumpVersion(version, type) {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3) return null;
  if (type === 'major') return `${parts[0] + 1}.0.0`;
  if (type === 'minor') return `${parts[0]}.${parts[1] + 1}.0`;
  if (type === 'patch') return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  return null;
}

function updateChangelog(version, changelog) {
  const today = new Date().toISOString().slice(0, 10);
  const newEntry = `## [${version}] — ${today}\n\n### Added\n- (list new features)\n\n### Changed\n- (list changes)\n\n### Fixed\n- (list bug fixes)\n\n`;
  return changelog.replace(/^# NovaStream — Changelog\n\n/, `# NovaStream — Changelog\n\n${newEntry}`);
}

// ═══════════════════════════════════════════════════════════

async function release() {
  console.log(`\n${BOLD}${CYAN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${CYAN}║       NovaStream Release Script             ║${RESET}`);
  console.log(`${BOLD}${CYAN}╚══════════════════════════════════════════════╝${RESET}`);
  if (isDryRun) log(`  ${YELLOW}🔍 DRY RUN MODE${RESET}`);
  log(`  Bump type: ${BOLD}${bumpType}${RESET}`);
  console.log('');

  // ── Step 1: Read current version ──
  step('Reading Current Version');
  const currentVersion = readFile(VERSION_FILE)?.trim();
  if (!currentVersion) {
    error('VERSION file not found or empty');
    process.exit(1);
  }
  log(`  Current: ${currentVersion}`);

  const newVersion = bumpVersion(currentVersion, bumpType);
  if (!newVersion) {
    error(`Invalid version format: ${currentVersion}`);
    process.exit(1);
  }
  log(`  New:     ${BOLD}${GREEN}${newVersion}${RESET}`);

  // ── Step 2: Update VERSION file ──
  step('Updating VERSION File');
  writeFile(VERSION_FILE, newVersion + '\n');
  success(`VERSION → ${newVersion}`);

  // ── Step 3: Update package.json files ──
  step('Updating package.json Files');

  for (const pkgPath of [ROOT_PKG, SERVER_PKG]) {
    const content = readFile(pkgPath);
    if (!content) {
      warn(`Not found: ${pkgPath}`);
      continue;
    }
    try {
      const pkg = JSON.parse(content);
      pkg.version = newVersion;
      writeFile(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      success(`${path.relative(PROJECT_ROOT, pkgPath)} → ${newVersion}`);
    } catch (err) {
      warn(`Failed to parse ${pkgPath}: ${err.message}`);
    }
  }

  // ── Step 4: Update CHANGELOG ──
  step('Updating CHANGELOG.md');
  const changelog = readFile(CHANGELOG_FILE);
  if (changelog) {
    const updated = updateChangelog(newVersion, changelog);
    writeFile(CHANGELOG_FILE, updated);
    success('CHANGELOG.md updated');
  } else {
    warn('CHANGELOG.md not found');
  }

  // ── Step 5: Build verification ──
  step('Build Verification');
  if (isDryRun) {
    log(`  ${YELLOW}[DRY RUN] Would build client${RESET}`);
  } else {
    const { execSync } = require('child_process');
    try {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit', timeout: 60000 });
      success('Client build passed');
    } catch (err) {
      error(`Build failed: ${err.message}`);
      process.exit(1);
    }
  }

  // ── Step 6: Git tag ──
  step('Creating Git Tag');
  if (isDryRun) {
    log(`  ${YELLOW}[DRY RUN] Would create tag: v${newVersion}${RESET}`);
  } else {
    const { execSync } = require('child_process');
    try {
      execSync(`git add VERSION package.json server/package.json CHANGELOG.md`, { stdio: 'pipe' });
      execSync(`git commit -m "release: v${newVersion}"`, { stdio: 'pipe' });
      execSync(`git tag -a v${newVersion} -m "NovaStream v${newVersion}"`, { stdio: 'pipe' });
      success(`Tag created: v${newVersion}`);
      log(`  To push: ${GRAY}git push origin main --tags${RESET}`);
    } catch (err) {
      warn(`Git tag failed: ${err.message}`);
      warn('  You may need to commit changes manually:');
      warn(`    git add VERSION package.json server/package.json CHANGELOG.md`);
      warn(`    git commit -m "release: v${newVersion}"`);
      warn(`    git tag -a v${newVersion} -m "NovaStream v${newVersion}"`);
    }
  }

  // ── Summary ──
  console.log(`\n${BOLD}${GREEN}╔══════════════════════════════════════════════╗${RESET}`);
  console.log(`${BOLD}${GREEN}║     ✅ Release v${newVersion.padEnd(10)}       ║${RESET}`);
  console.log(`${BOLD}${GREEN}╚══════════════════════════════════════════════╝${RESET}`);
  console.log('');
}

release().catch(err => {
  error(`Release failed: ${err.message}`);
  process.exit(1);
});
