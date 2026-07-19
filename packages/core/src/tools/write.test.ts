import { describe, expect, it } from "vitest";
import { MemoryApprovalStore } from "../approval/token";
import { FieldPolicy } from "../field-policy";
import type { OdooTransport } from "../transport/types";
import { executeApprovedWrite, previewWrite, validateWrite } from "./write";

function mockTransport(
  fields: Record<string, unknown> = {
    name: { type: "char", required: true },
    email: { type: "char" },
    secret: { type: "char" },
  },
): OdooTransport & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    kind: "xmlrpc",
    calls,
    async executeKw(model, method, args, kwargs) {
      calls.push({ model, method, args, kwargs });
      if (method === "fields_get") return fields;
      if (method === "create") return 42;
      if (method === "write") return true;
      if (method === "unlink") return true;
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

describe("write gate", () => {
  it("preview → validate → execute create when writes enabled", async () => {
    const t = mockTransport();
    const store = new MemoryApprovalStore();
    const preview = await previewWrite({
      model: "res.partner",
      operation: "create",
      values: { name: "ERPipe Smoke Partner" },
    });
    expect(preview.success).toBe(true);
    const _approval = preview.approval as Record<string, unknown>;

    const validated = await validateWrite(t, store, {
      model: "res.partner",
      operation: "create",
      values: { name: "ERPipe Smoke Partner" },
    });
    expect(validated.success).toBe(true);
    expect((validated.approval_status as { stored: boolean }).stored).toBe(true);

    // approval from preview has same token as validated
    const executed = await executeApprovedWrite(t, store, {
      approval: validated.approval as Record<string, unknown>,
      confirm: true,
      writesEnabled: true,
    });
    expect(executed.success).toBe(true);
    expect(executed.result).toBe(42);

    // second consume fails
    const again = await executeApprovedWrite(t, store, {
      approval: validated.approval as Record<string, unknown>,
      confirm: true,
      writesEnabled: true,
    });
    expect(again.success).toBe(false);
  });

  it("denies execute when writes disabled", async () => {
    const t = mockTransport();
    const store = new MemoryApprovalStore();
    const validated = await validateWrite(t, store, {
      model: "res.partner",
      operation: "create",
      values: { name: "X" },
    });
    const executed = await executeApprovedWrite(t, store, {
      approval: validated.approval as Record<string, unknown>,
      confirm: true,
      writesEnabled: false,
    });
    expect(executed.success).toBe(false);
    expect(executed.code).toBe("WRITE_GATE_DENIED");
  });

  it("field policy blocks validate", async () => {
    const t = mockTransport();
    const store = new MemoryApprovalStore();
    const policy = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["secret"] },
        },
      },
    });
    const validated = await validateWrite(t, store, {
      model: "res.partner",
      operation: "create",
      values: { name: "X", secret: "nope" },
      fieldPolicy: policy,
    });
    expect(validated.success).toBe(false);
    expect(
      (validated.issues as { code: string }[]).some((i) => i.code === "field_policy_denied"),
    ).toBe(true);
  });

  it("rejects unknown fields against metadata", async () => {
    const t = mockTransport({ name: { type: "char" } });
    const store = new MemoryApprovalStore();
    const validated = await validateWrite(t, store, {
      model: "res.partner",
      operation: "create",
      values: { name: "X", not_a_field: 1 },
    });
    expect(validated.success).toBe(false);
  });
});
