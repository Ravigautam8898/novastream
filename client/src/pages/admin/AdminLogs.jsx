import { useState, useEffect, useRef, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';

export default function AdminLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lineCount, setLineCount] = useState(50);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [levelFilter, setLevelFilter] = useState('all');
  const scrollRef = useRef(null);

  const fetchLogs = useCallback(async () => {
    try {
      const data = await adminApi.getLogs(lineCount);
      setLogs(data.lines || []);
    } catch (err) {
      if (!loading) toast.error('Failed to load logs');
    } finally {
      setLoading(false);
    }
  }, [lineCount, loading]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchLogs]);

  const filtered = logs.filter((line) => {
    if (levelFilter === 'all') return true;
    return line.toLowerCase().includes(levelFilter);
  });

  const getLineColor = (line) => {
    if (line.includes('"level":50') || line.includes('"level":60') || line.toLowerCase().includes('error')) return 'text-red-400';
    if (line.includes('"level":40') || line.toLowerCase().includes('warn')) return 'text-yellow-400';
    return 'text-netflix-text-2';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white">Server Logs</h2>
        <div className="flex items-center gap-3">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-netflix-red/50"
          >
            <option value="all">All Levels</option>
            <option value="error">Errors</option>
            <option value="warn">Warnings</option>
            <option value="info">Info</option>
          </select>
          <select
            value={lineCount}
            onChange={(e) => setLineCount(Number(e.target.value))}
            className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-netflix-red/50"
          >
            <option value={50}>50 lines</option>
            <option value={100}>100 lines</option>
            <option value={200}>200 lines</option>
            <option value={500}>500 lines</option>
          </select>
          <button
            onClick={() => fetchLogs()}
            className="px-2 py-1 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white transition-colors"
          >
            Refresh
          </button>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-2 py-1 text-xs rounded transition-colors ${autoRefresh ? 'bg-green-500/20 text-green-400' : 'bg-netflix-dark-3 text-netflix-text-2 hover:text-white'}`}
          >
            {autoRefresh ? '● Auto' : '○ Auto'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-6">
          <div className="space-y-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="h-4 w-full rounded shimmer" />
            ))}
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-8 text-center">
          <p className="text-netflix-text-2 text-sm">No logs found.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="bg-black rounded-lg border border-netflix-border/20 p-4 overflow-auto max-h-[70vh] font-mono text-xs leading-relaxed"
        >
          {filtered.map((line, i) => (
            <div key={i} className={`${getLineColor(line)} hover:bg-white/[0.03] px-1 rounded`}>
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
