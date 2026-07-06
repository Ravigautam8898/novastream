# ═══════════════════════════════════════════════════════════
# NovaStream - Server Installation Script (Windows PowerShell)
# ═══════════════════════════════════════════════════════════
# Usage:
#   .\install.ps1                     # Full install
#   .\install.ps1 -Help               # Show options
#   .\install.ps1 -SkipClient         # Skip frontend entirely
#   .\install.ps1 -SkipPM2            # Skip PM2 installation
#   .\install.ps1 -Production         # Install production deps only
#
# This script will:
#   1. Check system requirements (Node.js, npm)
#   2. Install server dependencies
#   3. Install CLI dependencies
#   4. Install frontend dependencies (if client/ exists)
#   5. Set up .env from template (if not exists)
#   6. Install PM2 globally (optional)
#   7. Create required directories
# ═══════════════════════════════════════════════════════════

param(
    [switch]$SkipClient,
    [switch]$SkipPM2,
    [switch]$Production,
    [switch]$Help
)

# Show help
if ($Help) {
    Write-Host @"
Usage: .\install.ps1 [options]

Options:
  -Help               Show this help message
  -Production         Install production deps only (skip devDependencies)
  -SkipClient         Skip frontend installation
  -SkipPM2            Skip PM2 installation
"@
    exit 0
}

$ErrorActionPreference = "Stop"
$Host.UI.RawUI.ForegroundColor = "White"
# Ensure script works from any directory
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "╔══════════════════════════════════════════════╗" -ForegroundColor Blue
Write-Host "║     NovaStream - Server Installation        ║" -ForegroundColor Blue
Write-Host "╚══════════════════════════════════════════════╝" -ForegroundColor Blue
Write-Host ""
Write-Host "  This script will install everything needed to run NovaStream." -ForegroundColor Cyan
Write-Host "  Sit back — it handles Node, npm, FFmpeg, and PM2." -ForegroundColor Cyan
Write-Host ""

# ── Helper Functions ──
function Info  { Write-Host "[INFO]  " -ForegroundColor Cyan -NoNewline; Write-Host $args }
function Ok    { Write-Host "[OK]    " -ForegroundColor Green -NoNewline; Write-Host $args }
function Warn  { Write-Host "[WARN]  " -ForegroundColor Yellow -NoNewline; Write-Host $args }
function Fail  { Write-Host "[FAIL]  " -ForegroundColor Red -NoNewline; Write-Host $args; exit 1 }
function Step  { Write-Host ""; Write-Host "── $args ──" -ForegroundColor Blue }

# Track failures
$script:Failures = @()

function Invoke-NpmInstall {
    param($Directory, $Label)

    if (-not (Test-Path "$Directory\package.json")) {
        Warn "$Label\package.json not found. Skipping."
        return
    }

    # Use --loglevel=error to suppress npm deprecation warnings (e.g. inflight)
    # which on Windows PowerShell get wrapped as ErrorRecord objects and
    # trigger $ErrorActionPreference = "Stop" before $LASTEXITCODE is checked.
    # We explicitly DO NOT redirect stderr (2>&1) for the same reason.
    $flags = @("--no-audit", "--no-fund", "--loglevel=error")
    if ($Production) {
        $flags += "--omit=dev"
    }

    $hasLockfile = Test-Path "$Directory\package-lock.json"
    $installType = "npm install"

    if ($hasLockfile) {
        Info "Installing $Label dependencies (npm ci)..."
        $installType = "npm ci"
        $result = & npm ci --prefix $Directory @flags
        if ($LASTEXITCODE -ne 0) {
            Warn "npm ci failed for $Label, falling back to npm install..."
            $installType = "npm install"
            $result = & npm install --prefix $Directory @flags
        }
    } else {
        Info "No package-lock.json found, using npm install..."
        $result = & npm install --prefix $Directory @flags
    }

    if ($LASTEXITCODE -eq 0) {
        Ok "$Label dependencies installed ($installType)"
    } else {
        $script:Failures += $Label
        Warn "$Label dependencies FAILED"
        if ($result) {
            Write-Host $result -ForegroundColor DarkRed
        }
    }
}

# ── 1. Check System Requirements ──
Step "Checking System Requirements"

