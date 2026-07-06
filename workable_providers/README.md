# 🌊 Workable Streaming Providers

> **Clean, standalone, ready-to-integrate streaming providers**
> Each provider is a self-contained folder with all decryption/scraping logic embedded.

---

## 📦 What's Inside

| Provider | Status | Stream Type | Description |
|----------|--------|-------------|-------------|
| [castletv/](./castletv/) | ✅ **FULLY WORKING** | HLS (m3u8) | CastleTV — movies & series via AES-encrypted API |

## 🚀 How to Use

Each provider folder contains:
```
provider-name/
├── README.md          # Integration guide for AI agents
├── provider.py        # Standalone module with all logic
├── test.py            # Quick test script
```

### Quick start:
```bash
cd provider-name
pip install pycryptodome
python test.py "search query"
```

### Integration pattern:
```python
from provider import CastleTvProvider

provider = CastleTvProvider()
results = provider.search("cocktail")
detail = provider.detail(results[0]["id"])
stream = provider.stream(results[0]["id"], detail["episodes"][0]["id"])
print(stream["videoUrl"])  # ✅ Playable m3u8!
```

## 📋 Provider Interface

Every provider implements the same 3 methods:

| Method | Input | Output |
|--------|-------|--------|
| `search(query)` | string | `[{id, title, year, cover, languages, description, type}]` |
| `detail(id)` | string | `{title, year, cover, description, episodes: [{id, title, tracks, videos}]}` |
| `stream(movie_id, episode_id, quality)` | 3 strings | `{videoUrl, subtitles, availableQualities}` |

## 📄 Reverse-Engineering Notes

All providers were reverse-engineered from WaveStream v1.0.8 APK
(CloudStream 3-based). Sources:
- CNC Repo: `github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension`
- CSX/Megix Repo: `github.com/SaurabhKaperwan/CSX`
- Original APK: WaveStream v1.0.8

## ❌ Providers Checked That Have NO Content

Some providers are user-configurable players (not content sources):

| Provider | Type | Why No Content |
|----------|------|----------------|
| `M3UPlaylistPlayerProvider v8` | IPTV Player | No built-in streams. Users must provide their own M3U playlist URLs. |
| `Rtally v40` | Movie Scraper | Next.js site. Metadata works (title/year) but download paths (404). File hosts (vidhideplus/playerwish) ad-walled. Needs JS runtime. |
| `XonProvider v28` | Anime/Cartoon API | Two-layer auth: Firebase Remote Config (OAuth2) + `xon-avens.xyz/apis` (HTTP 401). No access without valid Firebase Auth token. |
| `EinthusanProvider v30` | Indian HD Movies | Site `einthusan.tv` actively blocks non-Indian IPs. Redirects to `/blocked/?lang=hindi`. Requires Indian VPN/proxy. |
| `PikashowProvider v25` | Movies/TV API | API at `manoda.co/v1/api/video` alive but returns 401. Requires HMAC-SHA256 signature (X-API-Key, X-Signature, X-Timestamp). HMAC secrets not hardcoded. |

These are skipped from workable_providers/ — they can't provide stream URLs on their own.
