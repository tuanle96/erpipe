# Live smoke results

**Script:** `npm run smoke:live`  
**Requires:** reachable Odoo + credentials via env

## Env

| Variable | Required | Notes |
|----------|----------|--------|
| `ODOO_URL` | yes | e.g. `http://127.0.0.1:8069` |
| `ODOO_DB` | yes | database name |
| `ODOO_USERNAME` | for xmlrpc | default `admin` |
| `ODOO_PASSWORD` or `ODOO_API_KEY` | yes | password (xmlrpc) or API key |
| `ODOO_TRANSPORT` | no | `xmlrpc` \| `json2` (default inferred) |
| `ODOO_MCP_ENABLE_WRITES` | no | `1` / `true` to exercise execute create + unlink |

## Example

```bash
ODOO_URL=http://127.0.0.1:8069 \
ODOO_DB=odoo \
ODOO_USERNAME=admin \
ODOO_PASSWORD=admin \
ODOO_TRANSPORT=xmlrpc \
npm run smoke:live
```

## Latest recorded (maintainer)

**Date:** 2026-07-18  
**Target:** local Odoo **18** · transport **xmlrpc**

| Suite | Result |
|-------|--------|
| health_check tools=23 prompts=7 | PASS |
| prompts catalog 7/7 render | PASS |
| Read / diagnose (P1–P2) | PASS |
| Report tools (P4) | PASS |
| preview_write / validate_write | PASS |
| execute denied when writes off | PASS |
| execute create + unlink (`ODOO_MCP_ENABLE_WRITES=1`) | PASS (prior run) |

Re-run on your instance before relying on smoke for a release.
