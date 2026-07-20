# Tool & prompt catalog

Source of truth in code:

| Surface | Count | Where |
|---------|-------|--------|
| Core phase tools (`PHASE1`…`PHASE4`) | **26** | `@erpipe/core` (`packages/core`) |
| Prompts | **7** | `CLOUD_V1_PROMPTS` |
| MCP resources | **4** | `CLOUD_V1_RESOURCES` |
| Hosted workspace MCP | **37 tools** | `ALL_TOOLS` in erpipe-cloud `agent/constants.ts` |
| Self-host example | **27 tools** (26 phase + `ping`) | `@erpipe/worker-selfhost` |

Python parity contracts still pin the original **D14 23-tool** names; TypeScript adds `model_facts`, `read_attachment`, and `render_report` on the core phase lists (`CLOUD_V1_TOOL_COUNT = 26`).

**Hosted extras** (not in OSS self-host): multi-instance + lifecycle + Odoo event pull + `ping` on the cloud agent:

```text
26 phase
+ ping
+ list_instances, search_across_instances, aggregate_across_instances, accounting_health_across_instances
+ create_instance, update_instance, rotate_instance_credentials, delete_instance
+ list_odoo_events, ack_odoo_event
= 37
```

Every Odoo-bound hosted tool requires an explicit `instance` key (`list_instances` to discover). Lifecycle tools require OAuth scope `erpipe:write`.

## Tools — core phases (26)

### Phase 1 — read / health (7)

| Tool | Purpose |
|------|---------|
| `search_records` | Domain search with limits |
| `model_facts` | Model intent snapshot (search / write / domain / overview) |
| `read_record` | Read records by id |
| `build_domain` | Build Odoo domain from structured input |
| `list_models` | List accessible models |
| `get_model_fields` | Field metadata for a model |
| `health_check` | Connection + surface sanity |

### Phase 2 — diagnose / smart read (9)

| Tool | Purpose |
|------|---------|
| `aggregate_records` | Aggregations over a domain |
| `search_employee` | HR employee search helpers |
| `search_holidays` | Leave / holiday search helpers |
| `get_odoo_profile` | Instance profile snapshot |
| `schema_catalog` | Schema browsing helpers (fan-out + cache metrics on hosted) |
| `diagnose_odoo_call` | Diagnose a failed model call |
| `diagnose_access` | Access / ACL diagnosis |
| `inspect_model_relationships` | Relational graph for a model |
| `read_attachment` | Read `ir.attachment` payload (bounded) |

### Phase 3 — gated writes (5)

| Tool | Purpose |
|------|---------|
| `preview_write` | Preview create/write/unlink + approval token |
| `validate_write` | Validate values against field policy |
| `execute_approved_write` | Execute only with a valid approval token |
| `chatter_post` | Post a chatter message |
| `execute_method` | Call a model method (safety-classified) |

Writes require host policy. Prefer **preview → validate → execute**. On hosted product: connection `writes_enabled` defaults OFF; owner HITL / `write_mode` and journal gates still apply.

### Phase 4 — reports (5)

| Tool | Purpose |
|------|---------|
| `generate_json2_payload` | Build JSON-2 style payloads |
| `upgrade_risk_report` | Upgrade risk analysis report |
| `fit_gap_report` | Fit/gap workshop report |
| `business_pack_report` | Business pack summary report |
| `render_report` | Render a report payload (e.g. base64) |

## Tools — hosted only (11)

### Common

| Tool | Purpose |
|------|---------|
| `ping` | Lightweight liveness / agent identity |

### Multi-instance (read-only fleet)

| Tool | Purpose |
|------|---------|
| `list_instances` | List workspace Odoo instances + status |
| `search_across_instances` | Fan-out search (≤10 targets, concurrency 4) |
| `aggregate_across_instances` | Fan-out aggregates with attribution |
| `accounting_health_across_instances` | Receivables-style health across instances |

There are **no** cross-instance write tools.

### Instance lifecycle (require `erpipe:write`)

| Tool | Purpose |
|------|---------|
| `create_instance` | Create instance (HTTPS preflight + auth probe) |
| `update_instance` | Label / pause-resume (`enabled`) |
| `rotate_instance_credentials` | Rotate stored credentials |
| `delete_instance` | Delete instance + encrypted secrets |

Governance toggles (`writes_enabled`, `write_mode`, field policy) stay dashboard-only.

### Odoo webhook pull queue

| Tool | Purpose |
|------|---------|
| `list_odoo_events` | List inbound webhook events for a connection |
| `ack_odoo_event` | Acknowledge a handled event |

Ingress: `POST /hooks/{slug}` with the connection webhook secret.

## Prompts (7)

| Prompt | Purpose |
|--------|---------|
| `diagnose_failed_odoo_call` | Guided diagnosis of a failed call |
| `fit_gap_workshop` | Structure fit/gap from requirements |
| `json2_migration_plan` | Plan XML-RPC/JSON-RPC → JSON-2 migration |
| `safe_write_review` | Review create/write/unlink before execute |
| `invoice_approval_chain` | Draft invoice find → validate → gated post |
| `po_to_receipt` | PO / receipt / bill three-way match |
| `customer_onboarding` | Dedup + gated customer create |

## Resources (4)

| Name | URI | Purpose |
|------|-----|---------|
| `odoo_models` | `odoo://models` | List available models |
| `odoo_model` | `odoo://model/{model_name}` | Model + fields |
| `odoo_record` | `odoo://record/{model_name}/{record_id}` | One record |
| `odoo_search` | `odoo://search/{model_name}/{domain}` | Search with JSON domain |

## Transport notes

| Transport | Typical auth | Package |
|-----------|--------------|---------|
| XML-RPC | username + password / API key as password | `@erpipe/odoo-xmlrpc` + `XmlRpcTransport` |
| JSON-2 | API key bearer | `Json2Transport` |

URL policy rejects unsafe origins (SSRF guard) before calling Odoo. Hosted product rechecks public-unicast DNS at create, session open, and per-call boundaries.
