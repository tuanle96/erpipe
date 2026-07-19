#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const corpusPath = path.join(root, "scripts/parity/corpus.json");
const pythonRunner = path.join(root, "scripts/parity/run_python_side.py");

const tsOnly = process.env.PARITY_TS_ONLY === "1";
const pythonBin = process.env.PYTHON || "python3";
const mcpOdooPath = process.env.MCP_ODOO_PATH || path.resolve(root, "../mcp-odoo");

const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));

// --- load TS core ---
const core = await import(pathToFileURL(path.join(root, "packages/core/dist/index.js")).href);

// --- surface assertions ---
const PHASE1 = core.PHASE1_TOOLS;
const PHASE2 = core.PHASE2_TOOLS;
const PHASE3 = core.PHASE3_TOOLS;
const PHASE4 = core.PHASE4_TOOLS;
const prompts = core.CLOUD_V1_PROMPTS;

const d14Tools = [...PHASE1, ...PHASE2, ...PHASE3, ...PHASE4];
const expectedTools = corpus.surface.tools;
const expectedPrompts = corpus.surface.prompts;

function failSetup(msg) {
  console.error(`SETUP FAIL: ${msg}`);
  process.exit(2);
}

if (d14Tools.length !== corpus.manifest.tool_count) {
  failSetup(`TS D14 tool count ${d14Tools.length} != manifest ${corpus.manifest.tool_count}`);
}
if (prompts.length !== corpus.manifest.prompt_count) {
  failSetup(`TS prompt count ${prompts.length} != manifest ${corpus.manifest.prompt_count}`);
}
if (JSON.stringify([...d14Tools].sort()) !== JSON.stringify([...expectedTools].sort())) {
  failSetup(
    `TS tool set mismatch vs corpus.surface.tools\n  TS: ${d14Tools.join(", ")}\n  expected: ${expectedTools.join(", ")}`,
  );
}
if (JSON.stringify([...prompts]) !== JSON.stringify(expectedPrompts)) {
  failSetup(`TS prompt set mismatch vs corpus.surface.prompts`);
}

console.log(`Surface OK: ${d14Tools.length} tools + ${prompts.length} prompts (cloud-v1)\n`);

// --- normalize ---
function sortKeys(value) {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const out = {};
  for (const k of Object.keys(value).sort()) {
    out[k] = sortKeys(value[k]);
  }
  return out;
}

function canonicalize(value) {
  return JSON.stringify(sortKeys(value));
}

/** Drop / normalize fields that are allowed to differ between Python and TS. */
function normalizeForCompare(_tool, compare, value) {
  if (compare === "text") {
    if (typeof value === "string") return value;
    if (value && typeof value === "object" && "text" in value) {
      return String(value.text);
    }
    return String(value);
  }

  if (compare === "approval_core") {
    const v = value && typeof value === "object" ? value : {};
    const approval = v.approval && typeof v.approval === "object" ? v.approval : {};
    return sortKeys({
      success: v.success,
      tool: v.tool,
      model: v.model,
      operation: v.operation,
      approval: {
        model: approval.model,
        operation: approval.operation,
        record_ids: approval.record_ids ?? [],
        values: approval.values ?? {},
        context: approval.context ?? {},
        instance: approval.instance ?? "default",
        token: approval.token,
      },
      issues: (v.issues ?? []).map((i) => ({
        code: i.code,
        severity: i.severity,
      })),
      warning_codes: (v.warnings ?? []).map((w) => w.code).sort(),
    });
  }

  // deep: strip known optional/noisy fields
  const clone = JSON.parse(JSON.stringify(value ?? null));
  if (clone && typeof clone === "object") {
    // execute_method may be present only on Python preview
    delete clone.execute_method;
    if (Array.isArray(clone.warnings)) {
      clone.warnings = clone.warnings.map((w) => ({
        code: w.code,
        // message wording may drift slightly; code is the contract
        message: w.message,
      }));
    }
    if (Array.isArray(clone.risks)) {
      // actions attached by annotate_finding_actions
      clone.risks = clone.risks.map((r) => ({
        code: r.code,
        severity: r.severity,
        evidence: r.evidence,
        recommendation: r.recommendation,
        action: r.action,
      }));
    }
    if (Array.isArray(clone.next_actions)) {
      // keep order
    }
    // recommended_next_calls query null vs omit
    if (Array.isArray(clone.items)) {
      for (const item of clone.items) {
        if (Array.isArray(item.recommended_next_calls)) {
          for (const call of item.recommended_next_calls) {
            if (call.arguments && call.arguments.query === null) {
              call.arguments.query = null;
            }
          }
        }
      }
    }
  }
  return sortKeys(clone);
}

