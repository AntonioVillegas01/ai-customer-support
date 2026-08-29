---
name: ai-quality-review
description: Review or implement LLM, retrieval, prompt, citation, classification, summarization, or tool-calling changes in the AI Customer Support Platform. Use when modifying prompts, models, or providers; changing chunking, embeddings, search, reranking, thresholds, context construction, or citations; adding AI workflows or tools; changing abstention or escalation logic; or investigating hallucinations, latency, cost, or poor answer quality.
---

# AI Quality Review

Keep AI behavior measurable, safe, grounded, and cost-controlled. LLM access goes only through the provider port (OpenRouter today, replaceable tomorrow).

## Required inputs
- The AI task affected (answering, classification, summarization, tool selection, retrieval) and its measurable success criteria.
- The prompt version(s), models, and retrieval parameters involved.

## Procedure
1. Confirm provider access stays behind the replaceable port; no direct SDK calls from use cases; behavior must not depend solely on free-model availability.
2. Confirm prompts are versioned and the version is recorded per run.
3. Validate structured outputs against schemas; define behavior for malformed output (retry, repair, fallback, escalate).
4. Treat retrieved content and customer messages as untrusted data; review for direct and indirect prompt injection paths.
5. Review evidence sufficiency: insufficient evidence must yield explicit abstention or human escalation, not a guess.
6. Verify citations map to actually retrieved chunks; reject fabricated or dangling citations.
7. Verify tool calls remain proposals authorized and executed by deterministic code; no unrestricted DB/HTTP access for the model.
8. Review fallback and degradation behavior on provider timeout, rate limit, and outage.
9. Check latency and cost budgets: timeouts, retries with backoff, circuit breakers, concurrency limits, token/cost caps.
10. Confirm observability: model config, prompt version, latency, tokens, sources, tools, validation results, and failures recorded (Langfuse/OTel); chain-of-thought never exposed or persisted; sensitive data minimized before provider calls.

## Evaluation (required for behavior changes)
- Define offline evaluation cases covering the changed behavior, including adversarial (injection, off-topic, insufficient-evidence) and regression cases.
- Prefer deterministic checks (schema validity, citation grounding, abstention triggers) plus human-reviewed samples. Never rely solely on LLM-as-judge.

## Expected output
- AI behavior change; evaluation dataset impact; metrics and thresholds; safety risks; cost and latency impact; required regression tests; observed results (only what was actually run).
