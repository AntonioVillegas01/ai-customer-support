# Widget Integration Guide

Embed the AI support widget on any approved website with a single script tag.

## Quick start

```html
<script
  src="https://widget.<your-domain>/embed.js"
  data-widget-key="wgt_XXXXXXXXXXXX"
  async
></script>
```

The loader injects an isolated `<iframe>` (sandboxed, separate origin) with a floating launcher button. All conversation UI runs inside the iframe; the host page never receives customer message content.

## Security model

1. **Origin allowlist** — tenant admins register allowed origins in Settings → Widget. The API refuses to mint widget tokens for any other `Origin` (403).
2. **Short-lived signed tokens** — the iframe calls `POST /v1/widget/token` with the public widget key; the server validates the `Origin` header and returns an HMAC-signed token (15 min TTL) bound to the organization and widget configuration. The public widget key grants nothing by itself; there are no private API credentials in the browser.
3. **Iframe isolation** — the widget runs on a dedicated origin with its own CSP (`default-src 'self'; connect-src <api-origin>`). The host page cannot script into it.
4. **postMessage protocol** — loader ↔ iframe messages validate `event.origin` on both sides and use a namespaced message type prefix `acs:`. Unknown origins and types are ignored.
5. **Rate limiting** — token minting and message posting are rate limited per IP and per token. Abusive traffic degrades to 429 with `Retry-After`.

## Runtime protocol

| Step | Call | Notes |
|---|---|---|
| 1 | `POST /v1/widget/token` `{ widgetKey }` | Origin-checked; returns `{ token, config }` (branding, locale) |
| 2 | `POST /v1/widget/conversations` | Bearer token; creates or resumes a conversation |
| 3 | `POST /v1/widget/conversations/:id/messages` | Requires `idempotencyKey` (UUID, client-generated). Returns 202; duplicates return `duplicate: true` and are never double-processed |
| 4 | `GET /v1/widget/conversations/:id/events` | SSE stream: message/assistant events, tool confirmation requests, escalation notices. Auto-reconnect; on reconnect refetch history via step 5 |
| 5 | `GET /v1/widget/conversations/:id/messages?limit=…&cursor=…` | Cursor-paginated history |

Token refresh: on 401, re-mint via step 1 (transparent to the customer). Conversation id is kept in `sessionStorage` (never auth material).

## Message lifecycle

- Messages are accepted (202) before AI processing; delivery states arrive over SSE.
- Duplicate network retries are safe: reuse the same `idempotencyKey`.
- If the AI provider is unavailable the customer receives a graceful failure event with an escalation offer — human handoff keeps working.

## Tool confirmations

When the assistant proposes a consequential action (e.g. create a return), the widget receives a `tool.confirmation_requested` SSE event with a human-readable summary and expiry. The customer must explicitly confirm; the widget calls the confirm endpoint with the widget token. Expired or rejected confirmations never execute.

## Accessibility & localization

- WCAG 2.2 AA: keyboard navigable, focus trapped inside the open panel, `aria-live` for incoming messages, visible focus indicators, prefers-reduced-motion respected.
- Locale comes from widget configuration; all strings go through the widget i18n catalog.

## Branding

Tenant admins configure title, primary color, and locale. Branding arrives with the token response — no extra request.
