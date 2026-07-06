# ═══════════════════════════════════════════════════════════════
# NovaStream — Multi-Stage Docker Build
# ═══════════════════════════════════════════════════════════════
#
# Stage 1: Client Build (Vite → static assets)
# Stage 2: Server Build (Node.js dependencies)
# Stage 3: Production (Nginx + Node.js)

# ── Stage 1: Client Build ──
FROM node:20-alpine AS client-builder

WORKDIR /app/client

# Copy dependency files
COPY client/package.json client/package-lock.json ./

# Install dependencies (PPR-011: needs devDeps for Vite build)
RUN npm ci

# Copy source
COPY client/ .

# Build static assets
RUN npm run build

# ── Stage 2: Server Build ──
FROM node:20-alpine AS server-builder

WORKDIR /app/server

# Install system dependencies for canvas + ffmpeg
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev \
    librsvg-dev \
    ffmpeg

# Copy dependency files
COPY server/package.json server/package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy server source
COPY server/ .

# ── Stage 3: Production ──
FROM node:20-alpine

WORKDIR /app

# Install runtime system dependencies
RUN apk add --no-cache \
    ffmpeg \
    cairo \
    pango \
    jpeg \
    giflib \
    librsvg \
    nginx

# Copy built client from stage 1
COPY --from=client-builder /app/client/dist /app/client/dist

# Copy server from stage 2
COPY --from=server-builder /app/server /app/server

# Copy PM2 ecosystem config
COPY ecosystem.config.js /app/

# Copy environment template
COPY docs/reference/.env.example /app/.env.example

# Create required directories
RUN mkdir -p /app/server/uploads /app/server/thumbnails /app/logs

# Nginx configuration for serving client + proxying API
COPY docker/nginx.conf /etc/nginx/http.d/default.conf

# Start script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

EXPOSE 80
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/api/health || exit 1

CMD ["/app/start.sh"]
