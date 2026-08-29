# ADR 0008: Hybrid retrieval (FTS + pgvector) with RRF fusion

## Status
Accepted

## Context
Pure vector search misses exact terms (order numbers, product names); pure FTS misses paraphrases.

## Decision
- Hybrid retrieval inside PostgreSQL: full-text (tsvector, ts_rank) and vector cosine similarity fused with Reciprocal Rank Fusion (k=60), normalized to [0,1].
- Both branches are tenant-filtered and restricted to chunks of *indexed* document versions that are the source's *active* version.
- Evidence keeps document id, version id, chunk id, title, section, URL, and score — citations are validated against this exact set; the model can only cite retrieved indexes.
- Reranking is an optional port (not yet implemented; tracked in KNOWN_LIMITATIONS).

## Consequences
One datastore to operate; retrieval quality measured by the evals package (Recall@K, MRR, citation correctness).
