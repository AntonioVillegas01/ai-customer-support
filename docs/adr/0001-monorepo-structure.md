# ADR 0001: pnpm + Turborepo monorepo layout

## Status
Accepted

## Context
The platform ships four deployables (web dashboard, API, worker, widget) that share a domain model, contracts, and configuration. Independent repos would duplicate types and drift.

## Decision
Single pnpm workspace orchestrated by Turborepo:
- `apps/web` (Next.js dashboard), `apps/api` (NestJS), `apps/worker` (NestJS standalone processor), `apps/widget` (Vite iframe app + embed loader).
- `packages/domain` and `packages/application` are framework-free (hexagon core).
- `packages/contracts` holds Zod schemas + stable error codes shared by all apps.
- `packages/persistence` is the Drizzle adapter package shared by api and worker so both use identical repositories and migrations.
- `packages/config`, `logger`, `observability`, `testing`, `eslint-config`, `typescript-config` are cross-cutting.

## Consequences
- One lockfile, atomic cross-package refactors, task graph caching via turbo.
- Workspace cycles are forbidden; `@acs/testing` hosts application use-case tests because it depends on `@acs/application` (a dev-dependency in the other direction would create a cycle).
