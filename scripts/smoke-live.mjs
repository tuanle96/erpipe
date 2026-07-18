#!/usr/bin/env node
/**
 * Live smoke against a real Odoo (XML-RPC or JSON-2).
 *
 * Env:
 *   ODOO_URL      e.g. http://127.0.0.1:8070
 *   ODOO_DB
 *   ODOO_USERNAME  (xmlrpc)
 *   ODOO_PASSWORD  or ODOO_API_KEY
 *   ODOO_TRANSPORT xmlrpc|json2  (default: xmlrpc if password, else json2)
 */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Load built packages
const coreUrl = pathToFileURL(
  path.join(root, "packages/core/dist/index.js"),
).href;
const core = await import(coreUrl);

const url = process.env.ODOO_URL;
const db = process.env.ODOO_DB;
const username = process.env.ODOO_USERNAME || "admin";
const password = process.env.ODOO_PASSWORD || process.env.ODOO_API_KEY;
const transportName =
  process.env.ODOO_TRANSPORT ||
  (process.env.ODOO_API_KEY && !process.env.ODOO_PASSWORD ? "json2" : "xmlrpc");

if (!url || !db || !password) {
  console.error(
    "Need ODOO_URL, ODOO_DB, and ODOO_PASSWORD (xmlrpc) or ODOO_API_KEY (json2)",
  );
  process.exit(1);
}

/** @type {import('@erpipe/core').OdooTransport} */
let transport;
if (transportName === "json2") {
  transport = new core.Json2Transport({
    url,
    db,
    apiKey: password,
    allowHttp: true,
  });
} else {
  transport = new core.XmlRpcTransport({
    url,
    db,
    username,
    password,
    allowHttp: true,
  });
}

