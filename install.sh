#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# NovaStream - Server Installation Script (Linux / macOS)
# ═══════════════════════════════════════════════════════════
# Usage:
#   chmod +x install.sh
#   ./install.sh                    # Full install
#   ./install.sh --help             # Show options
#   ./install.sh --production       # Skip frontend dev deps
#   ./install.sh --no-client        # Skip frontend entirely
#   ./install.sh --no-pm2           # Skip PM2 install
#
# This script will:
#   1. Check system requirements (Node.js >= 18, npm, system libs)
#   2. Install server dependencies (npm ci)
#   3. Install CLI dependencies (npm ci)
#   4. Install frontend dependencies (npm ci)
#   5. Set up .env from template (if not exists)
#   6. Install PM2 globally (optional)
#   7. Create required directories
# ═══════════════════════════════════════════════════════════

set -euo pipefail

# ── Parse Flags ──
SKIP_CLIENT=false
SKIP_PM2=false
PRODUCTION=false

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      echo "Usage: ./install.sh [options]"
      echo ""
      echo "Options:"
      echo "  --help, -h         Show this help message"
      echo "  --production       Install production deps only (skip devDependencies)"
      echo "  --no-client         Skip frontend installation"
      echo "  --no-pm2            Skip PM2 installation"
      exit 0
      ;;
    --no-client)    SKIP_CLIENT=true ;;
    --no-pm2)       SKIP_PM2=true ;;
    --production)   PRODUCTION=true ;;
  esac
done

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     NovaStream - Server Installation        ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${CYAN}  This script will install everything needed to run NovaStream.${NC}"
echo -e "${CYAN}  Sit back — it handles Node, npm, system libs, FFmpeg, and PM2.${NC}"
echo ""

# ── Helper Functions ──
info()  { echo -e "${CYAN}[INFO]${NC} $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}   $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
fail()  { echo -e "${RED}[FAIL]${NC} $1"; exit 1; }
step()  { echo ""; echo -e "${BLUE}── $1 ──${NC}"; }
confirm() {
  echo -e -n "${YELLOW}  ? $1 [Y/n]${NC} "
  read -r response
  case "$response" in
    [nN][oO]|[nN]) return 1 ;;
    *) return 0 ;;
  esac
}

# Track failures for summary
FAILURES=()

npm_install_dir() {
  local dir="$1"
  local label="$2"
  local extra_flags=""

  if [ ! -f "$dir/package.json" ]; then
    warn "$dir/package.json not found. Skipping."
    return
  fi

  if $PRODUCTION; then
    extra_flags="--omit=dev"
  fi

  info "Installing $label dependencies..."

  if [ -f "$dir/package-lock.json" ]; then
    if npm ci --prefix "$dir" $extra_flags --no-audit --no-fund 2>/dev/null; then
      ok "$label dependencies installed (npm ci)"
    else
      warn "npm ci failed for $label, falling back to npm install..."
      if npm install --prefix "$dir" $extra_flags --no-audit --no-fund; then
        ok "$label dependencies installed (npm install fallback)"
      else
        FAILURES+=("$label")
        warn "$label dependencies FAILED"
      fi
    fi
  else
    info "No package-lock.json found, using npm install..."
    if npm install --prefix "$dir" $extra_flags --no-audit --no-fund; then
      ok "$label dependencies installed"
    else
      FAILURES+=("$label")
      warn "$label dependencies FAILED"
    fi
  fi
}

# ── 1. Check System Requirements ──
step "Checking System Requirements"

# OS detection
OS="unknown"
case "$(uname -s)" in
  Linux*)  OS="linux" ;;
  Darwin*) OS="macos" ;;
esac

# Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    NODE_MAJOR=$(node --version | cut -d'.' -f1 | sed 's/v//')
    if [ "$NODE_MAJOR" -lt 18 ]; then
        fail "Node.js >= 18 required (found $NODE_VERSION). Please upgrade.

  Quick fix:
    nvm install 20     # if using nvm
    # or download from https://nodejs.org"
    fi
    ok "Node.js $NODE_VERSION"

    if [ "$NODE_MAJOR" -lt 20 ]; then
      warn "Node.js >= 20 recommended for Vite 6+ (found $NODE_VERSION)"
      warn "  Consider upgrading: nvm install 20"
    fi
else
    fail "Node.js not found. Please install Node.js >= 18 from https://nodejs.org"
fi

# npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    ok "npm $NPM_VERSION"
else
    fail "npm not found. Please install Node.js (includes npm)"
fi

# ── 0. Auto-install system dependencies (FFmpeg + canvas libs) ──
# We do this BEFORE everything else so the user can walk away.
step "Installing System Dependencies"

# macOS: Install Homebrew if missing, then FFmpeg + canvas libs
if [ "$OS" = "macos" ] && ! command -v ffmpeg &> /dev/null; then
  info "FFmpeg and Cairo libraries needed. Installing via Homebrew..."
  if ! command -v brew &> /dev/null; then
    info "Installing Homebrew first..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)" 2>/dev/null || \
      warn "Homebrew install failed. Install manually: https://brew.sh"
  fi
  if command -v brew &> /dev/null; then
    brew install ffmpeg cairo pango jpeg giflib librsvg 2>/dev/null && \
      ok "System dependencies installed via Homebrew" || \
      warn "Some Homebrew packages failed. Check output above."
  fi
fi

# Linux: Install FFmpeg + build-essential + canvas libs via apt
if [ "$OS" = "linux" ]; then
  # Determine package manager
  PKG_MANAGER=""
  if command -v apt &> /dev/null; then PKG_MANAGER="apt"
  elif command -v dnf &> /dev/null; then PKG_MANAGER="dnf"
  elif command -v yum &> /dev/null; then PKG_MANAGER="yum"
  elif command -v pacman &> /dev/null; then PKG_MANAGER="pacman"
  fi

  if [ -n "$PKG_MANAGER" ]; then
    # Build list of packages to install
    PACKAGES=""
    if ! command -v ffmpeg &> /dev/null; then
      PACKAGES="$PACKAGES ffmpeg"
    fi
    if ! command -v gcc &> /dev/null; then
      if [ "$PKG_MANAGER" = "apt" ]; then PACKAGES="$PACKAGES build-essential"
      elif [ "$PKG_MANAGER" = "dnf" ] || [ "$PKG_MANAGER" = "yum" ]; then PACKAGES="$PACKAGES gcc gcc-c++ make"
      elif [ "$PKG_MANAGER" = "pacman" ]; then PACKAGES="$PACKAGES base-devel"
      fi
    fi

    # Canvas native libs
    if [ "$PKG_MANAGER" = "apt" ]; then
      for lib in libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev; do
        if ! dpkg -s "$lib" &>/dev/null 2>&1; then
          PACKAGES="$PACKAGES $lib"
        fi
      done
    fi

    if [ -n "$PACKAGES" ]; then
      PACKAGES=$(echo "$PACKAGES" | xargs)  # trim
      info "Installing system packages:$PACKAGES"
      case "$PKG_MANAGER" in
        apt)    sudo apt update -qq && sudo apt install -y $PACKAGES ;; # removed -qq for visibility
        dnf)    sudo dnf install -y $PACKAGES ;;  
        yum)    sudo yum install -y $PACKAGES ;;
        pacman) sudo pacman -S --needed --noconfirm $PACKAGES ;;
      esac
      if [ $? -eq 0 ]; then
        ok "System packages installed"
      else
        warn "Some system packages may have failed. You may need to install them manually."
      fi
    else
      ok "All system packages already installed"
    fi
  else
    warn "No known package manager found. Install FFmpeg + build tools manually:"
    info "  FFmpeg: https://ffmpeg.org/download.html"
    info "  Build tools: gcc, make, cairo, pango, jpeg, giflib, librsvg"
  fi
fi

# ── Attempt nvm auto-switch ──
step "Setting Node.js Version"

if command -v nvm &> /dev/null && [ -f ".nvmrc" ]; then
  nvm use 2>/dev/null && \
    ok "Switched to Node.js $(node --version) via .nvmrc" || \
    warn "nvm use failed — you may need to install Node 20 first: nvm install 20"
elif [ -f ".nvmrc" ]; then
  # Try common nvm install locations
  for nvm_sh in "$HOME/.nvm/nvm.sh" "/usr/local/opt/nvm/nvm.sh" "/opt/homebrew/opt/nvm/nvm.sh"; do
    if [ -f "$nvm_sh" ]; then
      . "$nvm_sh" && nvm use 2>/dev/null && \
        ok "Switched to Node.js $(node --version) via .nvmrc" && break || \
        warn "nvm found at $nvm_sh but couldn't switch. Run: nvm install 20"
      break
    fi
  done
