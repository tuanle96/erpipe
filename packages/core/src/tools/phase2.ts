/**
 * Phase 2 tools: profile, schema catalog, aggregate, HR helpers, diagnostics.
 */
import type { OdooTransport } from "../transport/types.js";
import { JSON2_POSITIONAL_ARG_MAP } from "../transport/json2-map.js";
import { OdooError } from "../errors.js";
import {
  clampLimit,
  normalizeDomainInput,
  validateModelName,
  fieldsGet,
  fail,
  type ToolResult,
  ABS_MAX_LIMIT,
  MAX_SEARCH_LIMIT,
} from "./helpers.js";
import { buildJson2Payload } from "../transport/json2.js";

export type { ToolResult };

export async function getOdooProfile(
  transport: OdooTransport,
  opts: { include_modules?: boolean; module_limit?: number } = {},
): Promise<ToolResult> {
  try {
    const includeModules = opts.include_modules !== false;
    const moduleLimit = clampLimit(opts.module_limit ?? 100, ABS_MAX_LIMIT);
    const serverVersion = await transport.serverVersion();
    let userContext: unknown = null;
    try {
      userContext = await transport.executeKw("res.users", "context_get", []);
    } catch {
      userContext = { error: "context_get failed" };
    }
    let modules: unknown[] = [];
    if (includeModules) {
      modules = (await transport.executeKw(
        "ir.module.module",
        "search_read",
        [[["state", "=", "installed"]]],
        {
          fields: ["name", "shortdesc", "state"],
          limit: moduleLimit,
          order: "name ASC",
        },
      )) as unknown[];
      if (!Array.isArray(modules)) modules = [];
    }
    return {
      success: true,
      tool: "get_odoo_profile",
      profile: {
        transport: transport.kind,
        server_version: serverVersion,
        user_context: userContext,
        installed_modules: modules,
        installed_module_count: includeModules ? modules.length : null,
      },
      metadata_used: {
        live_odoo: true,
        installed_modules: includeModules,
      },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function schemaCatalog(
  transport: OdooTransport,
  opts: {
    query?: string | null;
    models?: string[] | null;
    include_fields?: boolean;
    limit?: number;
  } = {},
): Promise<ToolResult> {
  try {
    const limit = clampLimit(opts.limit ?? 50, ABS_MAX_LIMIT);
    if (opts.models) {
      for (const m of opts.models) validateModelName(m);
    }
    // Prefer server-side filter when query/models provided
    let domain: unknown[] = [];
    if (opts.models?.length) {
      domain = [["model", "in", opts.models]];
    } else if (opts.query?.trim()) {
      const q = opts.query.trim();
      domain = ["|", ["model", "ilike", q], ["name", "ilike", q]];
    }
    let rows = (await transport.executeKw(
      "ir.model",
      "search_read",
      [domain],
      {
        fields: ["model", "name"],
        limit,
        order: "model ASC",
      },
    )) as { model: string; name?: string }[];
    if (!Array.isArray(rows)) rows = [];
    const records: Record<string, unknown>[] = [];
    for (const row of rows) {
      const rec: Record<string, unknown> = {
        model: row.model,
        name: row.name ?? "",
      };
      if (opts.include_fields) {
        try {
          rec.fields = await fieldsGet(transport, row.model);
        } catch (e) {
          rec.fields_error = e instanceof Error ? e.message : String(e);
        }
      }
      records.push(rec);
    }
    return {
      success: true,
      tool: "schema_catalog",
      count: records.length,
      result: records,
      metadata_used: { cache_hit: false, include_fields: !!opts.include_fields },
    };
  } catch (e) {
    return fail(e);
  }
}

const ALLOWED_AGGS = new Set([
  "sum",
  "avg",
  "min",
  "max",
  "count",
  "count_distinct",
  "array_agg",
  "bool_and",
  "bool_or",
]);

function parseMeasure(spec: string): [string, string] {
  const [field, aggRaw] = spec.split(":");
  const agg = (aggRaw || "sum").toLowerCase();
  if (!field) throw new OdooError("VALIDATION_ERROR", "empty measure field");
  if (!ALLOWED_AGGS.has(agg)) {
    throw new OdooError("VALIDATION_ERROR", `unsupported aggregator: ${agg}`);
  }
  return [field, agg];
}

export async function aggregateRecords(
  transport: OdooTransport,
  opts: {
    model: string;
    group_by: string[];
    measures?: string[] | null;
    domain?: unknown;
    lazy?: boolean;
    limit?: number | null;
    offset?: number;
    order?: string | null;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    if (!opts.group_by?.length) {
      throw new OdooError("VALIDATION_ERROR", "group_by must include at least one field");
    }
    const offset = opts.offset ?? 0;
    if (offset < 0) throw new OdooError("VALIDATION_ERROR", "offset must be >= 0");
    const clampedLimit =
      opts.limit != null ? clampLimit(opts.limit, MAX_SEARCH_LIMIT) : null;
    const domain = normalizeDomainInput(opts.domain);
    const normalizedMeasures: string[] = [];
    for (const spec of opts.measures || []) {
      const [field, agg] = parseMeasure(spec);
      normalizedMeasures.push(`${field}:${agg}`);
    }

    const version = await transport.serverVersion();
    const major = version.major;
    let methodUsed = "read_group";
    let rows: unknown;
    let fallbackReason: string | null = null;

    if (major >= 19) {
      methodUsed = "formatted_read_group";
      const kwargs: Record<string, unknown> = {
        domain,
        groupby: opts.group_by,
        aggregates: normalizedMeasures,
      };
      if (offset) kwargs.offset = offset;
      if (clampedLimit != null) kwargs.limit = clampedLimit;
      if (opts.order) kwargs.order = opts.order;
      rows = await transport.executeKw(opts.model, "formatted_read_group", [], kwargs);
    } else {
      const kwargs: Record<string, unknown> = {
        domain,
        fields: normalizedMeasures,
        groupby: opts.group_by,
        lazy: opts.lazy ?? false,
      };
      if (offset) kwargs.offset = offset;
      if (clampedLimit != null) kwargs.limit = clampedLimit;
      if (opts.order) kwargs.orderby = opts.order;
      rows = await transport.executeKw(opts.model, "read_group", [], kwargs);
    }

    const list = Array.isArray(rows) ? rows : [];
    return {
      success: true,
      method: methodUsed,
      major_version: major || null,
      fallback_reason: fallbackReason,
      model: opts.model,
      group_by: opts.group_by,
      measures: normalizedMeasures,
      row_count: list.length,
      rows: list,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function searchEmployee(
  transport: OdooTransport,
  opts: { name: string; limit?: number },
): Promise<ToolResult> {
  try {
    const limit = clampLimit(opts.limit ?? 20);
    const result = (await transport.executeKw("hr.employee", "name_search", [], {
      name: opts.name,
      limit,
    })) as [number, string][];
    const parsed = (Array.isArray(result) ? result : []).map((item) => ({
      id: item[0],
      name: item[1],
    }));
    return { success: true, result: parsed };
  } catch (e) {
    return fail(e);
  }
}

export async function searchHolidays(
  transport: OdooTransport,
  opts: {
    start_date: string;
    end_date: string;
    employee_id?: number | null;
  },
): Promise<ToolResult> {
  try {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.start_date)) {
      return { success: false, error: "Invalid start_date format. Use YYYY-MM-DD." };
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.end_date)) {
      return { success: false, error: "Invalid end_date format. Use YYYY-MM-DD." };
    }
    const start = new Date(`${opts.start_date}T00:00:00Z`);
    const adjusted = new Date(start.getTime() - 86400000);
    const adjustedStart = adjusted.toISOString().slice(0, 10);
    const domain: unknown[] = [
      "&",
      ["start_datetime", "<=", `${opts.end_date} 22:59:59`],
      ["stop_datetime", ">=", `${adjustedStart} 23:00:00`],
    ];
    if (opts.employee_id) {
      domain.push(["employee_id", "=", opts.employee_id]);
    }
    const holidays = await transport.executeKw(
      "hr.leave.report.calendar",
      "search_read",
      [domain],
      {},
    );
    return { success: true, result: holidays };
  } catch (e) {
    return fail(e);
  }
}

export function diagnoseOdooCall(opts: {
  model: string;
  method: string;
  args?: unknown[] | null;
  kwargs?: Record<string, unknown> | null;
  transport?: string;
  target_version?: string | null;
}): ToolResult {
  const issues: { code: string; severity: string; message: string }[] = [];
  try {
    validateModelName(opts.model);
  } catch {
    issues.push({
      code: "invalid_model_name",
      severity: "error",
      message: "Use an Odoo technical model name like 'res.partner'.",
    });
  }
  const args = opts.args ?? [];
  const kwargs = opts.kwargs ?? {};
  let json2: unknown = null;
  let json2Ready = true;
  try {
    const body = buildJson2Payload(opts.method, args, kwargs);
    json2 = {
      endpoint: `/json/2/${opts.model}/${opts.method}`,
      body,
    };
  } catch (e) {
    json2Ready = false;
    issues.push({
      code: "json2_positional_unsupported",
      severity: "error",
      message: e instanceof Error ? e.message : String(e),
    });
  }
  const destructive = new Set(["create", "write", "unlink"]);
  const safety = destructive.has(opts.method)
    ? { safety: "destructive", destructive_method: true, confidence: "high" }
    : opts.method.startsWith("action_") || opts.method.startsWith("button_")
      ? { safety: "side_effect", destructive_method: false, confidence: "medium" }
      : { safety: "likely_read", destructive_method: false, confidence: "low" };

  if (
    opts.transport === "xmlrpc" &&
    opts.target_version &&
    Number(String(opts.target_version).split(".")[0]) >= 19
  ) {
    issues.push({
      code: "deprecated_rpc_transport",
      severity: "warning",
      message:
        "XML-RPC/JSON-RPC are deprecated since Odoo 19; plan JSON-2 migration.",
    });
  }

  return {
    success: !issues.some((i) => i.severity === "error"),
    tool: "diagnose_odoo_call",
    model: opts.model,
    method: opts.method,
    classification: {
      ...safety,
      json2_ready: json2Ready,
      json2_mapped: opts.method in JSON2_POSITIONAL_ARG_MAP,
    },
    issues,
    suggested_payload: {
      args,
      kwargs,
      json2: json2Ready ? json2 : null,
    },
  };
}

export async function inspectModelRelationships(
  transport: OdooTransport,
  opts: {
    model: string;
    include_readonly?: boolean;
    include_computed?: boolean;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    const fieldsMetadata = await fieldsGet(transport, opts.model);
    const includeReadonly = opts.include_readonly !== false;
    const includeComputed = opts.include_computed !== false;
    const relationships: Record<string, Record<string, unknown>[]> = {
      many2one: [],
      one2many: [],
      many2many: [],
    };
    const requiredFields: Record<string, unknown>[] = [];
    for (const [fieldName, raw] of Object.entries(fieldsMetadata).sort()) {
      if (!raw || typeof raw !== "object") continue;
      const meta = raw as Record<string, unknown>;
      const fieldType = String(meta.type ?? "");
      const readonly = Boolean(meta.readonly);
      const required = Boolean(meta.required);
      const computed = Boolean(meta.compute || meta.computed);
      if (readonly && !includeReadonly) continue;
      if (computed && !includeComputed) continue;
      if (
        fieldType === "many2one" ||
        fieldType === "one2many" ||
        fieldType === "many2many"
      ) {
        relationships[fieldType]!.push({
          name: fieldName,
          relation: meta.relation,
          string: meta.string,
          required,
          readonly,
        });
      }
      if (required && !readonly) {
        requiredFields.push({
          name: fieldName,
          type: fieldType,
          string: meta.string,
        });
      }
    }
    return {
      success: true,
      tool: "inspect_model_relationships",
      model: opts.model,
      summary: {
        field_count: Object.keys(fieldsMetadata).length,
        relationship_count:
          relationships.many2one!.length +
          relationships.one2many!.length +
          relationships.many2many!.length,
        required_count: requiredFields.length,
      },
      relationships,
      required_fields: requiredFields,
      metadata_used: { fields_get: true, source: "server" },
    };
  } catch (e) {
    return fail(e);
  }
}

export async function diagnoseAccess(
  transport: OdooTransport,
  opts: {
    model: string;
    operation?: string;
    domain?: unknown;
    record_ids?: number[] | null;
    expected_count?: number | null;
    limit?: number;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    const operation = opts.operation ?? "read";
    const limit = clampLimit(opts.limit ?? 50, ABS_MAX_LIMIT);
    let countDomain = normalizeDomainInput(opts.domain);
    if (opts.record_ids?.length) {
      countDomain = [["id", "in", opts.record_ids]];
    }
    let visibleCount: number | null = null;
    try {
      visibleCount = Number(
        await transport.executeKw(opts.model, "search_count", [countDomain], {}),
      );
    } catch (e) {
      return {
        success: false,
        tool: "diagnose_access",
        model: opts.model,
        operation,
        error: e instanceof Error ? e.message : String(e),
        hint: "search_count failed — often ACL or model missing for this user",
      };
    }

    let modelMeta: unknown = null;
    try {
      const rows = await transport.executeKw(
        "ir.model",
        "search_read",
        [[["model", "=", opts.model]]],
        { fields: ["id", "name", "model"], limit: 1 },
      );
      modelMeta = Array.isArray(rows) ? rows[0] : null;
    } catch {
      modelMeta = null;
    }

    let accessRows: unknown[] = [];
    try {
      accessRows = (await transport.executeKw(
        "ir.model.access",
        "search_read",
        [[["model_id.model", "=", opts.model]]],
        {
          fields: [
            "name",
            "perm_read",
            "perm_write",
            "perm_create",
            "perm_unlink",
            "group_id",
          ],
          limit,
        },
      )) as unknown[];
      if (!Array.isArray(accessRows)) accessRows = [];
    } catch {
      accessRows = [];
    }

    const report: ToolResult = {
      success: true,
      tool: "diagnose_access",
      model: opts.model,
      operation,
      visible_count: visibleCount,
      expected_count: opts.expected_count ?? null,
      count_match:
        opts.expected_count == null
          ? null
          : visibleCount === opts.expected_count,
      model_meta: modelMeta,
      access_lines: accessRows,
      notes: [
        "Never uses sudo; reflects current Odoo credentials only.",
        "visible_count is search_count under current ACL + record rules.",
      ],
    };
    return report;
  } catch (e) {
    return fail(e);
  }
}

export const PHASE2_TOOLS = [
  "aggregate_records",
  "search_employee",
  "search_holidays",
  "get_odoo_profile",
  "schema_catalog",
  "diagnose_odoo_call",
  "diagnose_access",
  "inspect_model_relationships",
] as const;
