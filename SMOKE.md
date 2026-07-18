# Live smoke results

**Date:** 2026-07-18  
**Target:** `http://127.0.0.1:8070` · db `bestmix_7_7` · Odoo **18.0e** · transport **xmlrpc**  
**Script:** `npm run smoke:live`

## Latest (D14: 23 tools + 7 prompts)

| Suite | Result |
|-------|--------|
| health_check tools=23 prompts=7 | PASS |
| prompts catalog 7/7 render | PASS |
| Read / diagnose (P1–P2) | PASS |
| Report tools (P4) | PASS |
| preview_write / validate_write | PASS |
| execute denied when writes off | PASS |
| execute create + unlink (`ODOO_MCP_ENABLE_WRITES=1`) | PASS (prior run) |

```bash
ODOO_URL=http://127.0.0.1:8070 ODOO_DB=bestmix_7_7 ODOO_USERNAME=admin \
ODOO_PASSWORD=admin ODOO_TRANSPORT=xmlrpc npm run smoke:live
```
