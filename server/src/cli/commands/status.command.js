// server/src/cli/commands/status.command.js
// System Status — server version, DB, users, content, memory, storage

const os = require('os');
const path = require('path');
const fs = require('fs');
const SystemService = require('../../services/system.service');
const Content = require('../../models/Content.model');

const colors = {
  reset: '\x1b[0m', bright: '\x1b[1m', dim: '\x1b[2m',
  red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m',
  blue: '\x1b[34m', cyan: '\x1b[36m', gray: '\x1b[90m',
};
const c = (color, text) => colors[color] + text + colors.reset;

async function show(rl, User, mongoose) {
  console.clear();
  console.log(c('cyan', '\n╔══════════════════════════════════════════╗'));
  console.log(c('cyan', '║           System Status                  ║'));
  console.log(c('cyan', '╚══════════════════════════════════════════╝\n'));

  try {
    // Server info
    const pkg = require(path.resolve(__dirname, '..', '..', '..', 'package.json'));
    console.log(c('bright', '  📦 Server'));
    console.log(`     Version:     ${pkg.version}`);
    console.log(`     Node.js:     ${process.version}`);
    console.log(`     Platform:    ${process.platform} ${process.arch}`);
    console.log(`     Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`     PID:         ${process.pid}`);
    console.log(`     Uptime:      ${formatUptime(process.uptime())}`);
    console.log('');

    // Database
    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    console.log(c('bright', '  🗄️  Database'));
    console.log(`     Status:      ${dbState === 1 ? c('green', 'Connected') : c('red', dbStateMap[dbState] || 'Unknown')}`);
    if (dbState === 1) {
      const dbInfo = await SystemService.getDatabaseStats(mongoose.connection);
      console.log(`     MongoDB:     ${dbInfo.version || 'Unknown'}`);
      console.log(`     Collections: ${dbInfo.collections?.length || 0}`);
      const totalDocs = dbInfo.collections?.reduce((sum, col) => sum + (col.count || 0), 0) || 0;
      console.log(`     Documents:   ${totalDocs.toLocaleString()}`);
      console.log(`     Data Size:   ${formatBytes(dbInfo.dataSize || 0)}`);
    }
    console.log('');

    // Users
    if (User && dbState === 1) {
      const totalUsers = await User.countDocuments();
      const activeUsers = await User.countDocuments({ isActive: true });
      const admins = await User.countDocuments({ role: { $in: ['super_admin', 'admin'] } });
      const managers = await User.countDocuments({ role: 'manager' });
      const members = await User.countDocuments({ role: 'member' });
      console.log(c('bright', '  👥 Users'));
      console.log(`     Total:       ${totalUsers}`);
      console.log(`     Active:      ${activeUsers}`);
      console.log(`     Admins:      ${admins}`);
      console.log(`     Managers:    ${managers}`);
      console.log(`     Members:     ${members}`);
      console.log('');

      // Content
      const contentCount = await Content.countDocuments();
      const movies = await Content.countDocuments({ contentType: 'movie' });
      const series = await Content.countDocuments({ contentType: 'series' });
      console.log(c('bright', '  🎬 Content'));
      console.log(`     Total:       ${contentCount}`);
      console.log(`     Movies:      ${movies}`);
      console.log(`     Series:      ${series}`);
      console.log('');
    }

    // Memory
    const mem = SystemService.getMemoryInfo();
    console.log(c('bright', '  💾 Memory'));
    console.log(`     Used:        ${mem.humanUsed} (${mem.percent}%)`);
    console.log(`     Total:       ${mem.humanTotal}`);
    console.log('');

    // Process memory
    const procMem = process.memoryUsage();
    console.log(c('bright', '  ⚙️  Process Memory'));
    console.log(`     RSS:         ${formatBytes(procMem.rss)}`);
    console.log(`     Heap Used:   ${formatBytes(procMem.heapUsed)}`);
    console.log(`     Heap Total:  ${formatBytes(procMem.heapTotal)}`);
    console.log('');

    // Disk
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    try {
      const disks = fs.statSync(projectRoot);
      console.log(c('bright', '  💿 Storage'));
      console.log(`     Project:     ${projectRoot}`);
      console.log('');
    } catch {
      console.log('');
    }

    // Active Sessions
    if (dbState === 1) {
      const sessions = await SystemService.getActiveSessions(User);
      console.log(c('bright', '  🔑 Active Sessions'));
      console.log(`     Count:       ${sessions.length}`);
      console.log('');
    }

  } catch (err) {
    console.log(c('red', `  ❌ Error: ${err.message}`));
  }
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  parts.push(`${s}s`);
  return parts.join(' ');
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

module.exports = { show };
