# NovaStream — Frontend, Security, & CLI

> **Part of:** [NovaStream Server Plan](./README.md)
> **Last Updated:** July 4, 2026

---

## 12. Frontend UI/UX Design (Netflix-Style)

### 12.1 Homepage Layout
```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         HERO CAROUSEL (Full-width, auto-play)        │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │    │
│  │  │  Feature 1   │  │  Feature 2  │  │  Feature 3  │ │    │
│  │  │  (auto-play) │  │  (on hover) │  │  (on hover) │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────┘ │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Continue Watching ─────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Trending Now ──────────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Hollywood ─────────────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Bollywood ─────────────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ Korean ────────────────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─ South Indian ──────────────────────────────────────┐    │
│  │  [Card] [Card] [Card] [Card] ← horizontal scroll   │    │
│  └──────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

### 12.2 Key UI Components

**Hero Carousel:**
- Full-width billboard-style hero at the top
- 5-7 featured items cycling automatically every 8 seconds
- Each slide shows: backdrop image, title, description, genre tags, rating
- Auto-playing video trailer on hover/active (muted by default)
- Gradient overlays for text readability
- "Play" and "More Info" buttons
- Dot indicators for manual navigation
- Responsive: adjusts height on mobile (50vh on mobile, 75vh on desktop)

**Content Card:**
```
┌────────────┐
│            │     ← Poster thumbnail (lazy loaded)
│   Poster   │
│            │
├────────────┤
│ ★ 8.3 Title│     ← Rating + title
│ 2024 • 2h  │     ← Year + runtime
│ Drama Action│     ← Genre chips
└────────────┘
```
- On hover: Card expands upward, shows:
  - Larger poster with play button overlay
  - Rating badge, year, runtime
  - Genre tags
  - Brief description
  - Watch/Add to list buttons
- Smooth transition with scale up and shadow
- Lazy loaded when entering viewport

**Content Row:**
- Horizontal scrolling container with arrow navigation
- Shows "hidden" arrows on hover (Netflix pattern)
- Touch/swipe support for mobile
- Section title on the left
- "See All" link for category pages
- Arrow buttons: left/right with smooth scrolling
- Snap scrolling to nearest card

**Hover Card (Expanded):**
- Appears when hovering a content card
- 2x width of normal card
- Shows: larger poster/thumbnail, title, year, runtime
- Rating, genre tags
- Brief overview (2 lines max)
- Play button, Add to Watchlist button
- Similar content suggestions at bottom

### 12.3 Color Theme
```css
/* Dark Netflix-inspired theme */
--bg-primary: #141414;        /* Main background */
--bg-secondary: #1f1f1f;     /* Card background */
--bg-tertiary: #2a2a2a;      /* Hover states */
--text-primary: #ffffff;      /* Primary text */
--text-secondary: #b3b3b3;   /* Secondary text */
--accent-primary: #e50914;    /* Netflix red - primary CTA */
--accent-hover: #f40612;     /* Hover state for red */
--accent-secondary: #46d369; /* Green - "New episodes" */
--overlay-dark: rgba(0,0,0,0.7);  /* Gradient overlay */
--border-color: rgba(255,255,255,0.1);
```

### 12.4 Micro-Interactions & Animations
- **Page transitions:** Fade + slide between routes
- **Card hover:** Scale up (1.05x) with shadow elevation
- **Carousel slide:** Smooth horizontal transitions
- **Loading states:** Skeleton shimmer placeholders
- **Scroll reveal:** Content rows fade in as they enter viewport
- **Button hover:** Background color shift with subtle scale
- **Mobile tap:** Ripple effect on interactive elements

---



## 13. Login & Authentication System

### 13.1 Login Page Design
```
┌─────────────────────────────────────────────────────────┐
│                                                          │
│                    ┌─────────────────┐                   │
│                    │                 │                   │
│                    │     Logo        │                   │
│                    │                 │                   │
│                    └─────────────────┘                   │
│                                                          │
│              ┌─────────────────────────┐                 │
│              │   Username              │                 │
│              └─────────────────────────┘                 │
│              ┌─────────────────────────┐                 │
│              │   Password              │                 │
│              └─────────────────────────┘                 │
│                                                          │
│              ┌─────────────────────────┐                 │
│              │       Sign In           │                 │
│              └─────────────────────────┘                 │
│                                                          │
│           ┌─────────────────────────────────┐            │
│           │  This is a private server.      │            │
│           │  Contact admin for access.      │            │
│           └─────────────────────────────────┘            │
│                                                          │
└─────────────────────────────────────────────────────────┘
```
- **No registration page** — users are created by admin only
- Dark themed matching the app design
- Background: animated gradient or blurred content backdrop
- "Forgot password?" → Contact admin (no self-service)
- Failed attempts: show error "Invalid credentials"
- Rate limited: 5 attempts per minute per IP
- Session token stored in httpOnly cookie + localStorage

### 13.2 Auth Flow
```
1. User enters username + password
2. POST /api/auth/login
3. Server validates credentials (bcrypt compare)
4. Server checks if user is active
5. Server generates JWT (7 day expiry)
6. Server stores session in DB
7. Returns JWT token + user info
8. Frontend stores token in httpOnly cookie
9. All subsequent API calls include Authorization header
10. On logout: token is invalidated server-side
11. On token expiry: redirect to login
```

### 13.3 Session Management
- Single session per user (new login invalidates old session)
- Session tracking in MongoDB
- Auto-expiry after 7 days of inactivity
- Admin can force-logout any user
- Login history tracked (IP, user agent, timestamp)

---



## 14. Browser Security & Anti-Debug System

### 14.1 Client-Side Security Measures

```javascript
// client/src/security/antiDebug.js

