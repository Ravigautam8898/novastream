// server/src/models/Season.model.js
// Season model — belongs to a Content (series)

const mongoose = require('mongoose');

const seasonSchema = new mongoose.Schema({
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true,
    index: true,
  },
  tmdbId: { type: Number, sparse: true },

  seasonNumber: { type: Number, required: true },
  name: { type: String },
  overview: { type: String },

  posterPath: { type: String },
  airDate: { type: Date },

  episodeCount: { type: Number, default: 0 },

  // Custom metadata
  isActive: { type: Boolean, default: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ── Indexes ──
seasonSchema.index({ contentId: 1, seasonNumber: 1 }, { unique: true });
seasonSchema.index({ contentId: 1, isActive: 1 });

// ── Virtuals ──
seasonSchema.virtual('episodes', {
  ref: 'Episode',
  localField: '_id',
  foreignField: 'seasonId',
  options: { sort: { episodeNumber: 1 } },
});

module.exports = mongoose.model('Season', seasonSchema);
