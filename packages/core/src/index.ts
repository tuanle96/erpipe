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
  readAttachment,
  DEFAULT_MAX_ATTACHMENT_BYTES,
  ABS_MAX_ATTACHMENT_BYTES,
  PHASE2_TOOLS,
} from "./tools/phase2.js";
export { buildDomain, type DomainConditionInput, type BuildDomainResult } from "./tools/domain.js";
export {
  validateModelName,
  clampLimit,
  normalizeDomainInput,
  resolveReadFields,
  fieldsGet,
  fail,
  MAX_SEARCH_LIMIT,
  ABS_MAX_LIMIT,
  BULK_READ_ID_CAP,
  DEFAULT_PREVIEW_SLICE,
  PREVIEW_SLICE_MED,
  type ToolResult,
} from "./tools/helpers.js";
export {
  selectSmartFields,
  rankRelevantFields,
  buildTextQueryDomain,
  DEFAULT_MAX_SMART_FIELDS,
} from "./smart-fields.js";
export { FieldPolicy, type FieldPolicyDoc } from "./field-policy.js";
export {
  CLOUD_V1_PYTHON_CONTRACTS,
  addCloudV1ToolContracts,
  cloudV1StructuredContent,
  getCloudV1ToolContract,
  type CloudV1ToolContract,
  type CloudV1ToolName,
  type JsonSchema,
} from "./mcp-contracts.js";
export {
  CLOUD_V1_RESOURCES,
  readCloudV1Resource,
  type OdooResourceContext,
} from "./resources.js";
export {
  MemoryApprovalStore,
  WRITE_APPROVAL_TTL_MS,
  buildApprovalToken,
  verifyWriteApproval,
  type ApprovalTokenStore,
  type WriteApproval,
} from "./approval/token.js";
export {
  previewWrite,
  validateWrite,
  executeApprovedWrite,
  chatterPost,
  executeMethod,
  PHASE3_TOOLS,
} from "./tools/write.js";
export {
  generateJson2Payload,
  upgradeRiskReport,
  fitGapReport,
  businessPackReport,
  businessPackReportLive,
  renderReport,
  classifyMethodSafety,
  BUSINESS_PACKS,
  DEFAULT_MAX_REPORT_BYTES,
  ABS_MAX_REPORT_BYTES,
  PHASE4_TOOLS,
} from "./tools/reports.js";
export {
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
  type CloudV1PromptName,
  type PromptDef,
} from "./prompts.js";

/** Cloud tool surface: D14 (23) + read_attachment + render_report. */
export const CLOUD_V1_TOOL_COUNT = 25;
export const CLOUD_V1_PROMPT_COUNT = 7;
export const PHASE1_TOOLS = [
  "list_models",
  "get_model_fields",
  "search_records",
  "read_record",
  "build_domain",
  "health_check",
] as const;
