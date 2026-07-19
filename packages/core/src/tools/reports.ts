/**
 * Phase 4 report tools (D14 → 23 tools):
 * generate_json2_payload, upgrade_risk_report, fit_gap_report, business_pack_report.
 *
 * Ports of mcp-odoo diagnostics.py / agent_tools.business_pack_report (pure + optional live).
 */

import { JSON2_POSITIONAL_ARG_MAP } from "../transport/json2-map.js";
import type { OdooTransport } from "../transport/types.js";
import { BUSINESS_PACKS } from "./business-packs.js";
import { ABS_MAX_LIMIT, clampLimit, fail, type ToolResult, validateModelName } from "./helpers.js";
import { classifyMethodSafety } from "./method-safety.js";

export type { BusinessPackDefinition } from "./business-packs.js";
export { BUSINESS_PACKS } from "./business-packs.js";
export { classifyMethodSafety } from "./method-safety.js";
export type { ToolResult };

const ODOO_RPC_REMOVAL = "Odoo 22 fall 2028";
const ODOO_RPC_REMOVAL_MAJOR = 22;
const ODOO_RPC_DEPRECATION_MAJOR = 19;

function buildJson2Body(
  model: string,
  method: string,
  args: unknown[] | null | undefined,
  kwargs: Record<string, unknown> | null | undefined,
): { body: Record<string, unknown>; warnings: { code: string; message: string }[] } {
  const positional = [...(args ?? [])];
  const body: Record<string, unknown> = { ...(kwargs ?? {}) };
  const warnings: { code: string; message: string }[] = [];
  if (!positional.length) return { body, warnings };

  const argNames = JSON2_POSITIONAL_ARG_MAP[method];
  if (!argNames) {
    warnings.push({
      code: "json2_positional_unsupported",
      message: `JSON-2 requires named arguments for ${model}.${method}; custom positional arguments cannot be mapped safely.`,
    });
    return { body, warnings };
  }

  if (positional.length > argNames.length) {
    warnings.push({
      code: "json2_too_many_positional_args",
      message: `${model}.${method} accepts at most ${argNames.length} mapped positional arguments for JSON-2 preview; got ${positional.length}.`,
    });
  }

  for (let i = 0; i < Math.min(positional.length, argNames.length); i++) {
    const name = argNames[i]!;
    if (name in body) {
      warnings.push({
        code: "json2_duplicate_argument",
        message: `${model}.${method} received '${name}' both positionally and as a keyword; keeping the keyword value.`,
      });
      continue;
    }
    body[name] = positional[i];
  }
  return { body, warnings };
}

function normalizeBaseUrl(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  let u = baseUrl.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  return u.replace(/\/+$/, "");
}

function majorVersion(version: string | null | undefined): number {
  if (!version) return 0;
  const m = /^(\d+)/.exec(version);
  return m ? Number(m[1]) : 0;
}

function sanitizeOdooError(error: unknown, includeDebug = false): Record<string, unknown> | null {
  if (error == null) return null;
  let payload: Record<string, unknown>;
  if (typeof error === "object" && !Array.isArray(error)) {
    payload = { ...(error as Record<string, unknown>) };
  } else {
    const s = String(error);
    const start = s.indexOf("{");
    const end = s.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        const parsed = JSON.parse(s.slice(start, end + 1)) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const nested = (parsed as { error?: unknown }).error;
          if (nested && typeof nested === "object") {
            payload = { ...(nested as Record<string, unknown>) };
          } else {
            payload = { ...(parsed as Record<string, unknown>) };
          }
        } else {
          payload = { message: s };
        }
      } catch {
        payload = { message: s };
      }
    } else {
      payload = { message: s };
    }
  }
  return {
    name: payload.name ?? null,
    message: payload.message ?? (typeof error === "string" ? error : null),
    arguments: payload.arguments ?? [],
    context: payload.context ?? {},
    debug: includeDebug && payload.debug != null ? payload.debug : "[redacted]",
  };
}

