// server/src/routes/health.routes.js
// Health check endpoints
//   GET /api/health         → Quick server status JSON (replaces inline handler in routes/index.js)
//   GET /api/health/simple  → Returns "OK" (for uptime monitoring)
//   GET /api/health/full    → Returns full health details

const { Router } = require('express');
const path = require('path');
const config = require('../config/env');
const mongoose = require('mongoose');
const SystemService = require('../services/system.service');
const ApiResponse = require('../utils/ApiResponse');

// Import reconnect state from database module
const { reconnectState } = require('../config/database');

const router = Router();

/**
 * Quick health check — returns server status JSON (PPR-007: includes DB state).
 * Includes database connection state, last disconnect info, and retry status.
 */
router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStateLabels = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  const dbConnected = dbState === 1;

  ApiResponse.success(res, {
    status: dbConnected ? 'ok' : 'degraded',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    environment: config.server.nodeEnv,
    database: {
      status: dbStateLabels[dbState] || 'unknown',
      connected: dbConnected,
      lastDisconnect: reconnectState.lastDisconnect?.toISOString() || null,
      lastReconnect: reconnectState.lastReconnect?.toISOString() || null,
      retryAttempt: reconnectState.retryAttempt,
      isReconnecting: reconnectState.isReconnecting,
    },
  });
});

/**
 * Simple health check — returns plain "OK" with 200 status (PPR-007: only when DB is connected).
 * Use this for load balancers / uptime monitoring (e.g. UptimeRobot, Pingdom).
 * No JSON parsing needed — minimal overhead.
 *
 * Returns 503 Service Unavailable if the database is not connected,
 * so monitoring tools can distinguish a running-but-broken server from a healthy one.
 */
router.get('/simple', (req, res) => {
  const dbState = mongoose.connection.readyState;
  if (dbState === 1) {
    res.status(200).type('text/plain').send('OK');
  } else {
    res.status(503).type('text/plain').send('DB_DISCONNECTED');
  }
});

/**
 * Full health check — returns detailed system health information.
 * Checks: server, database, storage, memory, uptime, version.
 */
router.get('/full', async (req, res) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStateMap = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
    const isDBConnected = dbState === 1;

    const memInfo = SystemService.getMemoryInfo();
    const cpuInfo = SystemService.getCpuUsage();
    const processInfo = SystemService.getProcessInfo();

    let dbStats = null;
    if (isDBConnected) {
      try {
        dbStats = await SystemService.getDatabaseStats(mongoose.connection);
      } catch {
        dbStats = { status: 'error', message: 'Failed to query database stats' };
      }
    }

    // Disk check for uploads and project directories
    const uploadsDir = path.resolve(__dirname, '..', '..', 'uploads');
    const fs = require('fs');
    let storageInfo = { status: 'unknown' };
    try {
      if (fs.existsSync(uploadsDir)) {
        const uploadsSize = getDirSize(uploadsDir);
        storageInfo = {
          status: 'ok',
          uploadsPath: uploadsDir,
          uploadsSize: formatBytes(uploadsSize),
        };
      } else {
        storageInfo = { status: 'ok', uploadsPath: uploadsDir, note: 'Uploads directory does not exist yet' };
      }
    } catch {
      storageInfo = { status: 'error', message: 'Could not read storage info' };
    }

    res.json({
      server: true,
      version: require(path.resolve(__dirname, '..', '..', 'package.json')).version,
      uptime: process.uptime(),
      uptimeHuman: formatUptime(process.uptime()),
      timestamp: new Date().toISOString(),
      environment: config.server.nodeEnv,
      nodeVersion: process.version,
      platform: `${process.platform} ${process.arch}`,
      database: {
        status: dbStateMap[dbState] || 'unknown',
        connected: isDBConnected,
        lastDisconnect: reconnectState.lastDisconnect?.toISOString() || null,
        lastReconnect: reconnectState.lastReconnect?.toISOString() || null,
        retryAttempt: reconnectState.retryAttempt,
        isReconnecting: reconnectState.isReconnecting,
        version: dbStats?.version || null,
        collections: dbStats?.collections?.length || 0,
        dataSize: dbStats?.dataSize ? formatBytes(dbStats.dataSize) : null,
        storageSize: dbStats?.storageSize ? formatBytes(dbStats.storageSize) : null,
      },
      storage: storageInfo,
      memory: {
        total: memInfo.humanTotal,
        used: memInfo.humanUsed,
        percent: memInfo.percent,
        heapUsed: formatBytes(processInfo.memory.heapUsed),
        heapTotal: formatBytes(processInfo.memory.heapTotal),
        rss: formatBytes(processInfo.memory.rss),
      },
      cpu: {
        percent: cpuInfo.percent,
        cores: cpuInfo.cores,
        model: cpuInfo.model,
      },
      process: {
        pid: processInfo.pid,
        uptime: formatUptime(processInfo.uptime),
        memory: {
          rss: formatBytes(processInfo.memory.rss),
          heapUsed: formatBytes(processInfo.memory.heapUsed),
          heapTotal: formatBytes(processInfo.memory.heapTotal),
        },
      },
    });
  } catch (err) {
    res.status(500).json({
      server: true,
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * Recursively calculate directory size
 */
function getDirSize(dirPath) {
  const fs = require('fs');
  let total = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isFile()) {
      total += fs.statSync(fullPath).size;
    } else if (entry.isDirectory()) {
      total += getDirSize(fullPath);
    }
  }
  return total;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + units[i];
}

function formatUptime(seconds) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts = [];
  if (d > 0) parts.push(d + 'd');
  if (h > 0) parts.push(h + 'h');
  if (m > 0) parts.push(m + 'm');
  parts.push(s + 's');
  return parts.join(' ');
}

module.exports = router;
