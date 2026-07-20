# Tool & prompt catalog (D14 / cloud v1)

Canonical surface for `@erpipe/core` and `@erpipe/worker-selfhost`:

- **23 tools** (OSS core phases 1–4)
- **7 prompts**

**Hosted workspace** (`mcp.erpipe.com/mcp`) exposes the core tools plus multi-instance helpers (`list_instances`, cross-instance reads, attachments, etc.) and instance lifecycle tools (`create_instance`, `update_instance`, `rotate_instance_credentials`, `delete_instance`) — **36 tools** total at the cloud agent surface. Every Odoo-bound tool requires an explicit `instance` key. Lifecycle tools require `erpipe:write`.

Source of truth in code: `PHASE1_TOOLS` … `PHASE4_TOOLS` and `CLOUD_V1_PROMPTS` in `packages/core`; hosted registration in `erpipe-cloud` agent tool registrations.

## Tools

### Phase 1 — read / health

| Tool | Purpose |
|------|---------|
| `health_check` | Connection + surface sanity |
| `list_models` | List accessible models |
| `get_model_fields` | Field metadata for a model |
| `search_records` | Domain search with limits |
| `read_record` | Read records by id |
| `build_domain` | Build Odoo domain from structured input |

### Phase 2 — diagnose / smart read

| Tool | Purpose |
|------|---------|
| `aggregate_records` | Aggregations over a domain |
| `search_employee` | HR employee search helpers |
| `search_holidays` | Leave / holiday search helpers |
| `get_odoo_profile` | Instance profile snapshot |
| `schema_catalog` | Schema browsing helpers |
| `diagnose_odoo_call` | Diagnose a failed model call |
| `diagnose_access` | Access / ACL diagnosis |
| `inspect_model_relationships` | Relational graph for a model |

### Phase 3 — gated writes

| Tool | Purpose |
|------|---------|
| `preview_write` | Preview create/write/unlink + approval token |
| `validate_write` | Validate values against field policy |
| `execute_approved_write` | Execute only with a valid approval token |
| `chatter_post` | Post a chatter message |
| `execute_method` | Call a model method (safety-classified) |

Writes require host policy / env (`ODOO_MCP_ENABLE_WRITES` in smoke). Prefer preview → validate → execute.

### Phase 4 — reports

| Tool | Purpose |
|------|---------|
| `generate_json2_payload` | Build JSON-2 style payloads |
| `upgrade_risk_report` | Upgrade risk analysis report |
| `fit_gap_report` | Fit/gap workshop report |
| `business_pack_report` | Business pack summary report |

## Prompts

| Prompt | Purpose |
|--------|---------|
| `diagnose_failed_odoo_call` | Guided diagnosis of a failed call |
| `fit_gap_workshop` | Structure fit/gap from requirements |
| `json2_migration_plan` | Plan XML-RPC/JSON-RPC → JSON-2 migration |
| `safe_write_review` | Review create/write/unlink before execute |
| `invoice_approval_chain` | Draft invoice find → validate → gated post |
| `po_to_receipt` | PO / receipt / bill three-way match |
| `customer_onboarding` | Dedup + gated customer create |

## Transport notes

| Transport | Typical auth | Package |
|-----------|--------------|---------|
| XML-RPC | username + password / API key as password | `@erpipe/odoo-xmlrpc` + `XmlRpcTransport` |
| JSON-2 | API key bearer | `Json2Transport` |

URL policy rejects unsafe origins (SSRF guard) before calling Odoo.
