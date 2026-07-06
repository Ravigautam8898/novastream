#!/usr/bin/env node

// server/src/cli/index.js
// NovaStream Admin CLI — interactive menu for production operations
// Usage: node src/cli/index.js  (or: npm run admin)
//
// No external dependencies — uses Node.js built-in readline.

const readline = require('readline');
const mongoose = require('mongoose');

const { connectDatabase, disconnectDatabase } = require('../config/database');
const config = require('../config/env');
const logger = require('../config/logger');

// ── Load models lazily (connected after DB) ──
let User, SubscriptionPlan;

// ── CLI Commands ──
const statusCmd = require('./commands/status.command');
const userCmd = require('./commands/user.command');
const subscriptionCmd = require('./commands/subscription.command');
const databaseCmd = require('./commands/database.command');
const securityCmd = require('./commands/security.command');
const backupCmd = require('./commands/backup.command');

// ── Readline Interface ──
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '',
});

// ── Color helpers ──
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

function c(color, text) {
  return colors[color] + text + colors.reset;
}

// ── Menu ──
function showMenu() {
  const header = `
╔══════════════════════════════════════════╗
║       NovaStream Admin CLI v1.0.0        ║
╚══════════════════════════════════════════╝
`;
  console.log(c('cyan', header));
  console.log(c('bright', '  1.') + '  System Status');
  console.log(c('bright', '  2.') + '  User Management');
  console.log(c('bright', '  3.') + '  Subscription Management');
  console.log(c('bright', '  4.') + '  Database Tools');
  console.log(c('bright', '  5.') + '  Security Tools');
  console.log(c('bright', '  6.') + '  Backup / Restore');
  console.log(c('bright', '  7.') + '  Logs');
  console.log(c('bright', '  0.') + '  Exit\n');
}

async function handleChoice(choice) {
  switch (choice) {
    case '1':
      await statusCmd.show(rl, User, mongoose);
      break;
    case '2':
      await userCmd.show(rl, User);
      break;
    case '3':
      await subscriptionCmd.show(rl, User, SubscriptionPlan);
      break;
    case '4':
      await databaseCmd.show(rl, mongoose);
      break;
    case '5':
      await securityCmd.show(rl, User);
      break;
    case '6':
      await backupCmd.show(rl);
      break;
    case '7':
      await logsMenu();
      break;
    case '0':
    case 'exit':
    case 'quit':
      console.log(c('yellow', '\n👋 Goodbye!'));
      await disconnectDatabase();
      process.exit(0);
    default:
      console.log(c('red', '\n  ❌ Invalid option. Please enter a number (0-7).\n'));
  }
}

async function logsMenu() {
  console.clear();
  console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
  console.log(c('cyan', '║           Log Management                 ║'));
  console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

  const answer = await ask('  [1] View Recent Logs\n  [2] Clear Logs\n  [3] Back to Main Menu\n\n  Choose: ');

  switch (answer.trim()) {
    case '1': {
      const lines = await ask('  Lines to show (default 50): ') || '50';
      const count = parseInt(lines, 10) || 50;
      console.log('');
      const { execSync } = require('child_process');
      const logDir = require('path').resolve(__dirname, '..', '..', 'logs');
      try {
        const fs = require('fs');
        if (!fs.existsSync(logDir)) {
          console.log(c('yellow', '  ⚠️  No logs directory found.'));
          break;
        }
        const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
        if (files.length === 0) {
          console.log(c('yellow', '  ⚠️  No log files found.'));
          break;
        }
        const latest = files.sort().reverse()[0];
        const output = execSync(`tail -${count} "${logDir}/${latest}"`, { encoding: 'utf8', maxBuffer: 1024 * 1024 });
        console.log(c('dim', `  --- Last ${count} lines from ${latest} ---`));
        console.log(output);
      } catch (err) {
        console.log(c('red', `  ❌ Failed to read logs: ${err.message}`));
      }
      break;
    }
    case '2': {
      const confirm = await ask(c('red', '  ⚠️  Clear all log files? This requires Super Admin. (yes/no): '));
      if (confirm.trim().toLowerCase() === 'yes') {
        try {
          const logDir = require('path').resolve(__dirname, '..', '..', 'logs');
          const fs = require('fs');
          if (fs.existsSync(logDir)) {
            const files = fs.readdirSync(logDir).filter(f => f.endsWith('.log'));
            for (const f of files) {
              fs.unlinkSync(require('path').join(logDir, f));
            }
            console.log(c('green', `  ✅ Cleared ${files.length} log file(s).`));
          } else {
            console.log(c('yellow', '  ⚠️  No logs directory found.'));
          }
        } catch (err) {
          console.log(c('red', `  ❌ Failed to clear logs: ${err.message}`));
        }
      } else {
        console.log(c('yellow', '  Cancelled.'));
      }
      break;
    }
    default:
      break;
  }
}

function ask(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

// ── Main Loop ──
async function main() {
  console.clear();
  console.log(c('green', '  🔌 Connecting to MongoDB...'));

  try {
    // Load models after connect
    User = require('../models/User.model');
    SubscriptionPlan = require('../models/SubscriptionPlan.model');

    await connectDatabase();
    console.log(c('green', '  ✅ Connected to MongoDB\n'));
  } catch (err) {
    console.log(c('red', `  ❌ Failed to connect: ${err.message}`));
    console.log(c('yellow', '  ⚠️  Some commands will not work without a database connection.\n'));
  }

  // Main loop
  while (true) {
    showMenu();
    const answer = await ask(c('cyan', '  Enter your choice: '));
    await handleChoice(answer.trim());
    if (answer.trim() !== '0' && answer.trim() !== 'exit' && answer.trim() !== 'quit') {
      await ask(c('dim', '\n  Press Enter to continue...'));
    }
  }
}

// ── Handle SIGINT ──
process.on('SIGINT', async () => {
  console.log(c('yellow', '\n\n👋 Goodbye!'));
  await disconnectDatabase();
  process.exit(0);
});

// ── Start ──
if (require.main === module) {
  main().catch(async (err) => {
    console.error(c('red', `\n  ❌ Fatal error: ${err.message}`));
    console.error(err.stack);
    await disconnectDatabase();
    process.exit(1);
  });
}

module.exports = { main };
