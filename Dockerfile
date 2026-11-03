# Maverick container image, used by cloud hosts (Render, Railway, Fly.io…).
FROM node:22-bookworm-slim

ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable

WORKDIR /app

# Install dependencies first (cached between builds when only code changes).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc* ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

ENV NODE_ENV=production \
    MAVERICK_DATA_DIR=/data/pglite \
    PORT=3000

# Maverick runs as the unprivileged "node" user (the entrypoint drops root after
# fixing ownership of the persistent disk mounted at /data).
RUN mkdir -p /data && chown -R node:node /data /app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/app/scripts/docker-start.sh"]
