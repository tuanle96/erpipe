/** Port of Python diagnostics.JSON2_POSITIONAL_ARG_MAP */

export const JSON2_POSITIONAL_ARG_MAP: Record<string, readonly string[]> = {
  search: ["domain", "offset", "limit", "order"],
  search_count: ["domain", "limit"],
  search_read: ["domain", "fields", "offset", "limit", "order"],
  read: ["ids", "fields", "load"],
  write: ["ids", "vals"],
  unlink: ["ids"],
  create: ["vals_list"],
  name_search: ["name", "domain", "operator", "limit"],
  fields_get: ["allfields", "attributes"],
  read_group: ["domain", "fields", "groupby", "offset", "limit", "orderby", "lazy"],
  formatted_read_group: ["domain", "groupby", "aggregates", "having", "offset", "limit", "order"],
  message_post: ["ids"],
};

export const FIELDS_GET_ATTRIBUTES = [
  "string",
  "help",
  "type",
  "required",
  "readonly",
  "relation",
  "selection",
  "store",
  "searchable",
] as const;
