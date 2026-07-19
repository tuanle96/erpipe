import {
  addCloudV1ToolContracts,
  cloudV1StructuredContent,
  getCloudV1ToolContract,
} from "@erpipe/core";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

type Handler = (...args: unknown[]) => unknown | Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function withStructuredContent(name: string, result: unknown): unknown {
  if (!getCloudV1ToolContract(name) || !isRecord(result)) return result;
  const first = Array.isArray(result.content) ? result.content[0] : null;
  if (!isRecord(first) || typeof first.text !== "string") return result;
  try {
    const payload = JSON.parse(first.text) as unknown;
    return {
      ...result,
      structuredContent: cloudV1StructuredContent(name, payload),
    };
  } catch {
    return result;
  }
}

/** Pin self-host tools/list and tools/call to the exported Python D14 contracts. */
export function installCloudV1ContractCompatibility(server: McpServer): void {
  const toolRegistry = server as unknown as {
    tool: (name: string, ...rest: unknown[]) => unknown;
  };
  const originalTool = toolRegistry.tool.bind(server);
  toolRegistry.tool = (name: string, ...rest: unknown[]) => {
    const callback = rest.at(-1);
    if (typeof callback !== "function") return originalTool(name, ...rest);
    const head = rest.slice(0, -1);
    const wrapped = async (...args: unknown[]) =>
      withStructuredContent(name, await callback(...args));
    return originalTool(name, ...head, wrapped);
  };

  const registry = server.server as unknown as {
    setRequestHandler: (schema: unknown, handler: Handler) => unknown;
  };
  const originalSetRequestHandler = registry.setRequestHandler.bind(registry);
  registry.setRequestHandler = (schema, handler) => {
    if (schema !== ListToolsRequestSchema) {
      return originalSetRequestHandler(schema, handler);
    }
    registry.setRequestHandler = originalSetRequestHandler;
    return originalSetRequestHandler(schema, async (...args: unknown[]) =>
      addCloudV1ToolContracts(await handler(...args)),
    );
  };
}
