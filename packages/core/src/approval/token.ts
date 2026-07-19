import { canonicalJson } from "./canonical.js";

const WRITE_OPERATIONS = new Set(["create", "write", "unlink"]);
export const WRITE_APPROVAL_TTL_MS = 10 * 60 * 1000;
export const MAX_WRITE_BATCH_SIZE = 100;

export type WriteApproval = {
  token: string;
  model: string;
  operation: string;
  record_ids: number[];
  values: Record<string, unknown>;
  values_list?: Record<string, unknown>[];
  context: Record<string, unknown>;
  instance: string;
  fields_get_hash?: string;
  field_policy_version?: number;
  expires_at?: number;
};

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function buildApprovalToken(payload: Record<string, unknown>): Promise<string> {
  const digest = await sha256Hex(canonicalJson(payload));
  return `odoo-write:${digest.slice(0, 32)}`;
}

export function canonicalWritePayload(approval: {
  model: unknown;
  operation: unknown;
  record_ids?: unknown;
  values?: unknown;
  values_list?: unknown;
  context?: unknown;
  instance: unknown;
}): Record<string, unknown> {
  if (typeof approval.instance !== "string" || !approval.instance.trim()) {
    throw new Error("instance is required for write approval");
  }
  const payload: Record<string, unknown> = {
    model: approval.model,
    operation: approval.operation,
    record_ids: approval.record_ids ?? [],
    values: approval.values ?? {},
    context: approval.context ?? {},
    instance: approval.instance.trim(),
  };
  if (approval.values_list != null) {
    payload.values_list = approval.values_list;
  }
  return payload;
}

export async function verifyWriteApproval(
  approval: WriteApproval | Record<string, unknown>,
): Promise<{ ok: boolean; expected: string }> {
  const payload = canonicalWritePayload({
    model: approval.model,
    operation: approval.operation,
    record_ids: approval.record_ids,
    values: approval.values,
    values_list: approval.values_list,
    context: approval.context,
    instance: approval.instance,
  });
  const expected = await buildApprovalToken(payload);
  return { ok: String(approval.token ?? "") === expected, expected };
}

export type ApprovalTokenStore = {
  issue(token: string, payload: WriteApproval, expiresAt: number): Promise<void>;
  consume(token: string, now: number): Promise<WriteApproval | null>;
};

/** In-memory store for tests / single-process self-host. */
export class MemoryApprovalStore implements ApprovalTokenStore {
  private readonly map = new Map<
    string,
    { payload: WriteApproval; expiresAt: number; consumed: boolean }
  >();

  async issue(token: string, payload: WriteApproval, expiresAt: number): Promise<void> {
    this.map.set(token, { payload, expiresAt, consumed: false });
  }

  async consume(token: string, now: number): Promise<WriteApproval | null> {
    const row = this.map.get(token);
    if (!row || row.consumed || row.expiresAt < now) return null;
    row.consumed = true;
    return row.payload;
  }
}

export { WRITE_OPERATIONS };
