# Known Limitations

Honest ledger of incomplete or intentionally deferred work. Each item has a working interface or documented workaround; none are hidden behind fake implementations.

| # | Area | Limitation | Interface today | Tracked work |
|---|------|-----------|-----------------|--------------|
| 1 | RLS | App connects as table owner, which bypasses RLS; isolation is enforced in code + tests | RLS policies exist on tenant tables using `app.current_org_id` | Create unprivileged runtime DB role and set org GUC per transaction |
| 2 | Reranking | No reranker implemented | `RerankerPort` abstraction; hybrid RRF scores used directly | Add cross-encoder reranker adapter behind the port |
| 3 | Malware scanning | Upload scanning is an integration point, not an engine | Content-type sniffing + size limits + extension validation | Wire ClamAV or a hosted scanner at the marked hook |
| 4 | DOCX ingestion | Not implemented | Rejected with stable error code `KNOWLEDGE_UNSUPPORTED_FORMAT` | Add mammoth-based extractor |
| 5 | Billing | Usage records are persisted; no payment processing | Usage/budget tables and budget gate active | Integrate payment provider when commercially needed |
| 6 | Email delivery | Notification adapter logs emails locally in dev; no production SMTP/SES wiring | `NotificationPort` with console adapter | Configure SES adapter + templates |
| 7 | Data residency | Single-region only | Extension point documented in ADR 0011 | Region-aware storage/routing when required |
| 8 | Load tests | k6 scripts provided; results are environment-dependent | Scripts + documented estimated targets (not measured claims) | Run against staging and record baselines |
| 9 | Shadow evaluation | Not automated | Eval commands run offline against golden datasets | Pipe sampled production traffic into eval harness |
| 10 | i18n | Architecture in place (locale detection, message catalogs); only `en` catalog complete | Locale plumbed end-to-end | Add translated catalogs |
