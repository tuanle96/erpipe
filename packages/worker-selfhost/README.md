# @erpipe/worker-selfhost

Minimal **single-tenant** Cloudflare Worker that exposes ERPipe over MCP:

- OAuth 2.1 + PKCE **S256 only**
- MCP at `/{CONNECTION_SLUG}/mcp` (default slug: `default`)
- Core surface: **26 tools + 7 prompts** from `@erpipe/core` (phases 1–4) plus a small `ping` helper (**27 tools** total)

This package is an **example / self-host template** (`private: true` — not published to npm).

## Dev

```bash
# from monorepo root
npm install
npm run build
npm run dev:selfhost
```

- Home: http://127.0.0.1:8787/
- MCP: http://127.0.0.1:8787/default/mcp

## Deploy

Create a KV namespace, put the id in `wrangler.jsonc`, then:

```bash
npm run deploy:selfhost
```

## Env vars / secrets

| Var | Default | Meaning |
|-----|---------|---------|
| `CONNECTION_SLUG` | `default` | Path segment for MCP URL |
| `ODOO_URL` | — | Odoo base URL |
| `ODOO_DB` | — | Database name |
| `ODOO_API_KEY` | — | API key (JSON-2 bearer) |
| `ODOO_LOCALE` | — | Optional `context.lang` |
| `ODOO_JSON2_DB_HEADER` | `1` | Set `0` to omit `X-Odoo-Database` |

```bash
npx wrangler secret put ODOO_URL
npx wrangler secret put ODOO_DB
npx wrangler secret put ODOO_API_KEY
```

## Tools & prompts

See the monorepo catalog: [docs/tools.md](../../docs/tools.md).

Surface is assembled from `PHASE1_TOOLS` … `PHASE4_TOOLS` (26) plus `ping`. Hosted multi-instance / lifecycle / webhook tools are **not** included (private cloud only).

## Protocol notes

See [SPIKE.md](../../SPIKE.md) for the `/{slug}/mcp` contract, PRM path, and audience binding rules.
