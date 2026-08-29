# AI Customer Support Platform

Production-grade, multi-tenant AI customer-support platform: tenant knowledge ingestion, grounded RAG answers with verifiable citations, secure tool calling with human confirmation, human-agent handoff, and full auditability. The platform keeps working for human agents even when the AI provider is down.

## Stack

TypeScript (strict) · pnpm + Turborepo · Next.js (dashboard) · NestJS (API + worker) · PostgreSQL 17 + pgvector · Drizzle · Redis + BullMQ · OpenRouter behind a provider port · SSE streaming · OpenTelemetry + Langfuse · Docker · GitHub Actions · Terraform/AWS.

## Quick start

```bash
# prerequisites: Node >= 22, pnpm >= 9, Docker
./scripts/setup.sh        # installs deps, starts postgres/redis/minio, migrates, seeds
pnpm dev                  # web :3000, api :3001, worker, widget dev server
```

Runs fully offline with `AI_PROVIDER=fake` (deterministic responses). Set `AI_PROVIDER=openrouter` + `OPENROUTER_API_KEY` in `.env` for real models.

## Repository layout

| Path | Purpose |
|---|---|
| `apps/web` | Next.js dashboard (agent workspace + tenant admin) |
| `apps/api` | NestJS REST API + SSE, OpenAPI at `/docs` |
| `apps/worker` | BullMQ processors: AI generation, ingestion, outbox drainer |
| `apps/widget` | Embeddable iframe chat widget + `embed.js` loader |
| `packages/domain` | Framework-free entities, state machines, policies |
| `packages/application` | Use cases + ports (hexagon core) |
| `packages/persistence` | Drizzle schema, migrations, repository adapters |
| `packages/contracts` | Shared Zod schemas + stable error codes |
| `packages/config` / `logger` / `observability` | Validated env, pino, OTel/Langfuse |
| `packages/testing` | Deterministic fakes + application use-case tests |
| `evals` | Golden datasets, retrieval/answer quality metrics, injection tests |
| `infra/terraform` | AWS starter (ECS Fargate, RDS, ElastiCache) |
| `docs` | Architecture, ADRs, threat model, runbooks, limitations |

## Commands

```bash
pnpm build | dev | lint | typecheck | test     # via turbo
pnpm test:integration                          # needs docker compose services
pnpm test:e2e                                  # Playwright
pnpm db:migrate && pnpm db:seed
pnpm eval                                      # offline AI quality evals
pnpm loadtest                                  # k6 scripts
```

Seed logins (local only): `owner@acme.test` / `admin@acme.test` / `agent@acme.test`, password `Password123!` (second org: `globex.test`).

## Documentation

- [Architecture](docs/architecture.md) — diagrams, flows, failure design
- [ADRs](docs/adr/README.md) — 11 recorded decisions
- [Threat model](docs/security/threat-model.md) — STRIDE + OWASP LLM Top 10
- [Runbooks](docs/runbooks/) — provider outage, DB/Redis outage, ingestion, incidents
- [Known limitations](docs/KNOWN_LIMITATIONS.md) — honest ledger of deferred work
- [Widget integration](docs/widget-integration.md) — embed protocol

## Engineering rules

See [CLAUDE.md](CLAUDE.md). Non-negotiables: tenant scoping is server-side everywhere; domain/application layers stay framework-free; LLM output never triggers privileged actions without deterministic authorization; citations must map to retrieved evidence; all consequential operations are idempotent and audited.
