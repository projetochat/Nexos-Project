FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile

COPY scripts/verify-resource-safety.mjs scripts/verify-resource-safety.d.mts scripts/
COPY backend backend
# The checkout can contain TypeScript incremental metadata while dist is excluded
# from the Docker context. Remove it so a fresh image always emits its artifacts.
RUN rm -rf backend/dist && rm -f backend/*.tsbuildinfo && bun run --cwd backend prisma:generate && bun run --cwd backend build

FROM build AS migrate

WORKDIR /app/backend
USER bun
# Safe by default: release.py must opt in explicitly after two read-only preflights.
CMD ["bun", "run", "prisma:migrate:deploy", "--help"]

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache ffmpeg

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile --production

COPY --from=build /app/backend/dist backend/dist
COPY backend/prisma backend/prisma

RUN mkdir -p /var/lib/trixus/storage && chown -R bun:bun /var/lib/trixus/storage

WORKDIR /app/backend
USER bun
EXPOSE 3001
CMD ["bun", "run", "start"]
