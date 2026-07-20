import { describe, expect, it } from "vitest";
import type { OdooTransport } from "../transport/types.js";
import {
  buildDomainTool,
  getModelFields,
  healthCheck,
  listModels,
  readRecord,
  searchRecords,
} from "./read.js";

function mockTransport(handlers: {
  search_read?: (model: string, kwargs: Record<string, unknown>) => unknown;
  fields_get?: (model: string) => unknown;
  read?: (model: string, ids: number[], kwargs: Record<string, unknown>) => unknown;
}): OdooTransport & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    kind: "xmlrpc",
    calls,
    async executeKw(model, method, args, kwargs = {}) {
      calls.push({ model, method, args, kwargs });
      if (method === "search_read") {
        return handlers.search_read?.(model, kwargs as Record<string, unknown>) ?? [];
      }
      if (method === "fields_get") {
        return (
          handlers.fields_get?.(model) ?? {
            name: { type: "char", string: "Name" },
            email: { type: "char", string: "Email" },
          }
        );
      }
      if (method === "read") {
        const ids = (args[0] as number[]) ?? [];
        return (
          handlers.read?.(model, ids, kwargs as Record<string, unknown>) ??
          ids.map((id) => ({ id, name: `R${id}` }))
        );
      }
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

describe("listModels", () => {
  it("returns models from ir.model search_read", async () => {
    const t = mockTransport({
      search_read: () => [
        { model: "res.partner", name: "Contact" },
        { model: "sale.order", name: "Sales Order" },
      ],
    });
    const res = await listModels(t, { limit: 10 });
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect((res.result as { model: string }[])[0]?.model).toBe("res.partner");
  });

  it("returns failure when no models", async () => {
    const t = mockTransport({ search_read: () => [] });
    const res = await listModels(t);
    expect(res.success).toBe(false);
    expect(res.count).toBe(0);
  });

  it("pushes query filter to domain", async () => {
    const t = mockTransport({
      search_read: () => [{ model: "res.partner", name: "Contact" }],
    });
    await listModels(t, { query: "partner" });
    const call = t.calls[0] as { kwargs: { domain: unknown[] } };
    expect(call.kwargs.domain).toEqual([
      "|",
      ["model", "ilike", "partner"],
      ["name", "ilike", "partner"],
    ]);
  });
});

describe("getModelFields", () => {
  it("defaults to relevance top", async () => {
    const t = mockTransport({
      fields_get: () => ({
        name: { type: "char", string: "Name" },
        email: { type: "char", string: "Email" },
        message_ids: { type: "one2many" },
      }),
    });
    const res = await getModelFields(t, { model: "res.partner" });
    expect(res.success).toBe(true);
    expect(res.relevance_applied).toBe(true);
    expect(res.count).toBeGreaterThan(0);
  });

  it("returns full fields_get map when relevance=full", async () => {
    const t = mockTransport({
      fields_get: () => ({
        name: { type: "char" },
        email: { type: "char" },
      }),
    });
    const res = await getModelFields(t, { model: "res.partner", relevance: "full" });
    expect(res.success).toBe(true);
    expect(res.count).toBe(2);
    expect(res.relevance_applied).toBe(false);
  });

  it("rejects invalid model names", async () => {
    const t = mockTransport({});
    const res = await getModelFields(t, { model: "bad model!" });
    expect(res.success).toBe(false);
  });

  it("filters to requested field_names", async () => {
    const t = mockTransport({
      fields_get: () => ({
        name: { type: "char" },
        email: { type: "char" },
        phone: { type: "char" },
      }),
    });
    const res = await getModelFields(t, {
      model: "res.partner",
      field_names: ["name", "missing"],
    });
    expect(res.success).toBe(true);
    expect(Object.keys(res.result as object)).toEqual(["name"]);
  });
});

describe("searchRecords", () => {
  it("search_read with domain and limit", async () => {
    const t = mockTransport({
      search_read: () => [{ id: 1, name: "Acme" }],
      fields_get: () => ({ name: { type: "char" } }),
    });
    const res = await searchRecords(t, {
      model: "res.partner",
      domain: [["is_company", "=", true]],
      fields: ["name"],
      limit: 5,
    });
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
    expect(res.smart_fields_applied).toBe(false);
  });

  it("rejects negative offset", async () => {
    const t = mockTransport({});
    const res = await searchRecords(t, {
      model: "res.partner",
      offset: -1,
    });
    expect(res.success).toBe(false);
  });
});

describe("readRecord", () => {
  it("reads a single record", async () => {
    const t = mockTransport({
      read: () => [{ id: 7, name: "Acme" }],
    });
    const res = await readRecord(t, {
      model: "res.partner",
      record_id: 7,
      fields: ["name"],
    });
    expect(res.success).toBe(true);
    expect((res.result as { id: number }).id).toBe(7);
  });

  it("fails when record missing", async () => {
    const t = mockTransport({ read: () => [] });
    const res = await readRecord(t, { model: "res.partner", record_id: 99 });
    expect(res.success).toBe(false);
    expect(String(res.error)).toMatch(/not found/i);
  });

  it("rejects non-positive record_id", async () => {
    const t = mockTransport({});
    const res = await readRecord(t, { model: "res.partner", record_id: 0 });
    expect(res.success).toBe(false);
  });
});

describe("healthCheck / buildDomainTool", () => {
  it("healthCheck reports defaults", () => {
    const res = healthCheck({ writesEnabled: false, transport: "xmlrpc" });
    expect(res.success).toBe(true);
    expect((res.runtime as { writes_enabled: boolean }).writes_enabled).toBe(false);
  });

  it("buildDomainTool builds a domain list", () => {
    const res = buildDomainTool({
      conditions: [{ field: "name", operator: "ilike", value: "acme" }],
    });
    expect(res.success).toBe(true);
  });
});
