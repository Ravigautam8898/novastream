# Provider Sources Directory

This directory contains streaming provider implementations. Each file ending in `.provider.js` is automatically discovered and registered by `ProviderManager` at server startup.

## Privacy

Provider implementations are **private**. Only the framework template (`example.provider.js`) is tracked in git. Actual provider code (e.g., `yupflix.provider.js`) is gitignored per `.gitignore` rules.

## How to Add a Private Provider

### 1. Create your provider file

```
cp example.provider.js myprovider.provider.js
```

Replace `myprovider` with your provider's identifier (e.g., `castletv`, `youtube`, `vimeo`).

### 2. Update metadata

Edit the `static metadata` block:

| Field | Description |
|-------|-------------|
| `id` | Unique identifier used in `providers[].providerName` on Content documents |
| `legacyIds` | Optional — maps old `sourceSite` values to this provider (e.g., `['primary']`) |
| `providerType` | `API` — direct HTTP calls. `LIGHT_SCRAPER` — controlled queue. `BROWSER_SCRAPER` — heavy automation |
| `execution.mode` | Must match `providerType`: `API` → `DIRECT`, `LIGHT_SCRAPER` → `QUEUE`, `BROWSER_SCRAPER` → `WORKER` |
| `streamPolicy.type` | `STATIC_URL` — permanent URL. `SIGNED_URL` — expiring token URL. `DYNAMIC` — per-request generated |
| `priority` | Lower = tried first (APIs: 10-50, scrapers: 60-100) |

### 3. Implement required methods

| Method | Required | Purpose |
|--------|----------|---------|
| `initialize()` | Yes | Load config, API keys, base URL |
| `healthCheck()` | Yes | Return availability status |
| `getStreams(contentId, options)` | Yes | **Primary method** — return playable streaming URLs |
| `search(query)` | Yes | Search for content |
| `getDetails(contentId)` | Yes | Get full content metadata |
| `dispose()` | No | Clean up on provider unload |

### 4. Restart the server

```
pm2 restart novastream
```

ProviderManager will auto-discover your provider on next startup.

### 5. Map content to your provider

For **new content**: use `ContentRegistry.register()` to create Content documents with your `providerName` in the `providers[]` array.

For **existing content**: run the migration pattern from `scripts/migrate-provider-mappings.js` to add your provider mapping to existing documents.

## Provider Resolution Order

When a user presses PLAY, `ProviderManager.resolve()` follows this order:

1. **Lookup Content** — find by slug
2. **Get provider mapping** — check `providers[]` on the Content document
3. **Check `_streamCache`** — return cached URL if valid (10-min safety buffer)
4. **Acquire DistributedLock** — prevent cache stampede (C-008)
5. **Try API providers** — `DIRECT` execution mode
6. **Try LIGHT_SCRAPER providers** — `QUEUE` execution via ScraperQueue
7. **Try BROWSER_SCRAPER providers** — `WORKER` execution via ScraperQueue
8. **Cache result** — store in `_streamCache` with TTL
9. **Return URL** — playable streaming URL

## Provider Types Reference

| Type | Mode | Use Case | Concurrency |
|------|------|----------|-------------|
| `API` | `DIRECT` | Direct HTTP API calls to streaming source | Unlimited (per-provider limit optional) |
| `LIGHT_SCRAPER` | `QUEUE` | Light page scraping (JSON endpoints, DOM parsing) | Global max 5 concurrent |
| `BROWSER_SCRAPER` | `WORKER` | Headless browser automation (JS-rendered pages) | Global max 5 concurrent, circuit breaker |

## Stream Policy Reference

| Policy | TTL | Refresh | Example |
|--------|-----|---------|---------|
| `STATIC_URL` | `24h` (or longer) | Not needed | Direct CDN link to uploaded file |
| `SIGNED_URL` | Token-determined | 10 min before expiry | CloudFront/Cloudflare signed URL |
| `DYNAMIC` | Per-request | Every play | DASH manifest, live stream |

## Troubleshooting

- **Provider not registered**: Check `pm2 logs` for errors. Verify file ends in `.provider.js`.
- **Metadata validation failed**: Check `providerType` matches `execution.mode` (API→DIRECT, etc.).
- **Content not resolving**: Verify `providers[].providerName` matches the provider's `metadata.id`.
