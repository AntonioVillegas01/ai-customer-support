# ADR 0003: PostgreSQL + pgvector with Drizzle ORM

## Status
Accepted

## Context
We need a transactional source of truth, full-text search, vector search, and type-safe SQL shared by api and worker.

## Decision
- PostgreSQL 17 is the single source of truth. Redis is never authoritative for business data.
- pgvector for embeddings (HNSW, cosine). A dedicated vector DB is not justified at this scale; the retrieval port allows replacement if benchmarks demand it.
- Drizzle ORM over Prisma: SQL-first migrations we can audit (needed for RLS, tsvector generated columns, partial unique indexes, HNSW indexes), native pgvector support, no query engine binary, light footprint in the worker.

## Consequences
- Migrations are plain SQL, reviewable, and testable from a clean database.
- We write some raw SQL for hybrid retrieval (intentional; it is the performance-critical path).
