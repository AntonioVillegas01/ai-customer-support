# Runbook: Security incident response

## Triggers
Suspected cross-tenant leakage, credential compromise, prompt-injection achieving unauthorized action, data breach.

## Severity
- SEV1: confirmed cross-tenant data exposure or credential/database compromise.
- SEV2: attempted-but-blocked attacks at unusual scale; single-account compromise.

## Immediate actions (SEV1)
1. Preserve evidence: snapshot audit_events, ai_runs, tool_executions, access logs. Do not truncate.
2. Contain:
   - Revoke affected sessions (`sessions` table delete by user/org) and API keys.
   - Disable affected widget configs (clear allowed origins).
   - If tool abuse: disable the tool in the registry config.
3. Assess blast radius via audit_events (actor, tenant, subject, timestamps are immutable).
4. Rotate secrets (API HMAC secret invalidates all widget tokens; DB/Redis credentials via infra).

## Cross-tenant leakage specifically
1. Identify the query path; check repository scoping + retrieval filters.
2. Verify RLS policy state on the affected table.
3. Add a failing cross-tenant test reproducing the leak BEFORE fixing.

## Post-incident
Timeline, root cause, affected tenants (notify per GDPR obligations), corrective tests, update threat model.
