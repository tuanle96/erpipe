import { describe, expect, it } from "vitest";
import type { OdooTransport } from "../transport/types.js";
import {
  classifyModelError,
  compactFieldsGet,
  isInvalidFieldError,
  modelFacts,
  resolveIntentPackModels,
} from "./model-facts.js";
import { searchRecords } from "./read.js";

function mockTransport(handlers: {
  search_read?: (model: string, kwargs: Record<string, unknown>) => unknown;
  fields_get?: (model: string) => unknown;
  throwOn?: { model?: string; method?: string; error: Error; once?: boolean };
}): OdooTransport & { calls: { model: string; method: string }[] } {
  const calls: { model: string; method: string }[] = [];
  let thrownOnce = false;
  return {
    kind: "xmlrpc",
    calls,
    async executeKw(model, method, _args, kwargs = {}) {
      calls.push({ model, method });
      if (handlers.throwOn) {
        const matchModel = !handlers.throwOn.model || handlers.throwOn.model === model;
        const matchMethod = !handlers.throwOn.method || handlers.throwOn.method === method;
        if (matchModel && matchMethod) {
          if (handlers.throwOn.once) {
            if (!thrownOnce) {
              thrownOnce = true;
              throw handlers.throwOn.error;
            }
          } else {
            throw handlers.throwOn.error;
          }
        }
      }
      if (method === "search_read") {
        return handlers.search_read?.(model, kwargs as Record<string, unknown>) ?? [];
      }
      if (method === "fields_get") {
        return (
          handlers.fields_get?.(model) ?? {
            id: { type: "integer", string: "ID" },
            name: { type: "char", string: "Name", required: true, searchable: true },
            email: { type: "char", string: "Email", searchable: true },
            state: {
              type: "selection",
              string: "Status",
              selection: [
                ["draft", "Draft"],
                ["posted", "Posted"],
              ],
              searchable: true,
            },
            partner_id: { type: "many2one", relation: "res.partner", string: "Partner" },
            message_ids: { type: "one2many", relation: "mail.message" },
          }
        );
      }
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

describe("compactFieldsGet", () => {
  it("compacts selection to keys and ranks fields", () => {
    const { fields, fingerprint } = compactFieldsGet(
      {
        id: { type: "integer" },
        name: { type: "char", string: "Name", required: true },
        state: {
          type: "selection",
          selection: [
            ["a", "A"],
            ["b", "B"],
          ],
        },
        help_huge: { type: "text", string: "x".repeat(80), help: "secret" },
      },
      { maxFields: 10 },
    );
    expect(fingerprint).toMatch(/^[0-9a-f]{8}$/);
    const state = fields.find((f) => f.name === "state");
    expect(state?.sel).toEqual(["a", "b"]);
    expect(fields.some((f) => f.name === "name")).toBe(true);
  });
});

describe("classifyModelError", () => {
  it("maps 502 to UPSTREAM_UNAVAILABLE", () => {
    const c = classifyModelError(new Error("XML-RPC HTTP 502: error code: 502\n"));
    expect(c.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(c.retryable).toBe(true);
  });

  it("maps ACL text to ACCESS_DENIED", () => {
    const c = classifyModelError(new Error("You are not allowed to access 'Models'"));
    expect(c.code).toBe("ACCESS_DENIED");
    expect(c.retryable).toBe(false);
  });
});

describe("resolveIntentPackModels", () => {
  it("maps business words to technical models", () => {
    expect(resolveIntentPackModels("unpaid invoices")).toContain("account.move");
    expect(resolveIntentPackModels("customers")).toContain("res.partner");
  });
});

describe("modelFacts", () => {
  it("returns compact facts for explicit models", async () => {
    const t = mockTransport({});
    const res = await modelFacts(t, { models: ["res.partner"], intent: "search" });
    expect(res.success).toBe(true);
    expect(res.resolve_source).toBe("explicit");
    const models = res.models as { model: string; fields: { name: string }[] }[];
    expect(models[0]?.model).toBe("res.partner");
    expect(models[0]?.fields.some((f) => f.name === "name")).toBe(true);
  });

  it("merges intent packs for invoice query even when ir.model returns noise", async () => {
    const t = mockTransport({
      search_read: () => [
        { model: "account.invoice.report", name: "Invoices" },
        { model: "sale.advance.payment.inv", name: "Down Payment" },
      ],
    });
    const res = await modelFacts(t, { query: "invoice" });
    expect(res.success).toBe(true);
    const models = res.models as { model: string }[];
    expect(models.some((m) => m.model === "account.move")).toBe(true);
    expect(String(res.resolve_source)).toMatch(/intent_pack/);
  });

  it("falls back to intent packs when ir.model denied", async () => {
    const t = mockTransport({
      throwOn: {
        method: "search_read",
        error: new Error("You are not allowed to access 'Models' (ir.model) records."),
      },
    });
    const res = await modelFacts(t, { query: "invoice" });
    expect(res.success).toBe(true);
    expect(res.ir_model_access).toBe("denied");
    const models = res.models as { model: string; accessible: boolean }[];
    expect(models.some((m) => m.model === "account.move" && m.accessible)).toBe(true);
  });

  it("classifies all-fail 502 as UPSTREAM_UNAVAILABLE not MODEL_NOT_FOUND", async () => {
    const t = mockTransport({
      throwOn: {
        method: "fields_get",
        error: new Error("XML-RPC HTTP 502: error code: 502\n"),
      },
    });
    const res = await modelFacts(t, { models: ["res.partner"] });
    expect(res.success).toBe(false);
    expect(res.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(res.retryable).toBe(true);
    expect(String(res.error)).toMatch(/502/);
  });

  it("retries once on upstream then succeeds", async () => {
    const t = mockTransport({
      throwOn: {
        method: "fields_get",
        error: new Error("XML-RPC HTTP 502: error code: 502\n"),
        once: true,
      },
    });
    const res = await modelFacts(t, { models: ["res.partner"] });
    expect(res.success).toBe(true);
    expect(t.calls.filter((c) => c.method === "fields_get").length).toBe(2);
  });

  it("requires models or query", async () => {
    const t = mockTransport({});
    const res = await modelFacts(t, {});
    expect(res.success).toBe(false);
    expect(res.code).toBe("VALIDATION_ERROR");
  });
});

describe("searchRecords field recovery", () => {
  it("returns schema_hint on invalid field errors", async () => {
    const t = mockTransport({
      throwOn: {
        method: "search_read",
        error: new Error("Invalid field 'customer_id' in 'search_read'"),
      },
    });
    const res = await searchRecords(t, {
      model: "res.partner",
      domain: [["customer_id", "=", 1]],
      fields: ["name"],
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe("FIELD_INVALID");
    expect(res.schema_hint).toMatchObject({
      action: "model_facts",
      models: ["res.partner"],
    });
  });

  it("detects invalid field messages", () => {
    expect(isInvalidFieldError("Invalid field 'foo'")).toBe(true);
    expect(isInvalidFieldError("XML-RPC HTTP 502")).toBe(false);
  });
});
