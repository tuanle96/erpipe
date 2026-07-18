# Scripts

Run from the monorepo root after `npm install`.

| Script | npm | Purpose |
|--------|-----|---------|
| `smoke-live.mjs` | `npm run smoke:live` | Live Odoo smoke (XML-RPC or JSON-2). Requires `ODOO_*` env — [SMOKE.md](../SMOKE.md) |
| `parity-harness.mjs` | `npm run parity` | Compare `@erpipe/core` pure tools vs Python `mcp-odoo` fixture corpus — [PARITY.md](../PARITY.md) |
| `parity-harness.mjs` | `npm run parity:ts` | TS-only surface checks (`PARITY_TS_ONLY=1`) |
| `fanout-matrix.mjs` | `npm run fanout:matrix` | Multi-version Odoo fanout helper |
| `export-python-contracts.py` | — | Export and runtime-verify the pinned six-tool Python contract manifest |
| `parity/corpus.json` | — | Shared pure-tool fixtures |
| `parity/run_python_side.py` | — | Python side of the parity harness |

Most scripts load built packages from `packages/*/dist` — run `npm run build` (or the npm script which builds first) before invoking them manually.