# Node.js
try {
    $nodeVersion = node --version
    $nodeMajor = [int]($nodeVersion -replace '[v.]', '').Substring(0, 2)
    if ($nodeMajor -lt 18) {
        Fail "Node.js >= 18 required (found $nodeVersion). Please upgrade from https://nodejs.org"
    }
    Ok "Node.js $nodeVersion"

    if ($nodeMajor -lt 20) {
        Warn "Node.js >= 20 recommended for Vite 6+ (found $nodeVersion)"
        Warn "  Consider upgrading from https://nodejs.org"
    }
} catch {
    Fail "Node.js not found. Please install Node.js >= 18 from https://nodejs.org"
}

# npm
try {
    $npmVersion = npm --version
    Ok "npm $npmVersion"
} catch {
    Fail "npm not found. Please install Node.js (includes npm)"
}

# ── 2. Install Server Dependencies ──
Step "Installing Server Dependencies"

if (Test-Path "server") {
    Invoke-NpmInstall -Directory "server" -Label "Server"
} else {
    Warn "server/ directory not found. Skipping."
}

# ── 3. Install CLI Dependencies ──
Step "Installing CLI Dependencies"

if (Test-Path "cli") {
    Invoke-NpmInstall -Directory "cli" -Label "CLI"

    # Try to link novactl globally
    try {
        Push-Location cli
        $null = npm link --loglevel=error
        Ok "novactl linked globally (try: novactl --help)"
    } catch {
        Warn "Could not link novactl globally."
        Warn "  Alternative: use 'node cli\bin\novactl' or add cli\ to your PATH"
    } finally {
        Pop-Location
    }
} else {
    Warn "cli/ directory not found. Skipping."
}

# ── 4. Install Frontend Dependencies ──
if (-not $SkipClient) {
    Step "Installing Frontend Dependencies"

    if (Test-Path "client") {
        Invoke-NpmInstall -Directory "client" -Label "Frontend"
    } else {
        Info "client/ directory not found. Skipping."
    }
} else {
    Info "Skipping frontend installation (-SkipClient flag)"
}

# ── 5. Set Up Environment File ──
Step "Setting Up Environment"

if (Test-Path ".env") {
    Ok ".env file exists"
} else {
    if (Test-Path "docs/reference/.env.example") {
        Copy-Item "docs/reference/.env.example" ".env"
        Ok "Created .env from template"
        Warn "IMPORTANT: Edit .env with your configuration:"
        Warn "  - Set MONGODB_URI (required)"
        Warn "  - Set JWT_SECRET (generate: openssl rand -hex 32)"
        Warn "  - Set STREAM_SECRET (generate: openssl rand -hex 32)"
        Warn "  - Verify TMDB_API_KEY"
    } else {
        Warn "No .env template found at docs/reference/.env.example"
        Info "Create .env manually with your configuration"
    }
}

# ── 6. Create Required Directories ──
Step "Creating Required Directories"

$dirs = @("logs", "media", "thumbnails", "server\uploads", "server\thumbnails")
foreach ($dir in $dirs) {
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Ok "Created $dir/"
    } else {
        Ok "$dir/ already exists"
    }
}

# ── 7. Install PM2 ──
if (-not $SkipPM2) {
    Step "Installing Process Manager (PM2)"

    try {
        $pm2Version = pm2 --version
        Ok "PM2 $pm2Version already installed"
    } catch {
        Info "Installing PM2 globally..."
        try {
            npm install -g pm2
            Ok "PM2 installed"
        } catch {
            Warn "PM2 installation failed. Install manually: npm install -g pm2"
        }
    }
} else {
    Info "Skipping PM2 installation (-SkipPM2 flag)"
}

# ── 8. Install FFmpeg (via winget) ──
Step "Installing FFmpeg"

try {
    $ffmpegVersion = ffmpeg -version 2>&1 | Select-Object -First 1
    Ok "FFmpeg available: $ffmpegVersion"
} catch {
    Warn "FFmpeg not found. Required for video transcoding and thumbnail generation."
    # Try winget
    try {
        $winget = Get-Command winget -ErrorAction SilentlyContinue
        if ($winget) {
            Info "Installing FFmpeg via winget..."
            $result = winget install ffmpeg --accept-source-agreements --silent 2>&1 | Out-Null
            if ($LASTEXITCODE -eq 0) {
                Ok "FFmpeg installed via winget"
            } else {
                Warn "winget install failed. Install manually from https://ffmpeg.org"
            }
        } else {
            Warn "winget not available. Install FFmpeg manually:"
            Warn "  Download: https://ffmpeg.org/download.html"
            Warn "  Or use: winget install ffmpeg (Windows 10 1809+)"
        }
    } catch {
        Warn "Could not install FFmpeg. Please install manually: https://ffmpeg.org"
    }
}