// 1. DevTools Detection — detects if DevTools are open
function detectDevTools() {
  // Method 1: Check element getters
  const element = new Image();
  Object.defineProperty(element, 'id', {
    get: function() {
      window.__devtoolsOpen = true;
      triggerSecurityAlert('devtools_detected');
    }
  });
  console.log('%c', element);

  // Method 2: Detect debugger statements being skipped
  const startTime = performance.now();
  debugger;
  const endTime = performance.now();
  if (endTime - startTime > 100) {
    window.__devtoolsOpen = true;
    triggerSecurityAlert('debugger_delayed');
  }
}

// 2. Debugger Trap — periodic debugger to pause execution
setInterval(() => {
  const start = performance.now();
  (function() { return false; })['constructor']('debugger')();
  const end = performance.now();
  if (end - start > 50) {
    triggerSecurityAlert('debugger_detected');
  }
}, 1000);

// 3. Console Tampering Detection
const originalConsole = { ...console };
setInterval(() => {
  if (console.log !== originalConsole.log ||
      console.error !== originalConsole.error) {
    triggerSecurityAlert('console_tampered');
  }
}, 2000);

// 4. Context Menu (Right-Click) Prevention
document.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  return false;
});

// 5. Keyboard Shortcut Prevention
document.addEventListener('keydown', (e) => {
  // F12 — DevTools
  if (e.key === 'F12') {
    e.preventDefault();
    triggerSecurityAlert('f12_pressed');
  }
  // Ctrl+Shift+I — Inspect
  if (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
    e.preventDefault();
  }
  // Ctrl+Shift+J — Console
  if (e.ctrlKey && e.shiftKey && (e.key === 'J' || e.key === 'j')) {
    e.preventDefault();
  }
  // Ctrl+Shift+C — Inspect Element
  if (e.ctrlKey && e.shiftKey && (e.key === 'C' || e.key === 'c')) {
    e.preventDefault();
  }
  // Ctrl+U — View Source
  if (e.ctrlKey && (e.key === 'U' || e.key === 'u')) {
    e.preventDefault();
  }
});

// 6. Copy-Paste Prevention
document.addEventListener('copy', (e) => e.preventDefault());
document.addEventListener('cut', (e) => e.preventDefault());
document.addEventListener('paste', (e) => e.preventDefault());
document.addEventListener('drag', (e) => e.preventDefault());

// 7. Select Prevention
document.addEventListener('selectstart', (e) => e.preventDefault());

