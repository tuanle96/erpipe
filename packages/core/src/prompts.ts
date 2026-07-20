/**
 * Cloud v1 MCP prompts (D14: 7 prompts).
 *
 * Port of mcp-odoo prompts.py + prompts_workflows.py — only prompts whose
 * referenced tools are inside the 23-tool surface. Excluded until tools land:
 * custom_module_audit, expense_claim_review, accounting_close_checklist,
 * pre_migration_data_quality.
 */

export type PromptDef = {
  name: string;
  description: string;
  /** Argument names for MCP schema (all optional unless listed required). */
  args: { name: string; description: string; required: boolean }[];
};

export const CLOUD_V1_PROMPTS = [
  "diagnose_failed_odoo_call",
  "fit_gap_workshop",
  "json2_migration_plan",
  "safe_write_review",
  "invoice_approval_chain",
  "po_to_receipt",
  "customer_onboarding",
] as const;

export type CloudV1PromptName = (typeof CLOUD_V1_PROMPTS)[number];

export const PROMPT_CATALOG: PromptDef[] = [
  {
    name: "diagnose_failed_odoo_call",
    description: "Guide an assistant through diagnosing a failed Odoo model call.",
    args: [
      { name: "model", description: "Odoo model technical name", required: true },
      { name: "method", description: "Method that failed", required: true },
      { name: "error", description: "Observed error text", required: false },
    ],
  },
  {
    name: "fit_gap_workshop",
    description: "Structure an Odoo fit/gap workshop from raw requirements.",
    args: [{ name: "requirement", description: "Business requirement text", required: true }],
  },
  {
    name: "json2_migration_plan",
    description: "Plan migration from XML-RPC/JSON-RPC style calls to Odoo JSON-2.",
    args: [
      { name: "model", description: "Odoo model technical name", required: true },
      { name: "method", description: "Method to migrate", required: true },
    ],
  },
  {
    name: "safe_write_review",
    description: "Review a proposed create/write/unlink before execution.",
    args: [
      { name: "model", description: "Odoo model technical name", required: true },
      { name: "operation", description: "create | write | unlink", required: true },
    ],
  },
  {
    name: "invoice_approval_chain",
    description: "Find, validate, and gated-post draft customer invoices with human checkpoints.",
    args: [
      { name: "journal", description: "Optional journal filter", required: false },
      { name: "date_from", description: "Optional date from", required: false },
      { name: "date_to", description: "Optional date to", required: false },
    ],
  },
  {
    name: "po_to_receipt",
    description:
      "Three-way match a purchase order against its receipt and vendor bill; flag discrepancies.",
    args: [
      {
        name: "purchase_order",
        description: "PO name or id reference",
        required: true,
      },
    ],
  },
  {
    name: "customer_onboarding",
    description:
      "Dedup-check then create a customer with contacts and payment terms via the write gate.",
    args: [
      { name: "company_name", description: "Customer company name", required: true },
      { name: "email", description: "Optional email", required: false },
      { name: "vat", description: "Optional VAT/tax id", required: false },
    ],
  },
];

function empty(v: string | undefined | null, fallback: string): string {
  const s = (v ?? "").trim();
  return s || fallback;
}

export function promptDiagnoseFailedOdooCall(args: {
  model: string;
  method: string;
  error?: string;
}): string {
  return (
    "Diagnose this Odoo call without retrying destructive methods first.\n" +
    `Model: ${args.model}\n` +
    `Method: ${args.method}\n` +
    `Observed error: ${empty(args.error, "<not provided>")}\n\n` +
    "Use model_facts for the model, then diagnose_odoo_call / diagnose_access / " +
    "inspect_model_relationships before execute_method. Preserve Odoo error details, " +
    "but do not expose secrets."
  );
}

export function promptFitGapWorkshop(args: { requirement: string }): string {
  return (
    "Classify this requirement into standard Odoo, configuration, Studio, " +
    "custom module, avoid, or unknown.\n" +
    `Requirement: ${args.requirement}\n\n` +
    "Use fit_gap_report first, then model_facts (or schema_catalog) for evidence. " +
    "Recommend the smallest Odoo-native implementation path."
  );
}

export function promptJson2MigrationPlan(args: { model: string; method: string }): string {
  return (
    "Prepare a JSON-2 migration plan for this Odoo call.\n" +
    `Model: ${args.model}\n` +
    `Method: ${args.method}\n\n` +
    "Use generate_json2_payload and upgrade_risk_report. Call out named " +
    "arguments, per-call transaction behavior, database header expectations, " +
    "and destructive-method safeguards."
  );
}

export function promptSafeWriteReview(args: { model: string; operation: string }): string {
  return (
    "Review this proposed Odoo write before any execution.\n" +
    `Model: ${args.model}\n` +
    `Operation: ${args.operation}\n\n` +
    "Use preview_write and validate_write. Only execute through " +
    "execute_approved_write when the approval token matches, confirm=true is " +
    "explicit, and the runtime has ODOO_MCP_ENABLE_WRITES=1."
  );
}

