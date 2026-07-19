import {
  CLOUD_V1_PYTHON_CONTRACTS,
  type CloudV1ToolName,
} from "./cloud-v1-python-contracts.generated.js";

export type JsonSchema = Record<string, unknown>;

export type CloudV1ToolContract = {
  input_schema: JsonSchema;
  input_schema_sha256: string;
  output_schema: JsonSchema;
  output_schema_sha256: string;
  runtime_verified: { success: boolean; error: boolean };
  structured_content_mode: "direct" | "wrapped";
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function getCloudV1ToolContract(name: string): CloudV1ToolContract | null {
  if (!Object.hasOwn(CLOUD_V1_PYTHON_CONTRACTS.tools, name)) return null;
  return CLOUD_V1_PYTHON_CONTRACTS.tools[name as CloudV1ToolName] as CloudV1ToolContract;
}

/** Apply the Python D14 input/output schemas to an MCP tools/list response. */
export function addCloudV1ToolContracts(result: unknown): unknown {
  if (!isRecord(result) || !Array.isArray(result.tools)) return result;
  return {
    ...result,
    tools: result.tools.map((tool) => {
      if (!isRecord(tool) || typeof tool.name !== "string") return tool;
      const contract = getCloudV1ToolContract(tool.name);
      if (!contract) return tool;
      return {
        ...tool,
        inputSchema: contract.input_schema,
        outputSchema: contract.output_schema,
      };
    }),
  };
}

/** Build structuredContent matching the exact Python outputSchema for a tool. */
export function cloudV1StructuredContent(name: string, payload: unknown): Record<string, unknown> {
  const contract = getCloudV1ToolContract(name);
  if (contract?.structured_content_mode === "direct" && isRecord(payload)) {
    return payload;
  }
  return { result: payload };
}

export {
  CLOUD_V1_PYTHON_CONTRACTS,
  type CloudV1ToolName,
} from "./cloud-v1-python-contracts.generated.js";
