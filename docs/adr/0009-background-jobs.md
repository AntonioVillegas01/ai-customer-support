# ADR 0009: BullMQ + transactional outbox

## Status
Accepted

## Context
AI generation and ingestion are long-running and must survive process crashes without losing accepted work or duplicating side effects.

## Decision
- Customer messages are persisted in PostgreSQL *before* any AI work; an outbox event is written in the same transaction.
- BullMQ (Redis) executes jobs with exponential backoff + jitter, bounded attempts, and dead-letter queues. Job ids double as dedupe keys (`ai-gen:<messageId>`).
- An outbox drainer in the worker re-enqueues jobs for unprocessed events, covering the crash window between DB commit and queue enqueue.
- All consumers are idempotent: assistant messages carry deterministic idempotency keys; tool executions have unique idempotency keys per tenant.

## Consequences
At-least-once delivery with exactly-once *effects*. Redis loss degrades processing latency but never loses accepted messages.
