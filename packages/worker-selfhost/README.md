# @erpipe/worker-selfhost

Minimal single-tenant Cloudflare Worker:

- OAuth 2.1 + PKCE S256 only  
- MCP at `/{CONNECTION_SLUG}/mcp` (default slug: `default`)  
- Tools: `ping`, `echo`  

## Dev

```bash
# from monorepo root
npm install
npm run dev:selfhost
```

- Home: http://127.0.0.1:8787/  
- MCP: http://127.0.0.1:8787/default/mcp  

## Deploy

Create a KV namespace and put the id in `wrangler.jsonc`, then:

```bash
npm run deploy:selfhost
```

## Env vars

| Var | Default | Meaning |
|-----|---------|---------|
| `CONNECTION_SLUG` | `default` | Path segment for MCP URL |
| `ODOO_URL` | — | Odoo base URL (JSON-2) |
| `ODOO_DB` | — | Database name |
| `ODOO_API_KEY` | — | API key (JSON-2 bearer) |
| `ODOO_LOCALE` | — | Optional `context.lang` |
| `ODOO_JSON2_DB_HEADER` | `1` | Set `0` to omit `X-Odoo-Database` |

```bash
npx wrangler secret put ODOO_URL
npx wrangler secret put ODOO_DB
npx wrangler secret put ODOO_API_KEY
```

## Phase-1 tools

`health_check`, `list_models`, `get_model_fields`, `search_records`, `read_record`, `build_domain`, plus `ping`.
