# Runbook: AI provider outage

## Symptoms
- Alert: `ai_run_error_rate > 20%` for 5m, or circuit breaker `open` state metric.
- Widget shows "assistant temporarily unavailable"; escalation rate climbs.

## Impact
AI generation halts. **Human support keeps working**: conversation history, agent workspace, message exchange, and escalation are DB-backed and unaffected.

## Diagnosis
1. Check worker logs for `LLM_PROVIDER_ERROR` / timeout entries: `docker compose logs worker | grep ai-generation`.
2. Check OpenRouter status page and response codes (429 vs 5xx).
3. Inspect queue: ai-generation queue depth and oldest-job age metrics.

## Mitigation
1. If rate-limited (429): reduce worker concurrency (`AI_CONCURRENCY`), verify budget config.
2. If provider down: circuit breaker fast-fails; jobs retry with backoff up to max attempts, then land in DLQ.
3. Optionally switch model/provider via env (`AI_GENERATION_MODEL`) and restart workers — the port makes this a config change.
4. Communicate: conversations auto-offer escalation on repeated failures.

## Recovery
1. When provider recovers, breaker half-opens automatically.
2. Re-drive DLQ jobs: `pnpm --filter @acs/worker dlq:retry ai-generation` (or requeue via Bull board).
3. Verify: send a test message in a seeded org; confirm ai_runs row with status succeeded.
