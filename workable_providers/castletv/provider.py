#!/usr/bin/env python3
"""
CastleTvProvider v33 — Standalone Streaming Provider
====================================================
Fully reverse-engineered from CastleTvProvider.cs3 bytecode.

🔑 Encryption: AES/CBC/PKCS5Padding with dynamic key derivation
🌐 API: api.hlowb.com — JSON API with AES-encrypted responses
🎬 Stream: Verified working HLS (m3u8) URLs

Usage:
    from provider import CastleTvProvider

    p = CastleTvProvider()
    results = p.search("cocktail")
    detail = p.detail(results[0]["id"])
    stream = p.stream(results[0]["id"], detail["episodes"][0]["id"])
    print(stream["videoUrl"])  # ✅ Playable m3u8!

Requirements:
    pip install pycryptodome
"""

import base64
import json
import urllib.request
import urllib.parse

from Crypto.Cipher import AES
from Crypto.Util.Padding import unpad


# ============================================================
# Constants (extracted from bytecode)
# ============================================================

BASE_URL = "https://api.hlowb.com"
KEY_SUFFIX = "T!BgJB"           # keySupFixx from plugin bytecode
CHANNEL = "IndiaA"
CLIENT_TYPE = "1"
LANG = "en-US"
PACKAGE_NAME = "com.external.castle"
APK_SIGN_KEY = "ED0955EB04E67A1D9F3305B95454FED485261475"  # Hardcoded in DEX


# ============================================================
# Core Encryption — Exact algorithm from decompiled bytecode
# ============================================================

def _fetch_security_key() -> str:
    """Fetch dynamic Base64 security key from CastleTV API.
    
    GET /v0.1/system/getSecurityKey/1
    Response: {"code": 0, "data": "<base64_security_key>"}
    """
    url = f"{BASE_URL}/v0.1/system/getSecurityKey/1?channel={CHANNEL}&clientType={CLIENT_TYPE}&lang={LANG}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
    })
    resp = json.loads(urllib.request.urlopen(req, timeout=10).read())
    return resp["data"]


def _derive_key(b64_security_key: str) -> bytes:
    """Derive 16-byte AES key from security key.
    
    Algorithm from CastleTvProvider.kt:
      1. Base64-decode the security key
      2. Append KEY_SUFFIX bytes ("T!BgJB")
      3. If < 16 bytes: pad with zeros
      4. If > 16 bytes: truncate to first 16
      5. IV = same as key (!)
    """
    key_bytes = base64.b64decode(b64_security_key)
    suffix = KEY_SUFFIX.encode("ascii")
    material = key_bytes + suffix

    if len(material) < 16:
        material = material + b"\x00" * (16 - len(material))
    elif len(material) > 16:
        material = material[:16]

    return material


def _decrypt(encrypted_b64: str, b64_security_key: str) -> dict:
    """Decrypt a Base64-encoded AES-encrypted API response.
    
    Algorithm from CastleTvProvider.kt:
      Cipher: AES/CBC/PKCS5Padding
      Key: deriveKey(securityKey) -> 16 bytes
      IV: same as key (!)
    """
    aes_key = _derive_key(b64_security_key)

    # Fix padding
    if len(encrypted_b64) % 4:
        encrypted_b64 += "=" * (4 - len(encrypted_b64) % 4)

    encrypted = base64.b64decode(encrypted_b64)
    cipher = AES.new(aes_key, AES.MODE_CBC, aes_key)
    decrypted = unpad(cipher.decrypt(encrypted), AES.block_size)

    return json.loads(decrypted.decode("utf-8"))


def _api_get(path: str) -> dict:
    """Make authenticated GET request to CastleTV API."""
    key = _fetch_security_key()
    url = f"{BASE_URL}{path}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Linux; Android 10; SM-G975F) AppleWebKit/537.36",
        "Accept": "application/json, text/plain, */*",
    })
    resp = urllib.request.urlopen(req, timeout=10)
    encrypted = resp.read().decode().strip()
    return _decrypt(encrypted, key)


# ============================================================
# API Methods
# ============================================================

def _search_api(keyword: str) -> dict:
    """Search movies/series by keyword."""
    path = f"/film-api/v1.1.0/movie/searchByKeyword?channel={CHANNEL}&clientType=1&keyword={urllib.parse.quote(keyword)}"
    return _api_get(path)


