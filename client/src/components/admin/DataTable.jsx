import { useState } from 'react';

export default function DataTable({
  columns,
  data = [],
  keyField = '_id',
  loading = false,
  emptyMessage = 'No data found',
  page,
  totalPages,
  onPageChange,
}) {
  const [sortField, setSortField] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...data].sort((a, b) => {
    if (!sortField) return 0;
    const aVal = a[sortField];
    const bVal = b[sortField];
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    const cmp = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDir === 'asc' ? cmp : -cmp;
  });

  if (loading) {
    return (
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-8">
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-10 rounded shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-8 text-center">
        <p className="text-netflix-text-2 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-netflix-border/20">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium text-netflix-text-3 uppercase tracking-wider ${
                    col.sortable ? 'cursor-pointer hover:text-white select-none' : ''
                  }`}
                  onClick={() => col.sortable && handleSort(col.key)}
                  style={col.width ? { width: col.width } : undefined}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortField === col.key && (
                      <span className="text-netflix-red">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-netflix-border/10">
            {sorted.map((row) => {
              const rowKey = typeof keyField === 'function' ? keyField(row) : row[keyField];
              return (
              <tr key={rowKey ?? JSON.stringify(row)} className="hover:bg-white/[0.02] transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-netflix-text whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ); })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && onPageChange && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-netflix-border/20">
          <p className="text-xs text-netflix-text-3">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1}
              className="px-3 py-1 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              ← Prev
            </button>
            <button
              onClick={() => onPageChange(page + 1)}
              disabled={page >= totalPages}
              className="px-3 py-1 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
