---
name: production-verification
description: Verify whether a completed change in the AI Customer Support Platform is genuinely ready to merge and deploy. Use when a feature, bug fix, refactor, or release candidate is considered complete; when the user asks for code review, production-readiness review, release validation, or definition-of-done verification; or when a change affects critical workflows like message ingestion, AI generation, handoff, or billing-relevant analytics.
---

# Production Verification

Determine readiness from evidence, not optimism. Never fabricate command results; clearly separate checks you executed from checks you only recommend.

## Required inputs
- The actual diff (`git --no-pager diff` / branch comparison) — never review from memory.
- The stated scope of the change.

## Procedure
1. Inspect the full diff; flag unrelated or accidental changes.
2. Run applicable checks via the repo's canonical commands (format, lint, type check, tests, build; migration up/down if schema changed; regenerate contracts if API contracts changed) and record real output.
3. Verify environment configuration: new env vars documented in `.env.example`-style files and wired for all affected apps.
4. Verify security implications (delegate depth to `tenant-security-review` when tenant-sensitive).
5. Verify observability: new critical paths emit traces/metrics/logs; AI paths record run metadata.
6. Verify rollback and recovery: change is deployable and reversible without data loss; migrations compatible with the previous app version.
7. Verify documentation updated where behavior or architecture changed materially.

## Quality gates (blocking)
- Type check, lint, and affected tests pass with observed output.
- No unrelated file modifications.
- No secrets, credentials, or internal stack traces introduced into client-facing surfaces.

## Prohibited shortcuts
- Claiming tests pass without running them; skipping the diff review; marking "READY" with known blocking issues.

## Expected output
Verdict — exactly one of `READY`, `READY WITH FOLLOW-UP`, `NOT READY` — with:
- Evidence: commands executed and their observed results.
- Blocking issues (for NOT READY) or follow-ups (for READY WITH FOLLOW-UP).
- Recommended-but-not-executed checks, explicitly labeled.
