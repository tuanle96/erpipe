# Protocol contract (Entry Gate B)

Self-contained notes for the remote MCP + OAuth shape used by ERPipe self-host and hosted products.

## Contract

1. **MCP mount:** `/{slug}/mcp` (not an unscoped bare `/mcp` for multi-connection designs)
2. **OAuth 2.1 + PKCE:** S256 only (`allowPlainPKCE: false`)
3. **RFC 9728 PRM** (path-specific): `/.well-known/oauth-protected-resource/{slug}/mcp`
4. **RFC 8707 `resource`:** access grant is bound to the connection URL
5. **Cross-slug token replay** → `401` audience mismatch
6. **Library pins:** `agents@0.17.4`, `@cloudflare/workers-oauth-provider@0.8.2`

## Reserved path segments

Do not use these as connection slugs: `authorize`, `token`, `register`, `mcp`, `sse`, `.well-known`, `assets`, `health`, `app`, `admin`.

## Proof history

The contract was validated end-to-end (including Claude.ai Connected) before this monorepo was extracted. Implementation in-repo:

- `packages/worker-selfhost` — minimal single-tenant Worker
- Hosted multi-tenant control plane lives outside this OSS tree

## Related

- [packages/worker-selfhost/README.md](packages/worker-selfhost/README.md)
- [docs/tools.md](docs/tools.md)
