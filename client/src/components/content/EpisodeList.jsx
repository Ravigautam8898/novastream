import { useState } from 'react';

import { TMDB_IMAGE_BASE } from '../../config/images';

/**
 * EpisodeList — Season/episode selector for series on the WatchPage.
 *
 * Layout:
 *   - Horizontal season tabs at top
 *   - Scrollable episode grid below showing selected season's episodes
 *   - Each episode shows: still image, number, title, duration, overview
 *   - Currently playing episode is highlighted
 *   - Clicking an episode fires onSelect callback
 *
 * Props:
 *   - seasons: Array of season objects (each containing episodes[])
 *   - slug: Series slug for navigation links
 *   - selectedEpisodeId: ID of the currently playing episode (_id)
 *   - onSelectEpisode: Callback(episode) when user clicks an episode
 */
export default function EpisodeList({
  seasons = [],
  slug,
  selectedEpisodeId,
  onSelectEpisode,
  onSeasonChange, // Optional callback(season) when season tab changes — used by DetailPage to sync Play button
}) {
  const [selectedSeasonNumber, setSelectedSeasonNumber] = useState(
    seasons.length > 0 ? seasons[0].seasonNumber : null
  );

  const selectedSeason = seasons.find(
    (s) => s.seasonNumber === selectedSeasonNumber
  );
  const episodes = selectedSeason?.episodes || [];

  return (
    <div className="w-full">
      {/* ── Season Tabs ── */}
      {seasons.length > 1 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {seasons.map((season) => (
            <button
              key={season.seasonNumber}
              onClick={() => {
                setSelectedSeasonNumber(season.seasonNumber);
                onSeasonChange?.(season);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
                selectedSeasonNumber === season.seasonNumber
                  ? 'bg-netflix-red text-white shadow-sm'
                  : 'bg-netflix-dark-2 text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 border border-netflix-border/50'
              }`}
            >
              {season.name || `Season ${season.seasonNumber}`}
              <span className="ml-1 text-[10px] opacity-70">
                ({season.episodeCount || episodes.length})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* ── Season Info Bar ── */}
      {selectedSeason && (
        <div className="flex items-start gap-3 mb-4 p-3 bg-netflix-dark-2 rounded-lg border border-netflix-border/30">
          {selectedSeason.posterPath && (
            <img
              src={`${TMDB_IMAGE_BASE}/w92${selectedSeason.posterPath}`}
              alt={selectedSeason.name}
              className="w-[60px] rounded object-cover flex-shrink-0 hidden sm:block"
            />
          )}
          <div className="min-w-0">
            <h3 className="text-white text-sm font-semibold">
              {selectedSeason.name || `Season ${selectedSeason.seasonNumber}`}
            </h3>
            {selectedSeason.overview && (
              <p className="text-netflix-text-3 text-xs mt-0.5 line-clamp-2">
                {selectedSeason.overview}
              </p>
            )}
            {(selectedSeason.airDate || episodes.length > 0) && (
              <div className="flex gap-3 mt-1 text-[11px] text-netflix-text-3">
                {selectedSeason.airDate && (
                  <span>{new Date(selectedSeason.airDate).getFullYear()}</span>
                )}
                {episodes.length > 0 && (
                  <span>{episodes.length} Episode{episodes.length !== 1 ? 's' : ''}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Episode List ── */}
      <div className="space-y-1.5 max-h-[50vh] overflow-y-auto pr-1 scrollbar-thin">
        {episodes.length === 0 ? (
          <p className="text-netflix-text-3 text-xs text-center py-8">
            No episodes available for this season.
          </p>
        ) : (
          episodes.map((episode, index) => {
            // Safely check if this episode is selected. Both values must be
            // defined to avoid `undefined === undefined` false positives
            // (common when externally-sourced episodes lack MongoDB _id fields).
            const isSelected = selectedEpisodeId && episode._id && episode._id === selectedEpisodeId;
            const stillUrl = episode.stillPath
              ? episode.stillPath.startsWith('http')
                ? episode.stillPath
                : `${TMDB_IMAGE_BASE}/w300${episode.stillPath}`
              : null;

            return (
              <button
                key={episode._id || episode.episodeNumber}
                onClick={() => onSelectEpisode(episode)}
                className={`w-full text-left flex gap-3 p-2 rounded-lg transition-all duration-200 group ${
                  isSelected
                    ? 'bg-netflix-red/10 border border-netflix-red/30'
                    : 'hover:bg-netflix-dark-2 border border-transparent'
                }`}
              >
                {/* Episode thumbnail */}
                <div className="relative flex-shrink-0 w-[120px] sm:w-[150px] aspect-video rounded-md overflow-hidden bg-netflix-dark-3">
                  {stillUrl ? (
                    <img
                      src={stillUrl}
                      alt={episode.name}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-netflix-text-3">
                      <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  )}

                  {/* Ep number badge */}
                  <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[10px] font-semibold px-1.5 py-0.5 rounded">
                    {episode.episodeNumber}
                  </span>

                  {/* Playing indicator */}
                  {isSelected && (
                    <div className="absolute inset-0 bg-netflix-red/20 flex items-center justify-center">
                      <span className="bg-netflix-red text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase">
                        Playing
                      </span>
                    </div>
                  )}
                </div>

                {/* Episode info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-white text-sm font-medium truncate group-hover:text-netflix-red transition-colors">
                      {episode.episodeNumber}. {episode.name || `Episode ${episode.episodeNumber}`}
                    </h4>
                  </div>

                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-netflix-text-3">
                    {episode.runtime && (
                      <span>{Math.floor(episode.runtime / 60)}h {episode.runtime % 60}m</span>
                    )}
                    {episode.airDate && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-netflix-text-3/50" />
                        <span>{new Date(episode.airDate).toLocaleDateString()}</span>
                      </>
                    )}
                    {episode.voteAverage > 0 && (
                      <>
                        <span className="w-1 h-1 rounded-full bg-netflix-text-3/50" />
                        <span className="text-netflix-green">★ {episode.voteAverage.toFixed(1)}</span>
                      </>
                    )}
                  </div>

                  {episode.overview && (
                    <p className="text-netflix-text-2 text-xs mt-1 line-clamp-2 leading-relaxed">
                      {episode.overview}
                    </p>
                  )}
                </div>

                {/* Play icon */}
                <div className={`flex-shrink-0 flex items-center ${
                  isSelected ? 'text-netflix-red' : 'text-netflix-text-3 opacity-0 group-hover:opacity-100'
                } transition-all duration-200`}>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
