import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

// Standard TMDB genres for Discover navigation
const GENRES = [
  { name: 'Action', slug: 'action' },
  { name: 'Adventure', slug: 'adventure' },
  { name: 'Comedy', slug: 'comedy' },
  { name: 'Drama', slug: 'drama' },
  { name: 'Horror', slug: 'horror' },
  { name: 'Mystery', slug: 'mystery' },
  { name: 'Sci-Fi', slug: 'science-fiction' },
  { name: 'Thriller', slug: 'thriller' },
];

// Hardcoded categories (existing, preserved)
const CATEGORIES = [
  { name: 'Hollywood', slug: 'hollywood', icon: '🇺🇸' },
  { name: 'Bollywood', slug: 'bollywood', icon: '🇮🇳' },
  { name: 'Korean', slug: 'korean', icon: '🇰🇷' },
  { name: 'South Indian', slug: 'south-indian', icon: '🇮🇳' },
];

export default function Header() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [scrolled, setScrolled] = useState(false);

  // Track scroll for background change
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery('');
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ${
        scrolled ? 'bg-netflix-dark shadow-lg' : 'bg-gradient-to-b from-black/80 to-transparent'
      }`}
    >
      <div className="flex items-center justify-between px-6 md:px-12 h-16">
        {/* Left: Logo + Nav */}
        <div className="flex items-center gap-8">
          <Link to="/" className="text-netflix-red text-2xl font-bold tracking-tight hover:scale-105 transition-transform">
            NovaStream
          </Link>
          <nav className="hidden md:flex items-center gap-5">
            <Link to="/" className="text-netflix-text-2 hover:text-white text-sm font-medium transition-colors">
              Home
            </Link>
            {/* D-011: Discover dropdown (renamed from Browse) */}
            <div className="relative group">
              <button className="text-netflix-text-2 hover:text-white text-sm font-medium transition-colors flex items-center gap-1">
                Discover
                <svg className="w-3 h-3 mt-0.5 group-hover:rotate-180 transition-transform duration-200" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                </svg>
              </button>
              <div className="absolute top-full left-0 mt-2 w-52 bg-netflix-dark-2 border border-netflix-border rounded-lg shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                {/* Trending & New Releases */}
                <Link
                  to="/search?q=trending"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors rounded-t-lg"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
                  </svg>
                  Trending
                </Link>
                <Link
                  to="/search?q=new"
                  className="flex items-center gap-2 px-4 py-2.5 text-sm text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14l-5-5 1.41-1.41L12 14.17l7.59-7.59L21 8l-9 9z" />
                  </svg>
                  New Releases
                </Link>

                {/* Divider */}
                <div className="border-t border-netflix-border/50 my-1" />

                {/* Categories */}
                <div className="px-4 py-1.5 text-[11px] text-netflix-text-3 uppercase tracking-wider font-semibold">
                  Categories
                </div>
                {CATEGORIES.map((cat) => (
                  <Link
                    key={cat.slug}
                    to={`/category/${cat.slug}`}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors"
                  >
                    <span>{cat.icon}</span> {cat.name}
                  </Link>
                ))}

                {/* Divider */}
                <div className="border-t border-netflix-border/50 my-1" />

                {/* Genres sub-nav */}
                <div className="px-4 py-1.5 text-[11px] text-netflix-text-3 uppercase tracking-wider font-semibold">
                  Genres
                </div>
                <div className="grid grid-cols-2">
                  {GENRES.map((genre) => (
                    <Link
                      key={genre.slug}
                      to={`/category/${genre.slug}`}
                      className="px-4 py-1.5 text-sm text-netflix-text-2 hover:text-white hover:bg-netflix-dark-3 transition-colors"
                    >
                      {genre.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link to="/search" className="text-netflix-text-2 hover:text-white text-sm font-medium transition-colors">
              Search
            </Link>
            <Link to="/my-list" className="text-netflix-text-2 hover:text-white text-sm font-medium transition-colors">
              My List
            </Link>
            <Link to="/history" className="text-netflix-text-2 hover:text-white text-sm font-medium transition-colors">
              History
            </Link>
            {isAdmin && (
              <Link to="/admin" className="text-netflix-green text-xs font-semibold uppercase tracking-wider ml-2 hover:text-green-300 transition-colors">
                Admin
              </Link>
            )}
          </nav>
        </div>

        {/* Right: Search + User */}
        <div className="flex items-center gap-4">
          <form onSubmit={handleSearch} className="hidden sm:flex items-center">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="bg-netflix-dark-2 border border-netflix-border rounded px-3 py-1.5 text-sm
                text-netflix-text placeholder-netflix-text-3 w-40 focus:w-56
                focus:outline-none focus:border-netflix-text-2 transition-all duration-300"
            />
          </form>

          <div className="flex items-center gap-3">
            <span className="text-sm text-netflix-text-2 hidden sm:block">
              {user?.username}
            </span>
            <button
              onClick={logout}
              className="text-netflix-text-2 hover:text-netflix-red text-sm transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