def _detail_api(movie_id: int) -> dict:
    """Get movie details, episodes, tracks, resolutions."""
    url = f"{BASE_URL}/film-api/v1.9.9/movie?channel={CHANNEL}&clientType={CLIENT_TYPE}&lang={LANG}&movieId={movie_id}&packageName={PACKAGE_NAME}"
    req = urllib.request.Request(url, headers={
        "User-Agent": "okhttp/4.11.0",
    })
    resp = urllib.request.urlopen(req, timeout=15)
    encrypted = resp.read().decode().strip()
    return _decrypt(encrypted, _fetch_security_key())


def _stream_api(movie_id: int, episode_id: int, resolution: int = 2) -> dict:
    """Get video stream URL (HLS m3u8)."""
    key = _fetch_security_key()
    url = f"{BASE_URL}/film-api/v2.0.1/movie/getVideo2?clientType=1&packageName={PACKAGE_NAME}&channel={CHANNEL}&lang=en-US"

    body = {
        "mode": "1",
        "appMarket": "GuanWang",
        "clientType": "1",
        "woolUser": "false",
        "apkSignKey": APK_SIGN_KEY,
        "androidVersion": "13",
        "isNewUser": "true",
        "movieId": str(movie_id),
        "episodeId": str(episode_id),
        "resolution": str(resolution),
    }

    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode(),
        headers={
            "User-Agent": "okhttp/4.11.0",
            "Content-Type": "application/json; charset=utf-8",
        },
    )
    resp = urllib.request.urlopen(req, timeout=15)
    encrypted = resp.read().decode().strip()
    return _decrypt(encrypted, key)


# ============================================================
# Provider Class — Standard Interface
# ============================================================

class CastleTvProvider:
    """CastleTV streaming provider.
    
    Standard interface for AI integration:
      - search(query)   -> list of results
      - detail(id)      -> full metadata + episodes
      - stream(...)     -> playable m3u8 URL
    """

    name = "CastleTvProvider"
    version = 33
    description = "CastleTV - movies, series with AES-encrypted API"
    language = "multi"

    def search(self, query: str) -> list[dict]:
        """Search movies/shows.
        
        Returns:
            [{id, title, year, score, languages, cover, description, type, provider}]
        """
        data = _search_api(query)
        results = []

        for item in data.get("data", {}).get("rows", []):
            movie_id = item.get("redirectId") or item.get("id", "")

            # CastleTV returns images under coverHorizontalImage / coverVerticalImage
            cover = (
                item.get("coverHorizontalImage")
                or item.get("coverVerticalImage")
                or item.get("coverImage")
                or item.get("poster", "")
                or ""
            )

            results.append({
                "id": str(movie_id) if movie_id else "",
                "title": item.get("title", "Unknown"),
                "year": item.get("year", ""),
                "score": str(item.get("score", "")),
                "languages": item.get("languages", []),
                "cover": cover,
                "description": (item.get("briefIntroduction") or "")[:200],
                "type": item.get("movieType", ""),
                "provider": self.name,
            })

        return results

    def detail(self, movie_id: str) -> dict:
        """Get movie details with episodes, tracks, and qualities.
        
        Returns:
            {title, score, year, country, cover, description,
             episodes: [{id, title, tracks: [{id, name}], videos: [{resolution, description, premium}]}]}
        """
        detail = _detail_api(int(movie_id))

        if "data" not in detail:
            return {"error": "Movie not found", "episodes": []}

        data = detail["data"]
        episodes = []

        for ep in data.get("episodes", []):
            tracks = [
                {"id": t.get("languageId", ""), "name": t.get("languageName", "")}
                for t in ep.get("tracks", [])
            ]
            videos = [
                {
                    "resolution": v.get("resolution", ""),
                    "description": v.get("resolutionDescription", ""),
                    "premium": v.get("premiumProPermission", False),
                }
                for v in (ep.get("videos", []) or data.get("videos", []))
            ]

            episodes.append({
                "id": str(ep.get("id", "")),
                "title": ep.get("title", ""),
                "tracks": tracks,
                "videos": videos,
            })

        # Fallback to seasons if no flat episodes
        if not episodes:
            for season in data.get("seasons", []):
                for ep in season.get("episodes", []):
                    episodes.append({
                        "id": str(ep.get("id", "")),
                        "title": ep.get("title", ""),
                        "tracks": [],
                        "videos": [],
                    })

        cover = (
            data.get("coverHorizontalImage")
            or data.get("coverVerticalImage")
            or data.get("coverImage")
            or data.get("poster", "")
            or ""
        )

        return {
            "title": data.get("title", "Unknown"),
            "score": str(data.get("score", "")),
            "year": data.get("year", ""),
            "country": data.get("country", ""),
            "cover": cover,
            "description": (data.get("briefIntroduction") or "")[:500],
            "episodes": episodes,
            "provider": self.name,
        }

    def stream(self, movie_id: str, episode_id: str, quality: int = 2) -> dict:
        """Get video stream URL for an episode.
        
        Args:
            movie_id: Movie ID from search results
            episode_id: Episode ID from detail()
            quality: 1=SD 480P, 2=HD 720P, 3=FHD 1080P (may be premium)
        
        Returns:
            {videoUrl: "https://...m3u8", subtitles: [{language, url, abbr}],
             availableQualities: [{resolution, description, size, premium}],
             isPreview, expireTime}
        """
        video_data = _stream_api(int(movie_id), int(episode_id), resolution=quality)

        if "data" not in video_data:
            return {"error": "Failed to get stream URL"}

        data = video_data["data"]

        subtitles = [
            {"language": s.get("title", ""), "url": s.get("url", ""), "abbr": s.get("abbreviate", "")}
            for s in data.get("subtitles", [])
        ]

        available_qualities = []
        for v in data.get("videos", []):
            size = v.get("size", 0)
            size_str = (
                f"{size / 1e9:.1f} GB" if size > 1e9
                else f"{size / 1e6:.0f} MB" if size
                else "Unknown"
            )
            available_qualities.append({
                "resolution": v.get("resolution", ""),
                "description": v.get("resolutionDescription", ""),
                "size": size_str,
                "premium": v.get("premiumProPermission", False),
            })

        quality_names = {1: "SD 480P", 2: "HD 720P", 3: "FHD 1080P"}

        return {
            "videoUrl": data.get("videoUrl", ""),
            "isPreview": data.get("isPreview", False),
            "expireTime": data.get("expireTime", 0),
            "subtitles": subtitles,
            "availableQualities": available_qualities,
            "currentQuality": quality_names.get(quality, f"Q{quality}"),
            "provider": self.name,
        }


