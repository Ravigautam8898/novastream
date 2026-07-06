/**
 * System service — OS-level server statistics.
 * Used by admin dashboard for health monitoring.
 */
const os = require('os');
const path = require('path');
const fs = require('fs');
const Session = require('../models/Session.model');
const BlockedIP = require('../models/BlockedIP.model');

class SystemService {
  /**
   * Get CPU usage percentage (average across all cores)
   */
  static getCpuUsage() {
    const cpus = os.cpus();
    const totalIdle = cpus.reduce((acc, cpu) => acc + cpu.times.idle, 0);
    const totalTick = cpus.reduce((acc, cpu) => {
      return acc + cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.idle + cpu.times.irq;
    }, 0);
    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    return {
      percent: Math.round((1 - idle / total) * 100),
      cores: cpus.length,
      model: cpus[0]?.model || 'Unknown',
    };
  }

  /**
   * Get memory usage details
   */
  static getMemoryInfo() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total: total,
      free: free,
      used: used,
      percent: Math.round((used / total) * 100),
      humanTotal: (total / 1024 / 1024 / 1024).toFixed(1) + ' GB',
      humanUsed: (used / 1024 / 1024 / 1024).toFixed(1) + ' GB',
    };
  }

  /**
   * Get disk usage for the project directory
   */
  static getDiskInfo() {
    try {
      const projectRoot = path.resolve(__dirname, '..', '..', '..');
      // Use os.tmpdir() as fallback — full disk stats require platform-specific tools
      const stats = fs.statSync(projectRoot);
      return {
        path: projectRoot,
        // Basic info available cross-platform
        available: 'N/A (requires platform-specific tools)',
      };
    } catch {
      return { path: 'Unknown', available: 'N/A' };
    }
  }

  /**
   * Get process information
   */
  static getProcessInfo() {
    const usage = process.memoryUsage();
    return {
      pid: process.pid,
      title: process.title,
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      uptime: process.uptime(),
      memory: {
        rss: usage.rss,
        heapTotal: usage.heapTotal,
        heapUsed: usage.heapUsed,
        external: usage.external,
        arrayBuffers: usage.arrayBuffers || 0,
      },
      cwd: process.cwd(),
      env: process.env.NODE_ENV || 'development',
    };
  }

  /**
   * Get MongoDB database stats
   * @param {import('mongoose').Connection} db - Mongoose connection
   */
  static async getDatabaseStats(db) {
    try {
      const admin = db.db.admin();
      const dbStats = await admin.command({ dbStats: 1 });
      const collections = await db.db.listCollections().toArray();

      const collectionStats = await Promise.all(
        collections.map(async (col) => {
          try {
            const stats = await db.db.collection(col.name).stats();
            return {
              name: col.name,
              count: stats.count || 0,
              size: stats.size || 0,
              avgObjSize: stats.avgObjSize || 0,
              indexes: stats.nindexes || 0,
            };
          } catch {
            return { name: col.name, count: 0, size: 0, avgObjSize: 0, indexes: 0 };
          }
        })
      );

      return {
        status: 'connected',
        version: db.version,
        dataSize: dbStats.dataSize,
        storageSize: dbStats.storageSize,
        indexes: dbStats.indexes,
        collections: collectionStats,
      };
    } catch (err) {
      return { status: 'error', message: err.message, collections: [] };
    }
  }

  /**
   * Get active sessions with user info
   * @param {import('mongoose').Model} User - User model
   */
  static async getActiveSessions(User) {
    const sessions = await Session.find({ isActive: true })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    // Enrich with usernames
    const userIds = [...new Set(sessions.map(s => s.userId?.toString()).filter(Boolean))];
    const users = await User.find({ _id: { $in: userIds } })
      .select('username')
      .lean();
    const userMap = {};
    users.forEach(u => { userMap[u._id.toString()] = u.username; });

    return sessions.map(s => ({
      _id: s._id,
      userId: s.userId,
      username: userMap[s.userId?.toString()] || 'Unknown',
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
    }));
  }

  /**
   * Get blocked IPs
   */
  static async getBlockedIPs() {
    return BlockedIP.find({ isActive: true })
      .sort({ blockedAt: -1 })
      .limit(100)
      .lean();
  }

  /**
   * Block an IP
   */
  static async blockIP(ip, reason = 'manual', blockedBy = 'admin') {
    const existing = await BlockedIP.findOne({ ip, isActive: true });
    if (existing) {
      throw Object.assign(new Error(`IP ${ip} is already blocked`), { statusCode: 409 });
    }

    return BlockedIP.create({
      ip,
      reason,
      blockedBy,
      blockedAt: new Date(),
      expiresAt: null, // permanent by default
      attemptCount: 0,
      isActive: true,
    });
  }

  /**
   * Unblock an IP by record ID
   */
  static async unblockIP(id) {
    const record = await BlockedIP.findByIdAndUpdate(id, { isActive: false }, { new: true });
    if (!record) {
      throw Object.assign(new Error('Blocked IP record not found'), { statusCode: 404 });
    }
    return record;
  }

  /**
   * Get safe operational config (no env variable names or values exposed)
   * Returns only non-sensitive metadata needed for health monitoring.
   */
  static getConfig() {
    return {
      nodeEnv: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      pid: process.pid,
      uptime: process.uptime(),
    };
  }
}

module.exports = SystemService;
