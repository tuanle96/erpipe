/**
 * Business pack definitions for business_pack_report.
 * Data only — tool logic lives in reports.ts.
 */

export type BusinessPackDefinition = {
  modules: string[];
  models: string[];
  safe_reports: string[];
};

export const BUSINESS_PACKS: Record<string, BusinessPackDefinition> = {
  sales: {
    modules: ["sale", "sale_management", "crm"],
    models: ["sale.order", "sale.order.line", "res.partner", "product.product"],
    safe_reports: ["quotation_pipeline", "order_status", "customer_activity"],
  },
  crm: {
    modules: ["crm"],
    models: ["crm.lead", "crm.stage", "res.partner", "mail.activity"],
    safe_reports: ["pipeline", "lost_reasons", "activity_backlog"],
  },
  inventory: {
    modules: ["stock", "product"],
    models: ["stock.picking", "stock.move", "stock.quant", "product.product"],
    safe_reports: ["on_hand", "open_transfers", "reordering_attention"],
  },
  accounting: {
    modules: ["account"],
    models: ["account.move", "account.move.line", "account.journal", "res.partner"],
    safe_reports: ["open_invoices", "journal_health", "partner_balances"],
  },
  hr: {
    modules: ["hr", "hr_holidays"],
    models: ["hr.employee", "hr.leave", "hr.leave.report.calendar"],
    safe_reports: ["employee_lookup", "leave_calendar", "leave_status"],
  },
};
