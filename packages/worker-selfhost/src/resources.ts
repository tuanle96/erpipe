import {
  CLOUD_V1_RESOURCES,
  readCloudV1Resource,
  type FieldPolicy,
  type OdooTransport,
} from "@erpipe/core";
import { ResourceTemplate, type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const RESOURCE_METADATA = {
  mimeType: "application/json",
  annotations: { audience: ["assistant" as const], priority: 0.8 },
};

export function registerResources(
  server: McpServer,
  transport: OdooTransport | null,
  fieldPolicy: FieldPolicy,
): void {
  const read = async (uri: URL) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: await readCloudV1Resource(uri, {
          transport,
          fieldPolicy,
          instance: "default",
        }),
      },
    ],
  });

  for (const resource of CLOUD_V1_RESOURCES) {
    const config = { ...RESOURCE_METADATA, description: resource.description };
    if (resource.template) {
      server.registerResource(
        resource.name,
        new ResourceTemplate(resource.uri, { list: undefined }),
        config,
        async (uri) => read(uri),
      );
    } else {
      server.registerResource(resource.name, resource.uri, config, read);
    }
  }
}