function classifyFindingAction(code: string, severity: string): string {
  const overrides: Record<string, string> = {
    crud_override_missing_super: "needs_script",
    crud_override_super_not_returned: "needs_script",
    computed_method_missing: "needs_script",
    computed_method_missing_depends: "needs_script",
    computed_depends_missing_fields: "needs_script",
    xmlrpc_jsonrpc_removal: "needs_script",
    deprecated_rpc_transport: "needs_review",
    sudo_usage: "needs_review",
    destructive_operation: "needs_review",
    destructive_method: "needs_review",
    destructive_method_review: "needs_review",
    automated_action: "needs_review",
    custom_module_upgrade: "needs_review",
    security_rule_file: "needs_review",
    custom_model_class: "no_action",
    custom_method: "no_action",
    custom_view: "no_action",
    non_installable_module: "no_action",
  };
  if (overrides[code]) return overrides[code]!;
  const sev = severity.toLowerCase();
  if (sev === "error") return "needs_script";
  if (sev === "warning") return "needs_review";
  return "no_action";
}

function annotateFindingActions(findings: Record<string, unknown>[]): Record<string, number> {
  const summary = {
    no_action: 0,
    needs_review: 0,
    needs_script: 0,
  };
  for (const finding of findings) {
    const action = classifyFindingAction(
      String(finding.code ?? ""),
      String(finding.severity ?? "info"),
    );
    finding.action = action;
    summary[action as keyof typeof summary] += 1;
  }
  return summary;
}

function maxRisk(risks: { severity: string }[]): string {
  const sevs = new Set(risks.map((r) => r.severity));
  if (sevs.has("error")) return "high";
  if (sevs.has("warning")) return "medium";
  return "low";
}

/** Build a JSON-2 request preview without credentials or network access. */
export function generateJson2Payload(opts: {
  model: string;
  method: string;
  args?: unknown[] | null;
  kwargs?: Record<string, unknown> | null;
  base_url?: string | null;
  database?: string | null;
  include_database_header?: boolean;
}): ToolResult {
  try {
    const { model, method } = opts;
    const path = `/json/2/${model}/${method}`;
    const { body, warnings } = buildJson2Body(model, method, opts.args, opts.kwargs);
    const safety = classifyMethodSafety(method);
    if (safety.destructive_method) {
      warnings.push({
        code: "destructive_method",
        message: `${model}.${method} may modify or delete Odoo data.`,
      });
    } else if (safety.safety === "side_effect" || safety.safety === "unknown") {
      warnings.push({
        code: safety.safety === "side_effect" ? "side_effect_method" : "unknown_side_effects",
        message: `${model}.${method} is not a known read-only ORM method; review server-side implementation before executing it.`,
      });
    }

    const normalizedUrl = normalizeBaseUrl(opts.base_url);
    const includeDb = opts.include_database_header !== false;
    const headers: Record<string, unknown> = {
      Authorization: "bearer <api-key>",
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Odoo-Database": includeDb && opts.database ? opts.database : null,
    };

    return {
      success: !warnings.some((w) => w.code === "json2_positional_unsupported"),
      tool: "generate_json2_payload",
      model,
      method,
      endpoint: {
        path,
        url: normalizedUrl ? `${normalizedUrl}${path}` : null,
      },
      headers,
      body,
      warnings,
      transaction: {
        per_call: true,
        warning:
          "Each JSON-2 HTTP request is its own Odoo transaction; chain multi-step business operations server-side when atomicity matters.",
      },
      classification: safety,
      metadata_used: { client_instantiated: false },
    };
  } catch (e) {
    return { ...fail(e), tool: "generate_json2_payload" };
  }
}

