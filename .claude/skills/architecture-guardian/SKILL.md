---
name: architecture-guardian
description: Review or implement structural changes in the AI Customer Support Platform while preserving hexagonal architecture, bounded contexts, and dependency direction. Use when adding a module, bounded context, use case, adapter, repository, provider, queue, integration, or cross-context workflow; moving responsibilities between layers; reviewing architecture; hunting circular or inappropriate dependencies; or when a change spans multiple apps or packages.
---

# Architecture Guardian

Preserve the hexagonal architecture of this monorepo: domain and application layers stay framework-free; NestJS, Next.js, ORM, Redis, BullMQ, OpenRouter, Langfuse, and vendor SDKs live only in adapters/infrastructure; dependencies point inward through interfaces.

## Required inputs
- The concrete change or review target (files, module, or diff).
- The bounded context(s) involved and any cross-context interactions.

## Procedure
1. Map the affected components and their current dependencies (imports, DI wiring, package boundaries).
2. Decide correct placement: domain (entities, value objects, domain services, domain events), application (use cases, ports), adapters (controllers, repositories, queue processors, provider clients), infrastructure (wiring, config).
3. Identify the ports and contracts the change needs; define them in domain/application, implement them in adapters.
4. Check for framework leakage into domain/application (decorators, ORM types, SDK types, HTTP types).
5. Review transaction boundaries and event boundaries: atomic multi-writes in transactions, durable events via outbox.
6. Review error ownership: each layer maps errors it owns; stable machine-readable codes at boundaries.
7. Review cross-context coupling: only explicit contracts, application services, or domain events — never direct reach-ins.
8. Check for new circular dependencies and for code dumped into `utils`/`helpers`/`common`.

## Quality gates (blocking)
- No framework or vendor import in domain/application layers.
- No circular dependencies introduced.
- Cross-context calls go through explicit contracts only.
- Material architectural decisions get an ADR (e.g. `docs/adr/`).
- Boundary behavior is demonstrated by tests (port contract tests, use-case tests with fake adapters).

## Prohibited shortcuts
- "Temporary" direct SDK usage inside a use case.
- Mirroring ORM methods on repositories instead of modeling domain persistence needs.
- Reusing an ORM model as a domain entity to save mapping code.

## Expected output
- Affected boundaries; decision and rationale; dependency-direction review result; risks; required tests; ADR requirement (yes/no and why); verification evidence actually observed.
