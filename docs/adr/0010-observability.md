# ADR 0010: OpenTelemetry + Langfuse, both optional at runtime

## Status
Accepted

## Context
Operators need traces/metrics; AI engineers need run-level model telemetry. Local development must work with no external backends.

## Decision
- OpenTelemetry NodeSDK with OTLP export, enabled only when OTEL_EXPORTER_OTLP_ENDPOINT is set. Structured pino JSON logs with correlation ids and secret/PII redaction always on.
- Langfuse records AI run metadata (model, prompt version, tokens, latency, cost, status) when keys are configured. Message content and chain-of-thought are never sent.
- Every AI run is also persisted in the `ai_runs` table — the system of record for AI telemetry independent of external vendors.

## Consequences
Observability degrades gracefully; the ai_runs table powers analytics and budgets even without Langfuse.
