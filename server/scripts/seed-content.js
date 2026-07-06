// server/scripts/seed-content.js
// Seed Script — Populate initial content from TMDB into MongoDB
// Run: node server/scripts/seed-content.js [--count=10]
//
// Fetches trending movies and series from TMDB, syncs them into
// the Content/Season/Episode collections with category assignments.

/* eslint-disable no-console */

const mongoose = require('mongoose');

const config = require('../src/config/env');
const Content = require('../src/models/Content.model');
const Season = require('../src/models/Season.model');
const Episode = require('../src/models/Episode.model');
const TMDbService = require('../src/services/tmdb.service');
const logger = require('../src/config/logger');

// ── Category Mapping ──
// Map TMDB genres to NovaStream categories
const GENRE_CATEGORY_MAP = {
  // Hollywood (English-language content)
  'Action': 'Hollywood',
  'Adventure': 'Hollywood',
  'Animation': 'Hollywood',
  'Comedy': 'Hollywood',
  'Crime': 'Hollywood',
  'Documentary': 'Hollywood',
  'Drama': 'Hollywood',
  'Family': 'Hollywood',
  'Fantasy': 'Hollywood',
  'History': 'Hollywood',
  'Horror': 'Hollywood',
  'Music': 'Hollywood',
  'Mystery': 'Hollywood',
  'Romance': 'Hollywood',
  'Science Fiction': 'Hollywood',
  'Thriller': 'Hollywood',
  'TV Movie': 'Hollywood',
  'War': 'Hollywood',
  'Western': 'Hollywood',

  // Bollywood (Indian Hindi-language)
  'Bollywood': 'Bollywood',

  // Korean
  'Korean': 'Korean',

  // South Indian (Tamil, Telugu, Malayalam, Kannada)
  'South Indian': 'South Indian',
};

/**
 * Assign a category based on TMDB genre names and content metadata
 */
function assignCategory(genres = [], originalLanguage) {
  // Try language-based assignment first
  if (originalLanguage === 'hi') return 'Bollywood';
  if (originalLanguage === 'ko') return 'Korean';
  if (['ta', 'te', 'ml', 'kn'].includes(originalLanguage)) return 'South Indian';

  // Fall back to genre-based mapping
  for (const genre of genres) {
    const mapped = GENRE_CATEGORY_MAP[genre.name];
    if (mapped) return mapped;
  }

  // Default to Hollywood
  return 'Hollywood';
}

/**
 * Sync a movie from TMDB into our Content model
 */
async function syncMovie(tmdbItem) {
  try {
    const tmdbId = tmdbItem.tmdbId || tmdbItem.id;

    // Fetch full details from TMDB
    const movieData = await TMDbService.syncMovie(tmdbId);

    // Check if content already exists
    const existing = await Content.findOne({ tmdbId: movieData.tmdbId });
    if (existing) {
      logger.debug({ tmdbId: movieData.tmdbId, title: movieData.title }, 'Movie already exists, skipping');
      return existing;
    }

    const category = assignCategory(movieData.genres, movieData.originalLanguage);

    // Map TMDB data to our Content schema
    const content = new Content({
      tmdbId: movieData.tmdbId,
      slug: Content.generateSlug(movieData.title),
      title: movieData.title,
      originalTitle: movieData.originalTitle,
      tagline: movieData.tagline,
      overview: movieData.overview,
      contentType: 'movie',
      posterPath: movieData.posterPath,
      backdropPath: movieData.backdropPath,
      releaseDate: movieData.releaseDate ? new Date(movieData.releaseDate) : null,
      runtime: movieData.runtime,
      genres: movieData.genres || [],
      categories: [category],
      voteAverage: movieData.voteAverage,
      voteCount: movieData.voteCount,
      popularity: movieData.popularity || 0,
      isActive: true,
      isFeatured: false,
      cast: movieData.cast || [],
      director: movieData.director,
      videos: movieData.videos || [],
      productionCompanies: movieData.productionCompanies || [],
      homepage: movieData.homepage,
      imdbId: movieData.imdbId,
    });

    await content.save();
    logger.info({ title: content.title, slug: content.slug, category }, 'Movie synced successfully');
    return content;
  } catch (err) {
    logger.warn({ tmdbId: tmdbItem.tmdbId || tmdbItem.id, err: err.message }, 'Failed to sync movie');
    return null;
  }
}

/**
 * Sync a series from TMDB into our Content/Season/Episode models
 */
