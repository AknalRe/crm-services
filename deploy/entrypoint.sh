#!/bin/sh
set -e

echo "=== Reneo CRM Services Initializing ==="
echo "Node Version: $(node -v)"
echo "Database Target: $DATABASE_URL"
echo "WAHA Target: $WAHA_BASE_URL"

# Start Fastify Backend in background
echo "Starting Fastify CRM Backend on port 5000..."
node /app/backend/dist/server.js &

# Start Nginx in foreground
echo "Starting Nginx HTTP Server on port 80..."
exec nginx -g "daemon off;"

