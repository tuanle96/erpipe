# Protocol spike reference

Entry Gate B was proven in the `mcp-odoo` plan tree:

- Path: `mcp-odoo/plans/260714-0931-odoo-mcp-cloud/spike/`
- Results: `spike-results.md` — **PASS** including Claude.ai Connected
- Deployed proof: `https://erpipe-entry-b-spike.ninjac9.workers.dev/alpha/mcp`

## Contract carried into this repo

1. MCP mount: `/{slug}/mcp` (not unscoped `/mcp`)
2. OAuth 2.1 + PKCE **S256 only** (`allowPlainPKCE: false`)
3. Path-specific RFC 9728 PRM: `/.well-known/oauth-protected-resource/{slug}/mcp`
4. RFC 8707 `resource` binds grant to connection URL
5. Cross-slug token replay → 401 audience mismatch
6. Pins: `agents@0.17.4`, `@cloudflare/workers-oauth-provider@0.8.2`
