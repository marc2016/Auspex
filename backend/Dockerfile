FROM node:22-slim AS base
WORKDIR /app

# Install OS deps for better-sqlite3 and git operations
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    python3 \
    make \
    g++ \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

# ─── Install dependencies ─────────────────────────────────────────────────────
COPY package.json ./
COPY shared/package.json ./shared/
COPY backend/package.json ./backend/
RUN npm install --workspaces

# ─── Build shared types ───────────────────────────────────────────────────────
COPY shared/ ./shared/
RUN npm run build --workspace=shared

# ─── Build backend ────────────────────────────────────────────────────────────
COPY backend/ ./backend/
RUN npm run build --workspace=backend

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/shared/dist ./shared/dist
COPY --from=base /app/backend/dist ./backend/dist
COPY --from=base /app/package.json ./
COPY --from=base /app/backend/package.json ./backend/

# Data directory for SQLite (override with Docker volume)
RUN mkdir -p /data
ENV DATA_DIR=/data

EXPOSE 4000
CMD ["node", "backend/dist/server.js"]
