export { canonicalJson } from "./approval/canonical.js";
export {
  type ApprovalTokenStore,
  buildApprovalToken,
  MemoryApprovalStore,
  verifyWriteApproval,
  WRITE_APPROVAL_TTL_MS,
  type WriteApproval,
} from "./approval/token.js";
export { assertDomainList, isDomainList } from "./domain.js";
export { isOdooError, OdooError, type OdooErrorCode } from "./errors.js";
export { FieldPolicy, type FieldPolicyDoc } from "./field-policy.js";
export {
  addCloudV1ToolContracts,
  CLOUD_V1_PYTHON_CONTRACTS,
  type CloudV1ToolContract,
  type CloudV1ToolName,
  cloudV1StructuredContent,
  getCloudV1ToolContract,
  type JsonSchema,
} from "./mcp-contracts.js";
export {
  CLOUD_V1_PROMPTS,
  type CloudV1PromptName,
  PROMPT_CATALOG,
  type PromptDef,
  promptCustomerOnboarding,
  promptDiagnoseFailedOdooCall,
  promptFitGapWorkshop,
  promptInvoiceApprovalChain,
  promptJson2MigrationPlan,
  promptPoToReceipt,
  promptSafeWriteReview,
  renderCloudPrompt,
} from "./prompts.js";
export {
  CLOUD_V1_RESOURCES,
  type OdooResourceContext,
  readCloudV1Resource,
} from "./resources.js";
export {
  buildTextQueryDomain,
  DEFAULT_MAX_SMART_FIELDS,
  rankRelevantFields,
  selectSmartFields,
} from "./smart-fields.js";
export { type BuildDomainResult, buildDomain, type DomainConditionInput } from "./tools/domain.js";
export {
  ABS_MAX_LIMIT,
  BULK_READ_ID_CAP,
  clampLimit,
  DEFAULT_PREVIEW_SLICE,
  fail,
  fieldsGet,
  MAX_SEARCH_LIMIT,
  normalizeDomainInput,
  PREVIEW_SLICE_MED,
  resolveReadFields,
  type ToolResult,
  validateModelName,
} from "./tools/helpers.js";
export {
  ABS_MAX_ATTACHMENT_BYTES,
  aggregateRecords,
  DEFAULT_MAX_ATTACHMENT_BYTES,
  diagnoseAccess,
  diagnoseOdooCall,
  getOdooProfile,
  inspectModelRelationships,
  PHASE2_TOOLS,
  readAttachment,
  schemaCatalog,
  searchEmployee,
  searchHolidays,
} from "./tools/phase2.js";
export {
  buildDomainTool,
  getModelFields,
  healthCheck,
  listModels,
  readRecord,
  searchRecords,
} from "./tools/read.js";
export {
  ABS_MAX_REPORT_BYTES,
  BUSINESS_PACKS,
  businessPackReport,
  businessPackReportLive,
  classifyMethodSafety,
  DEFAULT_MAX_REPORT_BYTES,
  fitGapReport,
  generateJson2Payload,
  PHASE4_TOOLS,
  renderReport,
  upgradeRiskReport,
} from "./tools/reports.js";
export {
  chatterPost,
  executeApprovedWrite,
  executeMethod,
  PHASE3_TOOLS,
  previewWrite,
  validateWrite,
} from "./tools/write.js";
export {
  buildJson2Payload,
  type Json2Config,
  Json2Transport,
} from "./transport/json2.js";
export { FIELDS_GET_ATTRIBUTES, JSON2_POSITIONAL_ARG_MAP } from "./transport/json2-map.js";
export type {
  ConnectionConfig,
  OdooTransport,
  OdooVersion,
} from "./transport/types.js";
export { assertSafeOdooUrl, normalizeOdooOrigin } from "./transport/url-policy.js";
export { type XmlRpcConfig, XmlRpcTransport } from "./transport/xmlrpc.js";

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
