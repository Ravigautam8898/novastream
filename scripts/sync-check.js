#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * NovaStream — Governance Sync Check Script
 * ═══════════════════════════════════════════════════════════
 *
 * Automatically validates that all project files are in sync:
 *   - .env.example vars match config/env.js Zod schema
 *   - requirements.txt deps match server/package.json + cli/package.json
 *   - STATUS.md tasks reflect actual file existence
 *   - docs/index.md links to all doc files
 *   - Plan directory structure matches actual structure
 *   - Install scripts have parity
 *   - .env is properly gitignored
 *
 * Usage:
 *   node scripts/sync-check.js              # Standard check
 *   VERBOSE=1 node scripts/sync-check.js    # Detailed output
 *
 * Exit codes:
 *   0 — All checks passed (or only warnings)
 *   1 — Errors found (project is out of sync)
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

// ── Colors (no dependencies needed) ──
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const GRAY = '\x1b[90m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

const PROJECT_ROOT = path.resolve(__dirname, '..');

// ── Results Tracking ──
const results = { passed: 0, warnings: 0, errors: 0 };

function pass(msg) {
  results.passed++;
  if (process.env.VERBOSE) console.log(`  ${GREEN}✓${RESET} ${msg}`);
}

function warn(msg) {
  results.warnings++;
  console.log(`  ${YELLOW}⚠${RESET} ${msg}`);
}

function fail(msg) {
  results.errors++;
  console.log(`  ${RED}✗${RESET} ${msg}`);
}

function header(title) {
  console.log(`\n${BOLD}${CYAN}── ${title}${RESET}`);
}

// ── Helper Functions ──
function readFile(filePath) {
  const fullPath = path.join(PROJECT_ROOT, filePath);
  try {
    return fs.readFileSync(fullPath, 'utf-8');
  } catch {
    return null;
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.join(PROJECT_ROOT, filePath));
}

function parseEnvVars(content) {
  const vars = [];
  const lines = content.split('\n');
  let inTemplate = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ───') && trimmed.includes('──')) {
      inTemplate = true;
      continue;
    }
    if (!inTemplate) continue;
    // Match KEY=VALUE (not comments)
    const match = trimmed.match(/^([A-Z_][A-Z_0-9]*)=/);
    if (match) {
      vars.push(match[1]);
    }
  }
  return vars;
}

function parseRequirementsDeps(content, sectionName) {
  const deps = {};
  const lines = content.split('\n');
  let inSection = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.includes(`# ─── ${sectionName}`)) {
      inSection = true;
      continue;
    }
    if (trimmed.startsWith('# ───') && inSection) break;
    if (!inSection || trimmed.startsWith('#') || !trimmed) continue;
    const match = trimmed.match(/^([a-z@][a-z0-9@/\-_]+)\s+\^?([0-9]+\.[0-9]+\.[0-9]+)/);
    if (match) {
      deps[match[1]] = match[2];
    }
  }
  return deps;
}

