// cli/commands/server.commands.js
const ora = require('ora');
const chalk = require('chalk');
const Pm2Service = require('../services/pm2.service');
const MongoService = require('../services/mongo.service');
const serverDetector = require('../utils/server-detector');
const logger = require('../utils/logger');
const { loadEnv } = require('../utils/helpers');

const pm2 = new Pm2Service();

async function start() {
  loadEnv();
  const spinner = ora('Starting NovaStream server...').start();
  const result = pm2.smartStart();
  spinner.stop();

  if (result.success) {
    logger.success(result.message);
    if (result.manual) {
      logger.info('Server is running in this terminal. Use Ctrl+C to stop.');
    }
  } else if (result.alreadyRunning) {
    logger.warn(result.message);
    logger.info('Use "novactl status" to see running instances.');
    logger.info('Use "novactl stop" to stop them, then try again.');
  } else {
    logger.error(result.message);
    process.exit(1);
  }
}

async function stop() {
  const spinner = ora('Stopping NovaStream server(s)...').start();
  const result = pm2.smartStop();
  spinner.stop();

  if (result.killed > 0) {
    logger.success(result.message);
  } else {
    logger.info(result.message);
  }
}

async function restart() {
  loadEnv();
  const spinner = ora('Restarting NovaStream server...').start();
  const result = await pm2.smartRestart();
  spinner.stop();

  if (result.success) {
    logger.success(result.message);
  } else {
    logger.error(result.message);
    process.exit(1);
  }
}

async function status() {
  logger.title('NovaStream Server Status');
  logger.line();

  // 1. PM2 status
  const pm2Status = pm2.pm2Status();
  if (pm2Status.available) {
    if (pm2Status.running) {
      logger.success(`PM2: Managing '${pm2.appName}' process (running)`);
    } else {
      logger.info('PM2: Installed but not managing any novastream process');
    }
  } else {
    logger.info('PM2: Not installed (use direct node start)');
  }

  // 2. Port scan detection
  const detection = serverDetector.detectServers();
  const { servers, primaryPort, summary } = detection;

  if (servers.length === 0) {
    logger.empty();
    logger.error('Server is not running');
    logger.info(`Expected port: ${primaryPort} (configured in .env)`);
    return;
  }

  logger.empty();
  logger.success(summary);
  logger.line();

  for (const server of servers) {
    const isDefault = server.port === primaryPort;
    const label = isDefault ? ' (configured)' : '';

    console.log(`  ${chalk.cyan(`Port ${server.port}`)}${chalk.gray(label)}`);
    console.log(`    PID:       ${chalk.white(server.pid)}`);
    console.log(`    Process:   ${chalk.white(server.processName)}`);
    if (server.uptimeFormatted) {
      console.log(`    Uptime:    ${chalk.white(server.uptimeFormatted)}`);
    }
    if (server.memoryMB) {
      console.log(`    Memory:    ${chalk.white(`${server.memoryMB} MB`)}`);
    }
    if (server.cmdline) {
      // Show only the relevant part (script path and args)
      const cmdShort = server.cmdline.length > 100
        ? server.cmdline.slice(0, 100) + '...'
        : server.cmdline;
      console.log(`    Command:   ${chalk.gray(cmdShort)}`);
    }

    logger.line();
  }

  // Quick summary at the end
  if (servers.length > 1) {
    logger.warn(`${servers.length} server instances detected — only one should be running`);
    logger.info('Run "novactl stop" to stop all, then "novactl start" to start a single instance');
  }
}

async function uptime() {
  logger.title('NovaStream Server Uptime');
  logger.line();

  const detection = serverDetector.detectServers();

  if (detection.servers.length === 0) {
    logger.error('Server is not running');
    process.exit(1);
    return;
  }

  for (const server of detection.servers) {
    console.log(`  ${chalk.cyan(`Port ${server.port}`)}  ${chalk.gray('─')}  ${chalk.white(server.processName)} (PID ${server.pid})`);
    console.log(`    Uptime:    ${chalk.white(server.uptimeFormatted || 'N/A')}`);
    if (server.memoryMB) {
      console.log(`    Memory:    ${chalk.white(`${server.memoryMB} MB`)}`);
    }
    console.log('');
  }

  // Also show PM2 info if available
  const pm2Status = pm2.pm2Status();
  if (pm2Status.running) {
    logger.info('Managed by PM2 — use "novactl logs" to view logs');
  }
}

