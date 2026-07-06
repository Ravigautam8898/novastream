// cli/utils/logger.js
// Simple colored logger for CLI output using chalk

const chalk = require('chalk');

const logger = {
  info: (msg) => console.log(chalk.cyan(`  ℹ ${msg}`)),
  success: (msg) => console.log(chalk.green(`  ✓ ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`  ⚠ ${msg}`)),
  error: (msg) => console.log(chalk.red(`  ✗ ${msg}`)),
  debug: (msg) => {
    if (process.env.NOVACTL_DEBUG) {
      console.log(chalk.gray(`  [DEBUG] ${msg}`));
    }
  },

  // Raw helpers
  title: (msg) => console.log(chalk.bold.white(`\n  ${msg}`)),
  data: (label, value) => console.log(`  ${chalk.cyan(label)}: ${chalk.white(value)}`),
  line: () => console.log(chalk.gray('  ───────────────────────────────────────────────')),
  empty: () => console.log(''),
};

module.exports = logger;
