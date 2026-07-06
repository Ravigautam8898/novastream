export function CardSkeleton() {
  return (
    <div className="flex-shrink-0 w-[150px] md:w-[160px]" aria-hidden="true">
      <div className="aspect-[2/3] rounded shimmer" />
      <div className="mt-2 h-3 w-3/4 rounded shimmer" />
      <div className="mt-1 h-2 w-1/2 rounded shimmer" />
    </div>
  );
}

export function RowSkeleton({ count = 10 }) {
  return (
    <div className="flex gap-2 overflow-hidden" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div
      className="min-h-screen bg-netflix-dark p-6 md:p-12"
      role="status"
      aria-busy="true"
      aria-label="Page content loading"
    >
      {/* Hero skeleton */}
      <div className="w-full h-[50vh] rounded-lg shimmer mb-8" aria-hidden="true" />

      {/* Content rows */}
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="mb-8" aria-hidden="true">
          <div className="h-5 w-40 rounded shimmer mb-3" />
          <RowSkeleton count={10} />
        </div>
      ))}
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div
      className="min-h-screen bg-netflix-dark"
      role="status"
      aria-busy="true"
      aria-label="Detail content loading"
    >
      {/* Header skeleton */}
      <div className="h-14 bg-netflix-dark-2 shimmer" aria-hidden="true" />

      {/* Backdrop hero skeleton */}
      <div className="relative w-full h-[50vh] md:h-[65vh] lg:h-[70vh] min-h-[350px] bg-netflix-dark-2 shimmer" />

      {/* Content area skeleton */}
      <div className="px-6 md:px-12 lg:px-16 max-w-7xl mx-auto" aria-hidden="true">
        {/* Poster + metadata row (desktop) */}
        <div className="flex gap-6 md:gap-8 -mt-24 relative z-10">
          {/* Poster skeleton (hidden on mobile) */}
          <div className="hidden md:block w-[180px] lg:w-[220px] aspect-[2/3] rounded-lg shimmer flex-shrink-0" />

          {/* Text content skeleton */}
          <div className="flex-1 min-w-0 pt-4 md:pt-0">
            <div className="h-4 w-20 rounded shimmer mb-3" />
            <div className="h-8 md:h-10 w-3/4 rounded shimmer mb-3" />
            <div className="h-4 w-1/2 rounded shimmer mb-3" />
            <div className="flex gap-2 mb-3">
              <div className="h-6 w-14 rounded-full shimmer" />
              <div className="h-6 w-14 rounded-full shimmer" />
              <div className="h-6 w-14 rounded-full shimmer" />
            </div>
            <div className="flex gap-3 mt-4">
              <div className="h-10 w-28 rounded shimmer" />
              <div className="h-10 w-28 rounded shimmer" />
            </div>
          </div>
        </div>

        {/* Spacer */}
        <div className="h-20" />

        {/* Overview section */}
        <div className="max-w-3xl mb-8">
          <div className="h-5 w-24 rounded shimmer mb-3" />
          <div className="space-y-2">
            <div className="h-3 w-full rounded shimmer" />
            <div className="h-3 w-5/6 rounded shimmer" />
            <div className="h-3 w-4/6 rounded shimmer" />
          </div>
        </div>

        {/* Cast section */}
        <div className="mb-8">
          <div className="h-5 w-16 rounded shimmer mb-3" />
          <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex-shrink-0 w-[80px] text-center">
                <div className="w-[80px] h-[80px] rounded-full shimmer mb-2" />
                <div className="h-3 w-16 mx-auto rounded shimmer" />
              </div>
            ))}
          </div>
        </div>

        {/* Trailers section */}
        <div className="mb-8">
          <div className="h-5 w-20 rounded shimmer mb-3" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-video rounded-lg shimmer" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
