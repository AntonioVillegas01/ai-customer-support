# Runbook: Redis outage

## Symptoms
- BullMQ connection errors; rate-limit middleware logging fallbacks; SSE fan-out gaps across instances.

## Impact
- Job processing pauses (no accepted work is lost — messages/outbox live in Postgres).
- Rate limiting degrades to fail-closed for AI endpoints, fail-open for read endpoints (documented in code).
- Multi-instance SSE fan-out pauses; single-instance streams unaffected.

## Diagnosis
`docker compose ps redis` / ElastiCache events; check maxmemory evictions (`INFO stats`).

## Mitigation
- Restart/failover Redis. BullMQ reconnects automatically.
- If jobs were enqueued-but-lost (Redis data loss): the outbox drainer re-enqueues unprocessed events — no manual replay needed.

## Recovery
Verify queue depth resumes draining and no outbox rows remain unprocessed older than 5 minutes.