# ── 9. Generate Lockfile for Root ──
if ((Test-Path "package.json") -and -not (Test-Path "package-lock.json")) {
    Step "Generating Root Lockfile"
    $result = & npm install --package-lock-only --prefix . --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -eq 0) {
        Ok "Root lockfile generated"
    } else {
        Warn "Could not generate root lockfile"
    }
}

# ── 10. Install Root Dev Dependencies ──
if (Test-Path "package.json") {
    Step "Installing Root Dev Dependencies"
    Invoke-NpmInstall -Directory "." -Label "Root"
}

# ── 11. Summary ──
Write-Host ""
Write-Host "╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Green
if ($script:Failures.Count -eq 0) {
    Write-Host "║          ✅ Installation Complete!                        ║" -ForegroundColor Green
} else {
    Write-Host "║     ✅ Installation Complete (with warnings)             ║" -ForegroundColor Yellow
}
Write-Host "╚═══════════════════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""

# ── Show loaded versions ──
Write-Host "  Installed versions:" -ForegroundColor Cyan
Write-Host "    Node.js    $(node --version)"
Write-Host "    npm        $(npm --version)"
try { Write-Host "    PM2        $(pm2 --version)" } catch {}
try { $fv = ffmpeg -version 2>&1 | Select-Object -First 1; Write-Host "    FFmpeg     $fv" } catch {}
Write-Host ""

Write-Host "  How to start:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  ┌─ Option 1: Full stack (recommended) ───────────────────┐" -ForegroundColor Green
Write-Host "  │                                                         │" -ForegroundColor Green
Write-Host "  │  npm run dev                                            │" -ForegroundColor Yellow
Write-Host "  │                                                         │" -ForegroundColor Green
Write-Host "  │  Starts both:                                           │" -ForegroundColor Green
Write-Host "  │    • API Server  → http://localhost:5000                │" -ForegroundColor Green
Write-Host "  │    • UI (client) → http://localhost:5173                │" -ForegroundColor Green
Write-Host "  │                                                         │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─ Option 2: Just the API server ───────────────────────┐" -ForegroundColor Green
Write-Host "  │                                                         │" -ForegroundColor Green
Write-Host "  │  npm run server                                         │" -ForegroundColor Yellow
Write-Host "  │  API at http://localhost:5000                            │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  ┌─ Option 3: Production (PM2) ──────────────────────────┐" -ForegroundColor Green
Write-Host "  │                                                         │" -ForegroundColor Green
Write-Host "  │  pm2 start ecosystem.config.js                          │" -ForegroundColor Yellow
Write-Host "  │  API at http://localhost:5000                            │" -ForegroundColor Green
Write-Host "  │  Then build client: npm run build                        │" -ForegroundColor Green
Write-Host "  └─────────────────────────────────────────────────────────┘" -ForegroundColor Green
Write-Host ""
Write-Host "  Admin Dashboard:" -ForegroundColor Cyan
Write-Host "    1. Open http://localhost:5173/login" -ForegroundColor White
Write-Host "    2. Login with admin credentials" -ForegroundColor White
Write-Host "    3. Navigate to http://localhost:5173/admin" -ForegroundColor White
Write-Host ""
Write-Host "  Useful commands:" -ForegroundColor Cyan
Write-Host "    novactl health     Check server readiness" -ForegroundColor Yellow
Write-Host "    novactl user add   Create first admin user" -ForegroundColor Yellow
Write-Host "    npm run logs       Tail server logs" -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path ".env")) {
    Write-Host "  ⚠ .env file not found. Create it:" -ForegroundColor Yellow
    Write-Host "    Copy-Item docs/reference/.env.example .env" -ForegroundColor Yellow
    Write-Host ""
}

# Symlink .env into server dir
if ((Test-Path ".env") -and (-not (Test-Path "server\.env"))) {
    try {
        New-Item -Path "server\.env" -ItemType SymbolicLink -Value "..\.env" -Force | Out-Null
    } catch {
        Copy-Item ".env" "server\.env" -Force
    }
}
