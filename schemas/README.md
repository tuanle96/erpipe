# Tool schemas

Optional home for **exported JSON Schema** of the MCP tool surface (D14: 23 tools).

The authoritative Cloud v1 contract is exported from Python FastMCP and consumed
by both TypeScript Workers. This directory contains:

- Generated JSON Schema snapshots for external consumers
- Diffable schema freezes between releases

The generated TypeScript runtime copy lives at
`packages/core/src/cloud-v1-python-contracts.generated.ts`; do not edit it by hand.

See [docs/tools.md](../docs/tools.md) for the human-readable catalog.

`cloud-v1-python-contracts.json` pins all 23 D14 tools. Regenerate the JSON and
runtime TypeScript copy together with:

```bash
uv run --project /path/to/mcp-odoo python scripts/export-python-contracts.py \
  --mcp-odoo /path/to/mcp-odoo \
  --output schemas/cloud-v1-python-contracts.json \
  --typescript-output packages/core/src/cloud-v1-python-contracts.generated.ts
```

The exporter reads the real FastMCP `tools/list` input/output schemas, pins their
hashes, and records whether each tool uses direct or `{result: ...}` structured
content. Six representative typed tools additionally validate both success and
error samples through their Pydantic response models. The older
`phase1-python-contracts.json` is retained only as migration history.
