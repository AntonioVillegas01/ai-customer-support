---
name: incident-diagnosis
description: Diagnose production-like failures in the AI Customer Support Platform without immediately changing code or masking symptoms. Use when the user reports an outage, degradation, stuck queue, missing message, AI failure, retrieval failure, tool failure, latency spike, data inconsistency, or cross-tenant concern, or when logs, traces, metrics, or failure reproduction are needed.
---

# Incident Diagnosis

Evidence first, hypotheses second, fixes last. Do not modify code or data while establishing what happened.

## Required inputs
- Symptom description, affected tenants/users, and time window.
- Access to available evidence: logs, OpenTelemetry traces, Langfuse runs, queue state, database, recent deploys.

## Procedure
1. Establish impact and scope: which tenants, workflows (message ingestion, AI generation, retrieval, tools, handoff), and volume; is it ongoing?
2. Build an evidence-based timeline: first occurrence, correlated deploys, migrations, config changes, provider incidents.
3. Trace representative failing requests end-to-end across the relevant path: API → PostgreSQL → BullMQ/Redis → worker → provider port → retrieval → tool adapters. Use trace IDs; correlate Langfuse runs for AI steps.
4. Separate symptoms from root cause (e.g., a stuck queue may be a poison job, Redis pressure, or a crashing worker — identify which, with evidence).
5. Produce falsifiable hypotheses, ranked by likelihood, each with the evidence that would confirm or refute it.
6. Identify safe, reversible mitigation (pause a queue, disable a tool, raise a circuit breaker) distinct from the permanent fix.
7. Define the permanent corrective action and the regression test that would have caught this.
8. Note observability gaps that made diagnosis harder.

## Quality gates (blocking)
- No destructive remediation (deleting jobs/rows, flushing Redis, forced retries of consequential operations) without explicit user authorization.
- No secrets or customer PII pasted into the report or logs.
- Every root-cause claim is backed by cited evidence; otherwise present it as a ranked hypothesis.

## Prohibited shortcuts
- Restart-and-hope as a conclusion; patching the symptom without a causal explanation; blaming the AI provider without trace evidence.

## Expected output
- Impact; evidence; timeline; root cause or ranked hypotheses; immediate mitigation; permanent fix; regression coverage; observability gaps.
