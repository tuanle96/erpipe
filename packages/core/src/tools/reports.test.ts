import { describe, expect, it } from "vitest";
import {
  generateJson2Payload,
  upgradeRiskReport,
  fitGapReport,
  businessPackReport,
  classifyMethodSafety,
  BUSINESS_PACKS,
  PHASE4_TOOLS,
} from "./reports";

describe("classifyMethodSafety", () => {
  it("flags destructive CRUD", () => {
    expect(classifyMethodSafety("create").destructive_method).toBe(true);
    expect(classifyMethodSafety("write").safety).toBe("destructive");
  });
  it("flags read-only ORM", () => {
    expect(classifyMethodSafety("search_read").safety).toBe("read_only");
  });
  it("flags side-effect patterns", () => {
    expect(classifyMethodSafety("action_confirm").safety).toBe("side_effect");
    expect(classifyMethodSafety("message_post").safety).toBe("side_effect");
  });
});

describe("generate_json2_payload", () => {
  it("maps search_read positionals to named body", () => {
    const r = generateJson2Payload({
      model: "res.partner",
      method: "search_read",
      args: [[["is_company", "=", true]], ["id", "name"], 0, 10],
      base_url: "https://odoo.example.com",
      database: "prod",
    });
    expect(r.success).toBe(true);
    expect(r.tool).toBe("generate_json2_payload");
    expect((r.endpoint as { path: string }).path).toBe(
      "/json/2/res.partner/search_read",
    );
    expect((r.endpoint as { url: string }).url).toContain(
      "https://odoo.example.com/json/2/",
    );
    const body = r.body as Record<string, unknown>;
    expect(body.domain).toEqual([["is_company", "=", true]]);
    expect(body.fields).toEqual(["id", "name"]);
    expect(body.limit).toBe(10);
    expect((r.headers as Record<string, unknown>)["X-Odoo-Database"]).toBe(
      "prod",
    );
  });

  it("warns on unmapped custom method positionals", () => {
    const r = generateJson2Payload({
      model: "sale.order",
      method: "custom_foo",
      args: [1, 2],
    });
    expect(r.success).toBe(false);
    const warnings = r.warnings as { code: string }[];
    expect(warnings.some((w) => w.code === "json2_positional_unsupported")).toBe(
      true,
    );
  });

  it("warns on destructive methods", () => {
    const r = generateJson2Payload({
      model: "res.partner",
      method: "unlink",
      args: [[1]],
    });
    expect(r.success).toBe(true);
    const warnings = r.warnings as { code: string }[];
    expect(warnings.some((w) => w.code === "destructive_method")).toBe(true);
  });
});

describe("upgrade_risk_report", () => {
  it("errors when target reaches XML-RPC removal", () => {
    const r = upgradeRiskReport({
      source_version: "18.0",
      target_version: "22.0",
    });
    expect(r.success).toBe(true);
    expect((r.summary as { risk: string; blocked: boolean }).blocked).toBe(
      true,
    );
    expect((r.summary as { risk: string }).risk).toBe("high");
    const risks = r.risks as { code: string }[];
    expect(risks.some((x) => x.code === "xmlrpc_jsonrpc_removal")).toBe(true);
    expect((r.transport as { json2_required: boolean }).json2_required).toBe(
      true,
    );
  });

  it("warns on custom modules and destructive methods", () => {
    const r = upgradeRiskReport({
      target_version: "19.0",
      modules: [{ name: "x_custom_app", custom: true }],
      methods: [{ model: "res.partner", method: "write" }],
    });
    const risks = r.risks as { code: string }[];
    expect(risks.some((x) => x.code === "custom_module_upgrade")).toBe(true);
    expect(risks.some((x) => x.code === "destructive_method_review")).toBe(
      true,
    );
    expect(
      (r.destructive_methods as unknown[]).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it("redacts observed error debug by default", () => {
    const r = upgradeRiskReport({
      observed_errors: [{ message: "boom", debug: "secret stack" }],
    });
    const errs = r.odoo_errors as { debug: string }[];
    expect(errs[0]?.debug).toBe("[redacted]");
  });
});

describe("fit_gap_report", () => {
  it("classifies standard / custom / avoid requirements", () => {
    const r = fitGapReport({
      requirements: [
        "Manage contacts and invoices",
        "Custom API integration with external warehouse",
        "Bypass access rules for reporting",
        "Studio custom field on partner form",
        "Configure tax and approval sequences",
      ],
    });
    expect(r.success).toBe(true);
    const summary = r.summary as Record<string, number>;
    expect(summary.fit).toBeGreaterThanOrEqual(2); // standard + configuration
    expect(summary.gap).toBeGreaterThanOrEqual(2); // custom + avoid
    expect(summary.partial).toBeGreaterThanOrEqual(1); // studio
    const items = r.items as { classification: string }[];
    expect(items.map((i) => i.classification)).toContain("standard");
    expect(items.map((i) => i.classification)).toContain("custom_module");
    expect(items.map((i) => i.classification)).toContain("avoid");
    expect(items.map((i) => i.classification)).toContain("studio");
    expect(items.map((i) => i.classification)).toContain("configuration");
  });
});

describe("business_pack_report", () => {
  it("rejects unknown pack", () => {
    const r = businessPackReport({ pack: "nope" });
    expect(r.success).toBe(false);
    expect((r.available_packs as string[]).includes("sales")).toBe(true);
  });

  it("returns static pack without live evidence", () => {
    const r = businessPackReport({ pack: "accounting" });
    expect(r.success).toBe(true);
    expect(r.pack).toBe("accounting");
    expect(r.missing_models).toEqual([]);
    expect((r.metadata_used as { source: string }).source).toBe("static_pack");
    expect((r.expected_models as string[]).includes("account.move")).toBe(
      true,
    );
  });

  it("computes missing models when live evidence provided", () => {
    const r = businessPackReport({
      pack: "hr",
      available_models: ["hr.employee"],
      installed_modules: ["hr"],
    });
    expect(r.success).toBe(true);
    expect(r.available_models).toEqual(["hr.employee"]);
    expect((r.missing_models as string[]).length).toBeGreaterThan(0);
    expect(r.installed_modules).toEqual(["hr"]);
  });

  it("exposes all packs in BUSINESS_PACKS", () => {
    expect(Object.keys(BUSINESS_PACKS).sort()).toEqual([
      "accounting",
      "crm",
      "hr",
      "inventory",
      "sales",
    ]);
  });
});

describe("PHASE4_TOOLS", () => {
  it("has exactly 4 tools for D14 23-surface", () => {
    expect(PHASE4_TOOLS).toHaveLength(4);
    expect([...PHASE4_TOOLS]).toEqual([
      "generate_json2_payload",
      "upgrade_risk_report",
      "fit_gap_report",
      "business_pack_report",
    ]);
  });
});
