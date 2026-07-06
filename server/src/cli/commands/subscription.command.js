// server/src/cli/commands/subscription.command.js
// Subscription Management — view, assign plan, renew, remove
// Uses existing SubscriptionService methods — NO duplicate logic.

const SubscriptionService = require('../../services/subscription.service');
const { getPlan, getPlans } = require('../../config/plans');
const ApiError = require('../../utils/ApiError');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, text) => colors[color] + text + colors.reset;

async function show(rl, User, SubscriptionPlan) {
  if (!User) {
    console.log(c('red', '\n  ❌ Database not connected.\n'));
    return;
  }

  while (true) {
    console.clear();
    console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
    console.log(c('cyan', '║      Subscription Management             ║'));
    console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

    console.log('  [1] View Subscription (by username)');
    console.log('  [2] Assign Subscription Plan');
    console.log('  [3] Renew Subscription');
    console.log('  [4] Remove Subscription');
    console.log('  [5] Back to Main Menu\n');

    const choice = await ask(rl, '  Choose: ');

    switch (choice.trim()) {
      case '1':
        await viewSubscription(rl, User);
        break;
      case '2':
        await assignPlan(rl, User);
        break;
      case '3':
        await renewSubscription(rl, User);
        break;
      case '4':
        await removeSubscription(rl, User);
        break;
      case '5':
        return;
      default:
        console.log(c('red', '\n  ❌ Invalid option.\n'));
    }

    if (choice.trim() !== '5') {
      await ask(rl, c('dim', '\n  Press Enter to continue...'));
    }
  }
}

async function viewSubscription(rl, User) {
  console.log(c('bright', '\n  📋 View Subscription\n'));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  const status = await SubscriptionService.getStatus(user._id.toString());
  if (!status || !status.exists) {
    console.log(c('yellow', `  ⚠️  No subscription for '${username}'.\n`));
    if (status?.pendingPlan) {
      console.log(c('blue', '  🔄 Pending upgrade:'));
      console.log(`     Plan:     ${status.pendingPlan.planLabel}`);
      console.log(`     Starts:   ${new Date(status.pendingPlan.startDate).toLocaleString()}`);
    }
    return;
  }

  console.log(c('bright', `\n  ${user.username}'s Subscription\n`));
  console.log(`     Plan:          ${status.planLabel || status.plan}`);
  console.log(`     Status:        ${statusLabel(status.displayStatus || status.status)}`);
  console.log(`     Expiry:        ${status.expiryDate ? new Date(status.expiryDate).toLocaleDateString() : 'N/A'}`);
  if (status.daysRemaining !== null) {
    console.log(`     Days Remaining: ${status.daysRemaining > 0 ? status.daysRemaining + ' days' : c('red', 'Expired')}`);
  }
  console.log(`     Version:       ${status.version || 0}`);
  console.log(`     Renewals:      ${status.renewalCount || 0}`);
  console.log(`     Last Renewed:  ${status.lastRenewedAt ? new Date(status.lastRenewedAt).toLocaleString() : 'Never'}`);
  if (status.notes) {
    console.log(`     Notes:         ${status.notes}`);
  }
  if (status.pendingPlan) {
    console.log(`\n  ${c('blue', '🔄 Pending Upgrade:')}`);
    console.log(`     To Plan:  ${status.pendingPlan.planLabel}`);
    console.log(`     Starts:   ${new Date(status.pendingPlan.startDate).toLocaleString()}`);
  }
  console.log('');
}

