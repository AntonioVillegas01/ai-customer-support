# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS pruned
COPY . .
RUN pnpm dlx turbo@2 prune @acs/worker --docker

FROM base AS build
COPY --from=pruned /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruned /repo/out/full/ .
RUN pnpm turbo run build --filter=@acs/worker
RUN pnpm --filter @acs/worker deploy --prod /app

FROM node:22-alpine AS runtime
RUN addgroup -S acs && adduser -S acs -G acs
WORKDIR /app
COPY --from=build --chown=acs:acs /app .
USER acs
ENV NODE_ENV=production APP_NAME=worker
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3002/health/live || exit 1
CMD ["node", "dist/main.js"]
