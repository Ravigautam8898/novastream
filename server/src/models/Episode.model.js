// server/src/models/Episode.model.js
// Episode model — belongs to a Season, contains HLS stream info

const mongoose = require('mongoose');

const streamSchema = new mongoose.Schema({
  quality: {
    type: String,
    required: true,
    enum: ['480p', '720p', '1080p', '4K'],
  },
  filePath: { type: String },           // Path to the HLS directory
  playlistUrl: { type: String },        // URL to master.m3u8
  bitrate: { type: Number },            // e.g. 1500000 for 1.5 Mbps
  resolution: { type: String },         // e.g. "854x480"
  fileSize: { type: Number },           // Total bytes
  isActive: { type: Boolean, default: true },
}, { _id: false });

const subtitleSchema = new mongoose.Schema({
  language: { type: String, required: true },
  label: { type: String },
  url: { type: String },
  isDefault: { type: Boolean, default: false },
}, { _id: false });

const episodeSchema = new mongoose.Schema({
  seasonId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Season',
    required: true,
    index: true,
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Content',
    required: true,
    index: true,
  },
  tmdbId: { type: Number, sparse: true },

  episodeNumber: { type: Number, required: true },
  absoluteNumber: { type: Number },        // Overall episode number across all seasons
  name: { type: String, required: true },
  overview: { type: String },

  // Images
  stillPath: { type: String },
  thumbnailPath: { type: String },

  // Dates
  airDate: { type: Date },

  // Media Info
  runtime: { type: Number },               // In minutes
  voteAverage: { type: Number, default: 0 },
  voteCount: { type: Number, default: 0 },

  // Streaming
  streams: [streamSchema],                 // HLS quality variants
  subtitles: [subtitleSchema],
  downloadEnabled: { type: Boolean, default: false },

  // Watch progress (stored per-episode for quick resume)
  defaultQuality: {
    type: String,
    enum: ['480p', '720p', '1080p', '4K', 'auto'],
    default: 'auto',
  },

  // Status
  isActive: { type: Boolean, default: true, index: true },
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ── Indexes ──
episodeSchema.index({ seasonId: 1, episodeNumber: 1 }, { unique: true });
episodeSchema.index({ contentId: 1, episodeNumber: 1 });
episodeSchema.index({ contentId: 1, isActive: 1, episodeNumber: 1 });

// ── Virtuals ──
episodeSchema.virtual('stillUrl').get(function () {
  if (!this.stillPath) return null;
  return this.stillPath.startsWith('http')
    ? this.stillPath
    : `https://image.tmdb.org/t/p/w500${this.stillPath}`;
});

episodeSchema.virtual('duration').get(function () {
  return this.runtime ? `${this.runtime} min` : null;
});

module.exports = mongoose.model('Episode', episodeSchema);
