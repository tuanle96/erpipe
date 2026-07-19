/**
 * Gated write tools: preview_write → validate_write → execute_approved_write.
 */

import {
  type ApprovalTokenStore,
  buildApprovalToken,
  MAX_WRITE_BATCH_SIZE,
  verifyWriteApproval,
  WRITE_APPROVAL_TTL_MS,
  WRITE_OPERATIONS,
  type WriteApproval,
} from "../approval/token.js";
import { OdooError } from "../errors.js";
import { FieldPolicy } from "../field-policy.js";
import type { OdooTransport } from "../transport/types.js";
import { fail as failBase, fieldsGet, type ToolResult, validateModelName } from "./helpers.js";

export type { ToolResult };

function fail(tool: string, error: unknown): ToolResult {
  return failBase(error, tool);
}

async function hashFieldsGet(fields: Record<string, unknown>): Promise<string> {
  const { sha256Hex } = await import("../approval/token.js");
  const { canonicalJson } = await import("../approval/canonical.js");
  return sha256Hex(canonicalJson(fields));
}

function metadataIssuesForValues(
  values: Record<string, unknown>,
  fieldsMetadata: Record<string, unknown>,
  label = "",
): { code: string; severity: string; message: string }[] {
  const issues: { code: string; severity: string; message: string }[] = [];
  const prefix = label ? `${label}: ` : "";
  for (const fieldName of Object.keys(values).sort()) {
    const meta = fieldsMetadata[fieldName];
    if (!meta || typeof meta !== "object") {
      issues.push({
        code: "unknown_field",
        severity: "error",
        message: `${prefix}${JSON.stringify(fieldName)} is not present in fields_get metadata.`,
      });
      continue;
    }
    const m = meta as Record<string, unknown>;
    if (m.readonly) {
      issues.push({
        code: "readonly_field",
        severity: "error",
        message: `${prefix}${JSON.stringify(fieldName)} is readonly in fields_get metadata.`,
      });
    }
  }
  return issues;
}

export async function previewWrite(opts: {
  model: string;
  operation: string;
  values?: Record<string, unknown> | null;
  values_list?: Record<string, unknown>[] | null;
  record_ids?: number[] | null;
  context?: Record<string, unknown> | null;
  instance: string;
}): Promise<ToolResult> {
  try {
    if (!opts.instance.trim()) throw new Error("instance is required for write approval");
    validateModelName(opts.model);
    const issues: { code: string; severity: string; message: string }[] = [];
    const operation = String(opts.operation ?? "")
      .trim()
      .toLowerCase();
    if (!WRITE_OPERATIONS.has(operation)) {
      issues.push({
        code: "unsupported_write_operation",
        severity: "error",
        message: "operation must be one of create, write, or unlink.",
      });
    }
    const values = { ...(opts.values ?? {}) };
    const valuesList = opts.values_list ? opts.values_list.map((e) => ({ ...e })) : null;
    const recordIds = [...(opts.record_ids ?? [])].map(Number);

    if (valuesList != null) {
      if (operation !== "create") {
        issues.push({
          code: "values_list_unsupported_operation",
          severity: "error",
          message: "values_list is only supported for create.",
        });
      }
      if (Object.keys(values).length) {
        issues.push({
          code: "values_and_values_list",
          severity: "error",
          message: "Pass either values or values_list, not both.",
        });
      }
      if (!valuesList.length) {
        issues.push({
          code: "empty_values_list",
          severity: "error",
          message: "values_list must contain at least one record.",
        });
      } else if (valuesList.length > MAX_WRITE_BATCH_SIZE) {
        issues.push({
          code: "values_list_too_large",
          severity: "error",
          message: `values_list cap is ${MAX_WRITE_BATCH_SIZE}.`,
        });
      }
    } else if (operation === "create" && !Object.keys(values).length) {
      issues.push({
        code: "missing_create_values",
        severity: "error",
        message: "create requires non-empty values.",
      });
    }
    if ((operation === "write" || operation === "unlink") && !recordIds.length) {
      issues.push({
        code: "missing_record_ids",
        severity: "error",
        message: `${operation} requires record_ids.`,
      });
    }
    if (operation === "write" && !Object.keys(values).length) {
      issues.push({
        code: "missing_write_values",
        severity: "error",
        message: "write requires non-empty values.",
      });
    }

    const canonical = {
      model: opts.model,
      operation,
      record_ids: recordIds,
      values,
      context: { ...(opts.context ?? {}) },
      instance: opts.instance.trim(),
      ...(valuesList != null ? { values_list: valuesList } : {}),
    };
    const token = await buildApprovalToken(canonical);

    return {
      success: !issues.some((i) => i.severity === "error"),
      tool: "preview_write",
      model: opts.model,
      operation,
      approval: { ...canonical, token },
      issues,
      warnings: [
        {
          code: "destructive_operation",
          message:
            "This preview does not execute. execute_approved_write requires matching token + confirm=true + writes_enabled.",
        },
      ],
    };
  } catch (e) {
    return fail("preview_write", e);
  }
}

