/**
 * One-shot compact model facts for agents (collapse list_models → get_model_fields hops).
 * Live fields_get only — no shell / dossier. ACL-safe probe when ir.model is denied.
 */

import { isOdooError, OdooError } from "../errors.js";
import { rankRelevantFields } from "../smart-fields.js";
import type { OdooTransport } from "../transport/types.js";
import { clampLimit, fail, fieldsGet, type ToolResult, validateModelName } from "./helpers.js";

export const MODEL_FACTS_DEFAULT_MAX_MODELS = 5;
export const MODEL_FACTS_HARD_MAX_MODELS = 8;
export const MODEL_FACTS_DEFAULT_MAX_FIELDS = 24;
export const MODEL_FACTS_HARD_MAX_FIELDS = 40;
export const MODEL_FACTS_MAX_SELECTION_KEYS = 20;
export const MODEL_FACTS_LABEL_MAX = 40;

export type ModelFactsIntent = "search" | "write" | "domain" | "overview";

export type ModelErrorCode =
  | "ACCESS_DENIED"
  | "MODEL_NOT_FOUND"
  | "UPSTREAM_UNAVAILABLE"
  | "TRANSPORT_ERROR"
  | "UNKNOWN";

/** Static packs when query path needs business-word → technical models. */
export const INTENT_PACKS: Record<string, string[]> = {
  invoice: ["account.move", "account.move.line"],
  invoices: ["account.move", "account.move.line"],
  bill: ["account.move", "account.move.line"],
  billing: ["account.move", "account.move.line"],
  customer: ["res.partner"],
  customers: ["res.partner"],
  partner: ["res.partner"],
  contact: ["res.partner"],
  vendor: ["res.partner"],
  sale: ["sale.order", "sale.order.line"],
  sales: ["sale.order", "sale.order.line"],
  order: ["sale.order", "sale.order.line"],
  so: ["sale.order", "sale.order.line"],
  purchase: ["purchase.order", "purchase.order.line"],
  po: ["purchase.order", "purchase.order.line"],
  product: ["product.product", "product.template"],
  products: ["product.product", "product.template"],
  stock: ["stock.picking", "stock.move", "stock.quant"],
  inventory: ["stock.picking", "stock.move", "product.product"],
  employee: ["hr.employee", "hr.leave"],
  hr: ["hr.employee", "hr.leave"],
  lead: ["crm.lead"],
  crm: ["crm.lead"],
  project: ["project.project", "project.task"],
};

export type CompactField = {
  name: string;
  t: string;
  s?: string;
  req?: 1;
  ro?: 1;
  rel?: string;
  sel?: string[];
  sel_truncated?: 1;
  search?: 0 | 1;
  store?: 0 | 1;
};

function shortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function truncateLabel(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const t = value.trim();
  return t.length > MODEL_FACTS_LABEL_MAX ? `${t.slice(0, MODEL_FACTS_LABEL_MAX - 1)}…` : t;
}

function selectionKeys(raw: unknown): { keys: string[]; truncated: boolean } | null {
  if (!Array.isArray(raw)) return null;
  const keys: string[] = [];
  for (const row of raw) {
    if (Array.isArray(row) && row.length > 0 && (typeof row[0] === "string" || typeof row[0] === "number")) {
      keys.push(String(row[0]));
    }
  }
  if (!keys.length) return null;
  if (keys.length > MODEL_FACTS_MAX_SELECTION_KEYS) {
    return { keys: keys.slice(0, MODEL_FACTS_MAX_SELECTION_KEYS), truncated: true };
  }
  return { keys, truncated: false };
}

function compactOneField(name: string, meta: Record<string, unknown>): CompactField {
  const out: CompactField = {
    name,
    t: String(meta.type ?? "unknown"),
  };
  const label = truncateLabel(meta.string);
  if (label) out.s = label;
  if (meta.required) out.req = 1;
  if (meta.readonly) out.ro = 1;
  if (typeof meta.relation === "string" && meta.relation) out.rel = meta.relation;
  const sel = selectionKeys(meta.selection);
  if (sel) {
    out.sel = sel.keys;
    if (sel.truncated) out.sel_truncated = 1;
  }
  if (meta.searchable === false) out.search = 0;
  else if (meta.searchable === true) out.search = 1;
  if (meta.store === false) out.store = 0;
  else if (meta.store === true) out.store = 1;
  return out;
}

