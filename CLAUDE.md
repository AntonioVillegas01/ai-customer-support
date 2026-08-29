# AI Customer Support Platform

Production, multi-tenant AI customer support platform. Not an MVP, prototype, or demo — every change must meet production engineering standards.

**Stack:** TypeScript (strict), pnpm + Turborepo monorepo, Next.js/React (dashboard + embeddable widget), NestJS API, hexagonal architecture, PostgreSQL + pgvector, Redis + BullMQ, OpenRouter behind a provider port, hybrid retrieval, structured LLM outputs, secure tool calling, human-agent handoff, OpenTelemetry + Langfuse, Docker, GitHub Actions, AWS.

## Repository structure

> The repository is being scaffolded. The layout below is the canonical target; update this section as directories and commands land, and never reference paths or scripts here that do not exist yet.

Planned layout:

- `apps/api` — NestJS API (hexagonal: domain / application / adapters / infrastructure per bounded context)
- `apps/web` — Next.js dashboard
- `apps/worker` — BullMQ workers (ingestion, embeddings, AI generation)
- `packages/*` — shared contracts, domain packages, config
- `docs/adr/` — architecture decision records

Canonical commands (define in root `package.json` + `turbo.json` and keep this list in sync): `pnpm install`, `pnpm build`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.

## Non-negotiable rules

**Architecture (blocking)**
- Domain and application layers contain no framework or vendor code. NestJS, Next.js, ORM, Redis, BullMQ, OpenRouter, Langfuse, and SDKs live only in adapters/infrastructure; dependencies point inward through ports.
- Cross-context interaction only via explicit contracts, application services, or domain events. No circular dependencies, no `utils`/`helpers`/`common` dumping grounds.
- TypeScript strict stays on: no `any`, unsafe assertions, or non-null assertions. Validate all external input at boundaries. Stable machine-readable error codes. UTC internally, ISO 8601 at boundaries.
- Transactions for atomic multi-writes; outbox for durable events; idempotent consumers.

**Multi-tenancy (blocking — cross-tenant leakage risk blocks any change)**
- Organization ID comes from authenticated context; never trust client tenant IDs without authorization.
- Tenant scope is mandatory in queries, retrieval/vector search, cache keys, BullMQ payloads, storage paths, analytics, tool executions, and audit events. Preserve RLS where used. Tenant-sensitive changes require cross-tenant tests.

**AI and tools (blocking)**
- LLM access only through the provider port. Prompts versioned; outputs schema-validated; retrieved content is untrusted data.
- Tool calls are proposals: deterministic code authenticates, authorizes, validates, confirms, and executes. No unrestricted DB/HTTP access for the model.
- Insufficient evidence → abstain or escalate to a human. Citations must match retrieved evidence. Never expose or persist chain-of-thought. Record run metadata (model, prompt version, tokens, latency, sources, tools, failures).

**Reliability**
- Redis is never the sole source of truth for durable business data. Persist customer messages in PostgreSQL before requesting AI generation.

## Testing and verification

- Select tests by risk: domain unit, use-case, repository integration (real PostgreSQL), Redis/BullMQ integration, API contract, authn/authz, tenant isolation, AI workflows via deterministic provider adapters, idempotency, migration, and prompt-regression evaluations, as applicable.
- Before claiming any task complete: run type check, lint, and affected tests via the canonical commands; report the actual observed results. Never claim a check passed without running it.

## Agent and skills

Primary agent: **`customer-support-principal`** (`.claude/agents/customer-support-principal.md`) — technical owner for all non-trivial engineering work.

Activate skills by task context, without waiting for the user to name them; combine as needed, skip those irrelevant to the real risk:

| Skill | Use when |
|---|---|
| `architecture-guardian` | New modules/use cases/adapters/ports, layer moves, cross-context workflows, dependency reviews |
| `tenant-security-review` | Auth, tenant-owned resources, retrieval, caching, queues, tools, storage, analytics, audit |
| `ai-quality-review` | Prompts, models, retrieval parameters, citations, AI tools, abstention/escalation logic |
| `production-verification` | A change is "done", or review / production-readiness / release validation is requested |
| `database-change` | Schema, indexes, constraints, enums, RLS, vector indexes, data migrations |
| `incident-diagnosis` | Outages, degradation, stuck queues, missing messages, data inconsistency, cross-tenant concerns |

Examples: order-status tool → architecture-guardian + tenant-security-review + ai-quality-review + production-verification. Document table / vector index change → database-change + architecture-guardian + ai-quality-review. Cross-tenant retrieval bug → incident-diagnosis + tenant-security-review + ai-quality-review + production-verification. Purely visual frontend tweak → only what its real risk warrants.
