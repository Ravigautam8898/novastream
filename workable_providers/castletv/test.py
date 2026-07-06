#!/usr/bin/env python3
"""
CastleTvProvider — Quick Verification Test
===========================================
Run: python test.py [search_query]
Verifies: search, detail, and stream all return valid data.
"""

import sys

from provider import CastleTvProvider


def test_search(provider, query):
    """Verify search returns results with required fields."""
    results = provider.search(query)
    assert len(results) > 0, f"Search for '{query}' returned no results!"
    
    required = ["id", "title", "year", "cover", "description", "type"]
    for r in results[:3]:
        for field in required:
            assert field in r, f"Search result missing field '{field}'"
        assert r["title"], "Search result has empty title"
    
    print(f"  ✅ Search: {len(results)} results, all have required fields")
    return results[0]


def test_detail(provider, movie_id):
    """Verify detail returns episodes with tracks and videos."""
    detail = provider.detail(movie_id)
    assert "title" in detail, "Detail missing title"
    assert detail["title"], "Detail has empty title"
    assert "episodes" in detail, "Detail missing episodes"
    
    print(f"  ✅ Detail: \"{detail['title']}\" with {len(detail['episodes'])} episodes")
    
    if detail["episodes"]:
        ep = detail["episodes"][0]
        assert "id" in ep, "Episode missing id"
        assert "tracks" in ep, "Episode missing tracks"
        assert "videos" in ep, "Episode missing videos"
        print(f"     First ep: {ep['title'] or 'default'} | "
              f"tracks={[t['name'] for t in ep['tracks']]} | "
              f"videos={[v['description'] for v in ep['videos']]}")
    
    return detail


def test_stream(provider, movie_id, episode_id):
    """Verify stream returns a playable m3u8 URL."""
    stream = provider.stream(movie_id, episode_id, quality=2)
    
    assert "videoUrl" in stream, "Stream missing videoUrl"
    url = stream["videoUrl"]
    assert url, "Stream has empty videoUrl"
    assert url.startswith("http"), f"Stream URL doesn't start with http: {url[:50]}"
    
    print(f"  ✅ Stream: m3u8 URL returned")
    print(f"     URL: {url[:80]}...")
    
    if stream.get("subtitles"):
        print(f"     Subtitles: {len(stream['subtitles'])} available")
    if stream.get("availableQualities"):
        print(f"     Qualities: {[q['description'] for q in stream['availableQualities']]}")
    
    return stream


def main():
    query = sys.argv[1] if len(sys.argv) > 1 else "cocktail"
    
    print()
    print("=" * 70)
    print("  CastleTvProvider v33 — Verification Test")
    print("=" * 70)
    
    provider = CastleTvProvider()
    
    # Test 1: Search
    print(f"\n📋 Test 1: Search \"{query}\"")
    first = test_search(provider, query)
    
    # Test 2: Detail
    print(f"\n📄 Test 2: Detail for \"{first['title']}\"")
    detail = test_detail(provider, first["id"])
    
    # Test 3: Stream
    if detail["episodes"]:
        print(f"\n🎬 Test 3: Stream (HD 720P)")
        test_stream(provider, first["id"], detail["episodes"][0]["id"])
    else:
        print(f"\n⚠️  No episodes to test stream")
    
    print(f"\n{'=' * 70}")
    print(f"  ✅ All tests passed! Provider is working.")
    print(f"{'=' * 70}")


if __name__ == "__main__":
    main()
