import { describe, expect, it } from "vitest";
import type { OdooTransport } from "../transport/types.js";
import {
  aggregateRecords,
  diagnoseOdooCall,
  getOdooProfile,
  schemaCatalog,
  searchEmployee,
  searchHolidays,
} from "./phase2.js";

function mockTransport(
  major = 18,
  handlers: Record<
    string,
    (model: string, method: string, args: unknown[], kwargs: unknown) => unknown
  > = {},
): OdooTransport & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    kind: "json2",
    calls,
    async executeKw(model, method, args, kwargs = {}) {
      calls.push({ model, method, args, kwargs });
      const key = `${model}.${method}`;
      if (handlers[key]) return handlers[key]!(model, method, args as unknown[], kwargs);
      if (handlers[method]) return handlers[method]!(model, method, args as unknown[], kwargs);
      if (method === "search_read") return [];
      if (method === "fields_get") return { name: { type: "char" } };
      if (method === "name_search") return [[1, "Alice"]];
      if (method === "context_get") return { lang: "en_US" };
      if (method === "read_group" || method === "formatted_read_group") {
        return [{ name: "A", __count: 2 }];
      }
      return null;
    },
    async serverVersion() {
      return { major, minor: 0, raw: `${major}.0` };
    },
  };
}

describe("getOdooProfile", () => {
  it("returns version and modules", async () => {
    const t = mockTransport(18, {
      "ir.module.module.search_read": () => [
        { name: "sale", shortdesc: "Sales", state: "installed" },
      ],
    });
    const res = await getOdooProfile(t, { include_modules: true });
    expect(res.success).toBe(true);
    const profile = res.profile as {
      server_version: { major: number };
      installed_module_count: number;
    };
    expect(profile.server_version.major).toBe(18);
    expect(profile.installed_module_count).toBe(1);
  });
});

describe("schemaCatalog", () => {
  it("lists ir.model rows", async () => {
    const t = mockTransport(18, {
      "ir.model.search_read": () => [{ model: "res.partner", name: "Contact" }],
    });
    const res = await schemaCatalog(t, { limit: 10 });
    expect(res.success).toBe(true);
    expect(res.count).toBe(1);
  });

  it("rejects bad model names in models filter", async () => {
    const t = mockTransport();
    const res = await schemaCatalog(t, { models: ["bad name!"] });
    expect(res.success).toBe(false);
  });
});

describe("aggregateRecords", () => {
  it("uses read_group on Odoo < 19", async () => {
    const t = mockTransport(18);
    const res = await aggregateRecords(t, {
      model: "sale.order",
      group_by: ["partner_id"],
      measures: ["amount_total:sum"],
    });
    expect(res.success).toBe(true);
    expect(res.method).toBe("read_group");
    const call = t.calls.find((c) => (c as { method: string }).method === "read_group") as {
      method: string;
    };
    expect(call).toBeTruthy();
  });

  it("uses formatted_read_group on Odoo 19+", async () => {
    const t = mockTransport(19);
    const res = await aggregateRecords(t, {
      model: "sale.order",
      group_by: ["partner_id"],
      measures: ["amount_total:sum"],
    });
    expect(res.success).toBe(true);
    expect(res.method).toBe("formatted_read_group");
  });

  it("requires group_by", async () => {
    const t = mockTransport();
    const res = await aggregateRecords(t, {
      model: "sale.order",
      group_by: [],
    });
    expect(res.success).toBe(false);
  });

  it("rejects unsupported aggregator", async () => {
    const t = mockTransport();
    const res = await aggregateRecords(t, {
      model: "sale.order",
      group_by: ["partner_id"],
      measures: ["amount_total:median"],
    });
    expect(res.success).toBe(false);
  });
});

describe("searchEmployee / searchHolidays", () => {
  it("searchEmployee maps name_search tuples", async () => {
    const t = mockTransport();
    const res = await searchEmployee(t, { name: "Ali" });
    expect(res.success).toBe(true);
    expect(res.result).toEqual([{ id: 1, name: "Alice" }]);
  });

  it("searchHolidays validates date format", async () => {
    const t = mockTransport();
    const bad = await searchHolidays(t, {
      start_date: "01-01-2026",
      end_date: "2026-01-31",
    });
    expect(bad.success).toBe(false);

    const ok = await searchHolidays(t, {
      start_date: "2026-01-01",
      end_date: "2026-01-31",
      employee_id: 5,
    });
    expect(ok.success).toBe(true);
  });
});

describe("diagnoseOdooCall", () => {
  it("flags destructive methods and invalid models", () => {
    const ok = diagnoseOdooCall({
      model: "sale.order",
      method: "unlink",
    });
    expect(ok.success).toBe(true);
    expect((ok.classification as { safety: string }).safety).toBe("destructive");

    const bad = diagnoseOdooCall({
      model: "bad model!",
      method: "search_read",
    });
    expect(bad.success).toBe(false);
  });
});
