# Runbook: Knowledge ingestion failures

## Symptoms
- Alert on ingestion job failure rate; tenant admin sees failed status in dashboard.

## Key invariant
A failed ingestion NEVER corrupts the active document version. New versions become searchable only after successful indexing (status flip is the last step).

## Diagnosis
1. Ingestion job record has stage + error (validate → store → extract → chunk → embed → index).
2. Common causes: unsupported/corrupt file, embedding provider failure, oversized document, SSRF-blocked URL.

## Mitigation by stage
- extract failures: inspect stored artifact in object storage; file-type sniffing errors are terminal (user-facing error code).
- embed failures: provider issue — retried with backoff; DLQ after max attempts; re-drive when provider healthy.
- index failures: check pgvector index health, disk space.

## Recovery
Reprocess from the dashboard (or `POST /v1/knowledge/sources/:id/reprocess`) — ingestion is idempotent by content hash; unchanged content short-circuits.
