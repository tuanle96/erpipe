#!/usr/bin/env node
/**
 * Measure schema_catalog fan-out on Odoo 16–19 without logging credentials.
 *
 * Required per-version env:
 *   ODOO16_URL, ODOO16_DB, ODOO16_USERNAME, ODOO16_PASSWORD
 *   ODOO17_URL, ODOO17_DB, ODOO17_USERNAME, ODOO17_PASSWORD
 *   ODOO18_URL, ODOO18_DB, ODOO18_USERNAME, ODOO18_PASSWORD
 *   ODOO19_URL, ODOO19_DB, ODOO19_API_KEY
 * Optional: FANOUT_LIMIT (default 10), FANOUT_QUERY (default "res.")
 */
import { pathToFileURL } from "node:url";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const core = await import(
  pathToFileURL(path.join(root, "packages/core/dist/index.js")).href
);

const encoder = new TextEncoder();
const byteLength = (value) => encoder.encode(JSON.stringify(value)).byteLength;
const limit = Number(process.env.FANOUT_LIMIT || 10);
const query = process.env.FANOUT_QUERY || "res.";

if (!Number.isInteger(limit) || limit < 1 || limit > 24) {
  throw new Error("FANOUT_LIMIT must be an integer from 1 to 24");
}

const targets = [
  { version: 16, transport: "xmlrpc" },
  { version: 17, transport: "xmlrpc" },
  { version: 18, transport: "xmlrpc" },
  { version: 19, transport: "json2" },
];

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

function rawTransport(target) {
  const prefix = `ODOO${target.version}`;
  const url = required(`${prefix}_URL`);
  const db = required(`${prefix}_DB`);
  if (target.transport === "json2") {
    return new core.Json2Transport({
      url,
      db,
      apiKey: required(`${prefix}_API_KEY`),
      allowHttp: true,
    });
  }
  return new core.XmlRpcTransport({
    url,
    db,
    username: required(`${prefix}_USERNAME`),
    password: required(`${prefix}_PASSWORD`),
    allowHttp: true,
  });
}

async function measure(target) {
  const raw = rawTransport(target);
  await raw.connect();
  const methods = {};
  let odooCalls = 0;
  let requestBytes = 0;
  let responseBytes = 0;
  const measured = {
    kind: raw.kind,
    async executeKw(model, method, args, kwargs) {
      odooCalls += 1;
      methods[method] = (methods[method] || 0) + 1;
      requestBytes += byteLength({ model, method, args, kwargs: kwargs || {} });
      const response = await raw.executeKw(model, method, args, kwargs);
      responseBytes += byteLength(response);
      return response;
    },
    serverVersion: () => raw.serverVersion(),
  };

  const cpuStart = process.cpuUsage();
  const wallStart = performance.now();
  const result = await core.schemaCatalog(measured, {
    query,
    include_fields: true,
    limit,
  });
  const wallClockMs = Math.round(performance.now() - wallStart);
  const cpu = process.cpuUsage(cpuStart);
  if (!result.success) {
    throw new Error(
      `Odoo ${target.version} failed: ${result.error || "unknown"}`,
    );
  }

  return {
    version: target.version,
    transport: target.transport,
    models: result.count,
    wall_clock_ms: wallClockMs,
    cpu_user_ms: Math.round(cpu.user / 1000),
    cpu_system_ms: Math.round(cpu.system / 1000),
    request_bytes: requestBytes,
    response_bytes: responseBytes,
    result_payload_bytes: byteLength(result),
    odoo_calls: odooCalls,
    methods,
  };
}

const rows = [];
for (const target of targets) rows.push(await measure(target));
console.log(JSON.stringify({ query, limit, rows }, null, 2));
