#!/bin/sh
set -e

echo "=== Reneo CRM Services Initializing ==="
echo "Node Version: $(node -v)"
echo "Database Target: $DATABASE_URL"
echo "WAHA Target: $WAHA_BASE_URL"

# Ensure media uploads persist inside /app/data (mounted persistent volume)
PERSISTENT_DATA_DIR="${DATA_DIR:-/app/data}"
PERSISTENT_UPLOADS_DIR="${MEDIA_UPLOAD_DIR:-$PERSISTENT_DATA_DIR/uploads}"
mkdir -p "$PERSISTENT_UPLOADS_DIR" "$PERSISTENT_UPLOADS_DIR/profiles" "$PERSISTENT_UPLOADS_DIR/.meta"
if [ -d /app/uploads ] && [ ! -L /app/uploads ]; then
  cp -rn /app/uploads/. "$PERSISTENT_UPLOADS_DIR/" 2>/dev/null || true
  rm -rf /app/uploads
fi
if [ ! -e /app/uploads ]; then
  ln -s "$PERSISTENT_UPLOADS_DIR" /app/uploads
fi
export MEDIA_UPLOAD_DIR="$PERSISTENT_UPLOADS_DIR"

# Start Fastify Backend in background
echo "Starting Fastify CRM Backend on port 5000..."
node /app/backend/dist/server.js &

# Start Nginx in foreground
echo "Starting Nginx HTTP Server on port 80..."
exec nginx -g "daemon off;"

