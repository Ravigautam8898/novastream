# CastleTvProvider v33 — Fully Working HLS Stream Provider

> **Reverse-engineered from:** CastleTvProvider.cs3 (com.cncverse.CastleTvProviderPlugin)  
> **Source:** CNC Repo — `github.com/NivinCNC/CNCVerse-Cloud-Stream-Extension`  
> **Status:** ✅ **FULLY WORKING** — returns verified playable m3u8 stream URLs  
> **Encryption:** AES/CBC/PKCS5Padding with dynamic key derivation

---

## 📋 Overview

CastleTV is a movies & TV series provider with a JSON API at `api.hlowb.com`.
All API responses are Base64-encoded AES-encrypted JSON. The encryption key
is fetched dynamically from the API and derived using a specific algorithm.

### What's in this folder

| File | Purpose |
|------|---------|
| `provider.py` | Standalone provider module — **all logic embedded, zero external deps** |
| `test.py` | Test script — run it to verify the provider works |
| `README.md` | This file — documentation for AI agent integration |

---

## 🔧 How an AI Agent Should Integrate This

### Step 1: Copy the folder
```bash
cp -r workable_providers/castletv/ your-project/providers/
```

### Step 2: Import and use
```python
from providers.castletv.provider import CastleTvProvider

provider = CastleTvProvider()
results = provider.search("cocktail")        # Search
detail = provider.detail(results[0]["id"])   # Get details + episodes
stream = provider.stream(                    # Get playable stream
    movie_id=results[0]["id"],
    episode_id=detail["episodes"][0]["id"],
    quality=2  # 1=SD, 2=HD, 3=FHD
)
print(stream["videoUrl"])  # ✅ m3u8 URL - ready to play!
```

### Step 3: Handle the response
The provider returns standard JSON-serializable dicts:

**search() returns:** `[{id, title, year, score, languages, cover, description, type}]`
**detail() returns:** `{title, score, year, country, cover, description, episodes: [{id, title, tracks, videos}]}`
**stream() returns:** `{videoUrl: "https://...m3u8", subtitles: [...], availableQualities: [...], isPreview, expireTime}`

---

## 🧠 API Architecture (for AI agent context)

```
CastleTV API (api.hlowb.com)
│
├── GET  /v0.1/system/getSecurityKey/1   → Base64 security key (dynamic, rotates)
├── GET  /film-api/v1.1.0/movie/searchByKeyword  → Encrypted search results
├── GET  /film-api/v1.9.9/movie          → Encrypted movie details + episodes
└── POST /film-api/v2.0.1/movie/getVideo2  → Encrypted stream URL

Each API response is:
  raw_response = base64(encrypted_json)
  
To decrypt:
  1. Fetch security key from /getSecurityKey/1
  2. Derive AES key: base64_decode(security_key) + b"T!BgJB" → truncate to 16 bytes
  3. IV = AES key (same bytes!)
  4. Decrypt: AES/CBC/PKCS5Padding(raw_response, key, iv)
  5. Parse as JSON
```

---

## 📝 Notes for AI Integration

1. **Security key rotation**: The API key changes periodically. Always fetch it fresh.
2. **Rate limiting**: No observed rate limits, but be respectful (< 10 req/s).
3. **Premium qualities**: Resolution 3 (FHD 1080P) may return premium errors.
   Stick to resolution 1 (SD 480P) or 2 (HD 720P) for free content.
4. **TV Series**: Episodes are nested under `seasons[]` in the detail response.
   The provider handles both flat `episodes[]` and nested `seasons[].episodes[]`.
5. **Subtitles**: Available as VTT URLs in the stream response.
6. **Expiry**: Stream URLs expire (~1 hour). Fetch fresh on playback.