fi

# ── 2. Install Server Dependencies ──
step "Installing Server Dependencies"

if [ -d "server" ]; then
    npm_install_dir "server" "Server"
else
    warn "server/ directory not found. Skipping."
fi

# ── 3. Install CLI Dependencies ──
step "Installing CLI Dependencies"

if [ -d "cli" ]; then
    npm_install_dir "cli" "CLI"

    # Try to link novactl globally
    if command -v npm &> /dev/null; then
        # Check if npm prefix is writable
        NPM_PREFIX=$(npm config get prefix 2>/dev/null || echo "/usr/local")
        if [ -w "$NPM_PREFIX/lib/node_modules" ] 2>/dev/null || [ -w "$NPM_PREFIX" ] 2>/dev/null; then
            (cd cli && npm link) 2>/dev/null && \
                ok "novactl linked globally (try: novactl --help)" || \
                warn "Could not link novactl globally. Use: node cli/bin/novactl"
        else
            warn "Cannot link novactl globally (need sudo or configure npm prefix)"
            info "  Alternative: alias novactl='node $(pwd)/cli/bin/novactl'"
            info "  Or: sudo npm link in cli/ directory"
        fi
    fi
else
    warn "cli/ directory not found. Skipping."
fi

# ── 4. Install Frontend Dependencies ──
if ! $SKIP_CLIENT; then
    step "Installing Frontend Dependencies"

    if [ -d "client" ]; then
        npm_install_dir "client" "Frontend"
    else
        info "client/ directory not found. Skipping."
    fi
else
    info "Skipping frontend installation (--no-client flag)"
fi

# ── 5. Set Up Environment File ──
step "Setting Up Environment"

if [ -f ".env" ]; then
    ok ".env file exists"
else
    if [ -f "docs/reference/.env.example" ]; then
        cp docs/reference/.env.example .env
        ok "Created .env from template"
        warn "IMPORTANT: Edit .env with your configuration:"
        warn "  - Set MONGODB_URI (required)"
        warn "  - Set JWT_SECRET (generate: openssl rand -hex 32)"
        warn "  - Set STREAM_SECRET (generate: openssl rand -hex 32)"
        warn "  - Verify TMDB_API_KEY"
    else
        warn "No .env template found at docs/reference/.env.example"
        info "Create .env manually with your configuration"
    fi
fi

# ── 6. Create Required Directories ──
step "Creating Required Directories"

mkdir -p logs media thumbnails server/uploads server/thumbnails
ok "Directories created: logs/, media/, thumbnails/, server/uploads/, server/thumbnails/"

# ── 7. Install PM2 (optional) ──
if ! $SKIP_PM2; then
    step "Installing Process Manager (PM2)"

    if command -v pm2 &> /dev/null; then
        PM2_VERSION=$(pm2 --version)
        ok "PM2 $PM2_VERSION already installed"
    else
        info "Installing PM2 globally..."
        if npm install -g pm2 2>/dev/null; then
            ok "PM2 installed"
        else
            warn "PM2 installation failed. Install manually:"
            warn "  sudo npm install -g pm2"
            warn "  # or use: npx pm2"
        fi
    fi
else
    info "Skipping PM2 installation (--no-pm2 flag)"
fi

# ── 9. Generate Lockfile for Root (so subsequent runs use npm ci) ──
if [ -f "package.json" ] && [ ! -f "package-lock.json" ]; then
    step "Generating Root Lockfile"
    npm install --package-lock-only --prefix . --no-audit --no-fund 2>/dev/null && \
        ok "Root lockfile generated" || \
        warn "Could not generate root lockfile"
fi

