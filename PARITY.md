# Cloud-v1 tier parity harness

Compares **@erpipe/core** pure tools against **mcp-odoo** (Python) on a shared fixture corpus. This is **cloud-v1 tier parity** (D14: 23 tools / 7 prompts), not full local-server parity (41 tools).

## Run

```bash
# requires sibling mcp-odoo checkout with importable odoo_mcp
MCP_ODOO_PATH=../mcp-odoo PYTHON=python3 npm run parity

# or use the project venv
MCP_ODOO_PATH=../mcp-odoo PYTHON=../mcp-odoo/.venv/bin/python npm run parity

# TS surface + render only (no Python)
npm run parity:ts
```

## What is compared

| Tool / surface | Mode |
|----------------|------|
| Surface 23 tools + 7 prompts | exact name set |
| `generate_json2_payload` | deep JSON |
| `upgrade_risk_report` | deep JSON |
| `fit_gap_report` | deep JSON |
| `business_pack_report` | deep JSON |
| `build_domain` | deep JSON |
| `preview_write` | approval token + issues codes (choke point) |
| 3 sample prompts | exact text |

Live Odoo tools (search/read/profile/schema/write execute) are covered by `npm run smoke:live`, not this pure harness.

## Files

- `scripts/parity/corpus.json` — cases + surface manifest  
- `scripts/parity/run_python_side.py` — Python fixture runner  
- `scripts/parity-harness.mjs` — orchestrator + normalize/diff  

## Latest

**2026-07-18:** 16/16 pure cases **PASS** vs mcp-odoo on this machine.