const steps = [];
function ok(name, detail) {
  steps.push({ name, pass: true, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  steps.push({ name, pass: false, detail });
  console.error(`FAIL  ${name} — ${detail}`);
}

console.log(`Smoke transport=${transportName} url=${url} db=${db}\n`);

try {
  await transport.connect();
  ok("connect/authenticate");
} catch (e) {
  fail("connect/authenticate", e.message);
  process.exit(1);
}

try {
  const v = await transport.serverVersion();
  ok("serverVersion", JSON.stringify(v));
} catch (e) {
  fail("serverVersion", e.message);
}

// health_check (local, no Odoo)
{
  const h = core.healthCheck({
    name: "smoke",
    toolCount: 6,
    transport: transportName,
  });
  ok("health_check", h.success ? "success" : h.error);
}

// build_domain pure
{
  const d = core.buildDomainTool({
    conditions: [
      { field: "is_company", operator: "=", value: true },
      { field: "name", operator: "ilike", value: "a" },
    ],
  });
  ok("build_domain", d.success ? `domain len ${d.domain.length}` : d.error);
}

// list_models
try {
  const r = await core.listModels(transport, { limit: 10, query: "res." });
  if (r.success && r.count > 0) {
    ok(
      "list_models",
      `count=${r.count} sample=${r.result?.[0]?.model ?? "?"}`,
    );
  } else fail("list_models", JSON.stringify(r).slice(0, 200));
} catch (e) {
  fail("list_models", e.message);
}

// get_model_fields
try {
  const r = await core.getModelFields(transport, { model: "res.partner" });
  if (r.success && r.count > 0) {
    ok("get_model_fields", `res.partner fields=${r.count}`);
  } else fail("get_model_fields", JSON.stringify(r).slice(0, 200));
} catch (e) {
  fail("get_model_fields", e.message);
}

// search_records
try {
  const r = await core.searchRecords(transport, {
    model: "res.partner",
    domain: [],
    limit: 3,
  });
  if (r.success) {
    ok(
      "search_records",
      `count=${r.count} smart=${r.smart_fields_applied} first=${r.result?.[0]?.name ?? r.result?.[0]?.id}`,
    );
  } else fail("search_records", JSON.stringify(r).slice(0, 200));
} catch (e) {
  fail("search_records", e.message);
}

// read_record
try {
  const search = await core.searchRecords(transport, {
    model: "res.partner",
    domain: [],
    fields: ["id", "name"],
    limit: 1,
  });
  const id = search.result?.[0]?.id;
  if (!id) {
    fail("read_record", "no partner id from search");
  } else {
    const r = await core.readRecord(transport, {
      model: "res.partner",
      record_id: id,
    });
    if (r.success) {
      ok("read_record", `id=${id} name=${r.result?.name ?? "?"}`);
    } else fail("read_record", JSON.stringify(r).slice(0, 200));
  }
} catch (e) {
  fail("read_record", e.message);
}

// Phase 2
try {
  const r = await core.searchRecords(transport, {
    model: "res.partner",
    query: "a",
    limit: 2,
  });
  ok(
    "search_records+query",
    r.success
      ? `count=${r.count} fields=${(r.query_fields_used || []).join(",")}`
      : JSON.stringify(r).slice(0, 120),
  );
} catch (e) {
  fail("search_records+query", e.message);
}

try {
  const r = await core.getOdooProfile(transport, {
    include_modules: true,
    module_limit: 5,
  });
  ok(
    "get_odoo_profile",
    r.success
      ? `modules=${r.profile?.installed_module_count} ver=${r.profile?.server_version?.raw}`
      : JSON.stringify(r).slice(0, 120),
  );
} catch (e) {
  fail("get_odoo_profile", e.message);
}

try {
  const r = await core.schemaCatalog(transport, { query: "res.", limit: 5 });
  ok("schema_catalog", r.success ? `count=${r.count}` : JSON.stringify(r).slice(0, 120));
} catch (e) {
  fail("schema_catalog", e.message);
}

try {
  const r = await core.aggregateRecords(transport, {
    model: "res.partner",
    group_by: ["is_company"],
    measures: [],
    limit: 10,
  });
  ok(
    "aggregate_records",
    r.success
      ? `method=${r.method} rows=${r.row_count}`
      : JSON.stringify(r).slice(0, 160),
  );
} catch (e) {
  fail("aggregate_records", e.message);
}

try {
  const r = await core.inspectModelRelationships(transport, {
    model: "res.partner",
  });
  ok(
    "inspect_model_relationships",
    r.success
      ? `rels=${r.summary?.relationship_count} required=${r.summary?.required_count}`
      : JSON.stringify(r).slice(0, 120),
  );
} catch (e) {
  fail("inspect_model_relationships", e.message);
}

try {
  const r = await core.diagnoseAccess(transport, {
    model: "res.partner",
    operation: "read",
  });
  ok(
    "diagnose_access",
    r.success
      ? `visible=${r.visible_count} acl_lines=${(r.access_lines || []).length}`
      : JSON.stringify(r).slice(0, 120),
  );
} catch (e) {
  fail("diagnose_access", e.message);
}

{
  const r = core.diagnoseOdooCall({
    model: "res.partner",
    method: "search_read",
    args: [[]],
    kwargs: { limit: 5 },
    transport: transportName,
    target_version: "18.0",
  });
  ok("diagnose_odoo_call", r.success ? `json2_ready=${r.classification?.json2_ready}` : "issues");
}

try {
  const r = await core.searchEmployee(transport, { name: "a", limit: 3 });
  ok(
    "search_employee",
    r.success
      ? `n=${(r.result || []).length}`
      : `soft-fail ${String(r.error || "").slice(0, 80)}`,
  );
} catch (e) {
  ok("search_employee", `soft-fail ${e.message.slice(0, 80)}`);
}

console.log("\n--- Summary ---");
const failed = steps.filter((s) => !s.pass);
console.log(`${steps.length - failed.length}/${steps.length} passed`);
if (failed.length) {
  process.exitCode = 1;
} else {
  console.log("Live smoke green.");
}