/** Compact fields_get map for agent planning (not write authority). */
export function compactFieldsGet(
  fieldsMetadata: Record<string, unknown>,
  opts: {
    maxFields?: number;
    fieldNames?: string[] | null;
    intent?: ModelFactsIntent;
  } = {},
): { fields: CompactField[]; field_count_total: number; fingerprint: string } {
  const maxFields = Math.min(
    Math.max(1, opts.maxFields ?? MODEL_FACTS_DEFAULT_MAX_FIELDS),
    MODEL_FACTS_HARD_MAX_FIELDS,
  );
  const total = Object.keys(fieldsMetadata).length;
  let names: string[];
  if (opts.fieldNames?.length) {
    names = opts.fieldNames.filter((n) => n in fieldsMetadata).slice(0, maxFields);
  } else {
    const ranked = rankRelevantFields(fieldsMetadata, maxFields);
    names = ranked.map((r) => r.field);
    for (const forced of ["id", "name", "display_name"]) {
      if (forced in fieldsMetadata && !names.includes(forced)) {
        names = [forced, ...names].slice(0, maxFields);
      }
    }
    if (opts.intent === "write") {
      const required: string[] = [];
      for (const [name, raw] of Object.entries(fieldsMetadata)) {
        if (!raw || typeof raw !== "object") continue;
        const meta = raw as Record<string, unknown>;
        if (meta.required && !meta.readonly && !names.includes(name)) required.push(name);
      }
      names = [...required, ...names].filter((n, i, a) => a.indexOf(n) === i).slice(0, maxFields);
    }
  }

  const fields: CompactField[] = [];
  for (const name of names) {
    const raw = fieldsMetadata[name];
    if (!raw || typeof raw !== "object") continue;
    fields.push(compactOneField(name, raw as Record<string, unknown>));
  }

  const fingerprint = shortHash(
    fields
      .map((f) => `${f.name}:${f.t}:${f.req ?? 0}:${f.ro ?? 0}:${f.rel ?? ""}:${(f.sel ?? []).join("|")}`)
      .sort()
      .join(";"),
  );
  return { fields, field_count_total: total, fingerprint };
}

export function resolveIntentPackModels(query: string): string[] {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9_.]+/)
    .filter(Boolean);
  const out: string[] = [];
  for (const token of tokens) {
    const pack = INTENT_PACKS[token];
    if (pack) {
      for (const m of pack) {
        if (!out.includes(m)) out.push(m);
      }
    }
    if (token.includes(".") && /^[a-z][a-z0-9_.]*$/.test(token) && !out.includes(token)) {
      out.push(token);
    }
  }
  return out;
}

export function isAccessDeniedMessage(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("not allowed") ||
    e.includes("access denied") ||
    e.includes("accesserror") ||
    e.includes("you are not allowed") ||
    e.includes("access rights")
  );
}

