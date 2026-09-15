FROM oven/bun:1.3.14-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile

COPY backend backend
# The checkout can contain TypeScript incremental metadata while dist is excluded
# from the Docker context. Remove it so a fresh image always emits its artifacts.
RUN rm -rf backend/dist && rm -f backend/*.tsbuildinfo && bun run --cwd backend prisma:generate && bun run --cwd backend build

FROM build AS migrate

WORKDIR /app/backend
CMD ["bun", "run", "prisma:migrate:deploy"]

FROM oven/bun:1.3.14-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
COPY backend/package.json backend/package.json
RUN bun install --frozen-lockfile --production

COPY --from=build /app/backend/dist backend/dist
COPY backend/prisma backend/prisma

WORKDIR /app/backend
EXPOSE 3001
CMD ["bun", "run", "start"]
