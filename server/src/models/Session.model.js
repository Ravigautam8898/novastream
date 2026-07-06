// server/src/models/Session.model.js
// Session model — tracks active JWT sessions

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  tokenHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  ip: { type: String },
  userAgent: { type: String },
  isActive: { type: Boolean, default: true, index: true },
  expiresAt: { type: Date, required: true },
}, {
  timestamps: true,
});

// ── Indexes ──
sessionSchema.index({ userId: 1, isActive: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL auto-delete

// ── Statics ──
sessionSchema.statics.createSession = async function (userId, token, ip, userAgent, expiresInDays = 7) {
  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // Deactivate any existing sessions for this user (single session policy)
  await this.updateMany(
    { userId, isActive: true },
    { $set: { isActive: false } }
  );

  return this.create({
    userId,
    tokenHash,
    ip,
    userAgent,
    isActive: true,
    expiresAt: new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000),
  });
};

sessionSchema.statics.findValidSession = async function (token) {
  const crypto = require('crypto');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

  // NOTE: No `.populate('userId')` here.
  // The `authenticate` middleware only needs to verify the session exists.
  // User data (id, username, role) is already in the JWT token payload.
  // Populating userId would load the FULL User document on EVERY request,
  // including passwordHash, loginHistory, watchHistory, watchlist — all
  // completely unnecessary for session validation. This was causing
  // 3-12 second delays on authenticated requests with remote MongoDB.
  return this.findOne({
    tokenHash,
    isActive: true,
    expiresAt: { $gt: new Date() },
  });
};

module.exports = mongoose.model('Session', sessionSchema);