/** Input-driven Odoo upgrade / JSON-2 migration risk report. */
export function upgradeRiskReport(
  opts: {
    source_version?: string | null;
    target_version?: string | null;
    modules?: Record<string, unknown>[] | null;
    methods?: Record<string, unknown>[] | null;
    source_findings?: Record<string, unknown>[] | null;
    observed_errors?: unknown[] | null;
    use_live_metadata?: boolean;
    include_debug?: boolean;
  } = {},
): ToolResult {
  try {
    const risks: Record<string, unknown>[] = [];
    const targetMajor = majorVersion(opts.target_version);
    if (targetMajor >= ODOO_RPC_REMOVAL_MAJOR) {
      risks.push({
        code: "xmlrpc_jsonrpc_removal",
        severity: "error",
        evidence: `Target version ${opts.target_version} reaches ${ODOO_RPC_REMOVAL}.`,
        recommendation: "Move integrations to External JSON-2 with named arguments.",
      });
    } else if (targetMajor >= ODOO_RPC_DEPRECATION_MAJOR || opts.source_version) {
      risks.push({
        code: "json2_migration",
        severity: "warning",
        evidence:
          "Odoo 19 introduces External JSON-2 as the replacement API; XML-RPC stays available but deprecated through Odoo 21.",
        recommendation: "Prefer JSON-2 payload previews and avoid new XML-RPC-only integrations.",
      });
    }

    const destructiveMethods: Record<string, unknown>[] = [];
    for (const methodFact of opts.methods ?? []) {
      const method = String(methodFact.method ?? "");
      const model = String(methodFact.model ?? "");
      const safety = classifyMethodSafety(method);
      if (safety.destructive_method) {
        destructiveMethods.push({
          model,
          method,
          source: methodFact.source ?? "input",
        });
        risks.push({
          code: "destructive_method_review",
          severity: "warning",
          evidence: `${model}.${method} can modify Odoo data.`,
          recommendation: "Validate access rules, required fields, and transaction boundaries.",
        });
      } else if (safety.safety === "unknown") {
        risks.push({
          code: "unknown_custom_method",
          severity: "warning",
          evidence: `${model}.${method} side effects are unknown.`,
          recommendation: "Inspect custom module source before migrating or invoking.",
        });
      }
    }

    for (const module of opts.modules ?? []) {
      const moduleName = String(module.name ?? module.module ?? "unknown");
      if (module.custom || moduleName.startsWith("x_") || moduleName.startsWith("studio_")) {
        risks.push({
          code: "custom_module_upgrade",
          severity: "warning",
          evidence: `${moduleName} appears custom or Studio-like.`,
          recommendation: "Test views, fields, reports, actions, and access rules on staging.",
        });
      }
    }

    for (const finding of opts.source_findings ?? []) {
      risks.push({
        code: String(finding.code ?? "source_finding"),
        severity: String(finding.severity ?? "warning"),
        evidence: String(finding.evidence ?? finding),
        recommendation: String(
          finding.recommendation ?? "Review this source finding before upgrade.",
        ),
      });
    }

    if (opts.use_live_metadata) {
      risks.push({
        code: "live_metadata_not_used",
        severity: "info",
        evidence: "upgrade_risk_report is input-driven in this release.",
        recommendation: "Pass module/method/source findings explicitly.",
      });
    }

    const odooErrors = (opts.observed_errors ?? []).map((err) =>
      sanitizeOdooError(err, opts.include_debug),
    );
    const actionSummary = annotateFindingActions(risks);
    const risk = maxRisk(risks as { severity: string }[]);

    return {
      success: true,
      tool: "upgrade_risk_report",
      source_version: opts.source_version ?? null,
      target_version: opts.target_version ?? null,
      summary: {
        risk,
        blocked: risks.some((r) => r.severity === "error"),
        actions: actionSummary,
      },
      risks,
      transport: {
        xmlrpc_jsonrpc_deprecation: ODOO_RPC_REMOVAL,
        json2_required: targetMajor >= ODOO_RPC_REMOVAL_MAJOR,
      },
      destructive_methods: destructiveMethods,
      odoo_errors: odooErrors,
      metadata_used: {
        fields_get: false,
        source_scan: Boolean(opts.source_findings?.length),
        source:
          opts.modules?.length || opts.methods?.length || opts.source_findings?.length
            ? "input"
            : "none",
      },
      next_actions: [
        "Run generate_json2_payload for each integration call.",
        "Inspect custom modules, Studio fields, automated actions, reports, and views on staging.",
      ],
    };
  } catch (e) {
    return { ...fail(e), tool: "upgrade_risk_report" };
  }
}

