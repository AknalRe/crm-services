# Stage 1: Build Frontend (React + Vite + Tailwind)
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm install

COPY frontend/tsconfig.json frontend/vite.config.ts frontend/tailwind.config.js frontend/postcss.config.js frontend/index.html ./
COPY frontend/src ./src/
RUN npm run build

# Stage 2: Build Backend (Fastify + Drizzle ORM + TypeScript)
FROM node:20-alpine AS backend-builder
WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install

COPY backend/tsconfig.json backend/drizzle.config.ts ./
COPY backend/src ./src/
RUN npm run build

# Stage 3: Unified Production Runner (Nginx + Node 20)
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache nginx openssl libc6-compat

# Copy Frontend SPA build to Nginx
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html

# Copy Backend production build
COPY --from=backend-builder /app/backend/package*.json ./backend/
RUN cd backend && npm install --omit=dev
COPY --from=backend-builder /app/backend/dist ./backend/dist

# Nginx config & Entrypoint script
COPY deploy/nginx-unified.conf /etc/nginx/http.d/default.conf
COPY deploy/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

EXPOSE 80

ENV NODE_ENV=production
ENV PORT=5000

CMD ["/app/entrypoint.sh"]

