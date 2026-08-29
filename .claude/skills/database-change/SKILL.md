---
name: database-change
description: Safely design and implement PostgreSQL schema and data migrations for the AI Customer Support Platform. Use when adding or changing tables, columns, indexes, constraints, enums, RLS policies, pgvector indexes, or data transformations; changing persistence mappings; modifying tenant ownership of data; or introducing a migration that could lock or rewrite large tables.
---

# Database Change

PostgreSQL (with pgvector) is the source of truth. Migrations must be online-safe, tenant-aware, and reversible or recoverable.

## Required inputs
- The schema/data change and the tables it touches.
- Whether affected tables are large or hot (conversations, messages, document chunks/embeddings).

## Procedure
1. Assess backward and forward compatibility: the previous app version must run against the new schema during rollout.
2. Use expand-and-contract for breaking changes: add new structures, dual-write/backfill, switch reads, then remove old structures in a later release. Never mix unsafe schema removal with the application rollout that depends on it.
3. Analyze locking and rewrite risk: prefer `CREATE INDEX CONCURRENTLY`, avoid volatile defaults forcing table rewrites, add `NOT NULL`/constraints via `NOT VALID` + `VALIDATE` on large tables, keep migration transactions short.
4. Review defaults and nullability for both old and new writers.
5. Ensure tenant-aware indexing: indexes on tenant-owned tables lead with or include `organization_id` to match scoped query patterns.
6. Review foreign keys and constraints for integrity and cascade behavior.
7. Review pgvector implications: index type (HNSW/IVFFlat) and parameters, build cost on large tables, tenant-filtered query compatibility.
8. Preserve and update RLS policies for new/changed tenant-owned tables.
9. Plan data backfills as batched, idempotent, resumable operations — not single giant transactions.
10. Write rollback or recovery guidance for every migration.
11. Test: migration from a clean database AND upgrade from the previous schema.

## Quality gates (blocking)
- No destructive migration (drop/truncate/irreversible rewrite) without explicit user authorization.
- No new tenant-owned table without tenant scoping (and RLS where the pattern is used).
- Migration tested from clean state and from previous schema, with observed results.

## Expected output
- Schema change; compatibility strategy; migration sequence; locking and performance risk; data backfill strategy; rollback or recovery plan; verification evidence.