function classifyRequirement(
  requirement: string,
  availableModels: string[],
  installedModules: (string | Record<string, unknown>)[],
): { classification: string; confidence: string; evidence: string[] } {
  const text = requirement.toLowerCase();
  const modelText = availableModels.join(" ").toLowerCase();
  const moduleText = installedModules
    .map((m) => (typeof m === "object" ? String(m.name ?? m.module ?? "") : String(m)))
    .join(" ")
    .toLowerCase();

  if (["bypass access", "direct database", "modify core"].some((t) => text.includes(t))) {
    return {
      classification: "avoid",
      confidence: "medium",
      evidence: ["Requirement suggests bypassing Odoo safety boundaries."],
    };
  }
  if (["studio", "custom field", "new field", "form view"].some((t) => text.includes(t))) {
    return {
      classification: "studio",
      confidence: "medium",
      evidence: ["Looks like field/view customization."],
    };
  }
  if (["custom", "integration", "api", "workflow", "complex"].some((t) => text.includes(t))) {
    return {
      classification: "custom_module",
      confidence: "medium",
      evidence: ["Likely requires Python/business logic."],
    };
  }
  if (
    ["configure", "sequence", "email template", "tax", "approval"].some((t) => text.includes(t))
  ) {
    return {
      classification: "configuration",
      confidence: "medium",
      evidence: ["Likely solvable through Odoo configuration."],
    };
  }
  const standardTerms = ["contact", "partner", "invoice", "sale", "purchase", "inventory", "crm"];
  if (standardTerms.some((t) => text.includes(t))) {
    const evidence =
      modelText || moduleText
        ? ["Provided model/module evidence suggests standard Odoo coverage."]
        : ["Matches common standard Odoo app terminology."];
    return { classification: "standard", confidence: "medium", evidence };
  }
  return {
    classification: "unknown",
    confidence: "low",
    evidence: ["Not enough model/module evidence to classify confidently."],
  };
}

function rollupBucket(classification: string): string {
  if (classification === "standard" || classification === "configuration") {
    return "fit";
  }
  if (classification === "studio") return "partial";
  if (classification === "custom_module" || classification === "avoid") {
    return "gap";
  }
  return "unknown";
}

function recommendedFitGapCalls(
  requirement: string,
  classification: string,
): Record<string, unknown>[] {
  const first = requirement.split(/\s+/)[0] || null;
  const calls: Record<string, unknown>[] = [{ tool: "list_models", arguments: { query: first } }];
  if (
    classification === "studio" ||
    classification === "custom_module" ||
    classification === "unknown"
  ) {
    calls.push({
      tool: "inspect_model_relationships",
      arguments: { model: "res.partner", use_live_metadata: true },
    });
  }
  return calls;
}

/** Classify requirements into fit/gap implementation buckets (input-driven). */
export function fitGapReport(opts: {
  requirements: (string | Record<string, unknown>)[];
  available_models?: string[] | null;
  available_fields?: Record<string, unknown> | null;
  installed_modules?: (string | Record<string, unknown>)[] | null;
  business_context?: Record<string, unknown> | null;
  use_live_metadata?: boolean;
}): ToolResult {
  try {
    const items: Record<string, unknown>[] = [];
    const rollup = { fit: 0, partial: 0, gap: 0, unknown: 0 };
    const availableModels = opts.available_models ?? [];
    const installedModules = opts.installed_modules ?? [];

    for (const raw of opts.requirements) {
      const requirement =
        typeof raw === "object" && raw !== null
          ? String((raw as { requirement?: unknown }).requirement ?? raw)
          : String(raw);
      const { classification, confidence, evidence } = classifyRequirement(
        requirement,
        availableModels,
        installedModules,
      );
      const bucket = rollupBucket(classification) as keyof typeof rollup;
      rollup[bucket] += 1;
      items.push({
        requirement,
        classification,
        confidence,
        evidence,
        recommended_next_calls: recommendedFitGapCalls(requirement, classification),
      });
    }

    const classificationCounts: Record<string, number> = {
      standard: 0,
      configuration: 0,
      studio: 0,
      custom_module: 0,
      avoid: 0,
      unknown: 0,
    };
    for (const item of items) {
      const c = String(item.classification ?? "unknown");
      classificationCounts[c] = (classificationCounts[c] ?? 0) + 1;
    }

    const assumptions = [
      "Classification is heuristic unless backed by provided model/module evidence.",
      "Validate fit/gap results with safe model and field inspection before implementation.",
    ];
    if (opts.use_live_metadata) {
      assumptions.push(
        "fit_gap_report is input-driven in this release; use list_models/get_model_fields first.",
      );
    }

    return {
      success: true,
      tool: "fit_gap_report",
      summary: rollup,
      classification_counts: classificationCounts,
      items,
      metadata_used: {
        fields_get: Boolean(opts.available_fields),
        modules: Boolean(opts.installed_modules?.length),
        source:
          availableModels.length || opts.available_fields || installedModules.length
            ? "input"
            : "none",
      },
      assumptions,
      business_context: opts.business_context ?? {},
    };
  } catch (e) {
    return { ...fail(e), tool: "fit_gap_report" };
  }
}

