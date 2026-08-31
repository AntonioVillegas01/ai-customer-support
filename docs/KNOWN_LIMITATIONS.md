# Known limitations and technical debt

Honest inventory of what this platform does **not** do yet, gaps discovered during
end-to-end verification, and debt accepted deliberately with its rationale. Every
item here is confirmed against the actual code — nothing is speculative.

Last reviewed: 2026-08-31 (post Gemini provider migration).

## AI and retrieval

- **Fake provider is available for offline runs (`AI_PROVIDER=fake`).** The
  deterministic `FakeLlmProvider` never proposes tool calls and always
  classifies `requestsHuman: false` when unscripted. Consequences for offline
  E2E testing:
  - AI-initiated tool proposals cannot be exercised live; the tool confirmation
    flow was verified by seeding an `awaiting_confirmation` execution directly
    and driving the widget-confirm endpoint. AI-side proposal logic is covered
    by use-case unit tests only.
  - AI-classified escalation (`customer.requested_human`, sentiment) cannot
    trigger live; only the deterministic keyword safety screen
    (`detectSafetyFlags`) escalates in local runs (verified: `safety.legal`).
- **The OpenRouter adapter has never been exercised against the live API.**
  It is unit-tested with mocked HTTP; no CI job holds an API key. Retry,
  timeout, and concurrency-limit behavior under real provider latency is
  unmeasured. The Gemini adapter (`@acs/ai-providers`), by contrast, **has**
  been verified live: completion, structured output, and embeddings were
  exercised end-to-end (widget question answered with a grounded, cited reply
  after re-embedding the corpus with `gemini-embedding-001`).
- **Retrieval eval numbers use pseudo-embeddings.** `recall@5 = 1.000`,
  `MRR = 0.762` were measured locally against the seeded corpus with the
  deterministic char-code fake embedding (1536 dims). They validate the hybrid
  RRF pipeline mechanically but say nothing about semantic quality with a real
  embedding model. `precision@5 = 0.286` reflects the tiny corpus (7 golden
  cases, ~7 documents), not production quality. The eval harness has not been
  re-run against Gemini embeddings.
- **Switching embedding providers invalidates stored vectors.** Chunk
  embeddings are not tagged with the model that produced them; after changing
  `AI_MODEL_EMBEDDING` every source must be manually reprocessed
  (`POST /orgs/:orgId/knowledge/sources/:id/reprocess`) or vector search
  silently degrades to lexical-only quality. There is no automated
  re-embedding migration.
- **Prompt-injection suite covers 6 scenarios.** It is a regression floor, not
  a red-team. No coverage for multi-turn injection, encoding tricks, or
  tool-argument injection.
- **Token accounting is dead weight.** `usage_records.tokens` is never
  incremented — `MonthlyBudgetAdapter.tryConsume` writes `tokens: 0` and only
  accumulates `ai_cost_usd`. The `GET /orgs/:orgId/usage` endpoint therefore
  always reports `tokens: 0`.
- **Budget is consumed on estimate, never reconciled.** `tryConsume` adds the
  *estimated* cost before the LLM call and there is no post-call adjustment to
  the actual usage returned by the provider. Sustained over/under-estimation
  drifts the monthly budget.

## API

- **Missing staff/admin routes.** No endpoints exist for: member invitations,
  member role updates, organization profile updates, widget list/update,
  allowed-origin management, staff AI reply suggestions, or conversation
  summaries. The web dashboard renders explicit unavailable/restricted states
  rather than mock data.
- **Staff conversation list ignores filters.** `search`, `status`, and
  `unassigned` query parameters are accepted but not applied; tenant scoping is
  enforced, filtering is not.
- **Audit coverage is partial.** Recorded: admin API-key/widget actions, AI
  escalations, abstentions, tool proposals/confirmations/executions. Not
  recorded: logins and failed logins, knowledge source create/delete,
  conversation status changes by staff, member/session lifecycle.
- **`GET /orgs/:orgId/prompts` is not org-scoped.** Prompt versions are
  currently platform-global; the route returns all versions regardless of org.
  Acceptable while prompts are platform-managed, wrong the moment per-tenant
  prompt overrides land.
- **SSE has no `Last-Event-ID` resume.** Events published while a client is
  disconnected are dropped from the stream; clients must refetch message
  history on reconnect (the widget does this). Redis pub/sub has no replay —
  a durable stream (e.g. Redis Streams) would be required for true resume.
