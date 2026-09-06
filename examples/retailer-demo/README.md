# Retailer demo site

Static storefront that consumes the support widget via the one-line embed, simulating a real retailer host page.

## Run

```bash
# 1. Start the platform (from the repo root)
pnpm dev

# 2. Serve this folder
npx serve -l 8080 examples/retailer-demo
```

Open http://localhost:8080 and click the floating chat button (bottom-right).

## Requirements

- `http://localhost:8080` must be in the Acme widget origin allowlist (Settings → Widget, or seeded via SQL). Otherwise the token mint fails with 403 `ORIGIN_NOT_ALLOWED`.
- The embed is a single line at the bottom of `index.html`:

```html
<script src="http://localhost:3002/embed.js" data-widget-key="wgt_acme_local_demo_key" async></script>
```

## Things to try

- Ask about shipping, returns, or warranty (seeded knowledge base).
- Ask for order `ORD-1001` status (uses the `lookup_order` tool).
- Request a return for `ORD-1001` (triggers a confirmation card via `create_return`).