async function assignPlan(rl, User) {
  console.log(c('bright', '\n  💳 Assign Subscription Plan\n'));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  // Show available plans
  const plans = getPlans().filter(p => p.isActive);
  console.log(c('bright', '\n  Available Plans:\n'));
  for (const p of plans) {
    console.log(`     ${p.id.padEnd(10)} ${p.label.padEnd(15)} ${p.durationDays ? p.durationDays + ' days' : 'Custom'.padEnd(10)}`);
  }
  console.log('');

  const planId = (await ask(rl, `  Plan ID (e.g. 30d, 90d, 365d): `)).trim();
  if (!planId) return;

  const plan = getPlan(planId);
  if (!plan || !plan.isActive) {
    console.log(c('red', `  ❌ Invalid plan: '${planId}'.\n`));
    return;
  }

  let customDays = null;
  if (planId === 'custom') {
    const days = await ask(rl, '  Custom duration (days): ');
    customDays = parseInt(days, 10);
    if (!customDays || customDays < 1 || customDays > 3650) {
      console.log(c('red', '  ❌ Duration must be between 1 and 3650 days.\n'));
      return;
    }
  }

  try {
    // We need an actor user — use the first super_admin as fallback
    const adminUser = await User.findOne({ role: 'super_admin', isActive: true }).lean();
    const actorId = adminUser?._id?.toString() || user._id.toString();

    await SubscriptionService.create(
      user._id.toString(),
      planId,
      {
        customDurationDays: customDays,
        reason: 'CLI assignment',
        source: 'cli',
        actorUserId: actorId,
      }
    );
    console.log(c('green', `\n  ✅ Subscription '${planId}' assigned to '${username}'.\n`));
  } catch (err) {
    console.log(c('red', `  ❌ ${err.message}\n`));
  }
}

async function renewSubscription(rl, User) {
  console.log(c('bright', '\n  🔄 Renew Subscription\n'));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  if (!user.subscription || !user.subscription.status) {
    console.log(c('yellow', `  ⚠️  User '${username}' has no subscription. Use Assign Plan instead.\n`));
    return;
  }

  const planId = (await ask(rl, `  Plan ID to renew with (default: ${user.subscription.plan}): `)).trim() || user.subscription.plan;

  const plan = getPlan(planId);
  if (!plan || !plan.isActive) {
    console.log(c('red', `  ❌ Invalid plan: '${planId}'.\n`));
    return;
  }

  try {
    const adminUser = await User.findOne({ role: 'super_admin', isActive: true }).lean();
    const actorId = adminUser?._id?.toString() || user._id.toString();

    await SubscriptionService.renew(
      user._id.toString(),
      planId,
      {
        reason: 'CLI renewal',
        source: 'cli',
        actorUserId: actorId,
      }
    );
    console.log(c('green', `\n  ✅ Subscription renewed for '${username}' with plan '${planId}'.\n`));
  } catch (err) {
    console.log(c('red', `  ❌ ${err.message}\n`));
  }
}

async function removeSubscription(rl, User) {
  console.log(c('bright', '\n  🗑️  Remove Subscription\n'));

  const username = await ask(rl, '  Username: ');
  if (!username) return;

  const user = await User.findByUsername(username.trim());
  if (!user) {
    console.log(c('red', `  ❌ User '${username}' not found.\n`));
    return;
  }

  if (!user.subscription || !user.subscription.status) {
    console.log(c('yellow', `  ⚠️  User '${username}' has no subscription.\n`));
    return;
  }

  const confirm = await ask(rl, c('red', `  ⚠️  Remove subscription for '${username}'? (yes/no): `));
  if (confirm.trim().toLowerCase() !== 'yes') {
    console.log(c('yellow', '  Cancelled.\n'));
    return;
  }

  try {
    const adminUser = await User.findOne({ role: 'super_admin', isActive: true }).lean();
    const actorId = adminUser?._id?.toString() || user._id.toString();

    await SubscriptionService.deactivate(
      user._id.toString(),
      {
        reason: 'CLI removal',
        source: 'cli',
        actorUserId: actorId,
      }
    );
    console.log(c('green', `  ✅ Subscription removed for '${username}'.\n`));
  } catch (err) {
    console.log(c('red', `  ❌ ${err.message}\n`));
  }
}

function statusLabel(status) {
  const map = {
    active: c('green', 'Active'),
    trial: c('blue', 'Trial'),
    expired: c('red', 'Expired'),
    suspended: c('yellow', 'Suspended'),
    disabled: c('gray', 'Disabled'),
    pending_upgrade: c('blue', 'Pending Upgrade'),
    none: c('gray', 'None'),
  };
  return map[status] || status;
}

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

module.exports = { show };
