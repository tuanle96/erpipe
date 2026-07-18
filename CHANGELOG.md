# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] — 2026-07-19

### Changed

- Public npm release under scope `@erpipe` (test files excluded from tarball)

### Packages

| Package | Version |
|---------|---------|
| `@erpipe/odoo-xmlrpc` | `0.1.1` |
| `@erpipe/core` | `0.1.1` |

```bash
npm install @erpipe/core @erpipe/odoo-xmlrpc
```

- https://www.npmjs.com/package/@erpipe/core  
- https://www.npmjs.com/package/@erpipe/odoo-xmlrpc  

## [0.1.0] — 2026-07-19

### Added

- Open-core monorepo under MIT:
  - `@erpipe/odoo-xmlrpc` — fetch-based XML-RPC client (Workers-safe)
  - `@erpipe/core` — transports (XML-RPC + JSON-2), field policy, gated writes, D14 tool surface
  - `@erpipe/worker-selfhost` — single-tenant Cloudflare Worker example (OAuth + `/{slug}/mcp`)
- **23 MCP tools** + **7 prompts** (cloud v1 / D14 surface) — see [docs/tools.md](docs/tools.md)
- Live smoke harness (`npm run smoke:live`) and pure parity harness (`npm run parity`)
- Odoo version fanout matrix helper (`npm run fanout:matrix`)
- GitHub Actions CI (build → typecheck → test)
- Community docs: CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, issue/PR templates, Dependabot

### Notes

- `@erpipe/worker-selfhost` remains private (example only)
- Hosted multi-tenant product remains a separate private repository

[0.1.1]: https://github.com/tuanle96/erpipe/releases/tag/v0.1.1
[0.1.0]: https://github.com/tuanle96/erpipe/releases/tag/v0.1.0
