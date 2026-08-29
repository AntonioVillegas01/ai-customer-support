# ADR 0006: Server-Sent Events for real-time delivery

## Status
Accepted

## Context
The widget and agent workspace need live message streaming. Interaction is strictly server→client (clients send messages via normal POSTs with idempotency keys).

## Decision
SSE over WebSockets:
- Unidirectional flow matches the actual requirement; POST+SSE keeps message submission idempotent and retryable.
- SSE works through proxies/ALBs without protocol upgrades, supports auto-reconnect with Last-Event-ID, and is trivially compatible with HTTP auth (cookies/tokens).
- Fan-out across API instances uses Redis pub/sub; durable state is always PostgreSQL, so a dropped SSE connection loses nothing (clients re-fetch history on reconnect).

## Consequences
If bidirectional needs emerge (typing indicators from clients at high frequency), WebSockets can be added behind the same event-publisher port.