// 8. Security Response
function triggerSecurityAlert(type) {
  // Send alert to server
  fetch('/api/admin/security-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, timestamp: Date.now() })
  }).catch(() => {});

  // Optional: redirect to login or show warning overlay
  if (window.__devtoolsOpen) {
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;
                  height:100vh;background:#000;color:#fff;font-family:sans-serif;">
        <div style="text-align:center;">
          <h1>Access Denied</h1>
          <p>Developer tools detected. Please close DevTools to continue.</p>
        </div>
      </div>
    `;
  }
}
```

### 14.2 Server-Side Security Headers (Helmet)

```javascript
// server/src/app.js
const helmet = require('helmet');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "https://image.tmdb.org", "https://img1.streamraiwind.stream"],
      mediaSrc: ["'self'", "blob:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.themoviedb.org"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
  frameguard: { action: 'deny' },         // No iframes
  referrerPolicy: { policy: 'no-referrer' },
  xssFilter: true,
  noSniff: true,
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
```

### 14.3 Anti-Debug Countermeasures Summary
| Layer | Protection | Method |
|-------|-----------|--------|
| L1 | DevTools detection | Image element getter trap + debugger timing |
| L2 | Debugger trap | Periodic eval('debugger') call |
| L3 | Console tampering | Monitor console method integrity |
| L4 | Right-click | contextmenu event prevention |
| L5 | Keyboard shortcuts | F12, Ctrl+Shift+I, Ctrl+U prevention |
| L6 | Copy-paste | copy/cut/paste event prevention |
| L7 | View source | Ctrl+U prevention |
| L8 | CSP | Content Security Policy headers |
| L9 | Frameguard | DENY all iframe embedding |
| L10 | HSTS | HTTPS-only with preload |
| L11 | Permissions | Block camera, mic, geolocation |
| L12 | Alert reporting | Server-side security event logging |

---



## 15. Anti-Abuse & Rate Limiting System

### 15.1 Rate Limiting Strategy

```javascript
// server/src/middleware/rateLimiter.middleware.js
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');

// General API limiter — 100 requests per 15 min per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Auth endpoint limiter — 5 attempts per minute per IP
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many login attempts. Try again in 1 minute.' },
  skipSuccessfulRequests: true, // Only count failures
});

// Stream endpoint limiter — 30 requests per minute
const streamLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Stream rate limit exceeded.' },
});

// Admin endpoint limiter — 60 requests per minute per IP
// Dedicated limiter for admin panel to handle multiple API calls per page load
const adminLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { success: false, message: 'Too many requests. Please slow down.' },
});

// Slow down repeated offenders after limit
const generalSlowDown = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,
  delayMs: 500, // Add 500ms delay after 50 requests
});
```

### 15.2 IP Reputation & Blocking

```javascript
// server/src/middleware/ipBlocker.middleware.js
const BlockedIP = require('../models/BlockedIP.model');

async function ipBlocker(req, res, next) {
  const ip = req.ip;

  // Check if IP is blocked
  const blocked = await BlockedIP.findOne({
    ip, isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } }
    ]
  });

  if (blocked) {
    return res.status(403).json({
      success: false,
      message: 'Access denied',
      reason: blocked.reason,
      expiresAt: blocked.expiresAt
    });
  }

  next();
}

// Auto-block after N failed attempts
async function autoBlockIP(ip, reason) {
  const existingBlock = await BlockedIP.findOne({ ip, isActive: true });
  if (existingBlock) return;

  await BlockedIP.create({
    ip,
    reason,
    blockedBy: 'system',
    blockedAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    attemptCount: 1,
    isActive: true
  });
}
```

### 15.3 Honeypot Detection
```javascript
// Frontend: hidden fields in login form
;<input type="text" name="website" style="display:none;position:absolute;left:-9999px" tabIndex={-1} autoComplete="off" />

// Backend: check honeypot in auth.controller.js
if (req.body.website) {
  await autoBlockIP(req.ip, 'honeypot_triggered');
  return res.status(403).json({ success: false, message: 'Access denied' });
}
```

### 15.4 Anti-Abuse System Architecture
```
Client Request
      │
      ▼
┌─────────────────┐
│  1. IP Check    │ ← Blocked IP database
├─────────────────┤
│  2. Rate Limit  │ ← endpoint-specific limits
├─────────────────┤
│  3. Honeypot    │ ← invisible form fields
├─────────────────┤
│  4. User-Agent  │ ← block empty/suspicious UAs
├─────────────────┤
│  5. Referrer    │ ← require valid referrer for streams
├─────────────────┤
│  6. JWT Auth    │ ← valid token required
├─────────────────┤
│  7. IP Pin      │ ← token bound to IP
├─────────────────┤
│  8. Request     │ ← proceed to route handler
└─────────────────┘
```

---



## 16. Server Management CLI (novactl) — Node.js + Commander.js

### 16.1 Overview
A professional Node.js CLI using Commander.js instead of bash. Cross-platform (Windows/Linux/Mac), with interactive prompts, colored output, and spinners.

```bash
# Basic server management
novactl start                    # Start server with PM2
novactl stop                     # Stop server
novactl restart                  # Restart server
novactl status                   # Show server status & health
novactl uptime                   # Show server uptime & resource usage
novactl logs --lines=50          # Show last N log lines

# User management
novactl user add                 # Interactive: enter username + password
novactl user add --random        # Generate random username + password
novactl user add --username=xyz  # Specify username, random password
novactl user list                # List all users
novactl user delete <username>   # Delete a user
novactl user pass <username>     # Change password (interactive)

# IP management
novactl ip block <ip> [reason]   # Block an IP address
novactl ip unblock <ip>          # Unblock an IP address
novactl ip list                  # List blocked IPs

# System
novactl config show              # Show current configuration
novactl config path              # Show .env file path
novactl health                   # Full health check
novactl version                  # Show version

# Telegram (Phase 7)
novactl telegram setup           # Configure Telegram bot
novactl telegram status          # Check Telegram bot status
novactl telegram test            # Send test message
```

### 16.2 CLI Entry Point
```javascript
// cli/bin/novactl
#!/usr/bin/env node
const { Command } = require('commander');
const program = new Command();

program
  .name('novactl')
  .description('NovaStream Server Management CLI')
  .version('1.0.0');

// ── Server Commands ──
const serverCommands = require('../commands/server.commands');
program
  .command('start')
  .description('Start the NovaStream server')
  .action(serverCommands.start);

program
  .command('stop')
  .description('Stop the NovaStream server')
  .action(serverCommands.stop);

program
  .command('restart')
  .description('Restart the NovaStream server')
  .action(serverCommands.restart);

program
  .command('status')
  .description('Show server status and health')
  .action(serverCommands.status);

program
  .command('uptime')
  .description('Show server uptime and resource usage')
  .action(serverCommands.uptime);

program
  .command('logs')
  .description('View server logs')
  .option('--lines <number>', 'Number of lines to show', '50')
  .action(serverCommands.logs);

program
  .command('health')
  .description('Full health check')
  .action(serverCommands.health);

// ── User Commands ──
const userCommands = require('../commands/user.commands');
const user = program.command('user').description('User management');

user.command('add')
  .description('Add a new user (interactive)')
  .option('-r, --random', 'Generate random credentials')
  .option('-u, --username <username>', 'Specify username')
  .action(userCommands.add);

user.command('list')
  .description('List all users')
  .action(userCommands.list);

user.command('delete <username>')
  .description('Delete a user')
  .action(userCommands.delete);

user.command('pass <username>')
  .description('Change user password')
  .action(userCommands.pass);

// ── IP Commands ──
const ipCommands = require('../commands/ip.commands');
const ip = program.command('ip').description('IP management');

ip.command('block <ip>')
  .description('Block an IP address')
  .option('-r, --reason <reason>', 'Block reason', 'manual')
  .action(ipCommands.block);

ip.command('unblock <ip>')
  .description('Unblock an IP address')
  .action(ipCommands.unblock);

ip.command('list')
  .description('List blocked IP addresses')
  .action(ipCommands.list);

// ── Config Commands ──
const configCommands = require('../commands/config.commands');
program.command('config')
  .description('Show server configuration')
  .option('--path', 'Show config file path only')
  .action(configCommands.show);

// ── Telegram Commands ──
const telegramCommands = require('../commands/telegram.commands');
const telegram = program.command('telegram')
  .description('Telegram bot management (Phase 7)');

telegram.command('setup')
  .description('Configure Telegram bot')
  .action(telegramCommands.setup);

telegram.command('status')
  .description('Check Telegram bot connection')
  .action(telegramCommands.status);

telegram.command('test')
  .description('Send test message')
  .action(telegramCommands.test);

program.parse(process.argv);
```

### 16.3 Example Command Implementation
```javascript
// cli/commands/user.commands.js
const chalk = require('chalk');
const ora = require('ora');
const inquirer = require('inquirer');
const MongoService = require('../services/mongo.service');

async function addUser(options) {
  let username = options.username || '';
  let password = '';

  if (options.random || (username && !password)) {
    // Generate random credentials
    const crypto = require('crypto');
    username = username || `user_${crypto.randomBytes(4).toString('hex')}`;
    password = crypto.randomBytes(12).toString('base64url');

    const spinner = ora('Creating user...').start();
    try {
      await MongoService.createUser(username, password);
      spinner.succeed(chalk.green('✓ User created successfully'));
      console.log(chalk.cyan('\n  Username: ') + chalk.white.bold(username));
      console.log(chalk.cyan('  Password: ') + chalk.white.bold(password));
      console.log(chalk.yellow('\n  ⚠  Save these credentials — they won\'t be shown again!'));
    } catch (err) {
      spinner.fail(chalk.red(`✗ ${err.message}`));
      process.exit(1);
    }
  } else {
    // Interactive mode
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Enter username:',
        default: username,
        validate: input => input.length >= 3 || 'Username must be at least 3 characters',
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter password:',
        validate: input => input.length >= 6 || 'Password must be at least 6 characters',
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm password:',
        validate: (input, answers) => input === answers.password || 'Passwords do not match',
      },
    ]);

    const spinner = ora('Creating user...').start();
    try {
      await MongoService.createUser(answers.username, answers.password);
      spinner.succeed(chalk.green(`✓ User created: ${answers.username}`));
    } catch (err) {
      spinner.fail(chalk.red(`✗ ${err.message}`));
      process.exit(1);
    }
  }
}

async function listUsers() {
  const spinner = ora('Fetching users...').start();
  try {
    const users = await MongoService.listUsers();
    spinner.stop();

    console.log(chalk.cyan(`\n  Users (${users.length} total):`));
    console.log(chalk.gray('  ───────────────────────────────────────────────'));

    users.forEach(u => {
      const status = u.isActive
        ? chalk.green('✓ Active')
        : chalk.red('✗ Inactive');
      console.log(`  ${chalk.white(u.username.padEnd(20))} ${status.padEnd(12)} ${chalk.yellow(u.role)}`);
    });
    console.log('');
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function deleteUser(username) {
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Delete user '${username}'?`,
    default: false,
  }]);

  if (!confirm) {
    console.log(chalk.yellow('  Cancelled.'));
    return;
  }

  const spinner = ora('Deleting user...').start();
  try {
    await MongoService.deleteUser(username);
    spinner.succeed(chalk.green(`✓ User deleted: ${username}`));
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

module.exports = { add: addUser, list: listUsers, delete: deleteUser };
```

### 16.4 Mongo Service
```javascript
// cli/services/mongo.service.js
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');

class MongoService {
  static async connect() {
    const uri = process.env.MONGODB_URI;
    if (!uri) throw new Error('MONGODB_URI not set in .env');
    const client = new MongoClient(uri);
    await client.connect();
    return client;
  }

  static async createUser(username, password) {
    const client = await this.connect();
    try {
      const db = client.db();
      const existing = await db.collection('users').findOne({ username });
      if (existing) throw new Error(`User '${username}' already exists`);

      const passHash = await bcrypt.hash(password, 10);
      await db.collection('users').insertOne({
        username,
        passwordHash: passHash,
        role: 'user',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    } finally {
      await client.close();
    }
  }

  static async listUsers() {
    const client = await this.connect();
    try {
      const db = client.db();
      return await db.collection('users')
        .find({}, { projection: { username: 1, role: 1, isActive: 1, createdAt: 1 } })
        .sort({ createdAt: -1 })
        .toArray();
    } finally {
      await client.close();
    }
  }

  static async deleteUser(username) {
    const client = await this.connect();
    try {
      const db = client.db();
      const result = await db.collection('users').deleteOne({ username });
      if (result.deletedCount === 0) throw new Error(`User '${username}' not found`);
    } finally {
      await client.close();
    }
  }

  static async ping() {
    const client = await this.connect();
    try {
      await client.db().admin().ping();
      return true;
    } finally {
      await client.close();
    }
  }
}

module.exports = MongoService;
```

### 16.5 PM2 Ecosystem Configuration

```javascript
// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'novastream',
    script: './server/src/app.js',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'development',
    },
    env_production: {
      NODE_ENV: 'production',
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    log_type: 'json',              // ← Pino logs in JSON format
    time: true,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
    merge_logs: true,
  }]
};
```

### 16.6 CLI package.json
```json
{
  "name": "novactl",
  "version": "1.0.0",
  "description": "NovaStream Server Management CLI",
  "bin": {
    "novactl": "./bin/novactl"
  },
  "dependencies": {
    "commander": "^12.0.0",
    "chalk": "^5.3.0",
    "ora": "^8.0.0",
    "inquirer": "^9.2.0",
    "mongodb": "^6.0.0",
    "bcrypt": "^5.1.0"
  }
}
```

---




---

**← Previous:** [Part 3: Backend Services & Streaming](./03-BACKEND_AND_STREAMING.md) | **Next:** [Part 5: Future Work & Implementation](./05-FUTURE_AND_IMPLEMENTATION.md) →
