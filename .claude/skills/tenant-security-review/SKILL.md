---
name: tenant-security-review
description: Prevent authorization defects, cross-tenant data leaks, unsafe LLM tool execution, and customer-data exposure in the multi-tenant AI Customer Support Platform. Use when changing authentication, authorization, users, memberships, organizations, API keys, widgets, conversations, customers, knowledge, retrieval, caching, queues, analytics, tools, storage, exports, or audit events; when adding endpoints that access tenant-owned resources; or when reviewing security-sensitive code.
---

# Tenant Security Review

Tenant isolation is a critical security boundary. Any change that could create cross-tenant leakage is blocking and must not merge.

## Required inputs
- The diff or code under review.
- The tenant-owned resources it touches and the trust boundary (dashboard user, widget end-user, API key, worker, LLM tool call).

## Procedure — review each applicable surface
1. **Authentication**: server-side verification; widget tokens signed and short-lived; API keys hashed at rest.
2. **Permissions**: resource-level authorization checks server-side, not UI-only.
3. **Resource ownership**: organization ID derived from authenticated context; client-supplied tenant IDs authorized, never trusted.
4. **Query scoping**: every repository query on tenant-owned data filters by organization ID; RLS preserved where used.
5. **Retrieval filtering**: vector and hybrid search always constrained to the requesting tenant.
6. **Cache keys**: include tenant scope; no tenant-neutral keys for tenant data.
7. **Queue payloads**: BullMQ jobs carry tenant context that consumers validate.
8. **Object storage**: tenant-isolated paths; no cross-tenant listing or signed-URL leakage.
9. **Tool authorization**: LLM tool calls are proposals; deterministic code validates tenant ownership of every referenced resource before execution.
10. **PII and logging**: secrets redacted; PII minimized; no raw customer content in logs.
11. **Audit events**: privileged actions produce immutable audit records including the tenant.
12. **Abuse controls**: rate limits, request-size limits, SSRF protection for URL ingestion, file-content validation for uploads.
13. **Tests**: negative authorization tests and cross-tenant access tests exist for the change.

## Reject (blocking)
- UI-only authorization; unscoped repository queries; blind trust in request tenant IDs; tenant-neutral cache keys; privileged LLM tool execution without deterministic authorization; raw secret or PII logging; missing negative authorization tests.

## Expected output
- Threats found; severity per threat; affected trust boundary; required remediation; required negative tests; residual risk.
