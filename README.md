# ERPipe — MCP for Odoo

Open-source TypeScript building blocks for **remote MCP** access to Odoo.

> Hosted multi-tenant product (control plane, dashboard, OAuth multi-connection) lives in a separate private repo. This monorepo is **MIT** tool logic + a single-tenant self-host Worker example.

## Status

| Milestone | State |
|-----------|--------|
| Entry Gate B (OAuth + `/{slug}/mcp`) | **PASS** — see `mcp-odoo` plan spike |
| Phase 0 skeleton | done |
| Phase 1 (JSON-2 + 6 tools) | **in progress / wired** |
| Phase 2–4 remaining tools | next |

**Pins (proven by spike):**

| Package | Version |
|---------|---------|
| `agents` | `0.17.4` |
| `@cloudflare/workers-oauth-provider` | `0.8.2` |
| Python behavior | `mcp-odoo` tag `v1.2.1` + schema commit `8b40df7` (dual pin until `v1.2.2`) |

## Packages

| Package | Name | Role |
|---------|------|------|
| `packages/core` | `@erpipe/core` | Transports, tools, field policy — **no Workers imports** |
| `packages/xmlrpc` | `@erpipe/odoo-xmlrpc` | Fetch-based XML-RPC (Workers-safe) |
| `packages/worker-selfhost` | `@erpipe/worker-selfhost` | Minimal `McpAgent` + OAuth example (`ping`) |

## Quick start (self-host Worker)

```bash
npm install
npm run typecheck
npm run test
npm run dev:selfhost
# open http://127.0.0.1:8787/
# MCP: http://127.0.0.1:8787/default/mcp
```

Deploy (Cloudflare account required):

```bash
npm run deploy:selfhost
```

## Canonical MCP URL

Connection-scoped path (proven with Claude.ai):

```text
https://<host>/{connection_slug}/mcp
```

Reserved slugs (never use as connection id): `authorize`, `token`, `register`, `mcp`, `sse`, `.well-known`, `assets`, `health`, `app`, `admin`.

## License

MIT — see [LICENSE](LICENSE).

"Odoo" is a trademark of Odoo S.A. ERPipe is not affiliated with Odoo S.A.
