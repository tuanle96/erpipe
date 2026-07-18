import { OdooError } from "../errors.js";
import {
  selectSmartFields,
  DEFAULT_MAX_SMART_FIELDS,
} from "../smart-fields.js";

const MODEL_NAME_RE =
  /^[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*$/;

export const MAX_SEARCH_LIMIT = 100;
export const ABS_MAX_LIMIT = 500;

export function validateModelName(model: string): void {
  if (!MODEL_NAME_RE.test(model)) {
    throw new OdooError("FIELD_INVALID", `Invalid model name: ${model}`);
  }
}

export function clampLimit(
  limit: number,
  maximum = MAX_SEARCH_LIMIT,
): number {
  if (!Number.isFinite(limit) || limit < 1) {
    throw new OdooError("LIMIT_EXCEEDED", "limit must be >= 1");
  }
  return Math.min(Math.floor(limit), maximum);
}

/**
 * Normalize domain input: array, JSON string, or { conditions: [{field,operator,value}] }.
 */
export function normalizeDomainInput(domain: unknown): unknown[] {
  if (domain == null || domain === "") return [];
  if (typeof domain === "string") {
    const parsed = JSON.parse(domain) as unknown;
    return normalizeDomainInput(parsed);
  }
  if (Array.isArray(domain)) return domain;
  if (typeof domain === "object" && domain !== null && "conditions" in domain) {
    const conditions = (domain as { conditions: unknown }).conditions;
    if (!Array.isArray(conditions)) {
      throw new OdooError("VALIDATION_ERROR", "conditions must be an array");
    }
    return conditions.map((c) => {
      if (typeof c !== "object" || c === null) {
        throw new OdooError("VALIDATION_ERROR", "invalid condition");
      }
      const o = c as Record<string, unknown>;
      return [o.field, o.operator, o.value];
    });
  }
  throw new OdooError(
    "VALIDATION_ERROR",
    "domain must be a list or conditions object",
  );
}

/** Smart-fields via field_ranking port when fields omitted. */
export function resolveReadFields(
  fieldsMeta: Record<string, unknown> | null,
  fields: string[] | null | undefined,
  maxSmart = DEFAULT_MAX_SMART_FIELDS,
): string[] | null {
  if (fields === undefined || fields === null) {
    if (!fieldsMeta) return ["id", "name", "display_name"];
    return selectSmartFields(fieldsMeta, maxSmart);
  }
  if (fields.length === 1 && fields[0] === "*") {
    return null; // all fields
  }
  return fields;
}
