import { useState, useRef, useEffect } from 'react';

/**
 * SourceSelector — OTT-style source selection dropdown.
 *
 * Default: Auto ⭐ Recommended (ProviderManager decides).
 * Advanced: Fast Sources (API) and Backup Sources (Scraper) with health status.
 *
 * Props:
 *   - sources: { fast: Array<{ id, label, type, status }>, backup: Array<{ id, label, type, status }> }
 *   - currentProvider: { type, label, status }
 *   - selectedSourceId: string | null (null = Auto)
 *   - onSourceChange: (sourceId: string | null) => void — null = Auto
 *   - isAdmin: boolean — if true, shows real provider names (from backend)
 */
export default function SourceSelector({
  sources,
  currentProvider,
  selectedSourceId,
  onSourceChange,
  isAdmin = false,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAuto = selectedSourceId === null;
  const hasFastSources = sources?.fast?.length > 0;
  const hasBackupSources = sources?.backup?.length > 0;
  const totalSources = (sources?.fast?.length || 0) + (sources?.backup?.length || 0);

  const handleSelect = (sourceId) => {
    onSourceChange(sourceId);
    setIsOpen(false);
  };

  const handleAuto = () => {
    onSourceChange(null);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 text-xs text-netflix-text-2 hover:text-white transition-colors px-2 py-1 rounded hover:bg-netflix-dark-3/50"
        title={isAuto ? 'Auto source — ProviderManager chooses the best source' : `Manual source selected`}
      >
        <span className="text-yellow-400 text-sm leading-none">
          {isAuto ? '\u2B50' : '\uD83D\uDD17'}
        </span>
        <span className="font-medium">
          {isAuto ? 'Auto' : 'Manual'}
        </span>
        <span className="text-netflix-text-3 text-[10px]">
          {currentProvider?.label || 'Recommended'}
        </span>
        <svg
          className={`w-3 h-3 text-netflix-text-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M7 10l5 5 5-5z" />
        </svg>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-64 bg-netflix-dark-3 border border-netflix-border/40 rounded-lg shadow-xl z-30 py-1 animate-fadeIn">
          {/* Auto option */}
          <button
            onClick={handleAuto}
            className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-netflix-dark-2/80 ${
              isAuto ? 'text-white bg-netflix-red/10' : 'text-netflix-text-2'
            }`}
          >
            <span className="text-lg">{'\u2B50'}</span>
            <div className="text-left">
              <p className="font-medium text-white">Auto</p>
              <p className="text-[11px] text-netflix-text-3">
                Recommended — {totalSources > 0 ? `${totalSources} sources available` : 'no sources'}
              </p>
            </div>
            {isAuto && (
              <svg className="w-4 h-4 text-netflix-red ml-auto" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
            )}
          </button>

          <div className="border-t border-netflix-border/20 my-1" />

          {/* Fast Sources section */}
          {hasFastSources && (
            <>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-netflix-text-3 uppercase tracking-wider">
                Fast Sources
              </div>
              {sources.fast.map((source) => (
                <button
                  key={source.id}
                  onClick={() => handleSelect(source.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-netflix-dark-2/80 ${
                    !isAuto && selectedSourceId === source.id
                      ? 'text-white bg-netflix-red/10'
                      : 'text-netflix-text-2'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    source.status === 'healthy' ? 'bg-netflix-green' : 'bg-yellow-500'
                  }`} />
                  <span className="flex-1 text-left">{source.label}</span>
                  {!isAuto && selectedSourceId === source.id && (
                    <svg className="w-4 h-4 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Backup Sources section */}
          {hasBackupSources && (
            <>
              <div className="px-4 py-1.5 text-[10px] font-semibold text-netflix-text-3 uppercase tracking-wider mt-1">
                Backup Sources
              </div>
              {sources.backup.map((source) => (
                <button
                  key={source.id}
                  onClick={() => handleSelect(source.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors hover:bg-netflix-dark-2/80 ${
                    !isAuto && selectedSourceId === source.id
                      ? 'text-white bg-netflix-red/10'
                      : 'text-netflix-text-2'
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    source.status === 'healthy' ? 'bg-yellow-500' : 'bg-netflix-text-3'
                  }`} />
                  <span className="flex-1 text-left">{source.label}</span>
                  {!isAuto && selectedSourceId === source.id && (
                    <svg className="w-4 h-4 text-netflix-red" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                    </svg>
                  )}
                </button>
              ))}
            </>
          )}

          {/* No sources */}
          {!hasFastSources && !hasBackupSources && (
            <div className="px-4 py-3 text-xs text-netflix-text-3 text-center">
              No alternative sources available
            </div>
          )}
        </div>
      )}
    </div>
  );
}
