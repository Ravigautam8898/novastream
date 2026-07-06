#!/bin/sh
# NovaStream — Production Start Script
# Starts Nginx (reverse proxy for client) and PM2 (Node.js server)

set -e

echo "=== NovaStream Production Startup ==="

# Ensure required directories exist
mkdir -p /app/server/uploads /app/server/thumbnails /app/logs

# Check for .env, use example if not present
if [ ! -f /app/.env ]; then
    if [ -f /app/.env.example ]; then
        echo "⚠️  No .env found — copying from .env.example"
        echo "⚠️  Please edit /app/.env with your actual credentials"
        cp /app/.env.example /app/.env
    else
        echo "❌ No .env or .env.example found"
        exit 1
    fi
fi

# Start Nginx
echo "Starting Nginx..."
nginx -g "daemon off;" &
NGINX_PID=$!
echo "Nginx started (PID: $NGINX_PID)"

# Start Node.js server with PM2
echo "Starting Node.js server..."
cd /app
npx pm2-runtime start ecosystem.config.js --env production &
PM2_PID=$!
echo "PM2 started (PID: $PM2_PID)"

# Health check wait
sleep 3

# Verify both services are running
if kill -0 $NGINX_PID 2>/dev/null; then
    echo "✅ Nginx is running"
else
    echo "❌ Nginx failed to start"
    exit 1
fi

echo "✅ NovaStream is running"
echo "   Client: http://localhost:80"
echo "   API:    http://localhost:5000/api/health"

# Wait for any process to exit
wait
