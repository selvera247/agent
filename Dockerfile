# FinDataGraph — single-host API + web
FROM node:22-bookworm-slim AS build

WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY apps/mcp-close/package.json apps/mcp-close/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY . .
RUN npm run build -w @findatagraph/web

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/data/findatagraph.db
ENV CORS_ORIGIN=*
ENV AUTH_MODE=local
ENV AUTH_ALLOW_LOCAL=1
ENV JWT_SECRET=dev-docker-change-me

RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/mcp/package.json apps/mcp/
COPY apps/mcp-close/package.json apps/mcp-close/
COPY packages/shared/package.json packages/shared/
RUN npm ci --omit=dev

COPY apps/api apps/api
COPY packages/shared packages/shared
COPY registry registry
COPY docs docs
COPY --from=build /app/apps/web/dist apps/web/dist

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 4000

CMD ["node", "apps/api/src/index.js"]
