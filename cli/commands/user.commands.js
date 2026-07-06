// cli/commands/user.commands.js
const ora = require('ora');
const chalk = require('chalk');
const inquirer = require('inquirer');
const MongoService = require('../services/mongo.service');
const logger = require('../utils/logger');
const { loadEnv, generatePassword, generateUsername } = require('../utils/helpers');

async function add(options) {
  loadEnv();

  let username = options.username || '';
  let password = '';

  if (options.random) {
    // Fully random: generate both username and password
    username = generateUsername();
    password = generatePassword();
  } else if (username && !options.random) {
    // Username specified, generate random password
    password = generatePassword();
  } else {
    // Interactive mode
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Enter username:',
        default: username || undefined,
        validate: (input) => {
          if (!input || input.length < 3) return 'Username must be at least 3 characters';
          if (!/^[a-zA-Z0-9_]+$/.test(input)) return 'Username can only contain letters, numbers, and underscores';
          return true;
        },
      },
      {
        type: 'password',
        name: 'password',
        message: 'Enter password:',
        mask: '*',
        validate: (input) => {
          if (!input || input.length < 6) return 'Password must be at least 6 characters';
          return true;
        },
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm password:',
        mask: '*',
        validate: (input, answers) => {
          if (input !== answers.password) return 'Passwords do not match';
          return true;
        },
      },
    ]);
    username = answers.username;
    password = answers.password;
  }

  const role = options.admin ? 'super_admin' : 'member';

  const spinner = ora('Creating user...').start();
  try {
    const mongo = new MongoService();
    await mongo.createUser(username, password, role);
    spinner.succeed(chalk.green(`✓ ${role} user created successfully`));
    logger.empty();

    if (options.random || options.username) {
      // Show credentials since they were auto-generated
      logger.title('Login Credentials');
      logger.data('Username', chalk.white.bold(username));
      logger.data('Password', chalk.white.bold(password));
      logger.data('Role', chalk.yellow(role));
      logger.warn(chalk.yellow('Save these credentials — they won\'t be shown again!'));
    } else {
      logger.data('Username', username);
      logger.data('Role', chalk.yellow(role));
    }
    logger.empty();
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function list() {
  loadEnv();
  const spinner = ora('Fetching users...').start();

  try {
    const mongo = new MongoService();
    const users = await mongo.listUsers();
    spinner.stop();

    if (users.length === 0) {
      logger.warn('No users found');
      logger.info('Create one: novactl user add');
      return;
    }

    logger.title(`Users (${users.length} total)`);
    logger.line();

    // Table header
    console.log(
      chalk.gray('  Username').padEnd(28) +
      chalk.gray('Role').padEnd(12) +
      chalk.gray('Status').padEnd(14) +
      chalk.gray('Last Login')
    );
    console.log(chalk.gray('  ' + '─'.repeat(70)));

    for (const u of users) {
      const status = u.isActive
        ? chalk.green('✓ Active')
        : chalk.red('✗ Inactive');
      const lastLogin = u.lastLoginAt
        ? new Date(u.lastLoginAt).toLocaleDateString()
        : chalk.gray('Never');
      const displayName = u.displayName || u.username;

      console.log(
        `  ${chalk.white(displayName.padEnd(24))}` +
        `${chalk.yellow((u.role || 'member').padEnd(10))}` +
        `${status.padEnd(14)}` +
        `${lastLogin}`
      );
    }
    logger.empty();
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function deleteUser(username) {
  loadEnv();

  if (!username) {
    logger.error('Usage: novactl user delete <username>');
    process.exit(1);
  }

  const { confirm } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message: `Delete user '${username}'? This cannot be undone.`,
      default: false,
    },
  ]);

  if (!confirm) {
    logger.info('Cancelled');
    return;
  }

  const spinner = ora('Deleting user...').start();
  try {
    const mongo = new MongoService();
    await mongo.deleteUser(username);
    spinner.succeed(chalk.green(`✓ User deleted: ${username}`));
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

async function changePassword(username) {
  loadEnv();

  if (!username) {
    logger.error('Usage: novactl user pass <username>');
    process.exit(1);
  }

  const answers = await inquirer.prompt([
    {
      type: 'password',
      name: 'newPassword',
      message: `New password for '${username}':`,
      mask: '*',
      validate: (input) => {
        if (!input || input.length < 6) return 'Password must be at least 6 characters';
        return true;
      },
    },
    {
      type: 'password',
      name: 'confirmPassword',
      message: 'Confirm new password:',
      mask: '*',
      validate: (input, answers) => {
        if (input !== answers.newPassword) return 'Passwords do not match';
        return true;
      },
    },
  ]);

  const spinner = ora('Updating password...').start();
  try {
    const mongo = new MongoService();
    await mongo.changePassword(username, answers.newPassword);
    spinner.succeed(chalk.green(`✓ Password updated for: ${username}`));
  } catch (err) {
    spinner.fail(chalk.red(`✗ ${err.message}`));
    process.exit(1);
  }
}

module.exports = { add, list, delete: deleteUser, pass: changePassword };