/** Static pack report; optionally enrich with live model/module lists. */
export function businessPackReport(opts: {
  pack: string;
  available_models?: string[] | null;
  installed_modules?: string[] | null;
}): ToolResult {
  const packKey = opts.pack.trim().toLowerCase();
  if (!(packKey in BUSINESS_PACKS)) {
    return {
      success: false,
      tool: "business_pack_report",
      // Match Python repr-style quotes: Unknown pack 'nope'.
      error: `Unknown pack '${opts.pack}'.`,
      available_packs: Object.keys(BUSINESS_PACKS).sort(),
    };
  }
  const definition = BUSINESS_PACKS[packKey]!;
  const modelSet = new Set(opts.available_models ?? []);
  const moduleSet = new Set(opts.installed_modules ?? []);
  const expectedModels = [...definition.models];
  const expectedModules = [...definition.modules];
  const presentModels = expectedModels.filter((m) => modelSet.has(m));
  const missingModels = expectedModels.filter((m) => !modelSet.has(m));
  const presentModules = expectedModules.filter((m) => moduleSet.has(m));
  const hasLive = modelSet.size > 0 || moduleSet.size > 0;

  return {
    success: true,
    tool: "business_pack_report",
    pack: packKey,
    expected_modules: expectedModules,
    installed_modules: presentModules,
    expected_models: expectedModels,
    available_models: presentModels,
    missing_models: hasLive ? missingModels : [],
    safe_reports: definition.safe_reports,
    recommended_next_calls: expectedModels.slice(0, 3).map((model) => ({
      tool: "list_models",
      arguments: { query: model.split(".")[0] },
    })),
    metadata_used: {
      models: modelSet.size > 0,
      modules: moduleSet.size > 0,
      source: hasLive ? "live_or_input" : "static_pack",
    },
  };
}

/**
 * business_pack_report with optional live Odoo enrichment
 * (list models + installed modules, bounded).
 */
export async function businessPackReportLive(
  transport: OdooTransport | null,
  opts: {
    pack: string;
    use_live_metadata?: boolean;
    module_limit?: number;
  },
): Promise<ToolResult> {
  try {
    let availableModels: string[] | null = null;
    let installedModules: string[] | null = null;
    const useLive = opts.use_live_metadata !== false && transport !== null;

    if (useLive && transport) {
      try {
        const rows = (await transport.executeKw("ir.model", "search_read", [[]], {
          fields: ["model"],
          limit: 2000,
        })) as { model?: string }[];
        if (Array.isArray(rows)) {
          availableModels = rows
            .map((r) => r.model)
            .filter((m): m is string => typeof m === "string");
        }
      } catch {
        availableModels = null;
      }
      try {
        const limit = clampLimit(opts.module_limit ?? 200, ABS_MAX_LIMIT);
        const mods = (await transport.executeKw(
          "ir.module.module",
          "search_read",
          [[["state", "=", "installed"]]],
          { fields: ["name"], limit, order: "name ASC" },
        )) as { name?: string }[];
        if (Array.isArray(mods)) {
          installedModules = mods
            .map((m) => m.name)
            .filter((n): n is string => typeof n === "string");
        }
      } catch {
        installedModules = null;
      }
    }

    return businessPackReport({
      pack: opts.pack,
      available_models: availableModels,
      installed_modules: installedModules,
    });
  } catch (e) {
    return { ...fail(e), tool: "business_pack_report" };
  }
}

/** Default max PDF size for render_report (2 MiB). */
export const DEFAULT_MAX_REPORT_BYTES = 2 * 1024 * 1024;
/** Hard ceiling for report PDF payloads. */
export const ABS_MAX_REPORT_BYTES = 5 * 1024 * 1024;

/**
 * Render an Odoo QWeb PDF report (ir.actions.report) as base64.
 * Read-only from ERPipe's perspective — uses report engine only.
 */
