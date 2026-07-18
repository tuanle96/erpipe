# Live smoke results

**Date:** 2026-07-18  
**Target:** `http://127.0.0.1:8070` · db `bestmix_7_7` · Odoo **18.0e** · transport **xmlrpc**  
**Script:** `npm run smoke:live`

## Latest (Phase 1–3)

| Suite | Result |
|-------|--------|
| Read / diagnose (P1–P2) | PASS |
| preview_write / validate_write | PASS |
| execute denied when writes off | PASS |
| execute create + unlink cleanup (`ODOO_MCP_ENABLE_WRITES=1`) | PASS |

```bash
# read-only gate check
ODOO_URL=http://127.0.0.1:8070 ODOO_DB=bestmix_7_7 ODOO_USERNAME=admin \
ODOO_PASSWORD=admin ODOO_TRANSPORT=xmlrpc npm run smoke:live

# full gated write + cleanup
ODOO_MCP_ENABLE_WRITES=1 ODOO_URL=... ODOO_DB=... ODOO_USERNAME=admin \
ODOO_PASSWORD=admin ODOO_TRANSPORT=xmlrpc npm run smoke:live
```
