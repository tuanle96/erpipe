import { OdooError } from "../errors.js";
import { buildTextQueryDomain, rankRelevantFields } from "../smart-fields.js";
import type { OdooTransport } from "../transport/types.js";
import { buildDomain, type DomainConditionInput } from "./domain.js";
import {
  ABS_MAX_LIMIT,
  clampLimit,
  fail,
  fieldsGet,
  normalizeDomainInput,
  resolveReadFields,
  type ToolResult,
  validateModelName,
} from "./helpers.js";

export type { ToolResult };

export async function listModels(
  transport: OdooTransport,
  opts: { query?: string | null; limit?: number } = {},
): Promise<ToolResult> {
  try {
    const limit = clampLimit(opts.limit ?? 100, ABS_MAX_LIMIT);
    const query = opts.query?.trim() ?? "";
    // Push limit (and optional name filter) to Odoo — avoid fetching every model id.
    const domain = query
      ? (["|", ["model", "ilike", query], ["name", "ilike", query]] as unknown[])
      : [];
    const rows = (await transport.executeKw("ir.model", "search_read", [], {
      domain,
      fields: ["model", "name"],
      limit,
      order: "model asc",
    })) as { model: string; name?: string }[];

    if (!rows?.length) {
      return {
        success: false,
        error: "No models found",
        count: 0,
        result: [],
      };
    }

    const records = rows.map((r) => ({
      model: r.model,
      name: r.name ?? "",
    }));
    return { success: true, count: records.length, result: records };
  } catch (e) {
    return fail(e);
  }
}

export async function getModelFields(
  transport: OdooTransport,
  opts: {
    model: string;
    field_names?: string[] | null;
    relevance?: string | null;
    max_fields?: number;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    if (opts.relevance != null && opts.relevance !== "top") {
      throw new OdooError("VALIDATION_ERROR", 'relevance must be "top" when provided');
    }
    let fields = await fieldsGet(transport, opts.model);
    if (opts.field_names?.length) {
      fields = Object.fromEntries(
        opts.field_names.filter((n) => n in fields).map((n) => [n, fields[n]]),
      );
    }
    if (opts.relevance === "top") {
      const max = opts.max_fields ?? 30;
      const ranking = rankRelevantFields(fields, max);
      const names = ranking.map((r) => r.field);
      fields = Object.fromEntries(names.map((n) => [n, fields[n]]));
      return {
        success: true,
        count: names.length,
        result: fields,
        relevance_applied: true,
        ranking,
      };
    }
    return { success: true, count: Object.keys(fields).length, result: fields };
  } catch (e) {
    return fail(e);
  }
}

export async function searchRecords(
  transport: OdooTransport,
  opts: {
    model: string;
    domain?: unknown;
    fields?: string[] | null;
    limit?: number;
    offset?: number;
    order?: string | null;
    query?: string | null;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    const limit = clampLimit(opts.limit ?? 10);
    const offset = opts.offset ?? 0;
    if (offset < 0) throw new OdooError("VALIDATION_ERROR", "offset must be >= 0");

    let domain = normalizeDomainInput(opts.domain);
    let fieldsMeta: Record<string, unknown> | null = null;
    if (opts.fields == null || (opts.query != null && String(opts.query).trim())) {
      try {
        fieldsMeta = await fieldsGet(transport, opts.model);
      } catch {
        fieldsMeta = null;
      }
    }
    let queryFieldsUsed: string[] | undefined;
    if (opts.query != null && String(opts.query).trim()) {
      const built = buildTextQueryDomain(String(opts.query), fieldsMeta);
      domain = [...built.domain, ...domain];
      queryFieldsUsed = built.fieldsUsed;
    }
    const resolved = resolveReadFields(fieldsMeta, opts.fields);
    const kwargs: Record<string, unknown> = {
      domain,
      limit,
      offset,
    };
    if (resolved !== null) kwargs.fields = resolved;
    if (opts.order) kwargs.order = opts.order;

    const records = await transport.executeKw(opts.model, "search_read", [], kwargs);
    const list = Array.isArray(records) ? records : [];
    const report: ToolResult = {
      success: true,
      count: list.length,
      result: list,
      smart_fields_applied: opts.fields == null,
      fields_used: resolved,
    };
    if (queryFieldsUsed) report.query_fields_used = queryFieldsUsed;
    return report;
  } catch (e) {
    return fail(e);
  }
}

export async function readRecord(
  transport: OdooTransport,
  opts: {
    model: string;
    record_id: number;
    fields?: string[] | null;
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    if (!Number.isInteger(opts.record_id) || opts.record_id < 1) {
      throw new OdooError("VALIDATION_ERROR", "record_id must be > 0");
    }
    let fieldsMeta: Record<string, unknown> | null = null;
    if (opts.fields == null) {
      try {
        fieldsMeta = await fieldsGet(transport, opts.model);
      } catch {
        fieldsMeta = null;
      }
    }
    const resolved = resolveReadFields(fieldsMeta, opts.fields);
    const kwargs: Record<string, unknown> = {};
    if (resolved !== null) kwargs.fields = resolved;
    const rows = (await transport.executeKw(
      opts.model,
      "read",
      [[opts.record_id]],
      kwargs,
    )) as unknown[];
    if (!rows?.length) {
      return {
        success: false,
        error: `Record not found: ${opts.model} ID ${opts.record_id}`,
      };
    }
    return {
      success: true,
      result: rows[0],
      smart_fields_applied: opts.fields == null,
      fields_used: resolved,
    };
  } catch (e) {
    return fail(e);
  }
}

export function healthCheck(info: {
  name?: string;
  toolCount?: number;
  promptCount?: number;
  writesEnabled?: boolean;
  transport?: string | null;
  allowUnknownMethods?: boolean;
}): ToolResult {
  return {
    success: true,
    tool: "health_check",
    server: {
      name: info.name ?? "erpipe",
      tools: info.toolCount ?? 6,
      prompts: info.promptCount ?? 0,
      resources: 0,
    },
    runtime: {
      writes_enabled: info.writesEnabled ?? false,
      transport: info.transport ?? null,
      broad_side_effect_mode: info.allowUnknownMethods ?? false,
    },
    rate_limits: { enabled: false },
    plugins: { loaded: [] },
  };
}

export function buildDomainTool(input: {
  conditions: DomainConditionInput[];
  logical_operator?: string;
  fields_metadata?: Record<string, unknown> | null;
}): ToolResult {
  try {
    return buildDomain(input);
  } catch (e) {
    return fail(e);
  }
}
