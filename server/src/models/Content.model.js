// server/src/models/Content.model.js
// Content model — stores both Movies and Series

const mongoose = require('mongoose');
const { getPosterUrl, getBackdropUrl } = require('../utils/tmdb-images');

const castMemberSchema = new mongoose.Schema({
  tmdbId: { type: Number },
  name: { type: String, required: true },
  character: { type: String },
  profilePath: { type: String },
  order: { type: Number },
}, { _id: false });

const genreSchema = new mongoose.Schema({
  id: { type: Number },
  name: { type: String },
}, { _id: false });

const contentSchema = new mongoose.Schema({
  // Identifiers
  tmdbId: { type: Number, unique: true, sparse: true },
  slug: { type: String, unique: true, required: true, index: true },

  // Titles & Descriptions
  title: { type: String, required: true, index: true },
  originalTitle: { type: String },
  tagline: { type: String },
  overview: { type: String },

  // Type
  contentType: {
    type: String,
    required: true,
    enum: ['movie', 'series'],
    index: true,
  },

  // Images
  posterPath: { type: String },
  backdropPath: { type: String },
  thumbnailPath: { type: String },
  logoPath: { type: String },

  // Classifications
  genre: { type: String },                        // Primary genre
  genres: [genreSchema],                          // Full genre array
  categories: [{ type: String }],                 // e.g. Hollywood, Bollywood, Korean
  tags: [{ type: String }],
  contentRating: { type: String },                // PG-13, R, TV-MA, etc.
  languages: [{ type: String }],

  // Dates
  releaseDate: { type: Date },
  firstAirDate: { type: Date },
  lastAirDate: { type: Date },

  // Media Info
  runtime: { type: Number },                           // In minutes
  numberOfSeasons: { type: Number, default: 0 },
  numberOfEpisodes: { type: Number, default: 0 },

  // Ratings
  voteAverage: { type: Number, default: 0 },
  voteCount: { type: Number, default: 0 },
  popularity: { type: Number, default: 0 },

  // Engagement
  viewCount: { type: Number, default: 0, index: true },
  likeCount: { type: Number, default: 0 },

  // Status Flags
  isActive: { type: Boolean, default: true, index: true },
  isFeatured: { type: Boolean, default: false, index: true },
  isPinned: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },

  // External Source (for proxied streaming from external providers)
  // Legacy — kept for backward compatibility until C3 migration
  sourceId: { type: String, index: true },   // External content ID (e.g., from primary source)
  sourceSite: { type: String },              // Source identifier for multi-source support

  // Metadata Sources (Track C5 — replaces reliance on tmdbId alone)
  // Maps identity provider names to their IDs and sync status.
  // Enables multi-source identity without adding top-level fields for each provider.
  // tmdbId/imdbId top-level fields remain for backward compatibility.
  metadataSources: {
    type: Map,
    of: new mongoose.Schema({
      id: { type: String, required: true },  // Provider's content ID (stringified)
      lastSync: { type: Date, default: Date.now },  // When metadata was last synced
    }, { _id: false }),
    default: {},
  },

  // External Links
  homepage: { type: String },
  imdbId: { type: String },

  // Provider Mappings (Track C2 — replaces legacy sourceId/sourceSite)
  // Allows multiple streaming providers per content item with confidence scoring.
  providers: [{
    providerName: { type: String, required: true },       // 'yupflix' | 'castletv'
    providerContentId: { type: String, required: true },   // Provider's internal ID
    confidenceScore: { type: Number, default: 1.0, min: 0, max: 1 }, // 0.0 - 1.0
    lastVerified: { type: Date, default: Date.now },       // When mapping was confirmed
    status: { type: String, enum: ['active', 'stale', 'failed'], default: 'active' },
  }],

  // External Links
  homepage: { type: String },
  imdbId: { type: String },

  // Cast & Crew
  cast: [castMemberSchema],
  director: { type: String },
  productionCompanies: [{ type: String }],

  // Videos (trailers, teasers)
  videos: [{
    key: { type: String },
    name: { type: String },
    site: { type: String },
    type: { type: String },
  }],

  // Streaming (HLS)
  streams: [{
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
  }],

  // Recommendations
  similarContent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Content' }],
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ── Indexes ──
contentSchema.index({
  title: 'text',
  overview: 'text',
  tagline: 'text',
}, {
  weights: { title: 10, tagline: 5, overview: 1 },
  name: 'content_text_search',
});
contentSchema.index({ contentType: 1, isActive: 1, isFeatured: -1 });
contentSchema.index({ contentType: 1, categories: 1 });
contentSchema.index({ categories: 1, isActive: 1 }); // SC-010: efficient category query + countDocuments
contentSchema.index({ popularity: -1 });
contentSchema.index({ contentType: 1, isActive: 1, popularity: -1 });
contentSchema.index({ createdAt: -1 });

// ── Virtuals ──
contentSchema.virtual('type').get(function () {
  return this.contentType === 'movie' ? 'Movie' : 'Series';
});

contentSchema.virtual('posterUrl').get(function () {
  return getPosterUrl(this.posterPath);
});

contentSchema.virtual('backdropUrl').get(function () {
  return getBackdropUrl(this.backdropPath);
});

// ── Slug Generation ──
contentSchema.statics.generateSlug = function (title) {
  return title
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    + '-' + Math.random().toString(36).substring(2, 6);
};

module.exports = mongoose.model('Content', contentSchema);
