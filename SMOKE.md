# Live smoke results

**Date:** 2026-07-18  
**Target:** `http://127.0.0.1:8070` · db `bestmix_7_7` · Odoo **18.0e** · transport **xmlrpc**  
**Script:** `npm run smoke:live`

| Step | Result |
|------|--------|
| connect/authenticate | PASS |
| serverVersion | PASS `18.0+e` |
| health_check | PASS |
| build_domain | PASS |
| list_models | PASS (sample `res.bank`) |
| get_model_fields | PASS (`res.partner` 242 fields) |
| search_records | PASS (3 partners, smart fields) |
| read_record | PASS |

**Note:** DEV `bestmix_7_7` login used for smoke: `admin` / `admin`.

```bash
ODOO_URL=http://127.0.0.1:8070 \
ODOO_DB=bestmix_7_7 \
ODOO_USERNAME=admin \
ODOO_PASSWORD=admin \
ODOO_TRANSPORT=xmlrpc \
npm run smoke:live
```