/** Classify transport / ACL / missing model from an Odoo error string. */
export function classifyModelError(error: unknown): {
  code: ModelErrorCode;
  message: string;
  retryable: boolean;
} {
  const message = error instanceof Error ? error.message : String(error);
  const e = message.toLowerCase();
  if (
    e.includes("http 502") ||
    e.includes("http 503") ||
    e.includes("http 504") ||
    e.includes("econnreset") ||
    e.includes("etimedout") ||
    e.includes("econnrefused") ||
    e.includes("socket hang up") ||
    e.includes("fetch failed") ||
    e.includes("network") ||
    e.includes("xml-rpc http 5")
  ) {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }
  if (isAccessDeniedMessage(message) || (isOdooError(error) && error.code === "ACCESS_DENIED")) {
    return { code: "ACCESS_DENIED", message, retryable: false };
  }
  if (
    e.includes("doesn't exist") ||
    e.includes("does not exist") ||
    e.includes("object ") && e.includes(" not found") ||
    e.includes("invalid model") ||
    e.includes("unknown model")
  ) {
    return { code: "MODEL_NOT_FOUND", message, retryable: false };
  }
  if (isOdooError(error) && (error.code === "CONNECTION_FAILED" || error.code === "TIMEOUT")) {
    return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
  }
  if (isOdooError(error) && error.code === "TRANSPORT_ERROR") {
    if (/502|503|504|timeout|connect/i.test(message)) {
      return { code: "UPSTREAM_UNAVAILABLE", message, retryable: true };
    }
    return { code: "TRANSPORT_ERROR", message, retryable: false };
  }
  return { code: "UNKNOWN", message, retryable: false };
}

function transportOdooCalls(transport: OdooTransport): number | null {
  const metrics = (transport as { metrics?: { odooCalls?: number } }).metrics;
  return typeof metrics?.odooCalls === "number" ? metrics.odooCalls : null;
}