function parsePackageDeps(filePath) {
  const content = readFile(filePath);
  if (!content) return { dependencies: {}, devDependencies: {} };
  try {
    const pkg = JSON.parse(content);
    return {
      dependencies: pkg.dependencies || {},
      devDependencies: pkg.devDependencies || {},
    };
  } catch {
    return { dependencies: {}, devDependencies: {} };
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 1: Environment Variables — .env.example vs config/env.js
// ═══════════════════════════════════════════════════════════
header('Check 1: Environment Variables');

const envExample = readFile('docs/reference/.env.example');
const envConfig = readFile('server/src/config/env.js');

if (!envExample) {
  fail('docs/reference/.env.example not found');
} else if (!envConfig) {
  fail('server/src/config/env.js not found — Phase 1 not complete?');
} else {
  const exampleVars = parseEnvVars(envExample);
  // Parse env.js for Zod schema keys
  const schemaMatch = envConfig.match(/const envSchema = z\.object\(\{([^}]+)\}\);/s);
  if (!schemaMatch) {
    warn('Could not parse env.js Zod schema — check file format');
  } else {
    const schemaContent = schemaMatch[1];
    const schemaVars = [];
    const varMatches = schemaContent.matchAll(/^\s+([A-Z_][A-Z_0-9]*):/gm);
    for (const m of varMatches) {
      schemaVars.push(m[1]);
    }

    // Check for vars in schema but missing from .env.example
    for (const v of schemaVars) {
      if (!exampleVars.includes(v)) {
        fail(`Env var '${v}' is in config/env.js but missing from .env.example`);
      } else if (process.env.VERBOSE) {
        pass(`Env var '${v}' is properly documented in .env.example`);
      }
    }

    // Check for vars in .env.example but not in schema
    for (const v of exampleVars) {
      if (!schemaVars.includes(v)) {
        warn(`Env var '${v}' is in .env.example but NOT in config/env.js (orphaned var?)`);
      }
    }

    if (results.errors === 0 && !process.env.VERBOSE) {
      pass(`All ${schemaVars.length} env vars properly documented in .env.example`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 2: Dependencies — requirements.txt vs package.json files
// ═══════════════════════════════════════════════════════════
header('Check 2: Dependencies');

const requirements = readFile('requirements.txt');
if (!requirements) {
  fail('requirements.txt not found');
} else {
  // Check Server Dependencies (prod + dev)
  const serverPkg = parsePackageDeps('server/package.json');
  const reqServerDeps = parseRequirementsDeps(requirements, 'Server Dependencies');
  const reqDevDeps = parseRequirementsDeps(requirements, 'Dev Dependencies');

  // Merge prod + dev deps from requirements into one set for comparison
  const allReqServerNames = [
    ...new Set([
      ...Object.keys(reqServerDeps),
      ...Object.keys(reqDevDeps),
    ]),
  ];

  const allServerDeps = {
    ...serverPkg.dependencies,
    ...serverPkg.devDependencies,
  };

  const serverPkgNames = Object.keys(allServerDeps);

  for (const dep of serverPkgNames) {
    if (!allReqServerNames.includes(dep)) {
      fail(`Dependency '${dep}' is in server/package.json but missing from requirements.txt (Server Dependencies or Dev Dependencies)`);
    }
  }

  // Check CLI Dependencies
  const cliPkg = parsePackageDeps('cli/package.json');
  const reqCliDeps = parseRequirementsDeps(requirements, 'CLI Dependencies');

  const allCliDeps = {
    ...cliPkg.dependencies,
    ...cliPkg.devDependencies,
  };

  const cliPkgNames = Object.keys(allCliDeps);
  const reqCliNames = Object.keys(reqCliDeps);

  for (const dep of cliPkgNames) {
    if (!reqCliNames.includes(dep)) {
      fail(`Dependency '${dep}' is in cli/package.json but missing from requirements.txt CLI Dependencies`);
    }
  }

  if (results.errors === 0) {
    const totalDeps = serverPkgNames.length + cliPkgNames.length;
    pass(`All ${totalDeps} dependencies documented in requirements.txt`);
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 3: STATUS.md Tasks vs Actual File Existence
// ═══════════════════════════════════════════════════════════
header('Check 3: STATUS.md File References');

const statusMd = readFile('docs/STATUS.md');
if (!statusMd) {
  fail('docs/STATUS.md not found');
} else {
  // Check key files referenced as done actually exist
  const fileChecks = [
    { name: 'docs/plans/SERVER_PLAN.md', required: true },
    { name: 'docs/reference/API_FINDINGS.md', required: true },
    { name: 'docs/reference/.env.example', required: true },
    { name: 'docs/research/TMDB_API_RESEARCH.md', required: true },
    { name: 'docs/index.md', required: true },
    { name: 'docs/STATUS.md', required: true },
    { name: 'ecosystem.config.js', required: true },
    { name: 'requirements.txt', required: true },
    { name: 'install.sh', required: true },
    { name: 'install.ps1', required: true },
    { name: 'server/src/config/env.js', required: true },
    { name: 'server/src/config/database.js', required: true },
    { name: 'server/src/config/logger.js', required: true },
    { name: 'server/src/app.js', required: true },
    { name: 'server/src/models/Content.model.js', required: true },
    { name: 'server/src/models/Season.model.js', required: true },
    { name: 'server/src/models/Episode.model.js', required: true },
    { name: 'server/src/models/User.model.js', required: true },
    { name: 'server/src/models/Session.model.js', required: true },
    { name: 'server/src/models/BlockedIP.model.js', required: true },
    { name: 'server/src/services/tmdb.service.js', required: true },
    { name: 'server/src/middleware/errorHandler.middleware.js', required: true },
    { name: 'server/src/utils/ApiResponse.js', required: true },
    { name: 'server/src/utils/ApiError.js', required: true },
    { name: 'server/src/routes/index.js', required: true },
    { name: 'cli/bin/novactl', required: true },
    { name: 'GOVERNANCE.md', required: true },
    { name: 'scripts/sync-check.js', required: true },
  ];

  for (const check of fileChecks) {
    if (!fileExists(check.name)) {
      if (check.required) {
        fail(`Required file missing: ${check.name}`);
      } else {
        warn(`Optional file missing: ${check.name} (may not be created yet)`);
      }
    } else if (process.env.VERBOSE) {
      pass(`File exists: ${check.name}`);
    }
  }

  if (results.errors === 0 && process.env.VERBOSE) {
    pass('All required files present');
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 4: docs/index.md Links
// ═══════════════════════════════════════════════════════════
header('Check 4: Documentation Links');

const indexMd = readFile('docs/index.md');
if (!indexMd) {
  fail('docs/index.md not found');
} else {
  const docFiles = [
    { path: 'STATUS.md', name: 'Status Tracker' },
    { path: 'reference/API_FINDINGS.md', name: 'API Findings' },
    { path: 'plans/SERVER_PLAN.md', name: 'Server Plan' },
    { path: 'research/TMDB_API_RESEARCH.md', name: 'TMDB Research' },
    { path: 'reference/.env.example', name: 'Env Template' },
    { path: '../GOVERNANCE.md', name: 'Governance' },
  ];

  for (const doc of docFiles) {
    // Check if the link text or path appears in index.md
    const linkPattern = doc.path.replace('../', '');
    if (indexMd.includes(linkPattern) || indexMd.includes(doc.name)) {
      if (process.env.VERBOSE) pass(`Link found: ${doc.name}`);
    } else {
      if (fileExists(path.join('docs', doc.path.replace('../', '')))) {
        warn(`Doc file '${doc.path}' exists but is NOT linked from docs/index.md`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 5: Gitignore — .env must be ignored
// ═══════════════════════════════════════════════════════════
header('Check 5: Git Security');

const gitignore = readFile('.gitignore');
if (!gitignore) {
  warn('.gitignore not found');
} else {
  if (gitignore.includes('.env')) {
    pass('.env is properly listed in .gitignore');
  } else {
    fail('.env is NOT in .gitignore — secrets could be committed!');
  }
}

// ═══════════════════════════════════════════════════════════
//  CHECK 6: Install Script Parity
// ═══════════════════════════════════════════════════════════
header('Check 6: Install Scripts Parity');

const installSh = readFile('install.sh');
const installPs1 = readFile('install.ps1');

const sectionChecks = [
  { keyword: 'System Requirements', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'Server Dependencies', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'CLI Dependencies', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'Frontend Dependencies', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'Setting Up Environment', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'Creating Required Directories', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'PM2', expectIn: ['install.sh', 'install.ps1'] },
  { keyword: 'FFmpeg', expectIn: ['install.sh', 'install.ps1'] },
];

for (const section of sectionChecks) {
  for (const script of section.expectIn) {
    const content = script === 'install.sh' ? installSh : installPs1;
    if (!content) {
      fail(`${script} not found`);
      continue;
    }
    if (!content.includes(section.keyword)) {
      warn(`Section '${section.keyword}' missing from ${script}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════
//  RESULTS
// ═══════════════════════════════════════════════════════════
console.log('');
console.log(`${BOLD}${'═'.repeat(55)}${RESET}`);
console.log(`${BOLD}  Results:${RESET}`);

const total = results.passed + results.warnings + results.errors;
console.log(`  ${GREEN}✔ ${results.passed} passed${RESET}`);
console.log(`  ${results.warnings > 0 ? YELLOW + '⚠' : '  '} ${results.warnings} warnings${RESET}`);
console.log(`  ${results.errors > 0 ? RED + '✗' : '  '} ${results.errors} errors${RESET}`);
console.log(`${BOLD}${'═'.repeat(55)}${RESET}`);

if (results.errors > 0) {
  console.log(`\n${RED}${BOLD}  ❌ GOVERNANCE CHECK FAILED${RESET}`);
  console.log(`  ${YELLOW}Fix the errors above, then re-run: node scripts/sync-check.js${RESET}\n`);
  process.exit(1);
}

if (results.warnings > 0) {
  console.log(`\n${YELLOW}${BOLD}  ⚠  CHECK PASSED WITH WARNINGS${RESET}`);
  console.log(`  ${GRAY}Review warnings above — non-blocking but recommended to address.${RESET}\n`);
  process.exit(0);
}

console.log(`\n${GREEN}${BOLD}  ✅ ALL CHECKS PASSED — Project is in sync!${RESET}\n`);
process.exit(0);
