// cli/commands/config.commands.js
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { findProjectRoot, loadEnv } = require('../utils/helpers');

function show(options) {
  loadEnv();
  const root = findProjectRoot();
  const envPath = path.join(root, '.env');

  if (!fs.existsSync(envPath)) {
    logger.error('.env file not found at ' + envPath);
    logger.info('Run: cp docs/reference/.env.example .env');
    process.exit(1);
  }

  if (options.path) {
    console.log(envPath);
    return;
  }

  // Show config overview (mask secrets)
  const envContent = fs.readFileSync(envPath, 'utf-8');
  const lines = envContent.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));

  logger.title('Server Configuration');
  logger.data('Config file', envPath);
  logger.line();

  for (const line of lines) {
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    // Mask sensitive values
    const sensitiveKeys = ['SECRET', 'KEY', 'TOKEN', 'PASSWORD', 'PASS'];
    const isSensitive = sensitiveKeys.some(k => key.toUpperCase().includes(k));

    if (isSensitive && value) {
      const visible = value.length > 8
        ? value.slice(0, 4) + '•'.repeat(8) + value.slice(-4)
        : '•'.repeat(12);
      logger.data(key, chalk.yellow(visible));
    } else if (value) {
      logger.data(key, chalk.white(value));
    } else {
      logger.data(key, chalk.red('[EMPTY]'));
    }
  }

  logger.line();
  logger.info('Use: novactl config --path to get the config file path');
  logger.empty();
}

module.exports = { show };
