# syntax=docker/dockerfile:1
FROM node:22-alpine AS base
RUN corepack enable pnpm
WORKDIR /repo

FROM base AS pruned
COPY . .
RUN pnpm dlx turbo@2 prune @acs/web --docker

FROM base AS build
COPY --from=pruned /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruned /repo/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@acs/web

FROM node:22-alpine AS runtime
RUN addgroup -S acs && adduser -S acs -G acs
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build --chown=acs:acs /repo/apps/web/.next/standalone ./
COPY --from=build --chown=acs:acs /repo/apps/web/.next/static ./apps/web/.next/static
USER acs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/login || exit 1
CMD ["node", "apps/web/server.js"]
