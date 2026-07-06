import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';
import DataTable from '../../components/admin/DataTable';
import StatusBadge from '../../components/admin/StatusBadge';
import ConfirmDialog from '../../components/admin/ConfirmDialog';

export default function AdminContent() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [filter, setFilter] = useState({ type: 'all', status: 'all' });

  const fetchContent = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20 };
      if (filter.type !== 'all') params.type = filter.type;
      if (filter.status !== 'all') params.status = filter.status;
      const result = await adminApi.getContent(params);
      setData(result.data || []);
      setTotalPages(result.pagination?.totalPages || 1);
    } catch (err) {
      toast.error('Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => { fetchContent(); }, [fetchContent]);

  const handleToggle = async (item, field) => {
    try {
      await adminApi.updateContent(item._id, { [field]: !item[field] });
      toast.success(`${item.title}: ${field} toggled`);
      fetchContent();
    } catch (err) {
      toast.error('Failed to update content');
    }
  };

  const columns = [
    {
      key: 'title', label: 'Title', sortable: true,
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">{r.title}</span>
          <span className="text-netflix-text-3 text-xs ml-2">({r.slug})</span>
        </div>
      ),
    },
    { key: 'contentType', label: 'Type', render: (r) => <StatusBadge status={r.contentType === 'movie' ? 'user' : 'admin'} label={r.contentType === 'movie' ? 'Movie' : 'Series'} /> },
    { key: 'voteAverage', label: 'Rating', sortable: true, render: (r) => <span className="text-netflix-green">{r.voteAverage?.toFixed(1) || '—'}</span> },
    { key: 'viewCount', label: 'Views', sortable: true },
    { key: 'isFeatured', label: 'Featured', render: (r) => <button onClick={() => handleToggle(r, 'isFeatured')} className={`px-2 py-0.5 text-xs rounded transition-colors ${r.isFeatured ? 'bg-yellow-500/20 text-yellow-400' : 'bg-netflix-dark-3 text-netflix-text-3 hover:text-white'}`}>{r.isFeatured ? '★ Yes' : '☆ No'}</button> },
    { key: 'isActive', label: 'Active', render: (r) => <button onClick={() => handleToggle(r, 'isActive')} className={`px-2 py-0.5 text-xs rounded transition-colors ${r.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>{r.isActive ? '✓' : '✗'}</button> },
    {
      key: 'actions', label: 'Actions', render: (r) => (
        <Link
          to={`/watch/${r.contentType}/${r.slug}`}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          View →
        </Link>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Content Manager</h2>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={filter.type}
          onChange={(e) => { setFilter(f => ({ ...f, type: e.target.value })); setPage(1); }}
          className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-netflix-red/50"
        >
          <option value="all">All Types</option>
          <option value="movie">Movies</option>
          <option value="series">Series</option>
        </select>
        <select
          value={filter.status}
          onChange={(e) => { setFilter(f => ({ ...f, status: e.target.value })); setPage(1); }}
          className="bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-1.5 text-xs text-white focus:outline-none focus:border-netflix-red/50"
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
        <span className="text-netflix-text-3 text-xs self-center ml-auto">{data.length} items</span>
      </div>

      <DataTable
        columns={columns}
        data={data}
        keyField="_id"
        loading={loading}
        emptyMessage="No content found."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
