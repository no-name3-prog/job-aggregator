# syntax=docker/dockerfile:1
# DE Apply Tracker — API + built dashboard (single image)

ARG NODE_VERSION=20

# ---------- Web build ----------
FROM node:${NODE_VERSION}-bookworm-slim AS web-builder
WORKDIR /app/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---------- App deps ----------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# tsx is needed at runtime to run TypeScript sources
RUN npm ci

# ---------- Runtime ----------
FROM node:${NODE_VERSION}-bookworm-slim AS app
WORKDIR /app

ENV NODE_ENV=production \
    PORT=8787 \
    CORS_ORIGIN=* \
    MONGODB_DB=job_aggregator

# Non-root user
RUN useradd --create-home --uid 10001 appuser \
  && mkdir -p /app/data/store /app/data/data-engineer \
  && chown -R appuser:appuser /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
COPY config ./config
# Seed job JSON if present (optional; can also volume-mount)
COPY data ./data
COPY --from=web-builder /app/web/dist ./web/dist

# Ensure writable store for file-based DB
RUN chown -R appuser:appuser /app/data

USER appuser
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Default: serve API + static dashboard
CMD ["npx", "tsx", "src/api/server.ts"]
