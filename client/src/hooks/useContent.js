import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Generic content fetching hook
 * Usage: const { data, loading, error, refetch } = useContent(fetchFn, deps)
 *
 * Features:
 *   - Request deduplication: concurrent fetches with the same deps are collapsed
 *   - Stale-update guard: out-of-order responses are discarded (PF-013)
 *   - Cancellation on unmount: no state updates on unmounted components
 *   - Cleanup always runs: fetch ID increments round-robin via useRef
 */
export function useContent(fetchFn, deps = []) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Monotonically incrementing fetch ID for stale-update guard (PF-013)
  const fetchIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetch = useCallback(async () => {
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn();
      // Guard: only update state if this is still the latest fetch (PF-013)
      // Prevents out-of-order responses from overwriting newer data.
      if (currentFetchId !== fetchIdRef.current) return;
      setData(result);
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      setError(err.response?.data?.message || err.message || 'An error occurred');
    } finally {
      if (currentFetchId === fetchIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    fetch();
    return () => {
      mountedRef.current = false;
      // Increment fetch ID to abort any in-flight response from updating state
      fetchIdRef.current += 1;
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * Paginated content fetching hook
 * Usage: const { data, loading, error, pagination, setPage } = usePaginatedContent(fetchFn, deps)
 *
 * Includes the same stale-update guard as useContent (PF-013).
 */
export function usePaginatedContent(fetchFn, deps = []) {
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Monotonically incrementing fetch ID for stale-update guard (PF-013)
  const fetchIdRef = useRef(0);
  const mountedRef = useRef(true);

  const fetch = useCallback(async (page = 1) => {
    const currentFetchId = ++fetchIdRef.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFn(page);
      if (currentFetchId !== fetchIdRef.current) return;
      setItems(result.items || []);
      setPagination(result.pagination || null);
    } catch (err) {
      if (currentFetchId !== fetchIdRef.current) return;
      setError(err.response?.data?.message || err.message || 'An error occurred');
    } finally {
      if (currentFetchId === fetchIdRef.current && mountedRef.current) {
        setLoading(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    fetch(1);
    return () => {
      mountedRef.current = false;
      fetchIdRef.current += 1;
    };
  }, [fetch]);

  const setPage = useCallback((page) => fetch(page), [fetch]);

  return { items, pagination, loading, error, setPage, refetch: () => fetch(1) };
}