# ── 10. Generate Secrets (if .env was just created) ──
if [ -f ".env" ] && grep -q "your-jwt-secret-here" .env 2>/dev/null; then
    step "Generating Security Secrets"

    JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "")
    STREAM_SECRET=$(openssl rand -hex 32 2>/dev/null || node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" 2>/dev/null || echo "")

    if [ -n "$JWT_SECRET" ]; then
        if [[ "$OSTYPE" == "darwin"* ]]; then
            sed -i '' "s/your-jwt-secret-here/$JWT_SECRET/" .env
            sed -i '' "s/your-stream-secret-here/$STREAM_SECRET/" .env
        else
            sed -i "s/your-jwt-secret-here/$JWT_SECRET/" .env
            sed -i "s/your-stream-secret-here/$STREAM_SECRET/" .env
        fi
        ok "Security secrets generated and saved to .env"
    fi
fi

# ── 11. Install Root Dev Dependencies ──
if [ -f "package.json" ]; then
    step "Installing Root Dev Dependencies"
    npm_install_dir "." "Root"
fi

# ── 12. Summary ──
echo ""
echo -e "${GREEN}╔═══════════════════════════════════════════════════════════╗${NC}"
if [ ${#FAILURES[@]} -eq 0 ]; then
    echo -e "${GREEN}║          ✅ Installation Complete!                        ║${NC}"
else
    echo -e "${YELLOW}║     ✅ Installation Complete (with warnings)             ║${NC}"
fi
echo -e "${GREEN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Show loaded versions ──
echo -e "  ${CYAN}Installed versions:${NC}"
echo -e "    Node.js    $(node --version)"
echo -e "    npm        $(npm --version)"
if command -v pm2 &> /dev/null; then echo -e "    PM2        $(pm2 --version)"; fi
if command -v ffmpeg &> /dev/null; then echo -e "    FFmpeg     $(ffmpeg -version 2>&1 | head -1)" ;fi
echo ""

echo -e "  ${CYAN}How to start:${NC}"
echo ""
echo -e "  ${GREEN}  ┌─ Option 1: Full stack (recommended) ───────────────────┐${NC}"
echo -e "  ${GREEN}  │                                                         │${NC}"
echo -e "  ${GREEN}  │  ${YELLOW}npm run dev${GREEN}                                        │${NC}"
echo -e "  ${GREEN}  │                                                         │${NC}"
echo -e "  ${GREEN}  │  Starts both:                                           │${NC}"
echo -e "  ${GREEN}  │    • API Server  → ${YELLOW}http://localhost:5000${GREEN}                │${NC}"
echo -e "  ${GREEN}  │    • UI (client) → ${YELLOW}http://localhost:5173${GREEN}                │${NC}"
echo -e "  ${GREEN}  │                                                         │${NC}"
echo -e "  ${GREEN}  └─────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${GREEN}  ┌─ Option 2: Just the API server ───────────────────────┐${NC}"
echo -e "  ${GREEN}  │                                                         │${NC}"
echo -e "  ${GREEN}  │  ${YELLOW}npm run server${GREEN}                                        │${NC}"
echo -e "  ${GREEN}  │  API at ${YELLOW}http://localhost:5000${GREEN}                             │${NC}"
echo -e "  ${GREEN}  └─────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${GREEN}  ┌─ Option 3: Production (PM2) ──────────────────────────┐${NC}"
echo -e "  ${GREEN}  │                                                         │${NC}"
echo -e "  ${GREEN}  │  ${YELLOW}pm2 start ecosystem.config.js${GREEN}                             │${NC}"
echo -e "  ${GREEN}  │  API at ${YELLOW}http://localhost:5000${GREEN}                             │${NC}"
echo -e "  ${GREEN}  │  Then build client: ${YELLOW}npm run build${GREEN}                         │${NC}"
echo -e "  ${GREEN}  └─────────────────────────────────────────────────────────┘${NC}"
echo ""
echo -e "  ${CYAN}Admin Dashboard:${NC}"
echo -e "    1. Open ${YELLOW}http://localhost:5173/login${NC} (or :5000 in production)"
echo -e "    2. Login with admin credentials"
echo -e "    3. Navigate to ${YELLOW}http://localhost:5173/admin${NC}"
echo ""
echo -e "  ${CYAN}Useful commands:${NC}"
echo -e "    ${YELLOW}novactl health${NC}     Check server readiness"
echo -e "    ${YELLOW}novactl user add${NC}   Create first admin user"
echo -e "    ${YELLOW}npm run logs${NC}       Tail server logs"
echo ""

if [ ! -f ".env" ]; then
    echo -e "  ${YELLOW}⚠ .env file not found. Create it from the template:${NC}"
    echo -e "    ${YELLOW}cp docs/reference/.env.example .env${NC}"
    echo ""
fi

if [ ! -f "server/.env" ] && [ -f ".env" ]; then
  # Symlink .env into server if not present
  if [ ! -f "server/.env" ]; then
    ln -sf ../.env server/.env 2>/dev/null || cp .env server/.env 2>/dev/null || true
  fi
fi
