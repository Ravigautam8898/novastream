// cli/services/mongo.service.js
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const { getMongoUri } = require('../utils/helpers');
const logger = require('../utils/logger');

class MongoService {
  constructor() {
    this.uri = getMongoUri();
    if (!this.uri) {
      throw new Error(
        'MONGODB_URI not configured.\n' +
        '  Make sure .env file exists at project root with MONGODB_URI set.'
      );
    }
  }

  async connect() {
    if (this.client) return this.client;
    this.client = new MongoClient(this.uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
    });
    await this.client.connect();
    return this.client;
  }

  async disconnect() {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }

  // ── User Management ──

  async createUser(username, password, role = 'member') {
    const db = (await this.connect()).db();
    const existing = await db.collection('users').findOne({ username });
    if (existing) {
      throw new Error(`User '${username}' already exists`);
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();

    await db.collection('users').insertOne({
      username,
      passwordHash,
      displayName: username,
      role,
      isActive: true,
      createdBy: null,
      lastLoginAt: null,
      lastLoginIp: null,
      loginHistory: [],
      createdAt: now,
      updatedAt: now,
    });

    return { username, role };
  }

  async listUsers() {
    const db = (await this.connect()).db();
    return db.collection('users')
      .find(
        {},
        {
          projection: {
            username: 1,
            role: 1,
            isActive: 1,
            displayName: 1,
            lastLoginAt: 1,
            createdAt: 1,
          },
        }
      )
      .sort({ createdAt: -1 })
      .toArray();
  }

  async deleteUser(username) {
    const db = (await this.connect()).db();
    const result = await db.collection('users').deleteOne({ username });
    if (result.deletedCount === 0) {
      throw new Error(`User '${username}' not found`);
    }
    return true;
  }

  async changePassword(username, newPassword) {
    const db = (await this.connect()).db();
    const user = await db.collection('users').findOne({ username });
    if (!user) {
      throw new Error(`User '${username}' not found`);
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await db.collection('users').updateOne(
      { username },
      { $set: { passwordHash, updatedAt: new Date() } }
    );
    return true;
  }

  async getUserCount() {
    const db = (await this.connect()).db();
    return db.collection('users').countDocuments();
  }

  // ── IP Management ──

  async blockIP(ip, reason = 'manual', blockedBy = 'admin', durationHours = 24) {
    const db = (await this.connect()).db();
    const existing = await db.collection('blocked_ips').findOne({
      ip,
      isActive: true,
      $or: [
        { expiresAt: null },
        { expiresAt: { $gt: new Date() } },
      ],
    });

    if (existing) {
      throw new Error(`IP '${ip}' is already blocked`);
    }

    const now = new Date();
    const expiresAt = durationHours
      ? new Date(now.getTime() + durationHours * 60 * 60 * 1000)
      : null;

    await db.collection('blocked_ips').insertOne({
      ip,
      reason,
      blockedBy,
      blockedAt: now,
      expiresAt,
      attemptCount: 0,
      isActive: true,
    });

    return { ip, reason, expiresAt };
  }

  async unblockIP(ip) {
    const db = (await this.connect()).db();
    const result = await db.collection('blocked_ips').updateOne(
      { ip, isActive: true },
      { $set: { isActive: false } }
    );

    if (result.matchedCount === 0) {
      throw new Error(`IP '${ip}' is not currently blocked`);
    }
    return true;
  }

  async listBlockedIPs() {
    const db = (await this.connect()).db();
    return db.collection('blocked_ips')
      .find(
        { isActive: true },
        {
          projection: {
            ip: 1,
            reason: 1,
            blockedBy: 1,
            blockedAt: 1,
            expiresAt: 1,
            attemptCount: 1,
          },
        }
      )
      .sort({ blockedAt: -1 })
      .toArray();
  }

  async getBlockedIPCount() {
    const db = (await this.connect()).db();
    return db.collection('blocked_ips').countDocuments({ isActive: true });
  }

  // ── Health ──

  async ping() {
    const db = (await this.connect()).db();
    await db.admin().ping();
    return true;
  }

  async getDbStats() {
    const db = (await this.connect()).db();
    const stats = await db.stats();
    return {
      collections: stats.collections,
      objects: stats.objects,
      dataSize: stats.dataSize,
      storageSize: stats.storageSize,
      indexes: stats.indexes,
      indexSize: stats.indexSize,
    };
  }
}

module.exports = MongoService;
