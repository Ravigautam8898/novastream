# TMDB API Research for NovaStream

> **Date:** June 30, 2026
> **Status:** Needs user registration on TMDB

---

## 1. Do We Need to Register?

**YES.** TMDB requires a free account and API key request. The TMDB API key is **NOT exposed** in YupFlix's frontend — it's kept securely server-side in their Cloudflare Worker backend.

### What YupFlix Uses from TMDB:
- **Image CDN URLs** (`https://image.tmdb.org/t/p/w500/...`) — These are publicly accessible once you know the file path. No API key needed to serve images.
- **tmdbId values** stored in their MongoDB — These are reference IDs we can use with our own API key.
- All TMDB data is **proxied through their own API** (Cloudflare Workers), never directly exposing the API key.

### To Get a TMDB API Key:
1. Create a free account at [themoviedb.org](https://www.themoviedb.org/signup)
2. Go to your Profile Settings → API section
3. Request a Developer API Key (free)
4. Choose between:
   - **API Key (v3 auth)** — Simple key in query params
   - **Bearer Token (v4 auth)** — More secure, header-based

---

## 2. Free Tier Details

| Feature | Details |
|---------|---------|
| **Cost** | Free for non-commercial use |
| **Rate Limit** | ~50 requests/second |
| **Commercial Use** | Requires separate agreement with TMDB sales |
| **Attribution Required** | Must display "Powered by TMDB" with logo |
| **Caching Limit** | Cannot cache data for >6 months |
| **AI/ML Training** | Prohibited |

---

## 3. Key Endpoints We'll Need

| Endpoint | Purpose |
|----------|---------|
| `GET /movie/{id}` | Movie details, runtime, genres |
| `GET /tv/{id}` | TV series details |
| `GET /tv/{id}/season/{num}` | Season episodes |
| `GET /search/movie` | Search movies by query |
| `GET /search/tv` | Search TV series by query |
| `GET /trending/{media_type}/{time_window}` | Trending (daily/weekly) |
| `GET /movie/popular` | Popular movies |
| `GET /tv/popular` | Popular TV series |
| `GET /configuration` | Available image sizes |
| `GET /genre/movie/list` | Movie genres |
| `GET /genre/tv/list` | TV genres |

---

## 4. Image URL Construction

```
Base: https://image.tmdb.org/t/p/
Format: {base_url}{size}{file_path}
```

### Available Sizes
| Type | Sizes |
|------|-------|
| Poster | `w92`, `w154`, `w185`, `w342`, `w500`, `w780`, `original` |
| Backdrop | `w300`, `w780`, `w1280`, `original` |
| Profile | `w45`, `w185`, `h632`, `original` |
| Logo | `w200`, `w500`, `original` |

### YupFlix Uses These Sizes:
- `w500` — Posters, episode stills
- `w1280` — Backdrops
- `w185` — Cast profile photos
- `w200` — Network logos

---

## 5. Node.js Integration

### Recommended Package: `moviedb-promise`
```bash
npm install moviedb-promise
```

```javascript
const { MovieDb } = require('moviedb-promise');

const tmdb = new MovieDb(process.env.TMDB_API_KEY);

// Get movie details
const movie = await tmdb.movieInfo({ id: 94997 });

// Search movies
const results = await tmdb.searchMovie({ query: 'house' });

// Get trending
const trending = await tmdb.trending({ media_type: 'all', time_window: 'week' });

// Get TV seasons
const season = await tmdb.seasonInfo({ id: 94997, season_number: 1 });
```

---

## 6. Where to Save Your TMDB Credentials

Your TMDB credentials go into the **`.env`** file at the **project root**.

### Credential Storage Location
```
novastream/
├── .env                          ← 🔐 YOU create this (gitignored!)
├── docs/
│   └── reference/
│       └── .env.example          ← 📋 Template with all variables
└── server/
    └── src/
        └── config/
            └── env.js            ← ⚙️ Loads from .env
```

### Steps to Set Up

1. **Copy the template:**
   ```bash
   cp docs/reference/.env.example .env
   ```

2. **Edit `.env`** and paste your TMDB credentials:
   ```env
   # ─── TMDB API (The Movie Database) ─────────────────────────────────────
   TMDB_API_KEY=eyJhbGciOiJI...    # ← Your API Key (v3) from TMDB settings
   TMDB_ACCESS_TOKEN=skZPOt5...     # ← Your API Read Access Token (v4)
   ```

3. **Never commit `.env`** — it's already in `.gitignore` by default.

### Where to Find Your Credentials on TMDB

| Step | Action |
|------|--------|
| 1 | Log in to [themoviedb.org](https://www.themoviedb.org) |
| 2 | Click your profile avatar → **Settings** |
| 3 | Click **API** in the left sidebar |
| 4 | Copy **API Key (v3)** → `TMDB_API_KEY` |
| 5 | Copy **API Read Access Token (v4)** → `TMDB_ACCESS_TOKEN` |

### Reference in Code

The server loads these via `process.env` using a config module:
```javascript
// server/src/config/env.js
module.exports = {
  tmdb: {
    apiKey: process.env.TMDB_API_KEY,
    accessToken: process.env.TMDB_ACCESS_TOKEN,
    imageBase: process.env.TMDB_IMAGE_BASE || 'https://image.tmdb.org/t/p',
  },
  // ... other configs
};
```

### Full Template
> See [`docs/reference/.env.example`](../reference/.env.example) for the complete configuration template with all variables, descriptions, and generation commands.
