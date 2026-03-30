FROM node:25-alpine AS deps
WORKDIR /app
RUN npm install -g pnpm
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:25-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Backend API URL (can be overridden at build time or runtime)
ARG BACKEND_URL=http://127.0.0.1:8000
ENV BACKEND_URL=${BACKEND_URL}
RUN pnpm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Bind to all interfaces (IPv4 + IPv6) so the container port is reachable from the host
ENV HOSTNAME="::"
# Runtime API base URL (override at container start)
ENV BACKEND_URL=http://127.0.0.1:8000

# Standalone output includes only the traced files the app needs —
# no full node_modules install required in the production image.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

# Health check — polls the app's /health endpoint every 30 s.
# start-period gives Next.js time to fully initialise before checks begin.
# Container is marked unhealthy after 3 consecutive failures (90 s total).
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["sh", "-c", "node scripts/write-runtime-config.mjs && node server.js"]
