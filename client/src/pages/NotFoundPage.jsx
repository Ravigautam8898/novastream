import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';

export default function NotFoundPage() {
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-netflix-dark px-4 text-center relative overflow-hidden">
      {/* ── Background gradient glow ── */}
      <div className="absolute inset-0 bg-gradient-to-b from-netflix-red/5 via-transparent to-netflix-dark pointer-events-none" />

      {/* ── Decorative grid pattern ── */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }}
      />

      {/* ── Content ── */}
      <div
        className={`relative z-10 transition-all duration-700 transform ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
      >
        {/* Error code */}
        <div className="relative mb-4">
          <span className="text-[12rem] sm:text-[16rem] font-bold text-netflix-red/10 select-none absolute left-1/2 -translate-x-1/2 -top-20 sm:-top-32">
            404
          </span>
          <span className="text-8xl sm:text-9xl font-bold text-netflix-red relative">
            404
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-semibold text-white mb-3">
          Page not found
        </h1>

        {/* Description */}
        <p className="text-netflix-text-2 max-w-md mx-auto mb-2 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        {/* Current path info */}
        <div className="mb-8">
          <code className="text-xs bg-netflix-dark-2 text-netflix-text-3 px-3 py-1.5 rounded-md border border-netflix-border/30 font-mono">
            {location.pathname}
          </code>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            to="/"
            className="bg-netflix-red text-white px-8 py-3 rounded-lg font-semibold hover:bg-netflix-red-hover transition-all duration-200 shadow-lg shadow-netflix-red/20 hover:shadow-netflix-red/30 hover:scale-105 active:scale-95"
          >
            Go Home
          </Link>
          <Link
            to="/search"
            className="bg-netflix-dark-3 text-white px-8 py-3 rounded-lg font-semibold border border-netflix-border/50 hover:border-netflix-text-2/50 hover:bg-netflix-dark-2 transition-all duration-200 hover:scale-105 active:scale-95"
          >
            Browse Content
          </Link>
        </div>

        {/* Helpful links */}
        <div className="mt-12 flex items-center justify-center gap-6 text-sm text-netflix-text-3">
          <Link to="/" className="hover:text-white transition-colors duration-200">Home</Link>
          <span className="w-1 h-1 rounded-full bg-netflix-text-3/30" />
          <Link to="/search" className="hover:text-white transition-colors duration-200">Search</Link>
          <span className="w-1 h-1 rounded-full bg-netflix-text-3/30" />
          <a href="mailto:support@novastream.app" className="hover:text-white transition-colors duration-200">Contact Support</a>
        </div>
      </div>

      {/* ── Error details (only in development) ── */}
      {import.meta.env.DEV && (
        <div className="absolute bottom-4 left-4 text-[10px] text-netflix-text-3/50 font-mono">
          {location.pathname}
        </div>
      )}
    </div>
  );
}