async function syncSeries(tmdbItem) {
  try {
    const tmdbId = tmdbItem.tmdbId || tmdbItem.id;

    // Check if content already exists
    const existing = await Content.findOne({ tmdbId });
    if (existing) {
      logger.debug({ tmdbId, title: existing.title }, 'Series already exists, skipping');
      return existing;
    }

    // Fetch full series details with seasons
    const seriesData = await TMDbService.syncSeries(tmdbId);

    const category = assignCategory(seriesData.genres, seriesData.originalLanguage);

    // Create the series content entry
    const content = new Content({
      tmdbId: seriesData.tmdbId,
      slug: Content.generateSlug(seriesData.title),
      title: seriesData.title,
      originalTitle: seriesData.originalTitle,
      tagline: seriesData.tagline,
      overview: seriesData.overview,
      contentType: 'series',
      posterPath: seriesData.posterPath,
      backdropPath: seriesData.backdropPath,
      firstAirDate: seriesData.firstAirDate ? new Date(seriesData.firstAirDate) : null,
      lastAirDate: seriesData.lastAirDate ? new Date(seriesData.lastAirDate) : null,
      numberOfSeasons: seriesData.numberOfSeasons,
      numberOfEpisodes: seriesData.numberOfEpisodes,
      genres: seriesData.genres || [],
      categories: [category],
      voteAverage: seriesData.voteAverage,
      voteCount: seriesData.voteCount,
      popularity: seriesData.popularity || 0,
      isActive: true,
      isFeatured: false,
      cast: seriesData.cast || [],
      videos: seriesData.videos || [],
      productionCompanies: seriesData.productionCompanies || [],
      homepage: seriesData.homepage,
    });

    await content.save();

    // Create seasons and episodes
    if (seriesData.seasons && seriesData.seasons.length > 0) {
      for (const seasonData of seriesData.seasons) {
        const season = new Season({
          contentId: content._id,
          tmdbId: seasonData.tmdbId,
          seasonNumber: seasonData.seasonNumber,
          name: seasonData.name,
          overview: seasonData.overview,
          posterPath: seasonData.posterPath,
          airDate: seasonData.airDate ? new Date(seasonData.airDate) : null,
          episodeCount: seasonData.episodeCount,
          isActive: true,
        });
        await season.save();

        // Create episodes for this season
        if (seasonData.episodes && seasonData.episodes.length > 0) {
          const episodeDocs = seasonData.episodes.map(ep => ({
            seasonId: season._id,
            contentId: content._id,
            tmdbId: ep.tmdbId,
            episodeNumber: ep.episodeNumber,
            name: ep.name,
            overview: ep.overview,
            stillPath: ep.stillPath,
            airDate: ep.airDate ? new Date(ep.airDate) : null,
            runtime: ep.runtime,
            voteAverage: ep.voteAverage,
            voteCount: ep.voteCount,
            isActive: true,
          }));
          await Episode.insertMany(episodeDocs);
        }
      }
    }

    logger.info({
      title: content.title,
      slug: content.slug,
      seasons: seriesData.seasons?.length || 0,
      category,
    }, 'Series synced successfully');

    return content;
  } catch (err) {
    logger.warn({ tmdbId: tmdbItem.tmdbId || tmdbItem.id, err: err.message }, 'Failed to sync series');
    return null;
  }
}

/**
 * Language-to-category mapping for discovery seeding
 * Each entry fetches popular content in that language and assigns the category
 */
const LANGUAGE_CATEGORIES = [
  { language: 'hi', category: 'Bollywood', label: 'Bollywood (Hindi)' },
  { language: 'ko', category: 'Korean', label: 'Korean' },
  { language: 'ta', category: 'South Indian', label: 'South Indian (Tamil)' },
  { language: 'te', category: 'South Indian', label: 'South Indian (Telugu)' },
  { language: 'ml', category: 'South Indian', label: 'South Indian (Malayalam)' },
  { language: 'kn', category: 'South Indian', label: 'South Indian (Kannada)' },
  { language: 'en', category: 'Hollywood', label: 'Hollywood (English)' },
];

/**
 * Seed content for a specific category/language using TMDB discover endpoint
 */
async function seedCategoryContent(language, label, count = 5) {
  console.log(`\n📂 Fetching ${label} content...`);

  const result = await TMDbService.getByLanguage(language, 1);
  const allItems = [
    ...(result.movies || []).map(m => ({ ...m, contentType: 'movie' })),
    ...(result.series || []).map(s => ({ ...s, contentType: 'series' })),
  ];

  console.log(`   Found ${allItems.length} items, syncing up to ${count}...`);

  const synced = [];
  for (let i = 0; i < Math.min(allItems.length, count); i++) {
    const item = allItems[i];
    let syncedItem;
    if (item.contentType === 'movie') {
      syncedItem = await syncMovie(item);
    } else {
      syncedItem = await syncSeries(item);
    }
    if (syncedItem) synced.push(syncedItem._id);
  }

  console.log(`   ✅ Synced ${synced.length} ${label} items`);
  return synced;
}

