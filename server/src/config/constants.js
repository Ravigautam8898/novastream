// server/src/config/constants.js
// Named Constants — replaces scattered magic numbers across the codebase
//
// Why separate file?
//   - Single source of truth for shared boundary values
//   - Avoids duplication when same constant is used in multiple files
//   - Makes intent explicit at the declaration site
//   - Easy to tune in one place
//
// Usage:
//   const { WATCH_HISTORY_MAX } = require('./constants');

// ── Watch History Limits ──

// Maximum number of watch history entries retained per user
// Older entries are trimmed when this limit is exceeded
const WATCH_HISTORY_MAX = 200;

// Threshold at which defensive trim is triggered during reads
// Slightly higher than WATCH_HISTORY_MAX so a small overshoot
// doesn't force a trim on every request
const WATCH_HISTORY_TRIM_THRESHOLD = 210;

// ── Favorites (Watchlist) Limits ──

// Maximum number of favorites/watchlist entries per user
const FAVORITES_MAX = 200;

// Threshold at which defensive trim is triggered during reads
const FAVORITES_TRIM_THRESHOLD = 210;

// ── Continue Watching ──

// Minimum seconds remaining to consider content "not yet finished"
// Items with less than this remaining are filtered out of continue-watching
const CONTINUE_WATCHING_MIN_REMAINING_SEC = 90;

module.exports = {
  WATCH_HISTORY_MAX,
  WATCH_HISTORY_TRIM_THRESHOLD,
  FAVORITES_MAX,
  FAVORITES_TRIM_THRESHOLD,
  CONTINUE_WATCHING_MIN_REMAINING_SEC,
};
