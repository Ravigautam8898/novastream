import { useEffect, useRef } from 'react';
import Artplayer from 'artplayer';
import Hls from 'hls.js';

/**
 * VideoPlayer — ArtPlayer-based video player with HLS.js and multi-quality support.
 *
 * Features:
 *   - HLS adaptive bitrate streaming via hls.js
 *   - Custom quality selector (avoids ArtPlayer native quality bug which causes
 *     black screen when switching quality URLs with HLS.js)
 *   - Supports both pre-defined quality URLs AND HLS.js level-based switching
 *   - Fullscreen, picture-in-picture, playback speed controls
 *   - Seamless episode switching — HLS source is updated in-place on the
 *     existing ArtPlayer instance (no destroy/recreate = no black flash)
 *   - Proper cleanup on unmount
 *
 * Architecture:
 *   Effect A (mount/unmount): Creates ArtPlayer once. Manages event listeners
 *     (PiP, visibility, fullscreen, timeupdate). Cleanup destroys on unmount.
 *   Effect B (URL changes): Manages HLS.js lifecycle inline — destroys old
 *     HLS and creates new HLS on the same video element. Never returns a
 *     cleanup function, so React never runs a stale cleanup before re-render.
 *
 * Props:
 *   - url: HLS stream URL (.m3u8 master or variant playlist)
 *   - qualities: Array of { quality, url } for per-quality variant playlists.
 *     When provided, the quality selector uses these explicit URLs.
 *     When omitted, falls back to auto-generating from HLS.js levels.
 *   - thumbnails: Object with { url, number, column } for seek preview sprite.
 *   - poster: Optional poster image URL
 *   - title: Optional video title for display
 *   - initialSeek: Number of seconds to seek to on load (for resume playback)
 *   - onTimeUpdate: Callback(currentTime, duration)
 *   - onPiPChange: Callback(isPiP) — fires when picture-in-picture state changes
 *   - onError: Callback(errorMessage)
 *   - onQualityChange: Callback(qualityString) — fired when user changes quality (C5e)
 *   - autoplay: Whether to auto-play (default: true)
 */