export async function renderReport(
  transport: OdooTransport,
  opts: {
    model: string;
    record_id: number;
    report_name?: string | null;
    report_id?: number | null;
    max_bytes?: number;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    if (!Number.isInteger(opts.record_id) || opts.record_id < 1) {
      return {
        success: false,
        tool: "render_report",
        error: "record_id must be a positive integer",
      };
    }
    const maxBytes = Math.min(
      Math.max(1, Math.floor(opts.max_bytes ?? DEFAULT_MAX_REPORT_BYTES)),
      ABS_MAX_REPORT_BYTES,
    );

    let reportName = opts.report_name?.trim() || null;
    let reportId = opts.report_id ?? null;
    let reportDisplay: string | null = null;

    if (!reportName && reportId == null) {
      // Pick the first QWeb PDF report bound to this model
      const found = (await transport.executeKw(
        "ir.actions.report",
        "search_read",
        [[["model", "=", opts.model]]],
        {
          fields: ["id", "name", "report_name", "report_type"],
          limit: 5,
          order: "id asc",
        },
      )) as {
        id?: number;
        name?: string;
        report_name?: string;
        report_type?: string;
      }[];
      const pdf =
        (found ?? []).find(
          (r) =>
            !r.report_type ||
            String(r.report_type).includes("qweb-pdf") ||
            String(r.report_type).includes("pdf"),
        ) ?? found?.[0];
      if (!pdf?.report_name && !pdf?.id) {
        return {
          success: false,
          tool: "render_report",
          error: `No ir.actions.report found for model ${opts.model}. Pass report_name (e.g. sale.report_saleorder).`,
        };
      }
      reportName = pdf.report_name ? String(pdf.report_name) : null;
      reportId = pdf.id != null ? Number(pdf.id) : null;
      reportDisplay = pdf.name ? String(pdf.name) : null;
    } else if (reportName && reportId == null) {
      const found = (await transport.executeKw(
        "ir.actions.report",
        "search_read",
        [[["report_name", "=", reportName]]],
        { fields: ["id", "name", "report_name"], limit: 1 },
      )) as { id?: number; name?: string }[];
      if (found?.[0]) {
        reportId = Number(found[0].id);
        reportDisplay = found[0].name ? String(found[0].name) : null;
      }
    }

    const reportRef = reportName ?? reportId;
    if (reportRef == null) {
      return {
        success: false,
        tool: "render_report",
        error: "Could not resolve report reference",
      };
    }

    // Odoo 16+: ir.actions.report._render_qweb_pdf(report_ref, res_ids)
    let raw: unknown;
    try {
      raw = await transport.executeKw(
        "ir.actions.report",
        "_render_qweb_pdf",
        [reportRef, [opts.record_id]],
        {},
      );
    } catch (e1) {
      // Fallback: some builds expose render as public method on the report record
      if (reportId == null) throw e1;
      raw = await transport.executeKw(
        "ir.actions.report",
        "render",
        [[reportId], [opts.record_id]],
        {},
      );
    }

    // Possible shapes: [pdf_bytes|base64, 'pdf'] | { data: base64 } | base64 string
    let b64: string | null = null;
    if (Array.isArray(raw) && raw.length >= 1) {
      const first = raw[0];
      if (typeof first === "string") b64 = first;
      else if (first instanceof Uint8Array) {
        b64 = uint8ToBase64(first);
      } else if (first && typeof first === "object" && "data" in (first as object)) {
        b64 = String((first as { data: unknown }).data);
      }
    } else if (typeof raw === "string") {
      b64 = raw;
    } else if (raw && typeof raw === "object" && "data" in (raw as object)) {
      b64 = String((raw as { data: unknown }).data);
    }

    if (!b64) {
      return {
        success: false,
        tool: "render_report",
        error:
          "Report engine returned an unexpected payload shape. Check report_name and Odoo version.",
        report_name: reportName,
        report_id: reportId,
      };
    }

    const approxDecoded = Math.floor((b64.length * 3) / 4);
    if (approxDecoded > maxBytes) {
      return {
        success: false,
        tool: "render_report",
        code: "REPORT_TOO_LARGE",
        error: `PDF ~${approxDecoded} bytes exceeds max_bytes ${maxBytes}`,
        report_name: reportName,
        report_id: reportId,
        max_bytes: maxBytes,
        datas_included: false,
      };
    }

    return {
      success: true,
      tool: "render_report",
      model: opts.model,
      record_id: opts.record_id,
      report_name: reportName,
      report_id: reportId,
      report_display_name: reportDisplay,
      mimetype: "application/pdf",
      encoding: "base64",
      approx_bytes: approxDecoded,
      max_bytes: maxBytes,
      datas_included: true,
      result: { datas: b64 },
    };
  } catch (e) {
    return { ...fail(e), tool: "render_report" };
  }
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  // btoa available in Workers + modern Node
  return btoa(binary);
}

export const PHASE4_TOOLS = [
  "generate_json2_payload",
  "upgrade_risk_report",
  "fit_gap_report",
  "business_pack_report",
  "render_report",
] as const;
