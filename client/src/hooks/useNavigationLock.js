import { useRef, useCallback, useEffect } from 'react';

/**
 * useNavigationLock — Prevents duplicate/race-condition navigation.
 *
 * D-009: When clicking multiple cards or hero buttons quickly, only the
 * first valid navigation executes. Subsequent clicks are ignored until
 * the current navigation resolves.
 *
 * Design rationale (Option A from D-009):
 * - Interaction lock: first click acquires lock → subsequent clicks ignored
 * - Lock resets after navigation completes (or on error)
 * - useRef-based: no re-render overhead from the lock itself
 * - Reusable by HeroCarousel, ContentCard, Search, Recommendations
 *
 * @returns {{ isNavigating: boolean, withNavigation: (fn: () => Promise<any>) => Promise<void> }}
 */
export function useNavigationLock() {
  const lockRef = useRef(false);
  const mountedRef = useRef(true);

  // Cleanup on unmount: release lock + mark unmounted
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lockRef.current = false;
    };
  }, []);

  /**
   * Wraps an async navigation function, preventing concurrent execution.
   * @param {() => Promise<any>} fn - The navigation function to execute.
   * @returns {Promise<void>} Resolves when navigation completes or is skipped.
   */
  const withNavigation = useCallback(async (fn) => {
    if (lockRef.current) return; // Silently ignore duplicate clicks
    lockRef.current = true;
    try {
      await fn();
    } finally {
      // Only release if still mounted; avoids stale lock release
      if (mountedRef.current) {
        lockRef.current = false;
      }
    }
  }, []);

  return {
    isNavigating: lockRef.current,
    withNavigation,
  };
}

export default useNavigationLock;