// --- run TS side ---
async function runTsCase(caseDef) {
  const tool = caseDef.tool;
  const inp = caseDef.input || {};

  if (tool === "generate_json2_payload") {
    return core.generateJson2Payload(inp);
  }
  if (tool === "upgrade_risk_report") {
    return core.upgradeRiskReport(inp);
  }
  if (tool === "fit_gap_report") {
    return core.fitGapReport(inp);
  }
  if (tool === "business_pack_report") {
    return core.businessPackReport(inp);
  }
  if (tool === "build_domain") {
    return core.buildDomainTool(inp);
  }
  if (tool === "preview_write") {
    return core.previewWrite(inp);
  }
  if (tool === "prompt") {
    const text = core.renderCloudPrompt(inp.name, inp.args || {});
    return { text };
  }
  throw new Error(`unsupported tool ${tool}`);
}

// --- run Python side ---
function runPythonAll() {
  if (!fs.existsSync(mcpOdooPath)) {
    failSetup(`mcp-odoo not found at ${mcpOdooPath}; set MCP_ODOO_PATH or PARITY_TS_ONLY=1`);
  }
  const env = {
    ...process.env,
    PYTHONPATH: [path.join(mcpOdooPath, "src"), process.env.PYTHONPATH || ""]
      .filter(Boolean)
      .join(path.delimiter),
  };
  const res = spawnSync(pythonBin, [pythonRunner, corpusPath], {
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (res.status !== 0) {
    console.error(res.stderr || res.stdout);
    failSetup(`Python side exited ${res.status}: ${res.stderr?.slice(0, 400)}`);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (_e) {
    failSetup(`Python side returned non-JSON: ${res.stdout?.slice(0, 400)}`);
  }
}

const steps = [];
function logPass(id, detail) {
  steps.push({ id, pass: true, detail });
  console.log(`PASS  ${id}${detail ? ` — ${detail}` : ""}`);
}
function logFail(id, detail) {
  steps.push({ id, pass: false, detail });
  console.error(`FAIL  ${id} — ${detail}`);
}

const pyResults = tsOnly ? null : runPythonAll();
if (tsOnly) {
  console.log("PARITY_TS_ONLY=1 — skipping Python diffs\n");
}

for (const caseDef of corpus.cases) {
  const id = caseDef.id;
  let tsResult;
  try {
    tsResult = await runTsCase(caseDef);
  } catch (e) {
    logFail(id, `TS threw: ${e.message}`);
    continue;
  }

  if (tsOnly) {
    const ok =
      caseDef.tool === "prompt"
        ? Boolean(tsResult?.text && String(tsResult.text).length > 20)
        : tsResult != null &&
          (tsResult.success === true || tsResult.success === false || tsResult.text);
    if (ok) logPass(id, "ts-only ok");
    else logFail(id, `TS empty: ${JSON.stringify(tsResult).slice(0, 120)}`);
    continue;
  }

  const pyEntry = pyResults[id];
  if (!pyEntry?.ok) {
    logFail(id, `Python failed: ${pyEntry?.error || "missing"}`);
    continue;
  }

  const a = normalizeForCompare(caseDef.tool, caseDef.compare, tsResult);
  const b = normalizeForCompare(caseDef.tool, caseDef.compare, pyEntry.result);
  const ca = canonicalize(a);
  const cb = canonicalize(b);
  if (ca === cb) {
    logPass(id, caseDef.compare);
  } else {
    // show a compact structural diff hint
    const max = 600;
    logFail(
      id,
      `diff (${caseDef.compare})\n    TS: ${ca.slice(0, max)}\n    PY: ${cb.slice(0, max)}`,
    );
  }
}

console.log("\n--- Parity summary ---");
const failed = steps.filter((s) => !s.pass);
console.log(
  `${steps.length - failed.length}/${steps.length} cases passed` +
    (tsOnly ? " (ts-only)" : " (TS vs Python)"),
);
if (failed.length) {
  console.error("Failed:", failed.map((f) => f.id).join(", "));
  process.exitCode = 1;
} else {
  console.log(tsOnly ? "TS-only corpus green." : "Cloud-v1 pure-tool parity green.");
}
