// cli/commands/ip.commands.js
const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const MongoService = require('../services/mongo.service');
const logger = require('../utils/logger');
const { loadEnv } = require('../utils/helpers');

async function block(ip, options) {
  loadEnv();

  if (!ip) {
    logger.error('Usage: novactl ip block <ip> [--reason <reason>]');
    process.exit(1);
  }

  const reason = options.reason || 'manual';

  // Validate IP format (basic check)
  const ipv4Regex = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/;
  if (!ipv4Regex.test(ip)) {
    logger.warn(`'${ip}' doesn't look like a standard IPv4 address. Blocking anyway...`);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Block IP '${ip}'? (Reason: ${reason})`,
      default: true,
    },
  ]);

  if (!confirm) {
    logger.info('Cancelled');
    return;
  }

  const spinner = ora('Blocking IP...').start();
  try {
    const mongo = new MongoService();
    const result = await mongo.blockIP(ip, reason);
    spinner.succeed(chalk.green(`✓ IP blocked: ${result.ip}`));
    logger.data('Reason', result.reason);
    logger.data('Expires', result.expiresAt
      ? new Date(result.expiresAt).toLocaleString()
      : chalk.yellow('Never (permanent)'));
    logger.empty();
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function unblock(ip) {
  loadEnv();

  if (!ip) {
    logger.error('Usage: novactl ip unblock <ip>');
    process.exit(1);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Unblock IP '${ip}'?`,
      default: true,
    },
  ]);

  if (!confirm) {
    logger.info('Cancelled');
    return;
  }

  const spinner = ora('Unblocking IP...').start();
  try {
    const mongo = new MongoService();
    await mongo.unblockIP(ip);
    spinner.succeed(chalk.green(`✓ IP unblocked: ${ip}`));
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function list() {
  loadEnv();
  const spinner = ora('Fetching blocked IPs...').start();

  try {
    const mongo = new MongoService();
    const blocked = await mongo.listBlockedIPs();
    spinner.stop();

    if (blocked.length === 0) {
      logger.success('No blocked IPs found');
      return;
    }

    logger.title(`Blocked IPs (${blocked.length} total)`);
    logger.line();

    // Table header
    console.log(
      chalk.gray('  IP Address').padEnd(22) +
      chalk.gray('Reason').padEnd(18) +
      chalk.gray('Blocked By').padEnd(14) +
      chalk.gray('Expires')
    );
    console.log(chalk.gray('  ' + '─'.repeat(68)));

    for (const b of blocked) {
      const expires = b.expiresAt
        ? new Date(b.expiresAt).toLocaleString()
        : chalk.yellow('Permanent');
      const blockedBy = b.blockedBy === 'system'
        ? chalk.yellow(b.blockedBy)
        : chalk.cyan(b.blockedBy);

      console.log(
        `  ${chalk.white(b.ip.padEnd(18))}` +
        `${chalk.gray((b.reason || 'unknown').padEnd(16))}` +
        `${blockedBy.padEnd(12)}` +
        `${expires}`
      );
    }

    logger.line();
    logger.info('Use: novactl ip unblock <ip> to remove a block');
    logger.empty();
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

module.exports = { block, unblock, list };
