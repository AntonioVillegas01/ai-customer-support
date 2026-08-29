# Known limitations

- `apps/api` and `apps/worker` provide production-oriented scaffolding and core persistence-backed flows, but several requested admin/staff endpoints are intentionally minimal pending dedicated use-case ports: member invitations, organization settings, analytics aggregation, AI suggestions, and summarization.
- Widget knowledge file uploads persist content to S3-compatible storage and validate simple magic bytes; full MIME sniffing and private-DNS redirect validation need hardening before production exposure.
- SSE uses Redis pub/sub with heartbeats and does not replay missed events. Clients must refetch persisted message history after reconnecting with `Last-Event-ID`.
- Worker ingestion supports PDF/HTML/Markdown/plain text extraction and rejects DOCX; extraction quality and language detection are basic and should be evaluated with representative corpora.
- API and worker share the same sandbox tool behavior by duplicated adapters; extract to a dedicated infrastructure package once both apps stabilize.
