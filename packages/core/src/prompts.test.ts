import { describe, expect, it } from "vitest";
import {
  CLOUD_V1_PROMPTS,
  PROMPT_CATALOG,
  renderCloudPrompt,
  promptDiagnoseFailedOdooCall,
  promptFitGapWorkshop,
  promptJson2MigrationPlan,
  promptSafeWriteReview,
  promptInvoiceApprovalChain,
  promptPoToReceipt,
  promptCustomerOnboarding,
} from "./prompts";

describe("CLOUD_V1_PROMPTS", () => {
  it("is exactly 7 for D14 surface", () => {
    expect(CLOUD_V1_PROMPTS).toHaveLength(7);
    expect(PROMPT_CATALOG).toHaveLength(7);
    expect(PROMPT_CATALOG.map((p) => p.name)).toEqual([...CLOUD_V1_PROMPTS]);
  });

  it("excludes out-of-tier prompts", () => {
    const excluded = [
      "custom_module_audit",
      "expense_claim_review",
      "accounting_close_checklist",
      "pre_migration_data_quality",
    ];
    for (const name of excluded) {
      expect(CLOUD_V1_PROMPTS).not.toContain(name);
      expect(renderCloudPrompt(name, {})).toBeNull();
    }
  });
});

describe("prompt text builders", () => {
  it("diagnose_failed_odoo_call names safe tools", () => {
    const t = promptDiagnoseFailedOdooCall({
      model: "res.partner",
      method: "write",
      error: "AccessError",
    });
    expect(t).toContain("res.partner");
    expect(t).toContain("AccessError");
    expect(t).toContain("diagnose_odoo_call");
    expect(t).toContain("diagnose_access");
  });

  it("fit_gap_workshop routes through fit_gap_report", () => {
    const t = promptFitGapWorkshop({ requirement: "Need multi-currency invoices" });
    expect(t).toContain("multi-currency");
    expect(t).toContain("fit_gap_report");
  });

  it("json2_migration_plan uses generate_json2_payload", () => {
    const t = promptJson2MigrationPlan({
      model: "sale.order",
      method: "search_read",
    });
    expect(t).toContain("generate_json2_payload");
    expect(t).toContain("upgrade_risk_report");
  });

  it("safe_write_review requires gate + writes flag", () => {
    const t = promptSafeWriteReview({
      model: "res.partner",
      operation: "create",
    });
    expect(t).toContain("preview_write");
    expect(t).toContain("execute_approved_write");
    expect(t).toContain("ODOO_MCP_ENABLE_WRITES=1");
  });

  it("invoice_approval_chain is gated and human-checkpointed", () => {
    const t = promptInvoiceApprovalChain({ journal: "INV" });
    expect(t).toContain("business_pack_report(pack='accounting')");
    expect(t).toContain("STOP");
    expect(t).toContain("chatter_post");
    expect(t).toContain("INV");
  });

  it("po_to_receipt is read-only three-way match", () => {
    const t = promptPoToReceipt({ purchase_order: "PO00042" });
    expect(t).toContain("PO00042");
    expect(t).toContain("READ-ONLY");
    expect(t).toContain("business_pack_report(pack='inventory')");
  });

  it("customer_onboarding dedups before gated create", () => {
    const t = promptCustomerOnboarding({
      company_name: "Acme",
      email: "a@acme.test",
    });
    expect(t).toContain("Acme");
    expect(t).toContain("Dedup FIRST");
    expect(t).toContain("preview_write");
  });
});

describe("renderCloudPrompt", () => {
  it("renders all seven by name", () => {
    for (const name of CLOUD_V1_PROMPTS) {
      const text = renderCloudPrompt(name, {
        model: "res.partner",
        method: "search",
        requirement: "contacts",
        operation: "write",
        purchase_order: "PO1",
        company_name: "Co",
      });
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(40);
    }
  });
});
