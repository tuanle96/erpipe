import { describe, expect, it } from "vitest";
import {
  CLOUD_V1_PYTHON_CONTRACTS,
  addCloudV1ToolContracts,
  cloudV1StructuredContent,
  getCloudV1ToolContract,
} from "./mcp-contracts.js";

describe("Python D14 MCP contracts", () => {
  it("pins all 23 tool schemas and both structured-content modes", () => {
    const contracts = Object.values(CLOUD_V1_PYTHON_CONTRACTS.tools);
    expect(contracts).toHaveLength(23);
    expect(contracts.filter((item) => item.structured_content_mode === "direct")).toHaveLength(11);
    expect(contracts.filter((item) => item.structured_content_mode === "wrapped")).toHaveLength(12);
    expect(contracts.every((item) => item.input_schema_sha256.length === 64)).toBe(true);
    expect(contracts.every((item) => item.output_schema_sha256.length === 64)).toBe(true);
  });

  it("replaces tools/list schemas from the Python manifest", () => {
    const names = Object.keys(CLOUD_V1_PYTHON_CONTRACTS.tools);
    const result = addCloudV1ToolContracts({
      tools: [
        ...names.map((name) => ({ name, inputSchema: {}, outputSchema: {} })),
        { name: "ping", inputSchema: {} },
      ],
    }) as { tools: Record<string, unknown>[] };
    for (const [index, name] of names.entries()) {
      const contract = getCloudV1ToolContract(name)!;
      expect(result.tools[index]?.inputSchema).toBe(contract.input_schema);
      expect(result.tools[index]?.outputSchema).toBe(contract.output_schema);
    }
    expect(result.tools.at(-1)).toEqual({ name: "ping", inputSchema: {} });
  });

  it("emits direct and wrapped structuredContent exactly", () => {
    const payload = { success: true, result: [] };
    expect(cloudV1StructuredContent("health_check", payload)).toEqual(payload);
    expect(cloudV1StructuredContent("generate_json2_payload", payload)).toEqual({
      result: payload,
    });
  });
});
