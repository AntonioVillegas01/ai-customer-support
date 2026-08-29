# ADR 0005: Shared-schema tenancy with server-side scoping + RLS

## Status
Accepted

## Context
Organizations must be strictly isolated. Schema-per-tenant does not scale operationally at this stage.

## Decision
- Shared schema; every tenant-owned row carries `organization_id NOT NULL`.
- Tenant scope is applied server-side from authenticated context (session membership, API key, or widget token). Client-provided organization ids are never trusted.
- All repository queries filter by `organization_id`; composite indexes lead with it.
- PostgreSQL Row-Level Security is enabled on tenant tables as defense in depth with `app.current_org_id`. Limitation: the application currently connects as the table owner, which bypasses RLS; a dedicated unprivileged role is the tracked hardening task (see docs/KNOWN_LIMITATIONS.md).
- Cache keys, queue payloads, storage paths, and analytics queries all carry tenant scope. Cross-tenant access is covered by automated tests.

## Consequences
Simple operations, strong horizontal scaling; isolation is enforced in code and verified by tests, with RLS as a second layer.
