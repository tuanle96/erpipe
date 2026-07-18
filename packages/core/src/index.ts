export { OdooError, isOdooError, type OdooErrorCode } from "./errors.js";
export type {
  ConnectionConfig,
  OdooTransport,
  OdooVersion,
} from "./transport/types.js";
export { assertDomainList, isDomainList } from "./domain.js";
export { canonicalJson } from "./approval/canonical.js";
export {
  Json2Transport,
  buildJson2Payload,
  type Json2Config,
} from "./transport/json2.js";
export { XmlRpcTransport, type XmlRpcConfig } from "./transport/xmlrpc.js";
export { JSON2_POSITIONAL_ARG_MAP, FIELDS_GET_ATTRIBUTES } from "./transport/json2-map.js";
export { normalizeOdooOrigin, assertSafeOdooUrl } from "./transport/url-policy.js";
export {
  listModels,
  getModelFields,
  searchRecords,
  readRecord,
  healthCheck,
  buildDomainTool,
  type ToolResult,
} from "./tools/read.js";
export {
  getOdooProfile,
  schemaCatalog,
  aggregateRecords,
  searchEmployee,
  searchHolidays,
  diagnoseOdooCall,
  inspectModelRelationships,
  diagnoseAccess,
  PHASE2_TOOLS,
} from "./tools/phase2.js";
export { buildDomain, type DomainConditionInput, type BuildDomainResult } from "./tools/domain.js";
export {
  validateModelName,
  clampLimit,
  normalizeDomainInput,
  resolveReadFields,
  MAX_SEARCH_LIMIT,
  ABS_MAX_LIMIT,
} from "./tools/helpers.js";
export {
  selectSmartFields,
  rankRelevantFields,
  buildTextQueryDomain,
  DEFAULT_MAX_SMART_FIELDS,
} from "./smart-fields.js";

export const CLOUD_V1_TOOL_COUNT = 23;
export const CLOUD_V1_PROMPT_COUNT = 7;
export const PHASE1_TOOLS = [
  "list_models",
  "get_model_fields",
  "search_records",
  "read_record",
  "build_domain",
  "health_check",
] as const;
