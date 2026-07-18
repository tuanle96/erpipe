# Live smoke results

**Date:** 2026-07-18  
**Target:** `http://127.0.0.1:8070` · db `bestmix_7_7` · Odoo **18.0e** · transport **xmlrpc**  
**Script:** `npm run smoke:live`

## Phase 1 + 2 (latest)

| Step | Result |
|------|--------|
| connect/authenticate | PASS |
| serverVersion | PASS `18.0+e` |
| health_check | PASS |
| build_domain | PASS |
| list_models | PASS |
| get_model_fields | PASS (`res.partner` 242 fields) |
| search_records | PASS |
| read_record | PASS |
| search_records + query | PASS |
| get_odoo_profile | PASS |
| schema_catalog | PASS |
| aggregate_records | PASS (`read_group`) |
| inspect_model_relationships | PASS |
| diagnose_access | PASS |
| diagnose_odoo_call | PASS |
| search_employee | PASS |

```bash
ODOO_URL=http://127.0.0.1:8070 \
ODOO_DB=bestmix_7_7 \
ODOO_USERNAME=admin \
ODOO_PASSWORD=admin \
ODOO_TRANSPORT=xmlrpc \
npm run smoke:live
```
