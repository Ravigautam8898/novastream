// cli/commands/sync.command.js
// Runs the governance sync-check script and displays results in the CLI

const { execSync } = require('child_process');
const path = require('path');
const chalk = require('chalk');
const { findProjectRoot } = require('../utils/helpers');

function main() {
  const root = findProjectRoot();
  const scriptPath = path.join(root, 'scripts', 'sync-check.js');

  console.log(chalk.cyan('\n  ╔══════════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║     NovaStream — Governance Sync Check     ║'));
  console.log(chalk.cyan('  ╚══════════════════════════════════════════════╝'));
  console.log('');

  // Check if the sync-check script exists
  const fs = require('fs');
  if (!fs.existsSync(scriptPath)) {
    console.log(chalk.yellow('  ⚠  Sync check script not found at:'));
    console.log(chalk.gray(`     ${scriptPath}`));
    console.log('');
    console.log(chalk.yellow('  Run install.sh or install.ps1 to set up the project first.'));
    process.exit(1);
  }

  try {
    const output = execSync(`node "${scriptPath}"`, {
      cwd: root,
      encoding: 'utf-8',
      stdio: 'pipe',
      timeout: 30000,
    });

    console.log(output);

    // Check exit code via overall result in output
    const hasErrors = output.includes('[FAIL]') || output.includes('❌');
    const hasWarnings = output.includes('[WARN]') || output.includes('⚠');

    if (hasErrors) {
      console.log(chalk.red('  ════════════════════════════════════════════════'));
      console.log(chalk.red('  ❌ Sync check completed with ERRORS'));
      console.log(chalk.red('     Fix the issues above before proceeding.'));
      console.log(chalk.red('  ════════════════════════════════════════════════'));
      process.exit(1);
    } else if (hasWarnings) {
      console.log(chalk.yellow('  ════════════════════════════════════════════════'));
      console.log(chalk.yellow('  ⚠  Sync check completed with WARNINGS'));
      console.log(chalk.yellow('     Review warnings above — non-blocking.'));
      console.log(chalk.yellow('  ════════════════════════════════════════════════'));
    } else {
      console.log(chalk.green('  ════════════════════════════════════════════════'));
      console.log(chalk.green('  ✅ All governance checks passed!'));
      console.log(chalk.green('     Everything is in sync.'));
      console.log(chalk.green('  ════════════════════════════════════════════════'));
    }
  } catch (err) {
    if (err.stdout) {
      console.log(err.stdout);
    }
    console.log(chalk.red(`\n  ❌ Sync check failed: ${err.message}`));
    process.exit(1);
  }
}

main();