export async function validateWrite(
  transport: OdooTransport,
  store: ApprovalTokenStore,
  opts: {
    model: string;
    operation: string;
    values?: Record<string, unknown> | null;
    values_list?: Record<string, unknown>[] | null;
    record_ids?: number[] | null;
    context?: Record<string, unknown> | null;
    instance: string;
    fieldPolicy?: FieldPolicy;
    fieldPolicyVersion?: number;
    use_live_metadata?: boolean;
  },
): Promise<ToolResult> {
  try {
    const preview = await previewWrite(opts);
    if (!preview.success) {
      return { ...preview, tool: "validate_write", approval_status: { stored: false } };
    }
    const approval = preview.approval as WriteApproval;
    const issues = [...((preview.issues as object[]) || [])] as {
      code: string;
      severity: string;
      message: string;
    }[];

    const policy = opts.fieldPolicy ?? new FieldPolicy();
    const instance = opts.instance;
    if (approval.values && Object.keys(approval.values).length) {
      const block = policy.checkWriteValues(
        instance,
        opts.model,
        approval.values as Record<string, unknown>,
      );
      if (block) {
        issues.push({
          code: "field_policy_denied",
          severity: "error",
          message: block,
        });
      }
    }
    if (approval.values_list) {
      for (const [i, entry] of approval.values_list.entries()) {
        const block = policy.checkWriteValues(instance, opts.model, entry);
        if (block) {
          issues.push({
            code: "field_policy_denied",
            severity: "error",
            message: `values_list[${i}]: ${block}`,
          });
        }
      }
    }

    let fieldsMetadata: Record<string, unknown> | null = null;
    let metadataSource = "none";
    if (opts.use_live_metadata !== false) {
      metadataSource = "server";
      fieldsMetadata = await fieldsGet(transport, opts.model);
      if (!Object.keys(fieldsMetadata).length) {
        return {
          success: false,
          tool: "validate_write",
          error: "live fields_get metadata was empty; refusing to approve writes",
          approval_status: { stored: false, source: metadataSource },
        };
      }
      if (approval.values_list) {
        for (const [i, entry] of approval.values_list.entries()) {
          issues.push(...metadataIssuesForValues(entry, fieldsMetadata, `values_list[${i}]`));
        }
      } else if (approval.values && Object.keys(approval.values).length) {
        issues.push(
          ...metadataIssuesForValues(approval.values as Record<string, unknown>, fieldsMetadata),
        );
      }
    }

    const success = !issues.some((i) => i.severity === "error");
    let stored = false;
    if (success && fieldsMetadata) {
      const fieldsHash = await hashFieldsGet(fieldsMetadata);
      const expiresAt = Date.now() + WRITE_APPROVAL_TTL_MS;
      const full: WriteApproval = {
        ...approval,
        fields_get_hash: fieldsHash,
        field_policy_version: opts.fieldPolicyVersion ?? 1,
        expires_at: expiresAt,
      };
      await store.issue(approval.token, full, expiresAt);
      stored = true;
    }

    return {
      success,
      tool: "validate_write",
      model: opts.model,
      operation: approval.operation,
      approval,
      issues,
      approval_status: {
        stored,
        expires_in_seconds: WRITE_APPROVAL_TTL_MS / 1000,
        source: metadataSource,
        reason: stored ? undefined : "execute requires successful validation + live fields_get",
      },
      metadata_used: { fields_get: !!fieldsMetadata, source: metadataSource },
    };
  } catch (e) {
    return fail("validate_write", e);
  }
}

