# Stage 1: Build Frontend (React + Vite + Tailwind) on native builder platform
FROM --platform=$BUILDPLATFORM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

COPY frontend/tsconfig.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js frontend/index.html ./
COPY frontend/public ./public/
COPY frontend/src ./src/
RUN npm run build

# Stage 2: Build Backend (Fastify + Drizzle ORM + TypeScript) on native builder platform
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund

COPY backend/tsconfig.json backend/drizzle.config.ts ./
COPY backend/drizzle ./drizzle/
COPY backend/src ./src/
RUN npm run build

# Stage 3: Install pure-JS Backend production dependencies on native builder platform
# (Avoids running npm install under slow QEMU emulation on target arm64 runners)
FROM --platform=$BUILDPLATFORM node:20-alpine AS backend-prod-deps
WORKDIR /app/backend

COPY backend/package*.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm install --omit=dev --no-optional --no-audit --no-fund

# Stage 4: Unified Production Runner (Nginx + Node 20)
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache nginx openssl

# Copy Frontend SPA build to Nginx
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy Backend production dependencies & build
COPY --from=backend-builder /app/backend/package*.json ./backend/
COPY --from=backend-prod-deps /app/backend/node_modules ./backend/node_modules
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY --from=backend-builder /app/backend/drizzle ./backend/drizzle

# Nginx config & Entrypoint script
COPY deploy/nginx-unified.conf /etc/nginx/http.d/default.conf
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=5000

CMD ["/app/entrypoint.sh"]
