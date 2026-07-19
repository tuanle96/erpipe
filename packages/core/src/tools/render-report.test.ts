import { describe, expect, it } from "vitest";
import { renderReport } from "./reports.js";
import type { OdooTransport } from "../transport/types.js";

function mockTransport(handlers: {
  search_read?: unknown;
  _render_qweb_pdf?: unknown;
}): OdooTransport {
  return {
    kind: "xmlrpc",
    async executeKw(_m, method) {
      if (method === "search_read") return handlers.search_read ?? [];
      if (method === "_render_qweb_pdf") return handlers._render_qweb_pdf ?? null;
      if (method === "render") return handlers._render_qweb_pdf ?? null;
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

describe("renderReport", () => {
  it("renders PDF base64 for a resolved report", async () => {
    const t = mockTransport({
      search_read: [
        {
          id: 1,
          name: "Quotation / Order",
          report_name: "sale.report_saleorder",
          report_type: "qweb-pdf",
        },
      ],
      // "PDF" as base64-ish short string
      _render_qweb_pdf: ["JVBERi0x", "pdf"],
    });
    const res = await renderReport(t, {
      model: "sale.order",
      record_id: 42,
    });
    expect(res.success).toBe(true);
    expect(res.datas_included).toBe(true);
    expect((res.result as { datas: string }).datas).toBe("JVBERi0x");
    expect(res.report_name).toBe("sale.report_saleorder");
  });

  it("rejects oversized PDF payload", async () => {
    const huge = "A".repeat(10_000_000);
    const t = mockTransport({
      search_read: [
        { id: 1, report_name: "sale.report_saleorder", report_type: "qweb-pdf" },
      ],
      _render_qweb_pdf: [huge, "pdf"],
    });
    const res = await renderReport(t, {
      model: "sale.order",
      record_id: 1,
      max_bytes: 1000,
    });
    expect(res.success).toBe(false);
    expect(res.code).toBe("REPORT_TOO_LARGE");
  });
});
