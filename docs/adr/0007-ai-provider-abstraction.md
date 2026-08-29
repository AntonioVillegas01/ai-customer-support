# ADR 0007: OpenRouter behind LlmProviderPort; no LangGraph

## Status
Accepted

## Context
Model/provider availability, pricing, and quality change quickly. Free-tier models are usable in development but must never be a production dependency.

## Decision
- All model access goes through `LlmProviderPort` / `EmbeddingProviderPort`. The OpenRouter adapter owns timeouts, retries with jittered exponential backoff, and a circuit breaker. A deterministic fake adapter serves tests and offline development (`AI_PROVIDER=fake`).
- Model selection is configuration (separate models for generation, classification, summarization, embeddings).
- No LangGraph: the orchestration flow is an explicit, inspectable state sequence inside `GenerateAiResponseUseCase` with recovery provided by BullMQ retries + idempotent steps. A graph framework adds a dependency without adding recovery semantics we don't already have.

## Consequences
Provider swaps are adapter-local. The pipeline's decision points (classification, escalation, evidence sufficiency, tool gating, citation validation) are ordinary code covered by unit tests.
