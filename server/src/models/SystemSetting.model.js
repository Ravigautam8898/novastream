// server/src/models/SystemSetting.model.js
// Centralized system settings — key-value store for all configurable platform parameters.
//
// Architecture reference: SUBSCRIPTION_SYSTEM_v3.md §13
//
// Settings are cached on load (5-min TTL) and can be updated at runtime
// by Super Admin. Every setting change is recorded in the AuditLog.

const mongoose = require('mongoose');

const systemSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },
  description: {
    type: String,
    default: '',
    maxlength: 500,
  },
  type: {
    type: String,
    enum: ['string', 'number', 'boolean', 'object', 'array'],
    default: 'string',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, {
  timestamps: true,
});

// ── Statics ──

/**
 * Get a setting value by key.
 * @param {string} key - Setting key (e.g. 'defaultTrialDays')
 * @param {*} [defaultValue=null] - Default value if key not found
 * @returns {Promise<*>} Setting value or default
 */
systemSettingSchema.statics.get = async function (key, defaultValue = null) {
  const setting = await this.findOne({ key }).lean();
  return setting ? setting.value : defaultValue;
};

/**
 * Set (create or update) a setting value.
 * @param {string} key - Setting key
 * @param {*} value - Setting value
 * @param {object} [options]
 * @param {string} [options.description] - Description of the setting
 * @param {string} [options.type] - Value type
 * @param {string} [options.updatedBy] - User ID who updated
 * @returns {Promise<Document>} Updated setting document
 */
systemSettingSchema.statics.set = async function (key, value, options = {}) {
  return this.findOneAndUpdate(
    { key },
    {
      $set: {
        value,
        type: options.type || typeof value,
        description: options.description || '',
        updatedBy: options.updatedBy || null,
      },
    },
    { upsert: true, new: true }
  );
};

/**
 * Get all settings as a flat key-value object.
 * @returns {Promise<object>} { key: value, ... }
 */
systemSettingSchema.statics.getAll = async function () {
  const settings = await this.find().sort({ key: 1 }).lean();
  const result = {};
  for (const s of settings) {
    result[s.key] = s.value;
  }
  return result;
};

/**
 * Delete a setting by key.
 * @param {string} key - Setting key
 * @returns {Promise<object>} Deletion result
 */
systemSettingSchema.statics.delete = async function (key) {
  return this.deleteOne({ key });
};

module.exports = mongoose.model('SystemSetting', systemSettingSchema);
