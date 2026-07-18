# ERPipe — MCP for Odoo

[![CI](https://github.com/tuanle96/erpipe/actions/workflows/ci.yml/badge.svg)](https://github.com/tuanle96/erpipe/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)

Open-source **TypeScript** building blocks for **remote MCP** access to [Odoo](https://www.odoo.com/).

| | |
|--|--|
| **This repo (MIT)** | Tool logic, transports, single-tenant self-host Worker example |
| **Hosted product** | Multi-tenant control plane + dashboard — [mcp.erpipe.com](https://mcp.erpipe.com) (separate private repo) |

## Why

- Talk to Odoo from MCP clients (Claude, Cursor, custom agents) over a stable URL shape
- Workers-safe XML-RPC + JSON-2 transports
- **Gated writes** (preview → approve → execute) with field policy
- Shared **23-tool + 7-prompt** surface (D14 / cloud v1) — see [docs/tools.md](docs/tools.md)

## Status

| Milestone | State |
|-----------|--------|
| OAuth + `/{slug}/mcp` contract | Proven — see [SPIKE.md](SPIKE.md) |
| D14 surface | **23 tools + 7 prompts** in `@erpipe/core` |
| Pure parity harness | `npm run parity` — [PARITY.md](PARITY.md) |
| Live smoke (Odoo 18) | `npm run smoke:live` — [SMOKE.md](SMOKE.md) |

**Pins:**

| Package | Version |
|---------|---------|
| `agents` | `0.17.4` |
| `@cloudflare/workers-oauth-provider` | `0.8.2` |

## Packages

| Path | Name | Role |
|------|------|------|
| `packages/core` | `@erpipe/core` | Transports, tools, field policy — **no Workers imports** |
| `packages/xmlrpc` | `@erpipe/odoo-xmlrpc` | Fetch-based XML-RPC (Workers-safe) |
| `packages/worker-selfhost` | `@erpipe/worker-selfhost` | Single-tenant `McpAgent` + OAuth example |

## Requirements

- **Node.js ≥ 20** (CI uses 22 — [`.nvmrc`](.nvmrc))
- npm
- Optional: Cloudflare account for `deploy:selfhost`
- Optional: Odoo 16–19 for live smoke

## Install (from source)

npm packages may not be on the public registry yet. Use git / monorepo workspace:

```bash
git clone https://github.com/tuanle96/erpipe.git
cd erpipe
npm install
npm run build
npm run typecheck
npm test
```

Workspace packages:

```json
{
  "dependencies": {
    "@erpipe/core": "file:./packages/core",
    "@erpipe/odoo-xmlrpc": "file:./packages/xmlrpc"
  }
}
```

## Quick start (self-host Worker)

```bash
npm run dev:selfhost
# Home: http://127.0.0.1:8787/
# MCP:  http://127.0.0.1:8787/default/mcp
```

Deploy:

```bash
# set secrets first — see packages/worker-selfhost/README.md
npm run deploy:selfhost
```

## Canonical MCP URL

Connection-scoped path (proven with Claude.ai):

```text
https://<host>/{connection_slug}/mcp
```

Reserved slugs (never use as connection id): `authorize`, `token`, `register`, `mcp`, `sse`, `.well-known`, `assets`, `health`, `app`, `admin`.

## Docs

| Doc | Topic |
|-----|--------|
| [docs/tools.md](docs/tools.md) | Full tool & prompt catalog |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Dev setup & PRs |
| [SECURITY.md](SECURITY.md) | Vulnerability reporting |
| [CHANGELOG.md](CHANGELOG.md) | Releases |
| [SMOKE.md](SMOKE.md) | Live Odoo smoke |
| [PARITY.md](PARITY.md) | Python vs TS pure harness |
| [SPIKE.md](SPIKE.md) | Protocol contract notes |

## Architecture (high level)

```text
MCP client  ──OAuth + MCP──►  Worker (self-host or hosted)
                                  │
                                  ▼
                           @erpipe/core tools
                                  │
                    ┌─────────────┴─────────────┐
                    ▼                           ▼
             XmlRpcTransport              Json2Transport
                    │                           │
                    └──────────► Odoo ◄─────────┘
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Please read the [Code of Conduct](CODE_OF_CONDUCT.md).

## License

MIT — see [LICENSE](LICENSE).

"Odoo" is a trademark of Odoo S.A. ERPipe is not affiliated with Odoo S.A.
