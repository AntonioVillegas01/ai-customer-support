# Architecture

## System overview

```mermaid
flowchart LR
    subgraph Clients
        W[Customer Widget<br/>iframe + embed.js]
        D[Dashboard<br/>Next.js]
    end
    subgraph Backend
        API[API<br/>NestJS]
        WK[Worker<br/>BullMQ processors]
    end
    subgraph Data
        PG[(PostgreSQL 17<br/>+ pgvector)]
        RD[(Redis)]
        S3[(Object storage)]
    end
    LLM[OpenRouter]

    W -->|widget token, SSE| API
    D -->|session cookie| API
    API --> PG
    API --> RD
    API --> S3
    WK --> PG
    WK --> RD
    WK --> S3
    WK -->|LlmProviderPort| LLM
    API -.->|Redis pub/sub fan-out| WK
```

## Hexagon

```mermaid
flowchart TB
    subgraph core[Framework-free core]
        DOM[packages/domain<br/>entities · state machines · policies]
        APP[packages/application<br/>use cases · ports]
    end
    PERS[packages/persistence<br/>Drizzle adapters]
    APIA[apps/api<br/>HTTP · auth · SSE · tools]
    WRK[apps/worker<br/>queue processors · OpenRouter adapter]
    APP --> DOM
    PERS -->|implements ports| APP
    APIA -->|drives use cases| APP
    WRK -->|drives use cases| APP
```

Dependency rule: everything points inward. `domain` and `application` import no framework, ORM, queue, or vendor SDK. See ADR 0002.

## Bounded contexts

Identity & Access · Organizations & Tenancy · Knowledge Management · Conversations · AI Orchestration · Agent Workspace · Tool Execution · Feedback & Quality · Analytics · Audit & Compliance · Notifications · Billing & Usage.

Contexts communicate through application services and outbox domain events. No context reads another context's tables directly.

## Message → AI response flow

```mermaid
sequenceDiagram
    participant C as Customer (widget)
    participant A as API
    participant P as PostgreSQL
    participant Q as BullMQ
    participant K as Worker
    participant L as OpenRouter

    C->>A: POST message (idempotency key)
    A->>P: tx: persist message + outbox event
    A-->>C: 202 accepted
    A->>Q: enqueue ai-gen:<messageId>
    K->>P: load conversation, dedupe check
    K->>K: safety screen + classification
    K->>P: tenant-scoped hybrid retrieval
    K->>K: escalation policy (deterministic)
    K->>L: grounded generation (structured output)
    K->>K: validate schema + citations
    K->>P: tx: persist assistant message, ai_run, citations
    K-->>A: Redis pub/sub event
    A-->>C: SSE stream tokens/final
```

Key invariants:
- User message is durable **before** AI work starts; API restarts lose nothing.
- Processing is idempotent (deterministic idempotency keys) — duplicate job delivery cannot create duplicate messages.
- Citations must map to actually retrieved evidence; zero valid citations ⇒ abstain + offer escalation.
- Tool proposals pass a deterministic gate: schema validation → actor auth → tenant ownership → business rules → confirmation if consequential → execute → sanitize → audit.

## Conversation state machine

```mermaid
stateDiagram-v2
    [*] --> open_ai
    open_ai --> pending_customer
    pending_customer --> open_ai
    open_ai --> escalated
    pending_customer --> escalated
    escalated --> assigned_human
    assigned_human --> resolved
    escalated --> resolved
    resolved --> closed
    resolved --> open_ai: reopen
    closed --> open_ai: reopen
```

Invalid transitions are rejected in the domain layer. AI suggestions are never auto-sent while a conversation is human-controlled.

## Tenancy

Every tenant-owned table carries `organization_id`. Scope derives from authenticated context (session, API key, widget token) — never from client input. Composite indexes lead with the org id; retrieval, caches, queue payloads, and storage paths are all tenant-scoped; RLS is defense in depth (ADR 0005).

## Ingestion pipeline

validate → store original (S3) → extract/normalize → detect language → sanitize markup → chunk (configurable) → embed → persist chunks+vectors → flip version to indexed (last step, atomic). Content-hash idempotency, versioning, DLQ, SSRF-guarded URL ingestion. Failed runs never touch the active version.

## Failure design summary

| Failure | Behavior |
|---|---|
| LLM timeout/outage | retry w/ backoff+jitter, circuit breaker, DLQ; humans unaffected |
| Invalid model output | schema validation fails run → retry → abstain+escalate |
| Postgres outage | full stop by design (source of truth); queues drain on recovery |
| Redis outage | processing pauses; outbox drainer recovers lost enqueues |
| Worker crash | at-least-once redelivery; idempotent effects |
| Client disconnect mid-stream | state persisted server-side; client re-fetches on reconnect |
| Duplicate submission | idempotency keys at message, job, and tool layers |