async function resolveModelsFromQuery(
  transport: OdooTransport,
  query: string,
  maxModels: number,
): Promise<{
  models: { model: string; label?: string }[];
  irModelAccess: "ok" | "denied" | "unknown";
  resolveSource: "ir.model" | "intent_pack" | "ir.model+intent_pack";
}> {
  const packs = resolveIntentPackModels(query).slice(0, maxModels);
  try {
    const domain = ["|", ["model", "ilike", query], ["name", "ilike", query]] as unknown[];
    const rows = (await transport.executeKw("ir.model", "search_read", [], {
      domain,
      fields: ["model", "name"],
      limit: maxModels,
      order: "model asc",
    })) as { model?: string; name?: string }[];
    const fromIr = Array.isArray(rows)
      ? rows
          .filter((r) => typeof r.model === "string")
          .map((r) => ({
            model: r.model as string,
            label: typeof r.name === "string" ? r.name : undefined,
          }))
      : [];

    // Prefer intent packs when they match business words and ir.model returned
    // noisy/incomplete hits (e.g. query "invoice" misses account.move "Journal Entry").
    if (packs.length) {
      const merged: { model: string; label?: string }[] = [];
      for (const m of packs) {
        if (!merged.some((x) => x.model === m)) merged.push({ model: m });
      }
      for (const row of fromIr) {
        if (!merged.some((x) => x.model === row.model)) merged.push(row);
      }
      return {
        models: merged.slice(0, maxModels),
        irModelAccess: "ok",
        resolveSource: fromIr.length ? "ir.model+intent_pack" : "intent_pack",
      };
    }

    return {
      models: fromIr.slice(0, maxModels),
      irModelAccess: "ok",
      resolveSource: "ir.model",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const classified = classifyModelError(e);
    if (classified.code === "ACCESS_DENIED" || isAccessDeniedMessage(msg)) {
      return {
        models: packs.map((model) => ({ model })),
        irModelAccess: "denied",
        resolveSource: "intent_pack",
      };
    }
    throw e;
  }
}

async function fieldsGetWithOptionalRetry(
  transport: OdooTransport,
  model: string,
): Promise<Record<string, unknown>> {
  try {
    return await fieldsGet(transport, model);
  } catch (e) {
    const c = classifyModelError(e);
    if (!c.retryable) throw e;
    // Single retry for transient upstream (502/timeout).
    return await fieldsGet(transport, model);
  }
}

function nextStepsForCode(code: string): string[] {
  switch (code) {
    case "UPSTREAM_UNAVAILABLE":
      return [
        "Odoo upstream failed (502/timeout). Retry the same model_facts call once.",
        "Do not switch to schema_catalog or invent field names.",
      ];
    case "IR_MODEL_DENIED":
      return [
        "Pass technical models=['account.move','res.partner',…] instead of browsing ir.model.",
        "Do not call list_models.",
      ];
    case "ALL_MODELS_INACCESSIBLE":
      return [
        "No requested model was readable with current credentials. Try different models or check Odoo ACLs.",
      ];
    case "MODEL_NOT_FOUND":
      return [
        "No models matched. Retry with models=['res.partner'] or a known technical name.",
      ];
    default:
      return [
        "Use returned field names and selection keys only — do not invent fields.",
        "Call search_records with model + domain/query, or preview_write for writes.",
      ];
  }
}

export async function modelFacts(
  transport: OdooTransport,
  opts: {
    models?: string[] | null;
    query?: string | null;
    intent?: ModelFactsIntent | null;
    max_models?: number;
    max_fields?: number;
    field_names?: string[] | null;
    include_relations?: boolean;
  } = {},
): Promise<ToolResult> {
  const started = Date.now();
  const callsAtStart = transportOdooCalls(transport);
  try {
    const intent: ModelFactsIntent = opts.intent ?? "search";
    if (!["search", "write", "domain", "overview"].includes(intent)) {
      throw new OdooError("VALIDATION_ERROR", 'intent must be "search"|"write"|"domain"|"overview"');
    }
    const maxModels = Math.min(
      clampLimit(opts.max_models ?? MODEL_FACTS_DEFAULT_MAX_MODELS, MODEL_FACTS_HARD_MAX_MODELS),
      MODEL_FACTS_HARD_MAX_MODELS,
    );
    const maxFields = Math.min(
      clampLimit(opts.max_fields ?? MODEL_FACTS_DEFAULT_MAX_FIELDS, MODEL_FACTS_HARD_MAX_FIELDS),
      MODEL_FACTS_HARD_MAX_FIELDS,
    );

    let targets: { model: string; label?: string }[] = [];
    let irModelAccess: "ok" | "denied" | "unknown" = "unknown";
    let resolveSource: "explicit" | "ir.model" | "intent_pack" | "ir.model+intent_pack" = "explicit";

    if (opts.models?.length) {
      for (const m of opts.models) validateModelName(m);
      targets = opts.models.slice(0, maxModels).map((model) => ({ model }));
      resolveSource = "explicit";
    } else if (opts.query?.trim()) {
      const resolved = await resolveModelsFromQuery(transport, opts.query.trim(), maxModels);
      targets = resolved.models;
      irModelAccess = resolved.irModelAccess;
      resolveSource = resolved.resolveSource;
    } else {
      return {
        success: false,
        tool: "model_facts",
        code: "VALIDATION_ERROR",
        retryable: false,
        error: "Provide models=[...] or query=... (prefer technical model names).",
        next_steps: [
          "model_facts({ models: ['res.partner'] })",
          "model_facts({ query: 'invoice' })",
        ],
      };
    }

    if (!targets.length) {
      const code = irModelAccess === "denied" ? "IR_MODEL_DENIED" : "MODEL_NOT_FOUND";
      return {
        success: false,
        tool: "model_facts",
        code,
        retryable: false,
        error:
          code === "IR_MODEL_DENIED"
            ? "ir.model access denied and no intent-pack candidates matched the query. Pass technical models=[...]."
            : "No models matched.",
        ir_model_access: irModelAccess,
        resolve_source: resolveSource,
        next_steps: nextStepsForCode(code),
      };
    }

    const modelsOut: Record<string, unknown>[] = [];
    const errorCodes: ModelErrorCode[] = [];

    for (const target of targets) {
      try {
        const full = await fieldsGetWithOptionalRetry(transport, target.model);
        const { fields, field_count_total, fingerprint } = compactFieldsGet(full, {
          maxFields,
          fieldNames: opts.field_names,
          intent,
        });
        const requiredWritable = fields
          .filter((f) => f.req === 1 && f.ro !== 1)
          .map((f) => f.name);
        const entry: Record<string, unknown> = {
          model: target.model,
          accessible: true,
          fingerprint,
          field_count_total,
          fields,
          required_writable: requiredWritable,
        };
        if (target.label) entry.label = target.label;
        if (intent === "search" || intent === "domain") {
          entry.domain_hints = fields
            .filter((f) => f.search !== 0 && (f.t === "char" || f.t === "selection" || f.t === "many2one"))
            .slice(0, 8)
            .map((f) => f.name);
        }
        modelsOut.push(entry);
      } catch (e) {
        const classified = classifyModelError(e);
        errorCodes.push(classified.code);
        modelsOut.push({
          model: target.model,
          label: target.label,
          accessible: false,
          error_code: classified.code,
          access_error: classified.message.slice(0, 300),
          retryable: classified.retryable,
          fields: [],
          required_writable: [],
        });
      }
    }

    const accessible = modelsOut.filter((m) => m.accessible === true);
    const failed = modelsOut.filter((m) => m.accessible === false);
    const callsAtEnd = transportOdooCalls(transport);
    const odooCalls =
      callsAtStart != null && callsAtEnd != null
        ? Math.max(0, callsAtEnd - callsAtStart)
        : targets.length + (resolveSource === "explicit" ? 0 : 1);

    const payload: ToolResult = {
      success: accessible.length > 0,
      tool: "model_facts",
      ir_model_access: irModelAccess,
      resolve_source: resolveSource,
      models: modelsOut,
      models_requested: targets.length,
      models_accessible: accessible.length,
      models_failed: failed.length,
      metadata_used: {
        fields_get: true,
        compact: true,
        odoo_calls: odooCalls,
        wall_clock_ms: Date.now() - started,
      },
    };

    if (accessible.length > 0) {
      payload.next_steps = nextStepsForCode("OK");
      if (failed.length) {
        payload.partial = true;
        payload.failures = failed.map((m) => ({
          model: m.model,
          error_code: m.error_code,
          access_error: m.access_error,
        }));
      }
      return payload;
    }

    // All models failed — pick top-level code from failure modes
    const upstreamN = errorCodes.filter((c) => c === "UPSTREAM_UNAVAILABLE").length;
    const accessN = errorCodes.filter((c) => c === "ACCESS_DENIED").length;
    let code = "ALL_MODELS_INACCESSIBLE";
    let retryable = false;
    let error = "No accessible models in the requested set.";
    if (upstreamN > 0 && upstreamN >= errorCodes.length / 2) {
      code = "UPSTREAM_UNAVAILABLE";
      retryable = true;
      error =
        failed[0] && typeof failed[0].access_error === "string"
          ? String(failed[0].access_error)
          : "Odoo upstream unavailable (502/timeout).";
    } else if (accessN === errorCodes.length && errorCodes.length > 0) {
      code = "ALL_MODELS_INACCESSIBLE";
      error = "All requested models denied by Odoo ACL.";
    }

    payload.code = code;
    payload.retryable = retryable;
    payload.error = error;
    payload.next_steps = nextStepsForCode(code);
    return payload;
  } catch (e) {
    const classified = classifyModelError(e);
    if (classified.code === "UPSTREAM_UNAVAILABLE") {
      return {
        success: false,
        tool: "model_facts",
        code: "UPSTREAM_UNAVAILABLE",
        retryable: true,
        error: classified.message,
        next_steps: nextStepsForCode("UPSTREAM_UNAVAILABLE"),
      };
    }
    return fail(e, "model_facts");
  }
}

/** Detect invalid-field / domain errors for search recovery hints. */
export function isInvalidFieldError(message: string): boolean {
  const e = message.toLowerCase();
  return (
    e.includes("invalid field") ||
    e.includes("unknown field") ||
    e.includes("invalid field name") ||
    e.includes("does not exist") && e.includes("field") ||
    e.includes("wrong field") ||
    e.includes("invalid domain") ||
    /field ['"]?\w+['"]? (is not valid|does not exist)/i.test(message)
  );
}

export function schemaHintForModel(
  model: string,
  intent: ModelFactsIntent = "search",
): Record<string, unknown> {
  return {
    action: "model_facts",
    models: [model],
    intent,
    reason: "Call model_facts once, then retry with returned field names only.",
  };
}
