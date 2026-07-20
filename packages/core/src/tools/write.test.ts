import { describe, expect, it } from "vitest";
import { MemoryApprovalStore } from "../approval/token";
import { FieldPolicy } from "../field-policy";
import type { OdooTransport } from "../transport/types";
import { executeApprovedWrite, executeMethod, previewWrite, validateWrite } from "./write";

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
      instance: "east",
      model: "res.partner",
      operation: "create",
      values: { name: "ERPipe Smoke Partner" },
    });
    expect(preview.success).toBe(true);
    const _approval = preview.approval as Record<string, unknown>;

    const validated = await validateWrite(t, store, {
      instance: "east",
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
      instance: "east",
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
      instance: "default",
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
      instance: "east",
      model: "res.partner",
      operation: "create",
      values: { name: "X", not_a_field: 1 },
    });
    expect(validated.success).toBe(false);
  });

  it("denies execute_method when strict mode has an empty allowlist", async () => {
    const transport = mockTransport();
    const result = await executeMethod(transport, {
      model: "sale.order",
      method: "custom_mutation",
      writesEnabled: true,
      allowUnknownMethods: false,
      allowedMethods: [],
    });
    expect(result).toMatchObject({ success: false, code: "WRITE_GATE_DENIED" });
    expect(transport.calls).toHaveLength(0);
  });

  it("redirects create/write/unlink to gated write path with next_tool", async () => {
    const transport = mockTransport();
    const result = await executeMethod(transport, {
      model: "product.template",
      method: "create",
      writesEnabled: true,
      allowUnknownMethods: true,
    });
    expect(result).toMatchObject({
      success: false,
      code: "WRITE_GATE_DENIED",
      next_tool: "preview_write",
    });
    expect(result.next_steps).toBeDefined();
    expect(transport.calls).toHaveLength(0);
  });
});
