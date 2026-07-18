# Tool schemas

Optional home for **exported JSON Schema** of the MCP tool surface (D14: 23 tools).

Today the authoritative schema lives in TypeScript / Zod inside `@erpipe/core` (`packages/core/src`). This directory is reserved for:

- Generated JSON Schema snapshots for external consumers
- Diffable schema freezes between releases

Nothing required at install time. When exports land they will be generated from the same source as the runtime tools — not hand-edited duplicates.

See [docs/tools.md](../docs/tools.md) for the human-readable catalog.

`phase1-python-contracts.json` is the pinned six-tool Phase-1 manifest. Regenerate it with:

```bash
/path/to/mcp-odoo/.venv/bin/python scripts/export-python-contracts.py \
  --mcp-odoo /path/to/mcp-odoo \
  --output schemas/phase1-python-contracts.json
```

The exporter reads the real FastMCP `tools/list` schemas and runtime-validates both
success and error envelopes against their Pydantic response models before writing.
