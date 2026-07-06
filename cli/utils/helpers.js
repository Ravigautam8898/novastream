// cli/utils/helpers.js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Find the project root directory by looking for project marker files
 * Searches up to 10 levels deep for .env, package.json with novastream, or ecosystem.config.js
 */
function findProjectRoot() {
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    dir = path.resolve(dir, '..');

    // Check for project markers (in order of specificity)
    if (fs.existsSync(path.join(dir, 'ecosystem.config.js'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, '.env'))) {
      return dir;
    }

    // Check package.json for our project name
    const pkgPath = path.join(dir, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        if (pkg.name === 'novastream' || pkg.name === 'novactl') {
          // Return the parent of cli/ or server/ (i.e., the monorepo root)
          return fs.existsSync(path.join(dir, 'cli')) ||
                 fs.existsSync(path.join(dir, 'server'))
            ? dir
            : path.resolve(dir, '..');
        }
      } catch {
        // Invalid JSON, continue searching
      }
    }
  }
  // Fallback: assume we're in cli/ directory, project root is one level up
  return path.resolve(__dirname, '..', '..');
}

/**
 * Load .env file from project root
 * Handles: comments (#), quoted values ("", ''), empty values,
 * values with = signs, and inline comments after unquoted values
 */
function loadEnv() {
  const root = findProjectRoot();
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error(
      '.env file not found at ' + envPath + '\n' +
      '  Run: cp docs/reference/.env.example .env\n' +
      '  Then edit .env with your configuration.'
    );
  }

  const content = fs.readFileSync(envPath, 'utf-8');
  for (const rawLine of content.split('\n')) {
    const trimmed = rawLine.trim();
    // Skip empty lines and full-line comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Find first = sign (value may contain more = signs)
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let valuePart = trimmed.slice(eqIndex + 1).trim();

    // Handle quoted values (preserve internal spaces and special chars)
    if (valuePart.startsWith('"')) {
      // Double-quoted: find closing quote, don't strip comments inside quotes
      const closeQuote = valuePart.indexOf('"', 1);
      if (closeQuote !== -1) {
        valuePart = valuePart.slice(1, closeQuote);
      } else {
        valuePart = valuePart.slice(1); // malformed, take rest
      }
    } else if (valuePart.startsWith("'")) {
      const closeQuote = valuePart.indexOf("'", 1);
      if (closeQuote !== -1) {
        valuePart = valuePart.slice(1, closeQuote);
      } else {
        valuePart = valuePart.slice(1);
      }
    } else {
      // Unquoted: strip inline comments (space + # or tab + #)
      const commentIndex = valuePart.search(/\s+#/);
      if (commentIndex !== -1) {
        valuePart = valuePart.slice(0, commentIndex).trimEnd();
      }
    }

    process.env[key] = valuePart;
  }
}

/**
 * Get MONGODB_URI from environment (loaded from .env)
 */
function getMongoUri() {
  return process.env.MONGODB_URI || '';
}

/**
 * Run a shell command and return output
 */
function runCommand(cmd, options = {}) {
  const defaultOpts = {
    cwd: findProjectRoot(),
    encoding: 'utf-8',
    stdio: options.silent ? 'pipe' : 'inherit',
    ...options,
  };
  delete defaultOpts.silent;
  return execSync(cmd, defaultOpts);
}

/**
 * Generate a random password
 */
function generatePassword(length = 16) {
  const crypto = require('crypto');
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate a random username
 */
function generateUsername(prefix = 'user') {
  const crypto = require('crypto');
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Check if PM2 is installed
 */
function checkPm2() {
  try {
    execSync('npx pm2 --version', { stdio: 'pipe', encoding: 'utf-8' });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  findProjectRoot,
  loadEnv,
  getMongoUri,
  runCommand,
  generatePassword,
  generateUsername,
  checkPm2,
};