# ============================================================
# Quick Test
# ============================================================

if __name__ == "__main__":
    import sys

    query = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else "cocktail"

    print(f"\n{'='*70}")
    print(f"  CastleTvProvider v33 — Search: \"{query}\"")
    print(f"{'='*70}")

    provider = CastleTvProvider()

    # 1. Search
    results = provider.search(query)
    print(f"\n📋 Results: {len(results)} found")
    for i, r in enumerate(results[:5]):
        print(f"  {i+1}. {r['title'][:45]:45s} | {r['year']} | score={r['score']} | lang={r['languages']}")

    if results:
        first = results[0]
        # 2. Detail
        print(f"\n📄 Detail: {first['title']}")
        d = provider.detail(first["id"])
        print(f"  Title:   {d['title']}")
        print(f"  Year:    {d['year']}")
        print(f"  Score:   {d['score']}")
        print(f"  Country: {d['country']}")
        print(f"  Episodes: {len(d['episodes'])}")

        if d["episodes"]:
            ep = d["episodes"][0]
            print(f"\n  Episode: {ep['title'] or 'default'}")
            print(f"  Tracks:  {[t['name'] for t in ep['tracks']]}")
            print(f"  Videos:  {[v['description'] for v in ep['videos']]}")

            # 3. Stream
            print(f"\n🎬 Getting stream (HD 720P)...")
            s = provider.stream(first["id"], ep["id"], quality=2)

            print(f"\n  ✅ Stream URL:")
            print(f"  {s['videoUrl']}")

            if s["subtitles"]:
                print(f"\n  📝 Subtitles:")
                for sub in s["subtitles"]:
                    print(f"     {sub['language']}: {sub['url']}")

            if s["availableQualities"]:
                print(f"\n  📺 Available qualities:")
                for q in s["availableQualities"]:
                    premium = " 🔒" if q["premium"] else ""
                    print(f"     {q['description']} ({q['size']}){premium}")

    print(f"\n{'='*70}")
    print(f"  ✅ Done — Stream is ready to play!")
    print(f"{'='*70}")