async function logs(options) {
  const lines = parseInt(options.lines, 10) || 50;
  const result = pm2.logs(lines);

  if (result.success) {
    console.log(result.output);
  } else {
    logger.warn('PM2 logs not available (server not started via PM2).');
    logger.info('To use PM2 for persistent logging, install it first:');
    logger.info('  npm install -g pm2');
    logger.info('Then use "novactl start" to launch with PM2 management.');
    process.exit(1);
  }
}

async function health() {
  loadEnv();
  logger.title('NovaStream Health Check');
  logger.line();

  // 1. Check server processes via port scan
  const detection = serverDetector.detectServers();
  const { servers, primaryPort } = detection;

  if (servers.length > 0) {
    logger.success(`Server process: Running (${servers.length} instance(s) on ${servers.map(s => s.port).join(', ')})`);
    for (const s of servers) {
      logger.data(`  Port ${s.port}`, `PID ${s.pid}, ${s.uptimeFormatted || 'N/A'} uptime`);
    }
  } else {
    logger.warn('Server process: Not detected (may be offline or on a non-standard port)');
  }

  // PM2 status
  const pm2Status = pm2.pm2Status();
  if (pm2Status.available && pm2Status.running) {
    logger.info('PM2: Managing server process');
  }

  logger.line();

  // 2. Check MongoDB connection
  try {
    const mongo = new MongoService();
    const spinner = ora('Testing MongoDB connection...').start();
    const alive = await mongo.ping();
    spinner.stop();
    if (alive) {
      logger.success('MongoDB: Connected');

      const stats = await mongo.getDbStats();
      const userCount = await mongo.getUserCount();
      const blockedCount = await mongo.getBlockedIPCount();
      logger.line();
      logger.data('Collections', stats.collections);
      logger.data('Total Documents', stats.objects.toLocaleString());
      logger.data('Database Size', `${(stats.dataSize / 1024 / 1024).toFixed(1)} MB`);
      logger.data('Storage Used', `${(stats.storageSize / 1024 / 1024).toFixed(1)} MB`);
      logger.data('Registered Users', userCount);
      logger.data('Blocked IPs', blockedCount);
    } else {
      logger.error('MongoDB: Connection failed');
    }
  } catch (err) {
    logger.error(`MongoDB: ${err.message}`);
  }

  // 3. Check HTTP endpoint on all detected + configured ports
  const http = require('http');
  const portsToCheck = [...new Set([primaryPort, ...servers.map(s => s.port)])];

  logger.line();
  for (const port of portsToCheck) {
    try {
      await new Promise((resolve) => {
        const req = http.get(`http://localhost:${port}/api/health`, { timeout: 3000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => {
            try {
              const json = JSON.parse(data);
              if (json.success) {
                logger.success(`HTTP (port ${port}): Online (${json.data?.environment || 'unknown'} mode)`);
              } else {
                logger.warn(`HTTP (port ${port}): Responding but unhealthy`);
              }
            } catch {
              logger.warn(`HTTP (port ${port}): Responding (non-JSON response)`);
            }
            resolve();
          });
        });
        req.on('error', () => {
          logger.warn(`HTTP (port ${port}): Not responding`);
          resolve();
        });
        req.on('timeout', () => {
          req.destroy();
          logger.warn(`HTTP (port ${port}): Timed out`);
          resolve();
        });
      });
    } catch {
      logger.warn(`HTTP (port ${port}): Could not connect`);
    }
  }

  // 4. Check disk usage
  const fs = require('fs');
  const path = require('path');
  const { findProjectRoot } = require('../utils/helpers');
  const root = findProjectRoot();

  logger.line();
  const mediaDir = path.join(root, 'media');
  const thumbsDir = path.join(root, 'thumbnails');

  const getDirSize = (dir) => {
    try {
      if (!fs.existsSync(dir)) return '0 B';

      const walkDir = (dirPath) => {
        let total = 0;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            total += walkDir(fullPath);
          } else if (entry.isFile()) {
            total += fs.statSync(fullPath).size;
          }
        }
        return total;
      };

      const bytes = walkDir(dir);
      const mb = bytes / 1024 / 1024;
      if (mb > 1) return `${mb.toFixed(1)} MB`;
      const kb = bytes / 1024;
      return kb > 1 ? `${kb.toFixed(1)} KB` : `${bytes} B`;
    } catch {
      return 'Unknown';
    }
  };

  logger.data('Media Storage', getDirSize(mediaDir));
  logger.data('Thumbnails', getDirSize(thumbsDir));
  logger.empty();
}

module.exports = { start, stop, restart, status, uptime, logs, health };
