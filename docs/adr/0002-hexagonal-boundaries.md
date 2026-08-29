# ADR 0002: Hexagonal architecture and bounded contexts

## Status
Accepted

## Context
Domain logic must outlive framework and vendor choices, and AI-related behavior must be testable without network access.

## Decision
- `packages/domain`: entities, value objects, state machines, deterministic policies (escalation), permission model. Zero runtime dependencies.
- `packages/application`: use cases + ports (UnitOfWork, repositories, LlmProviderPort, RetrievalPort, ToolRegistryPort, JobQueuePort, AuditPort, …). Depends only on domain and zod.
- Adapters live in `packages/persistence` (Drizzle), `apps/api` (HTTP, auth, SSE, Redis, tool handlers), `apps/worker` (BullMQ processors, OpenRouter adapter).
- Bounded contexts: Identity & Access, Organizations & Tenancy, Knowledge, Conversations, AI Orchestration, Agent Workspace, Tool Execution, Feedback & Quality, Analytics, Audit, Notifications, Billing & Usage. Contexts interact through application services and outbox domain events only.

## Consequences
- The AI pipeline (`GenerateAiResponseUseCase`) is fully unit-testable with fakes at the provider boundary.
- Some ceremony: repositories express domain needs (`findByIdempotencyKey`, `countConsecutiveAssistantAbstentions`) rather than mirroring ORM methods.