export async function executeApprovedWrite(
  transport: OdooTransport,
  store: ApprovalTokenStore,
  opts: {
    approval: WriteApproval | Record<string, unknown>;
    confirm?: boolean;
    writesEnabled?: boolean;
    fieldPolicy?: FieldPolicy;
  },
): Promise<ToolResult> {
  try {
    if (!opts.writesEnabled) {
      return {
        success: false,
        tool: "execute_approved_write",
        code: "WRITE_GATE_DENIED",
        error:
          "writes_enabled is false; set ODOO_MCP_ENABLE_WRITES=1 (or connection setting) to allow gated writes.",
      };
    }
    if (!opts.confirm) {
      return {
        success: false,
        tool: "execute_approved_write",
        code: "WRITE_GATE_DENIED",
        error: "confirm must be true",
      };
    }

    const { ok } = await verifyWriteApproval(opts.approval);
    if (!ok) {
      return {
        success: false,
        tool: "execute_approved_write",
        code: "WRITE_GATE_DENIED",
        error: "approval token does not match payload; re-run preview_write and validate_write",
      };
    }

    const token = String(opts.approval.token ?? "");
    const stored = await store.consume(token, Date.now());
    if (!stored) {
      return {
        success: false,
        tool: "execute_approved_write",
        code: "WRITE_GATE_DENIED",
        error: "approval token missing, already consumed, or expired; call validate_write first",
      };
    }

    // Re-check field policy at execute (defense in depth)
    const policy = opts.fieldPolicy ?? new FieldPolicy();
    const instance = stored.instance;
    if (stored.values && Object.keys(stored.values).length) {
      const block = policy.checkWriteValues(instance, stored.model, stored.values);
      if (block) {
        return {
          success: false,
          tool: "execute_approved_write",
          code: "WRITE_GATE_DENIED",
          error: block,
        };
      }
    }

    const op = stored.operation;
    let result: unknown;
    if (op === "create") {
      if (stored.values_list?.length) {
        result = await transport.executeKw(stored.model, "create", [stored.values_list], {
          ...(stored.context ? { context: stored.context } : {}),
        });
      } else {
        result = await transport.executeKw(stored.model, "create", [stored.values], {
          ...(stored.context ? { context: stored.context } : {}),
        });
      }
    } else if (op === "write") {
      result = await transport.executeKw(
        stored.model,
        "write",
        [stored.record_ids, stored.values],
        { ...(stored.context ? { context: stored.context } : {}) },
      );
    } else if (op === "unlink") {
      result = await transport.executeKw(stored.model, "unlink", [stored.record_ids], {
        ...(stored.context ? { context: stored.context } : {}),
      });
    } else {
      return {
        success: false,
        tool: "execute_approved_write",
        error: `unsupported operation ${op}`,
      };
    }

    return {
      success: true,
      tool: "execute_approved_write",
      operation: op,
      model: stored.model,
      result,
      outcome: "executed",
    };
  } catch (e) {
    // Ambiguous network failures should be treated as unknown by caller;
    // here we surface as error (no auto-retry).
    return fail("execute_approved_write", e);
  }
}

/** chatter_post: writes_enabled only, no approval token (founder DECISIONS). */
export async function chatterPost(
  transport: OdooTransport,
  opts: {
    model: string;
    record_id: number;
    body: string;
    writesEnabled?: boolean;
  },
): Promise<ToolResult> {
  try {
    if (!opts.writesEnabled) {
      return {
        success: false,
        tool: "chatter_post",
        code: "WRITE_GATE_DENIED",
        error: "writes_enabled is false",
      };
    }
    validateModelName(opts.model);
    if (opts.record_id < 1) {
      throw new OdooError("VALIDATION_ERROR", "record_id must be > 0");
    }
    const result = await transport.executeKw(opts.model, "message_post", [[opts.record_id]], {
      body: opts.body,
      message_type: "comment",
      subtype_xmlid: "mail.mt_note",
    });
    return { success: true, tool: "chatter_post", result };
  } catch (e) {
    return fail("chatter_post", e);
  }
}

export async function executeMethod(
  transport: OdooTransport,
  opts: {
    model: string;
    method: string;
    args?: unknown[];
    kwargs?: Record<string, unknown>;
    writesEnabled?: boolean;
    allowUnknownMethods?: boolean;
    allowedMethods?: string[]; // "model.method" entries
  },
): Promise<ToolResult> {
  try {
    validateModelName(opts.model);
    const method = opts.method;
    const destructive = new Set(["create", "write", "unlink"]);
    if (destructive.has(method)) {
      return {
        success: false,
        tool: "execute_method",
        error:
          "create/write/unlink must use preview_write → validate_write → execute_approved_write.",
      };
    }
    const key = `${opts.model}.${method}`;
    const allowed = opts.allowedMethods ?? [];
    if (!opts.allowUnknownMethods && !allowed.includes(key)) {
      return {
        success: false,
        tool: "execute_method",
        code: "WRITE_GATE_DENIED",
        error: `method ${key} not in allowlist`,
      };
    }
    // Side-effect methods require writes_enabled
    if (
      !opts.allowUnknownMethods &&
      (method.startsWith("action_") || method.startsWith("button_")) &&
      !opts.writesEnabled
    ) {
      return {
        success: false,
        tool: "execute_method",
        code: "WRITE_GATE_DENIED",
        error: "writes_enabled required for side-effect methods",
      };
    }
    const result = await transport.executeKw(
      opts.model,
      method,
      opts.args ?? [],
      opts.kwargs ?? {},
    );
    return { success: true, tool: "execute_method", result };
  } catch (e) {
    return fail("execute_method", e);
  }
}

export const PHASE3_TOOLS = [
  "preview_write",
  "validate_write",
  "execute_approved_write",
  "chatter_post",
  "execute_method",
] as const;
