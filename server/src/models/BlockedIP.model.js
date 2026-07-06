// server/src/models/BlockedIP.model.js
// Blocked IP model — tracks blocked IPs for abuse prevention

const mongoose = require('mongoose');

const blockedIPSchema = new mongoose.Schema({
  ip: {
    type: String,
    required: true,
    index: true,
  },
  reason: {
    type: String,
    enum: ['abuse', 'bruteforce', 'scraping', 'honeypot', 'manual', 'suspicious'],
    default: 'manual',
  },
  blockedBy: {
    type: String,
    enum: ['system', 'admin'],
    default: 'system',
  },
  blockedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null },  // null = permanent (TTL index defined below)
  attemptCount: { type: Number, default: 1 },
  isActive: { type: Boolean, default: true, index: true },

  // Optional notes
  notes: { type: String },
}, {
  timestamps: true,
});

// ── Indexes ──
blockedIPSchema.index({ ip: 1, isActive: 1 });
blockedIPSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-cleanup

// ── Statics ──
blockedIPSchema.statics.isBlocked = async function (ip) {
  const block = await this.findOne({
    ip,
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
  return !!block;
};

blockedIPSchema.statics.block = async function (ip, reason = 'manual', blockedBy = 'admin', durationHours = 24) {
  const existing = await this.findOne({
    ip,
    isActive: true,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });

  if (existing) {
    existing.attemptCount += 1;
    return existing.save();
  }

  const expiresAt = durationHours
    ? new Date(Date.now() + durationHours * 60 * 60 * 1000)
    : null;

  return this.create({
    ip,
    reason,
    blockedBy,
    blockedAt: new Date(),
    expiresAt,
    attemptCount: 1,
    isActive: true,
  });
};

blockedIPSchema.statics.unblock = async function (ip) {
  return this.updateMany(
    { ip, isActive: true },
    { $set: { isActive: false } }
  );
};

module.exports = mongoose.model('BlockedIP', blockedIPSchema);
