# Architecture Decision Records

| # | Decision | Status |
|---|----------|--------|
| [0001](0001-monorepo-structure.md) | pnpm + Turborepo monorepo layout | Accepted |
| [0002](0002-hexagonal-boundaries.md) | Hexagonal architecture and bounded contexts | Accepted |
| [0003](0003-database-and-orm.md) | PostgreSQL + pgvector with Drizzle ORM | Accepted |
| [0004](0004-authentication.md) | Internal credential auth behind an identity port | Accepted |
| [0005](0005-multi-tenancy.md) | Shared-schema tenancy with server-side scoping + RLS | Accepted |
| [0006](0006-realtime-delivery.md) | Server-Sent Events for real-time delivery | Accepted |
| [0007](0007-ai-provider-abstraction.md) | OpenRouter behind LlmProviderPort; no LangGraph | Accepted |
| [0008](0008-retrieval.md) | Hybrid retrieval (FTS + pgvector) with RRF fusion | Accepted |
| [0009](0009-background-jobs.md) | BullMQ + transactional outbox | Accepted |
| [0010](0010-observability.md) | OpenTelemetry + Langfuse, both optional at runtime | Accepted |
| [0011](0011-deployment.md) | AWS ECS Fargate deployment architecture | Accepted |