- **Widget tokens are 15-minute HMAC blobs with no rotation or revocation.**
  Compromised tokens remain valid until expiry. The widget silently re-mints on
  401, which also means a revoked widget key only takes effect on next mint.
- **Customer identity verification is unused by the widget.** The token mint
  endpoint supports verified identity via `customer.hmac`, but the embedded
  widget only performs anonymous sessions. Host pages cannot yet assert "this
  visitor is customer X" end-to-end.

## Widget

- **English-only i18n catalog.** `setLocale` falls back to `en` for any other
  branding locale.
- **No file attachments, no message editing, no typing indicators.**
- **Tool-confirmation expiry is client-side only.** A `setTimeout` swaps the
  card to an expired state; if the tab sleeps, the card may allow a click that
  the server will correctly reject (`expired` state) — the UI then shows a
  generic error rather than the expiry message.
- **No offline queueing.** Messages composed while disconnected fail
  immediately (with idempotent retry support, but no automatic resend).

## Infrastructure and operations

- **MinIO buckets are not auto-created.** `docker compose up` starts MinIO but
  `acs-knowledge` / `acs-attachments` must be created manually
  (`mc mb`) or knowledge ingestion fails with `NoSuchBucket`. Discovered during
  final verification; an init container in docker-compose is the fix.
- **Local port collision on 3002.** The worker health server
  (`WORKER_HEALTH_PORT`, default 3002) and the widget dev/preview server both
  default to 3002 — and the seeded widget allowed-origin is
  `http://localhost:3002`. Run the worker with `WORKER_HEALTH_PORT=3003` when
  serving the widget locally.
- **Terraform is a starter, not a deployed configuration.** No remote state
  backend, no secrets-manager integration (placeholders), never applied against
  a real AWS account. Treat it as an architectural sketch with real resource
  shapes, not IaC that has survived an apply.
- **k6 thresholds are labeled ESTIMATED.** No load test has run against a
  production-like deployment; the scripts and targets exist but the numbers are
  unvalidated.
- **Observability wiring is unverified against live backends.** OTel exporter
  endpoint and Langfuse keys are optional config; traces/metrics have not been
  confirmed end-to-end against a running collector or Langfuse instance.
- **No browser-level E2E suite.** The widget and dashboard were verified with
  unit tests plus manual API-driven E2E (curl against live services). There is
  no Playwright coverage of real DOM flows (SSE rendering, tool-confirm click
  path, login redirects).

## Deliberate design debt (accepted, with rationale)

- **Outbox drain is poll-based (every 10 s via repeatable BullMQ job).** Simple
  and idempotent; adds up to ~10 s latency to AI processing after message
  accept. Replace with LISTEN/NOTIFY or transactional enqueue if latency
  matters.
- **Widget session persistence uses `sessionStorage`.** Conversations do not
  survive tab close; this is a privacy-leaning default, not an oversight.
- **`vite preview` / `next start` are not production servers for the widget
  and web.** Dockerfiles exist for production images; local verification used
  the dev-grade servers.
- **RLS is belt-and-suspenders, not the primary guard.** Application-level org
  scoping is the enforced boundary (verified cross-tenant 403s); RLS policies
  exist on tenant tables but the app connects as table owner in local dev, so
  RLS is not exercised by the test suite.

## Fixed during final verification (for the record)

These were real gaps found and closed in commit `a684018` — kept here so the
verification trail stays honest:

- `GET /v1/orgs/:orgId/usage` did not exist although the web analytics page
  consumed it (page showed unavailable state).
- No audit events were written for admin actions or AI escalations; the audit
  table was empty in practice.
- The widget omitted `confirmationId` from the widget-confirm request body,
  failing schema validation on every tool confirmation.

Fixed during the Gemini provider migration:

- The API composition hardcoded `FakeEmbeddingProvider` for staff knowledge
  search regardless of `AI_PROVIDER`; adapters were extracted into the shared
  `@acs/ai-providers` package and both API and worker now compose the
  configured provider.
- `POST sources/:id/reprocess` created ingestion jobs without a
  `documentVersionId`, so every reprocess failed with "ingestion job missing
  document version"; it also never reset the version status, so the
  indexed-hash dedupe check would have short-circuited re-embedding anyway.
  Both fixed.
