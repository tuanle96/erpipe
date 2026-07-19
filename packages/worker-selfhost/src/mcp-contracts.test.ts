import { getCloudV1ToolContract } from "@erpipe/core";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import { installCloudV1ContractCompatibility } from "./mcp-contracts";

describe("self-host Python contract compatibility", () => {
  const closers: Array<{ close: () => Promise<void> }> = [];
  afterEach(async () => {
    await Promise.all(closers.splice(0).map((item) => item.close()));
  });

  it("publishes exact schemas and emits direct/wrapped structured content", async () => {
    const server = new McpServer({ name: "selfhost-test", version: "1.0.0" });
    installCloudV1ContractCompatibility(server);
    const health = server.tool("health_check", {}, async () => ({
      content: [{ type: "text", text: '{"success":true,"server":{}}' }],
    }));
    server.tool("generate_json2_payload", {}, async () => ({
      content: [{ type: "text", text: '{"success":true,"tool":"json2"}' }],
    }));
    await expect(
      (health as unknown as { handler: () => Promise<unknown> }).handler(),
    ).resolves.toMatchObject({
      structuredContent: { success: true, server: {} },
    });

    const client = new Client({ name: "selfhost-client", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    closers.push(client, server);
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const tools = await client.listTools();
    for (const tool of tools.tools) {
      const contract = getCloudV1ToolContract(tool.name)!;
      expect(tool.inputSchema).toEqual(contract.input_schema);
      expect(tool.outputSchema).toEqual(contract.output_schema);
    }
    const direct = await client.callTool({
      name: "health_check",
      arguments: {},
    });
    expect(direct.structuredContent).toEqual({ success: true, server: {} });
    const wrapped = await client.callTool({
      name: "generate_json2_payload",
      arguments: {},
    });
    expect(wrapped.structuredContent).toEqual({
      result: { success: true, tool: "json2" },
    });
  });
});
