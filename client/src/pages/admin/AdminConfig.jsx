import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import adminApi from '../../api/admin.api';

export default function AdminConfig() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [validating, setValidating] = useState(false);
  const [validation, setValidation] = useState(null);

  const fetchConfig = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getConfig();
      setConfig(data);
    } catch (err) {
      toast.error('Failed to load config');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const handleValidate = async () => {
    setValidating(true);
    try {
      const result = await adminApi.validateConfig();
      setValidation(result);
      if (result.valid) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to validate config');
    } finally {
      setValidating(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h2 className="text-xl font-bold text-white mb-6">Configuration</h2>
        <div className="space-y-2">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="h-10 bg-netflix-dark-2 rounded-lg border border-netflix-border/20 shimmer" />
          ))}
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="text-center py-12">
        <p className="text-netflix-text-2">Failed to load configuration.</p>
      </div>
    );
  }

  const vars = config.variables || {};
  const entries = Object.entries(vars).filter(([key]) =>
    !searchTerm || key.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-white">Configuration</h2>
        <button
          onClick={handleValidate}
          disabled={validating}
          className="px-3 py-1.5 text-xs rounded bg-netflix-dark-3 text-netflix-text-2 hover:text-white disabled:opacity-50 transition-colors"
        >
          {validating ? 'Validating...' : 'Validate .env'}
        </button>
      </div>

      {/* Validation Result */}
      {validation && (
        <div className={`rounded-lg border p-4 mb-6 ${
          validation.valid
            ? 'bg-green-500/10 border-green-500/20'
            : 'bg-red-500/10 border-red-500/20'
        }`}>
          <div className="flex items-start gap-3">
            <span className="text-lg mt-0.5">{validation.valid ? '✅' : '❌'}</span>
            <div>
              <p className={`text-sm font-medium ${validation.valid ? 'text-green-400' : 'text-red-400'}`}>
                {validation.message}
              </p>
              {validation.missing?.length > 0 && (
                <div className="mt-2">
                  <p className="text-netflix-text-3 text-xs mb-1">Missing variables:</p>
                  <div className="flex flex-wrap gap-1">
                    {validation.missing.map(v => (
                      <span key={v} className="px-2 py-0.5 rounded bg-red-500/20 text-red-400 text-xs font-mono">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              <p className="text-netflix-text-3 text-xs mt-2">
                {validation.totalVars} variables found · {validation.requiredVars?.length || 0} required
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Meta Info */}
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 p-4 mb-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-netflix-text-3">Environment:</span>
          <span className="text-white font-medium">{config.nodeEnv || '—'}</span>
          <span className="text-netflix-text-3 ml-4">Config File:</span>
          <span className="text-white text-xs font-mono truncate max-w-[300px]" title={config.envFile}>
            {config.envFile || '—'}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search variables..."
          className="w-full bg-netflix-dark-3 border border-netflix-border/30 rounded px-3 py-2 text-sm text-white placeholder-netflix-text-3 focus:outline-none focus:border-netflix-red/50"
        />
      </div>

      {/* Env Vars Table */}
      <div className="bg-netflix-dark-2 rounded-lg border border-netflix-border/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-netflix-border/20">
                <th className="px-4 py-3 text-left text-xs font-medium text-netflix-text-3 uppercase tracking-wider w-1/2">Variable</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-netflix-text-3 uppercase tracking-wider w-1/2">Value</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-netflix-border/10">
              {entries.map(([key, value]) => (
                <tr key={key} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-white font-mono text-xs">{key}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-netflix-text-2 font-mono text-xs break-all">
                      {isSensitive(key) && value ? (
                        <span className="text-yellow-400/70">
                          {value.length > 12
                            ? value.substring(0, 4) + '••••' + value.slice(-4)
                            : '••••••••'}
                        </span>
                      ) : value || (
                        <span className="text-netflix-text-3 italic">empty</span>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {entries.length === 0 && (
          <div className="p-8 text-center">
            <p className="text-netflix-text-2 text-sm">No matching variables found.</p>
          </div>
        )}
        <div className="px-4 py-2 border-t border-netflix-border/20">
          <p className="text-netflix-text-3 text-xs">{entries.length} of {Object.keys(vars).length} variables</p>
        </div>
      </div>
    </div>
  );
}

const sensitivePatterns = [/SECRET/i, /TOKEN/i, /PASSWORD/i, /PASS/i, /KEY/i, /URI/i];

function isSensitive(key) {
  return sensitivePatterns.some(p => p.test(key));
}
