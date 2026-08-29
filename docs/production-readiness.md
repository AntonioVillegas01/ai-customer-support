# Production Readiness Checklist

Status legend: ✅ implemented and verified · 🟡 implemented with tracked limitation · ⬜ tracked, not implemented (see docs/KNOWN_LIMITATIONS.md)

## Security
- ✅ Argon2id password hashing, DB sessions (hashed tokens), httpOnly/Secure/SameSite cookies
- ✅ CSRF double-submit guard on cookie-authenticated mutations
- ✅ Permission-based authorization + org membership checks server-side (403 verified cross-org)
- ✅ API keys hashed (sha256) with prefixes, shown once, revocable
- ✅ Widget tokens: HMAC-signed, 15-min TTL, origin allowlist (403 verified for bad origin)
- ✅ Tenant scoping in every repository query; RLS policies as defense in depth 🟡 (owner-connection bypass tracked)
- ✅ SSRF guard on URL ingestion; magic-byte file validation; body limits; helmet; CORS allowlist
- ✅ Secret redaction in logs; error envelope never leaks stack traces
- ✅ Threat model (STRIDE) + OWASP LLM Top 10 mapping
- ✅ CI: dependency audit, gitleaks, Trivy container scan, SBOM
- ⬜ Malware scanning engine (integration point exists)

## Multi-tenancy
- ✅ organization_id on every tenant table, composite indexes lead with it
- ✅ Cross-tenant isolation proven by integration tests (repos, retrieval) and live checks
- ✅ Tenant-scoped storage paths, cache keys, queue payloads, audit events

## AI quality & safety
- ✅ Structured outputs schema-validated; citations must map to retrieved evidence (fabrication ⇒ abstain)
- ✅ Deterministic escalation policy with machine-readable reason codes
- ✅ Deterministic tool gate: schema → auth → tenant ownership → confirmation for consequential → audit
- ✅ Retrieved documents framed as untrusted data; injection test suite (6 scenarios) green
- ✅ Prompt versions recorded per AI run; ai_runs is system of record
- ✅ Budget gate per organization; provider circuit breaker, retries with jitter, timeouts
- ✅ Offline evals with thresholds (recall@5 ≥ 0.85, MRR ≥ 0.6); measured locally: 1.000 / 0.762
- ⬜ Reranker (port exists); shadow evaluation

## Reliability
- ✅ Messages durable before AI work; outbox written in same transaction; drainer re-enqueues
- ✅ Idempotency at message, job (BullMQ jobId), and tool layers — duplicate delivery cannot double-process (verified)
- ✅ DLQs for ai-generation and ingestion; graceful failure event to customer with escalation offer
- ✅ Failed ingestion never corrupts the active document version (activation is the last atomic step)
- ✅ Graceful shutdown in api and worker; health/ready/live endpoints
- ✅ Runbooks: provider outage, DB outage, Redis outage, ingestion failures, security incidents

## Observability
- ✅ Structured JSON logs with correlation ids and redaction
- ✅ OTel wiring (enabled by env) + Langfuse metadata (no message content)
- ✅ ai_runs persists model, prompt version, tokens, latency, cost, status
- 🟡 Dashboards/alert definitions documented as SLO targets, not yet provisioned in IaC

## Delivery
- ✅ CI: lint, typecheck, unit, build, integration (clean migrate + seed against pgvector), security scans, container builds
- ✅ Multi-stage Dockerfiles (api, worker, web), non-root, healthchecks
- ✅ One-command local start (./scripts/setup.sh), .env.example without secrets, config validation at startup
- 🟡 Terraform starter (VPC/RDS/Redis/ECR/ECS cluster); ECS services/ALB/CloudFront tracked
- ✅ Migrations from clean DB tested in CI; seed for local development

## Performance (targets are estimates until measured under load)
- ✅ k6 scripts with labeled estimated targets (accept p95 < 500ms, staff reads p95 < 300ms)
- ✅ HNSW vector index + tsvector generated column with GIN index; pool sizing configurable
- ⬜ Recorded staging baselines
