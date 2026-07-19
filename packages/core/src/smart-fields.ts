/**
 * Port of Python field_ranking.py — smart field selection + free-text query domains.
 */

export const DEFAULT_MAX_SMART_FIELDS = 15;
export const DEFAULT_MAX_RELEVANT_FIELDS = 30;
export const DEFAULT_MAX_QUERY_FIELDS = 5;

const TECHNICAL_FIELD_NAMES = new Set([
  "id",
  "create_uid",
  "create_date",
  "write_uid",
  "write_date",
  "__last_update",
  "display_name",
]);

const TECHNICAL_PREFIXES = ["message_", "activity_", "website_message_", "website_meta_"];

const PRIORITY: Record<string, number> = {
  name: 100,
  code: 95,
  ref: 95,
  default_code: 95,
  barcode: 90,
  login: 90,
  email: 90,
  phone: 85,
  mobile: 85,
  state: 85,
  status: 85,
  stage_id: 85,
  kanban_state: 80,
  active: 80,
  partner_id: 75,
  user_id: 75,
  employee_id: 75,
  company_id: 70,
  currency_id: 70,
  amount_total: 70,
  amount_untaxed: 65,
  price_unit: 65,
  price_total: 65,
  quantity: 60,
  product_id: 60,
  product_uom_id: 55,
  date: 55,
  date_order: 55,
  date_invoice: 55,
  invoice_date: 55,
  date_deadline: 55,
  date_start: 55,
  date_end: 55,
  scheduled_date: 55,
};

const TEXT_QUERY_PRIORITY = [
  "name",
  "display_name",
  "complete_name",
  "default_code",
  "ref",
  "code",
  "email",
  "phone",
  "mobile",
  "barcode",
  "login",
];

function isTechnical(name: string): boolean {
  if (TECHNICAL_FIELD_NAMES.has(name)) return true;
  return TECHNICAL_PREFIXES.some((p) => name.startsWith(p));
}

function isSkipMeta(meta: Record<string, unknown>): boolean {
  if (meta.automatic) return true;
  const fieldType = String(meta.type ?? "");
  if (fieldType === "binary") return true;
  if (meta.compute && meta.store === false) return true;
  return false;
}

function smartScore(name: string, meta: Record<string, unknown>): number {
  if (PRIORITY[name] != null) return PRIORITY[name]!;
  if (meta.tracking) return 50;
  const t = String(meta.type ?? "");
  if (name.endsWith("_id") && t === "many2one") return 45;
  if (t === "datetime" || t === "date" || name.includes("date")) return 40;
  if (t === "selection" || t === "boolean") return 35;
  if (t === "char" || t === "text" || t === "html") return 25;
  if (t === "integer" || t === "float" || t === "monetary") return 25;
  if (t === "one2many" || t === "many2many") return 5;
  return 10;
}

export function selectSmartFields(
  fieldsMetadata: Record<string, unknown>,
  maxFields = DEFAULT_MAX_SMART_FIELDS,
  alwaysInclude: string[] = [],
): string[] {
  if (maxFields <= 0) return [];
  const forced = ["id"];
  for (const name of alwaysInclude) {
    if (!forced.includes(name) && name in fieldsMetadata) forced.push(name);
  }
  const candidates: [number, string][] = [];
  for (const [name, raw] of Object.entries(fieldsMetadata)) {
    if (forced.includes(name)) continue;
    if (isTechnical(name)) continue;
    if (!raw || typeof raw !== "object") continue;
    const meta = raw as Record<string, unknown>;
    if (isSkipMeta(meta)) continue;
    candidates.push([smartScore(name, meta), name]);
  }
  candidates.sort((a, b) => b[0] - a[0] || a[1].localeCompare(b[1]));
  const selected = [...forced];
  for (const [, name] of candidates) {
    if (selected.length >= maxFields) break;
    selected.push(name);
  }
  return selected;
}

export function rankRelevantFields(
  fieldsMetadata: Record<string, unknown>,
  maxFields = DEFAULT_MAX_RELEVANT_FIELDS,
): { field: string; score: number }[] {
  if (maxFields <= 0) return [];
  const scored: { field: string; score: number }[] = [];
  for (const [name, raw] of Object.entries(fieldsMetadata)) {
    if (!raw || typeof raw !== "object") continue;
    if (isTechnical(name)) continue;
    const meta = raw as Record<string, unknown>;
    if (isSkipMeta(meta)) continue;
    let score = smartScore(name, meta);
    if (meta.required) score += 30;
    if (meta.searchable) score += 5;
    scored.push({ field: name, score });
  }
  scored.sort((a, b) => b.score - a.score || a.field.localeCompare(b.field));
  return scored.slice(0, maxFields);
}

export function selectTextQueryFields(
  fieldsMetadata: Record<string, unknown>,
  maxFields = DEFAULT_MAX_QUERY_FIELDS,
): string[] {
  if (maxFields <= 0) return [];
  const searchable: Record<string, Record<string, unknown>> = {};
  for (const [name, raw] of Object.entries(fieldsMetadata)) {
    if (!raw || typeof raw !== "object") continue;
    const meta = raw as Record<string, unknown>;
    const t = String(meta.type ?? "");
    if (t !== "char" && t !== "text") continue;
    const searchableFlag = meta.searchable ?? meta.store ?? true;
    if (!searchableFlag) continue;
    searchable[name] = meta;
  }
  let selected = TEXT_QUERY_PRIORITY.filter((n) => n in searchable);
  if (!selected.length && Object.keys(searchable).length) {
    selected = Object.keys(searchable).sort(
      (a, b) => smartScore(b, searchable[b]!) - smartScore(a, searchable[a]!) || a.localeCompare(b),
    );
  }
  return selected.slice(0, maxFields);
}

export function buildTextQueryDomain(
  query: string,
  fieldsMetadata: Record<string, unknown> | null = null,
  maxFields = DEFAULT_MAX_QUERY_FIELDS,
): { domain: unknown[]; fieldsUsed: string[] } {
  const cleaned = String(query).trim();
  if (!cleaned) throw new Error("query must be a non-empty string");
  let fieldNames = selectTextQueryFields(fieldsMetadata ?? {}, maxFields);
  if (!fieldNames.length) fieldNames = ["name"];
  const domain: unknown[] = [];
  for (let i = 0; i < fieldNames.length - 1; i++) domain.push("|");
  for (const f of fieldNames) domain.push([f, "ilike", cleaned]);
  return { domain, fieldsUsed: fieldNames };
}