/**
 * Mark top items as featured
 */
async function markFeatured(contentIds) {
  const batchSize = 7;
  const featuredIds = contentIds.filter(Boolean).slice(0, batchSize);
  if (featuredIds.length > 0) {
    await Content.updateMany(
      { _id: { $in: featuredIds } },
      { $set: { isFeatured: true } }
    );
    logger.info({ count: featuredIds.length }, 'Items marked as featured');
  }
}

/**
 * Main seed function
 */
async function seedContent(options = {}) {
  const count = options.count || 8;
  const categoryCount = options.categoryCount || 5;
  const connectString = config.mongodb.uri;

  console.log('\n╔══════════════════════════════════════════════╗');
  console.log('║   NovaStream — Content Seed Script          ║');
  console.log('╚══════════════════════════════════════════════╝');

  // Connect to MongoDB
  await mongoose.connect(connectString);
  console.log('✅ Connected to MongoDB\n');

  try {
    const allSyncedIds = [];

    // ── Step 1: Seed Trending (Hero + Featured) ──
    console.log('── Step 1: Trending Content ──');
    const trending = await TMDbService.getTrending(1);
    console.log(`📍 Found ${trending.length} trending items, syncing ${count}...\n`);

    for (let i = 0; i < Math.min(trending.length, count); i++) {
      const item = trending[i];
      console.log(`[${i + 1}/${Math.min(trending.length, count)}] ${item.title} (${item.contentType})`);

      let synced;
      if (item.contentType === 'movie') {
        synced = await syncMovie(item);
      } else {
        synced = await syncSeries(item);
      }
      if (synced) allSyncedIds.push(synced._id);
    }

    // ── Step 2: Seed Category Content ──
    console.log('\n── Step 2: Category Content ──');
    const nonEnglishCategories = LANGUAGE_CATEGORIES.filter(c => c.language !== 'en');
    for (const cat of nonEnglishCategories) {
      const ids = await seedCategoryContent(cat.language, cat.label, categoryCount);
      allSyncedIds.push(...ids);
    }

    // ── Step 3: Seed English/Hollywood (if trending didn't cover enough) ──
    console.log('\n── Step 3: Additional Hollywood Content ──');
    await seedCategoryContent('en', 'Hollywood (English)', Math.max(categoryCount, 5));

    // ── Step 4: Mark Featured ──
    console.log('\n── Step 4: Marking Featured ──');
    await markFeatured(allSyncedIds);

    // ── Summary ──
    const movieCount = await Content.countDocuments({ contentType: 'movie' });
    const seriesCount = await Content.countDocuments({ contentType: 'series' });
    const seasonCount = await Season.countDocuments();
    const episodeCount = await Episode.countDocuments();

    // Show category breakdown
    const categories = await Content.aggregate([
      { $unwind: '$categories' },
      { $group: { _id: '$categories', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    console.log('\n═══════════════════════════════════════════════');
    console.log('  Seed Complete!');
    console.log('───────────────────────────────────────────────');
    console.log(`  Movies:    ${movieCount}`);
    console.log(`  Series:    ${seriesCount}`);
    console.log(`  Seasons:   ${seasonCount}`);
    console.log(`  Episodes:  ${episodeCount}`);
    console.log('───────────────────────────────────────────────');
    console.log('  Category Breakdown:');
    for (const cat of categories) {
      const pct = ((cat.count / (movieCount + seriesCount)) * 100).toFixed(0);
      const bar = '█'.repeat(Math.floor(pct / 10)) + '░'.repeat(10 - Math.floor(pct / 10));
      console.log(`    ${cat._id.padEnd(16)} ${cat.count.toString().padStart(3)} ${bar}`);
    }
    console.log('═══════════════════════════════════════════════\n');

  } catch (err) {
    console.error('\n❌ Seed failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('👋 Disconnected from MongoDB\n');
  }
}

// ── CLI Entry Point ──
if (require.main === module) {
  const args = process.argv.slice(2);
  const countIndex = args.findIndex(a => a.startsWith('--count='));
  const count = countIndex !== -1 ? parseInt(args[countIndex].split('=')[1], 10) : 10;

  seedContent({ count })
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = seedContent;
