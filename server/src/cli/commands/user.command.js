// server/src/cli/commands/user.command.js
// User Management — list, create, reset password, disable, enable

const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const Session = require('../../models/Session.model');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, text) => colors[color] + text + colors.reset;

async function show(rl, User) {
  if (!User) {
    console.log(c('red', '\n  ❌ Database not connected. Cannot manage users.\n'));
    return;
  }

  while (true) {
    console.clear();
    console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
    console.log(c('cyan', '║         User Management                  ║'));
    console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

    console.log('  [1] List Users');
    console.log('  [2] Create User');
    console.log('  [3] Reset Password');
    console.log('  [4] Disable User');
    console.log('  [5] Enable User');
    console.log('  [6] Back to Main Menu\n');

    const choice = await ask(rl, '  Choose: ');

    switch (choice.trim()) {
      case '1':
        await listUsers(User);
        break;
      case '2':
        await createUser(rl, User);
        break;
      case '3':
        await resetPassword(rl, User);
        break;
      case '4':
        await toggleUser(rl, User, false);
        break;
      case '5':
        await toggleUser(rl, User, true);
        break;
      case '6':
        return;
      default:
        console.log(c('red', '\n  ❌ Invalid option.\n'));
    }

    if (choice.trim() !== '6') {
      await ask(rl, c('dim', '\n  Press Enter to continue...'));
    }
  }
}

async function listUsers(User) {
  console.log(c('bright', '\n  👥 All Users\n'));

  const users = await User.find({})
    .select('username displayName role isActive accountStatus subscription.status subscription.plan subscription.expiryDate createdAt')
    .sort({ createdAt: -1 })
    .lean();

  if (users.length === 0) {
    console.log('  No users found.\n');
    return;
  }

  // Table header
  const header = `  ${'Username'.padEnd(16)} ${'Role'.padEnd(14)} ${'Status'.padEnd(12)} ${'Sub'.padEnd(8)} ${'Created'.padEnd(12)}`;
  console.log(c('dim', header));
  console.log(c('dim', '  ' + '-'.repeat(70)));

  for (const u of users) {
    const status = u.isActive ? c('green', 'active') : c('red', 'disabled');
    const sub = u.subscription?.status || c('gray', 'none');
    const created = (u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—').padEnd(12);
    console.log(
      `  ${u.username.padEnd(16)} ${u.role.padEnd(14)} ${status.padEnd(12)} ${String(sub).padEnd(8)} ${created}`
    );
  }
  console.log(c('dim', `\n  Total: ${users.length} users\n`));
}

async function createUser(rl, User) {
  console.log(c('bright', '\n  ✏️  Create New User\n'));

  const username = await ask(rl, '  Username: ');
  if (!username || username.trim().length < 3) {
    console.log(c('red', '  ❌ Username must be at least 3 characters.\n'));
    return;
  }

  const password = await ask(rl, '  Password (min 6 chars): ');
  if (!password || password.length < 6) {
    console.log(c('red', '  ❌ Password must be at least 6 characters.\n'));
    return;
  }

  console.log('\n  Allowed roles: member, manager, super_admin');
  const role = (await ask(rl, '  Role (default: member): ')) || 'member';
  const validRoles = ['member', 'manager', 'super_admin'];
  if (!validRoles.includes(role.trim().toLowerCase())) {
    console.log(c('red', `  ❌ Invalid role '${role}'. Must be one of: ${validRoles.join(', ')}\n`));
    return;
  }

  try {
    const user = await User.createUser(username.trim().toLowerCase(), password, role.trim().toLowerCase());
    console.log(c('green', `\n  ✅ User '${user.username}' created successfully. Role: ${user.role}\n`));
  } catch (err) {
    if (err.code === 11000) {
      console.log(c('red', `  ❌ Username '${username}' already exists.\n`));
    } else {
      console.log(c('red', `  ❌ Failed to create user: ${err.message}\n`));
    }
  }
}

async function resetPassword(rl, User) {
  console.log(c('bright', '\n  🔑 Reset Password\n'));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  const newPassword = await ask(rl, '  New Password (min 6 chars): ');
  if (!newPassword || newPassword.length < 6) {
    console.log(c('red', '  ❌ Password must be at least 6 characters.\n'));
    return;
  }

  user.passwordHash = await bcrypt.hash(newPassword, 12);
  await user.save();

  // Invalidate all sessions for this user
  await Session.updateMany(
    { userId: user._id, isActive: true },
    { $set: { isActive: false } }
  );

  console.log(c('green', `  ✅ Password reset for '${user.username}'. ${c('yellow', 'All sessions invalidated.')}\n`));
}

async function toggleUser(rl, User, enable) {
  const action = enable ? 'Enable' : 'Disable';
  const label = enable ? 'enabled' : 'disabled';
  console.log(c('bright', `\n  🚫 ${action} User\n`));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  if (user.isActive === enable) {
    console.log(c('yellow', `  ⚠️  User '${username}' is already ${label}.\n`));
    return;
  }

  user.isActive = enable;
  await user.save();

  if (!enable) {
    // Invalidate sessions when disabling
    await Session.updateMany(
      { userId: user._id, isActive: true },
      { $set: { isActive: false } }
    );
  }

  console.log(c('green', `  ✅ User '${username}' ${label}.\n`));
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

module.exports = { show };