export function promptInvoiceApprovalChain(
  args: { journal?: string; date_from?: string; date_to?: string } = {},
): string {
  return (
    "Process draft customer invoices safely. Requires the Accounting/Invoicing " +
    "module — confirm with business_pack_report(pack='accounting') and stop with " +
    "a clear message if it is not installed.\n" +
    `Journal filter: ${empty(args.journal, "<all sales journals>")}\n` +
    `Date range: ${empty(args.date_from, "<unbounded>")} to ${empty(args.date_to, "<unbounded>")}\n\n` +
    "Steps:\n" +
    "0. model_facts(models=['account.move'], intent='search') once — use returned " +
    "field names and selection keys only.\n" +
    "1. search_records on account.move with domain " +
    "[('move_type','=','out_invoice'),('state','=','draft')] (plus the journal/" +
    "date filters). Use aggregate_records to summarise count and total by partner.\n" +
    "2. For each invoice, read_record to check partner_id, invoice_date, " +
    "invoice_line_ids amounts, and tax totals. Flag anything missing a customer, " +
    "a due date, or with a zero/negative total — do NOT post those.\n" +
    "3. Present the validated batch to the human and STOP for explicit go-ahead " +
    "before any posting.\n" +
    "4. For each approved invoice, post it through the gate: preview_write -> " +
    "validate_write -> execute_approved_write on account.move with the posting " +
    "action your validate step confirmed. Show the diff summary at each " +
    "execute_approved_write and require confirm=true.\n" +
    "5. Record an audit note per posted invoice with chatter_post. Never create, " +
    "write, or unlink invoices with a direct, ungated call — only through the " +
    "gate above."
  );
}

export function promptPoToReceipt(args: { purchase_order: string }): string {
  return (
    "Perform a three-way match for a purchase order. Requires Purchase and " +
    "Inventory — verify with business_pack_report(pack='inventory') and " +
    "model_facts; stop if purchase.order or stock.picking is inaccessible.\n" +
    `Purchase order: ${args.purchase_order}\n\n` +
    "Steps:\n" +
    "0. model_facts(models=['purchase.order','stock.picking','account.move'], " +
    "intent='search') once.\n" +
    "1. read_record on purchase.order for ordered lines (product, qty, price_unit) " +
    "and state.\n" +
    "2. search_records on stock.picking linked to the PO for received quantities; " +
    "search_records on account.move (move_type='in_invoice') for the vendor bill " +
    "lines.\n" +
    "3. Compare ordered vs received vs billed quantity and price per line. Build a " +
    "discrepancy table (over-receipt, short-receipt, price variance, untaxed vs " +
    "taxed mismatch).\n" +
    "4. This workflow is READ-ONLY: report the discrepancies and recommended " +
    "action to the human. Do NOT confirm receipts or post bills here — if a " +
    "correction is approved, hand off to invoice_approval_chain or the gated " +
    "write tools (preview_write -> validate_write -> execute_approved_write) in a " +
    "separate, explicitly confirmed step."
  );
}

export function promptCustomerOnboarding(args: {
  company_name: string;
  email?: string;
  vat?: string;
}): string {
  return (
    "Onboard a new customer without creating duplicates. Core res.partner is " +
    "always available; payment terms need Accounting — check with model_facts " +
    "for account.payment.term before referencing it.\n" +
    `Company: ${args.company_name}\n` +
    `Email: ${empty(args.email, "<none>")}\n` +
    `VAT: ${empty(args.vat, "<none>")}\n\n` +
    "Steps:\n" +
    "0. model_facts(models=['res.partner','account.payment.term'], intent='write') " +
    "once; use only returned fields.\n" +
    "1. Dedup FIRST: search_records on res.partner with a free-text query on the " +
    "company name, and separately by email/vat when provided. If a confident " +
    "match exists, STOP and report it instead of creating a duplicate.\n" +
    "2. If no match, propose the partner values (name, is_company=true, email, " +
    "vat, customer_rank, property_payment_term_id) plus any child contacts. " +
    "Present them to the human for confirmation.\n" +
    "3. Create through the gate: preview_write -> validate_write -> " +
    "execute_approved_write on res.partner (use values_list for the parent plus " +
    "child contacts in one reviewed batch where possible). Require confirm=true " +
    "and show the diff. Never create partners with a direct, ungated write."
  );
}

/** Render a cloud v1 prompt by name; returns null if unknown. */
export function renderCloudPrompt(
  name: string,
  args: Record<string, string | undefined> = {},
): string | null {
  switch (name) {
    case "diagnose_failed_odoo_call":
      return promptDiagnoseFailedOdooCall({
        model: args.model ?? "",
        method: args.method ?? "",
        error: args.error,
      });
    case "fit_gap_workshop":
      return promptFitGapWorkshop({ requirement: args.requirement ?? "" });
    case "json2_migration_plan":
      return promptJson2MigrationPlan({
        model: args.model ?? "",
        method: args.method ?? "",
      });
    case "safe_write_review":
      return promptSafeWriteReview({
        model: args.model ?? "",
        operation: args.operation ?? "",
      });
    case "invoice_approval_chain":
      return promptInvoiceApprovalChain({
        journal: args.journal,
        date_from: args.date_from,
        date_to: args.date_to,
      });
    case "po_to_receipt":
      return promptPoToReceipt({ purchase_order: args.purchase_order ?? "" });
    case "customer_onboarding":
      return promptCustomerOnboarding({
        company_name: args.company_name ?? "",
        email: args.email,
        vat: args.vat,
      });
    default:
      return null;
  }
}