export default function VideoPlayer({
  url,
  qualities,
  thumbnails,
  poster,
  title = '',
  initialSeek,
  onTimeUpdate,
  onPiPChange,
  onError,
  onQualityChange,
  autoplay = true,
}) {
  const artRef = useRef(null);
  const playerRef = useRef(null);
  const hlsRef = useRef(null);
  const containerRef = useRef(null);
  const pipActiveRef = useRef(false);

  // Load saved volume from localStorage; default to 0.7
  const getSavedVolume = () => {
    try {
      const saved = localStorage.getItem('novastream_player_volume');
      if (saved !== null) {
        const parsed = parseFloat(saved);
        if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) return parsed;
      }
    } catch { /* localStorage unavailable */ }
    return 0.7;
  };

  // Refs for callbacks so Effect A (which runs once on mount) always
  // invokes the latest version without needing to re-mount the player.
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onPiPChangeRef = useRef(onPiPChange);
  const onErrorRef = useRef(onError);
  const onQualityChangeRef = useRef(onQualityChange);
  onTimeUpdateRef.current = onTimeUpdate;
  onPiPChangeRef.current = onPiPChange;
  onErrorRef.current = onError;
  onQualityChangeRef.current = onQualityChange;

  // Sort qualities from highest to lowest for the UI
  const sortQualities = (list) => {
    if (!list || list.length === 0) return [];
    const order = ['4K', '1080p', '720p', '480p', '360p'];
    return [...list].sort(
      (a, b) => order.indexOf(a.quality) - order.indexOf(b.quality)
    );
  };

  // Build quality options from HLS.js levels
  const buildHlsLevelOptions = (hls) => {
    if (!hls || !hls.levels) return [];
    return hls.levels.map((level, index) => ({
      html: `${level.height}p`,
      level: index,
    }));
  };

  // Helper: switch to a new quality URL by destroying and recreating HLS.js
  const switchQualityUrl = (art, video, newUrl, currentTime) => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    video.removeAttribute('src');

    const hls = new Hls({ lowLatencyMode: true, backbufferLength: 30 });
    hls.loadSource(newUrl);
    hls.attachMedia(video);

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (currentTime > 0) {
        video.currentTime = currentTime;
      }
      art.play();
    });

    hls.on(Hls.Events.ERROR, (event, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad();
        } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
        } else {
          hls.destroy();
        }
        if (data.type !== Hls.ErrorTypes.NETWORK_ERROR) {
          onErrorRef.current?.(new Error(data.details || 'Video playback error'));
        }
      }
    });

    hlsRef.current = hls;
  };

  // Build the combined quality selector list
  const buildQualitySelector = (art, video, hls, predefinedQualities) => {
    const items = [];

    items.push({ html: 'Auto', url: null, level: -1, isDefault: true });

    if (predefinedQualities && predefinedQualities.length > 0) {
      const sorted = sortQualities(predefinedQualities);
      sorted.forEach((q) => {
        items.push({ html: q.quality, url: q.url, level: undefined });
      });
    }

    if (hls && hls.levels && hls.levels.length > 1 && !predefinedQualities) {
      buildHlsLevelOptions(hls).forEach((l) => {
        items.push({ html: l.html, url: null, level: l.level });
      });
    }

    if (items.length <= 1) return;

    // Remove existing quality setting first (handles rebuilds on episode
    // switches where different streams may have different quality levels).
    try { art.setting.remove('quality'); } catch {}

    // Call setting.add() directly — don't wait for art.ready.
    // ArtPlayer is created with url: '' and never transitions to
    // the 'ready' state on its own. setting.add() works regardless
    // of ready state; it just registers a menu item in the settings panel.
    art.setting.add({
      html: 'Quality',
      icon: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>',
      name: 'quality',
      selector: items.map((item) => ({ html: item.html, value: item })),          onSelect: function (selectorItem) {
        const q = selectorItem.value;

        // C5e: Report quality change to parent
        const qualityLabel = selectorItem.html;
        if (qualityLabel && qualityLabel !== 'Auto' && onQualityChangeRef.current) {
          onQualityChangeRef.current(qualityLabel);
        } else if (qualityLabel === 'Auto') {
          // When Auto is selected, report the current HLS level height
          if (hlsRef.current && hlsRef.current.levels && hlsRef.current.currentLevel >= 0) {
            const levelHeight = hlsRef.current.levels[hlsRef.current.currentLevel]?.height;
            if (levelHeight && onQualityChangeRef.current) {
              onQualityChangeRef.current(`${levelHeight}p`);
            }
          }
        }

        if (q.level !== undefined && !q.url && hlsRef.current) {
          hlsRef.current.currentLevel = q.level === -1 ? -1 : q.level;
          return selectorItem.html;
        }

        if (q.url && hlsRef.current) {
          const currentTime = art.currentTime;
          switchQualityUrl(art, video, q.url, currentTime);
          return selectorItem.html;
        }

        if (q.level === -1 && hlsRef.current) {
          hlsRef.current.currentLevel = -1;
          return 'Auto';
        }

        return selectorItem.html;
      },
    });
  };

  // ── Effect A: Create ArtPlayer once on mount, destroy on unmount ──
  // Does NOT depend on `url`. HLS source is managed externally by Effect B.
  useEffect(() => {
    if (!artRef.current) return;

    const art = new Artplayer({
      container: artRef.current,
      // Empty URL placeholder — HLS is managed externally by Effect B.
      // ArtPlayer's video element is the canvas; Effect B attaches HLS.js to it.
      url: '',
      title,
      poster,
      autoplay: false, // Effect B handles autoplay after HLS manifest is parsed
      muted: false,
      autoSize: false, // Player fills the parent container consistently; no resize when video loads
      autoMini: true,
      screenshot: false,
      setting: true,
      hotkey: true,
      playbackRate: true,
      pip: true,
      flip: false,
      lock: true,
      fastForward: true,
      volume: getSavedVolume(),
      theme: '#e50914',
      airplay: true,
      fullscreenWeb: true,
      fullscreen: true,
      layers: [],
      ...(thumbnails ? { thumbnails } : {}),
      moreVideoAttr: {
        crossOrigin: 'anonymous',
        playsInline: true,
        preload: 'metadata',
        'x-webkit-airplay': 'allow',
        'webkit-playsinline': true,
      },
    });

    playerRef.current = art;

    // ── PiP Event Tracking ──
    const handleEnterPiP = () => {
      pipActiveRef.current = true;
      onPiPChangeRef.current?.(true);
    };

    const handleLeavePiP = () => {
      pipActiveRef.current = false;
      onPiPChangeRef.current?.(false);
    };

    art.on('video:enterpictureinpicture', handleEnterPiP);
    art.on('video:leavepictureinpicture', handleLeavePiP);

    // ── Auto PiP on Tab Switch ──
    const handleVisibilityChange = () => {
      if (document.hidden && art.playing && !pipActiveRef.current) {
        const video = art.video;
        if (video && document.pictureInPictureEnabled && !document.pictureInPictureElement) {
          video.requestPictureInPicture().catch(() => {});
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // ── Mobile: Lock to landscape on fullscreen ──
    const handleFullscreen = () => {
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        try {
          screen.orientation?.lock?.('landscape').catch(() => {});
        } catch { /* Orientation lock not supported */ }
      }
    };

    const handleExitFullscreen = () => {
      try {
        screen.orientation?.unlock?.();
      } catch { /* Orientation unlock not supported */ }
    };

    art.on('fullscreen', handleFullscreen);
    art.on('fullscreenWeb', handleFullscreen);
    document.addEventListener('fullscreenchange', handleFullscreen);
    document.addEventListener('webkitfullscreenchange', handleFullscreen);

    // ── Time update listener (uses ref to avoid stale closure) ──
    if (onTimeUpdateRef.current) {
      art.on('video:timeupdate', () => {
        const currentTime = art.currentTime;
        const duration = art.duration;
        if (currentTime && duration) {
          onTimeUpdateRef.current(currentTime, duration);
        }
      });
    }

    // ── Volume Persistence ──
    // Save volume to localStorage whenever the user adjusts it via the
    // player controls. Restored on mount via getSavedVolume().
    const handleVolumeChange = () => {
      const newVolume = art.volume;
      if (newVolume !== undefined && newVolume >= 0 && newVolume <= 1) {
        try {
          localStorage.setItem('novastream_player_volume', String(newVolume));
        } catch { /* localStorage unavailable */ }
      }
    };

    art.on('video:volumechange', handleVolumeChange);

    // ── Cleanup on Unmount Only ──
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreen);
      document.removeEventListener('webkitfullscreenchange', handleFullscreen);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      if (playerRef.current) {
        playerRef.current.destroy(false);
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only mount/unmount — never re-runs on prop changes

  // ── Effect B: Switch HLS source when URL changes (in-place, no ArtPlayer destroy) ──
  // This effect deliberately does NOT return a cleanup function, so React never
  // runs stale cleanup before re-renders. HLS lifecycle is managed inline:
  //   - Old HLS instance is destroyed at the top
  //   - New HLS instance is created with the new URL
  //   - Attached to the SAME video element (ArtPlayer's video)
  //   - No ArtPlayer destroy/recreate = no black flash on episode switch
  useEffect(() => {
    if (!playerRef.current?.video || !url) return;

    const video = playerRef.current.video;

    // ── Destroy old HLS instance ──
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    // Clear the video src so ArtPlayer doesn't try to resume the old stream
    // and HLS.js can cleanly attach to a src-free element.
    video.removeAttribute('src');

    const isHls = url.includes('.m3u8');

    // ── Proper video error handler with cleanup (ST-008) ──
    // Use addEventListener instead of video.onerror so we can remove
    // it on URL change, preventing handler leaks and stale references.
    // Defined OUTSIDE the if block so the cleanup function can access it
    // (const is block-scoped, and the cleanup runs in the parent scope).
    const handleVideoError = () => {
      onErrorRef.current?.(new Error('Video element playback error'));
    };

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        lowLatencyMode: true,
        backbufferLength: 30,
      });

      hls.loadSource(url);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        // Rebuild quality selector — removes old and adds new.
        // This prevents duplicate entries AND ensures quality level options
        // are up-to-date if different episodes have different encodings.
        buildQualitySelector(playerRef.current, video, hls, qualities);

        // Seek to saved position (continue watching)
        if (initialSeek && initialSeek > 0) {
          if (hls.duration > 0) {
            video.currentTime = initialSeek;
          } else {
            video.currentTime = initialSeek;
          }
        }

        // Autoplay the new stream
        if (autoplay) {
          playerRef.current.play();
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (data.fatal) {
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            hls.startLoad();
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.destroy();
          }
          if (data.type !== Hls.ErrorTypes.NETWORK_ERROR) {
            onErrorRef.current?.(new Error(data.details || 'Video playback error'));
          }
        }
      });

      video.addEventListener('error', handleVideoError);

      hlsRef.current = hls;

      // Fallback for non-HLS URLs (e.g., direct MP4)
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS support
      video.src = url;
    }

    // ── Cleanup on URL change or unmount (ST-008) ──
    // Removes the error event listener we added above, destroys any
    // existing HLS.js instance, and clears the video src to prevent
    // stale stream connections and handler leaks across episode switches.
    return () => {
      video.removeEventListener('error', handleVideoError);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
      video.removeAttribute('src');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, qualities]);

  return (
    <div
      ref={containerRef}
      className="video-player-container w-full h-full bg-black"
    >
      <div ref={artRef} className="w-full h-full" />
    </div>
  );
}
