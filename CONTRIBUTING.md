# Contributing to ERPipe

Thanks for helping improve open-core MCP access to Odoo.

## Prerequisites

- **Node.js ≥ 20** (CI uses Node 22; see `.nvmrc`)
- npm (workspaces)
- Optional: a local Odoo instance for `npm run smoke:live`

## Setup

```bash
git clone https://github.com/erpipe-org/erpipe.git
cd erpipe
npm install
npm run build
npm run typecheck
npm test
```

## Monorepo layout

| Path | Package | Notes |
|------|---------|--------|
| `packages/core` | `@erpipe/core` | Tools, transports, field policy — no Workers imports · **published** |
| `packages/xmlrpc` | `@erpipe/odoo-xmlrpc` | Fetch-based XML-RPC · **published** |
| `packages/worker-selfhost` | `@erpipe/worker-selfhost` | Example Worker (private, not published) |

Build order matters: **xmlrpc → core → worker-selfhost**. Root `npm run build` enforces this.

### Publishing (maintainers)

```bash
npm run build
npm run typecheck
npm test
# publish dependency first
npm publish -w @erpipe/odoo-xmlrpc --access public
npm publish -w @erpipe/core --access public
```

Bump versions in the workspace `package.json` files (and lockstep dependency ranges) before each release.

## Development

```bash
# unit tests (watch)
npm run test:watch

# self-host Worker
npm run dev:selfhost

# pure TS surface (no Python)
npm run parity:ts

# live Odoo smoke (requires env — see SMOKE.md)
ODOO_URL=... ODOO_DB=... ODOO_USERNAME=admin ODOO_PASSWORD=... npm run smoke:live
```

## Pull requests

1. Branch from `main`
2. Keep changes focused (one concern per PR when possible)
3. Ensure **build + typecheck + test** pass locally
4. Update docs if you change tools, env vars, or public APIs
5. Use a clear commit message (Conventional Commits preferred: `feat:`, `fix:`, `docs:`, `chore:`)

### PR checklist

- [ ] `npm run build && npm run typecheck && npm test` pass
- [ ] New tools documented in [docs/tools.md](docs/tools.md) if the surface changed
- [ ] No secrets (`.env`, API keys, customer data) in the diff
- [ ] Related issue linked (if any)

## Code style

- TypeScript **strict**; match existing patterns in the package you touch
- Prefer small, testable pure functions in `@erpipe/core`
- Do not import Cloudflare Workers APIs into `@erpipe/core` or `@erpipe/odoo-xmlrpc`

## Security

See [SECURITY.md](SECURITY.md). Do not file public issues for vulnerabilities.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
