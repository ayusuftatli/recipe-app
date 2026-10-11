# better-sqlite3 and sharp are native modules: build and run on the same base image.
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_PATH=/data/recipes.db \
    PHOTO_DIR=/data/photos \
    MIGRATIONS_DIR=/app/drizzle \
    BODY_SIZE_LIMIT=20M
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
EXPOSE 3000
# Migrations run in hooks.server.ts init(), before the server starts listening.
CMD ["node", "build"]
