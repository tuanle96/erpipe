# ERPipe — MCP for Odoo

[![CI](https://github.com/erpipe-org/erpipe/actions/workflows/ci.yml/badge.svg)](https://github.com/erpipe-org/erpipe/actions/workflows/ci.yml)
[![npm @erpipe/core](https://img.shields.io/npm/v/@erpipe/core.svg)](https://www.npmjs.com/package/@erpipe/core)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](package.json)
[![Hosted: free v1](https://img.shields.io/badge/hosted-free_v1-00a99d.svg)](https://mcp.erpipe.com/)
[![Hosted product](https://img.shields.io/badge/hosted-mcp.erpipe.com-e63973.svg)](https://mcp.erpipe.com/)

Open-source **TypeScript** building blocks for **remote MCP** access to [Odoo](https://www.odoo.com/).

| | |
|--|--|
| **This repo (MIT)** | Tool logic, transports, single-tenant self-host Worker example |
| **Hosted product** | Multi-tenant control plane + dashboard — [mcp.erpipe.com](https://mcp.erpipe.com) (separate private repo) |

**Try it (real Odoo only):** [create a free v1 workspace](https://mcp.erpipe.com/), add one or more HTTPS Odoo instances, then connect ChatGPT, Codex CLI, Claude Code, Gemini CLI, Antigravity CLI, or Grok to the shared endpoint `https://mcp.erpipe.com/mcp`. Follow the [human setup recipe or copy a prompt for your AI agent](https://erpipe.com/docs/connector). There is no shared public sandbox.

## Why

- Talk to Odoo from ChatGPT, Codex CLI, Claude Code, Gemini CLI, Antigravity CLI, Grok, Cursor, and custom MCP agents over a stable URL shape
- Workers-safe XML-RPC + JSON-2 transports
- **Gated writes** (preview → approve → execute) with field policy
- Shared **26-tool + 7-prompt** core surface in `@erpipe/core` (D14 parity set of 23 plus `model_facts`, `read_attachment`, `render_report`) — hosted workspace is **37 tools** (multi-instance, lifecycle, webhook events, `ping`) — see [docs/tools.md](docs/tools.md)

## Status

| Milestone | State |
|-----------|--------|
| Hosted workspace `/mcp` contract | Implemented in the private cloud control plane |
| Self-host `/{slug}/mcp` example | Proven — see [SPIKE.md](SPIKE.md) |
| Core surface | **26 tools + 7 prompts + 4 resources** in `@erpipe/core` |
| Hosted surface | **37 tools + 7 prompts** at `mcp.erpipe.com/mcp` |
| Pure parity harness | `npm run parity` — [PARITY.md](PARITY.md) |
| Live smoke (Odoo 16–19) | `npm run smoke:live` — [SMOKE.md](SMOKE.md) |

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

## Install

```bash
npm install @erpipe/core @erpipe/odoo-xmlrpc
```

| Package | npm |
|---------|-----|
| `@erpipe/core` | [npmjs.com/package/@erpipe/core](https://www.npmjs.com/package/@erpipe/core) |
| `@erpipe/odoo-xmlrpc` | [npmjs.com/package/@erpipe/odoo-xmlrpc](https://www.npmjs.com/package/@erpipe/odoo-xmlrpc) |

Self-host Worker example stays in this monorepo only (`@erpipe/worker-selfhost` is private / not published).

### Develop from source

```bash
git clone https://github.com/erpipe-org/erpipe.git
cd erpipe
npm install
npm run build
npm run typecheck
npm test
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

## Canonical MCP URLs

| Surface | URL shape | Notes |
|---------|-----------|--------|
| **Hosted product** | `https://mcp.erpipe.com/mcp` | One workspace OAuth app; Odoo-bound tools require an explicit `instance` key (`list_instances` to discover). |
| **Self-host example** | `https://<host>/{connection_slug}/mcp` | Single-tenant Worker demo in `@erpipe/worker-selfhost`. |

Hosted setup: [mcp.erpipe.com/docs/connector](https://mcp.erpipe.com/docs/connector) · compatibility: [erpipe.com/compatibility](https://erpipe.com/compatibility)

Reserved path segments (never use as a self-host connection id): `authorize`, `token`, `register`, `mcp`, `sse`, `.well-known`, `assets`, `health`, `app`, `admin`.

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
