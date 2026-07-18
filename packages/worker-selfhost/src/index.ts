/**
 * ERPipe self-host Worker — OAuth + /{slug}/mcp + Phase-1 tools.
 */
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import {
  PHASE1_TOOLS,
  Json2Transport,
  listModels,
  getModelFields,
  searchRecords,
  readRecord,
  healthCheck,
  buildDomainTool,
  type OdooTransport,
  type DomainConditionInput,
} from "@erpipe/core";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { McpAgent } from "agents/mcp";
import { z } from "zod";
import { createAuthApp } from "./auth";
import { mcpPath, parseSlugFromPath } from "./routes";

export type Props = {
  userId: string;
  email: string;
  slug: string;
  connectionId: string;
};

export type Env = {
  OAUTH_KV: KVNamespace;
  MCP_OBJECT: DurableObjectNamespace;
  CONNECTION_SLUG?: string;
  ODOO_URL?: string;
  ODOO_DB?: string;
  ODOO_API_KEY?: string;
  ODOO_USERNAME?: string;
  ODOO_LOCALE?: string;
  ODOO_JSON2_DB_HEADER?: string;
};

function connectionSlug(env: Env): string {
  const s = (env.CONNECTION_SLUG ?? "default").toLowerCase().trim();
  return s || "default";
}

function makeTransport(env: Env): OdooTransport | null {
  const url = env.ODOO_URL?.trim();
  const db = env.ODOO_DB?.trim();
  const apiKey = env.ODOO_API_KEY?.trim();
  if (!url || !db || !apiKey) return null;
  return new Json2Transport({
    url,
    db,
    apiKey,
    locale: env.ODOO_LOCALE,
    json2DbHeader: env.ODOO_JSON2_DB_HEADER !== "0",
    allowHttp: true,
  });
}

export class SelfhostMcp extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "erpipe-selfhost",
    version: "0.1.0",
  });

  async init() {
    const transport = makeTransport(this.env);

    this.server.tool(
      "ping",
      "Health: bound OAuth props + whether Odoo transport is configured",
      {},
      async () =>
        textResult({
          ok: true,
          product: "erpipe-selfhost",
          slug: this.props?.slug ?? null,
          connectionId: this.props?.connectionId ?? null,
          odoo_configured: transport !== null,
          phase1_tools: PHASE1_TOOLS,
        }),
    );

    this.server.tool(
      "health_check",
      "Report this MCP server's non-secret runtime safety posture",
      {},
      async () =>
        textResult(
          healthCheck({
            name: "erpipe-selfhost",
            toolCount: PHASE1_TOOLS.length + 1,
            writesEnabled: false,
            transport: transport ? "json2" : null,
          }),
        ),
    );

    this.server.tool(
      "list_models",
      "List Odoo models with optional name filtering",
      {
        query: z.string().optional(),
        limit: z.number().int().positive().optional(),
      },
      async ({ query, limit }) => {
        if (!transport) return noOdoo();
        return textResult(await listModels(transport, { query, limit }));
      },
    );

    this.server.tool(
      "get_model_fields",
      "Get field metadata for a specific Odoo model",
      {
        model: z.string(),
        field_names: z.array(z.string()).optional(),
        relevance: z.string().optional(),
        max_fields: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await getModelFields(transport, args));
      },
    );

    this.server.tool(
      "search_records",
      "Search Odoo records with read-only search_read",
      {
        model: z.string(),
        domain: z.unknown().optional(),
        fields: z.array(z.string()).optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        order: z.string().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await searchRecords(transport, args));
      },
    );

    this.server.tool(
      "read_record",
      "Read a single Odoo record by model and ID",
      {
        model: z.string(),
        record_id: z.number().int().positive(),
        fields: z.array(z.string()).optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await readRecord(transport, args));
      },
    );

    this.server.tool(
      "build_domain",
      "Build and validate an Odoo domain from structured conditions",
      {
        conditions: z.array(
          z.object({
            field: z.string(),
            operator: z.string(),
            value: z.unknown(),
          }),
        ),
        logical_operator: z.string().optional(),
      },
      async ({ conditions, logical_operator }) =>
        textResult(
          buildDomainTool({
            conditions: conditions as DomainConditionInput[],
            logical_operator,
          }),
        ),
    );
  }
}

function textResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
  };
}

function noOdoo() {
  return textResult({
    success: false,
    error:
      "Odoo not configured. Set ODOO_URL, ODOO_DB, ODOO_API_KEY (JSON-2) on the Worker.",
  });
}

function createGuardedApiHandler(expectedSlug: string) {
  const inner = SelfhostMcp.serve("/:slug/mcp");

  return {
    async fetch(
      request: Request,
      env: Env,
      ctx: ExecutionContext & { props?: Props },
    ) {
      const pathSlug = parseSlugFromPath(new URL(request.url).pathname);
      if (!pathSlug || pathSlug !== expectedSlug) {
        return new Response("Not Found", { status: 404 });
      }

      const bound = ctx.props;
      if (bound?.slug && bound.slug !== pathSlug) {
        return new Response(
          JSON.stringify({
            error: "forbidden",
            message: "Token connection does not match URL slug",
            grant_slug: bound.slug,
            path_slug: pathSlug,
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        );
      }

      return inner.fetch(request, env, ctx);
    },
  };
}

function buildProvider(env: Env) {
  const slug = connectionSlug(env);
  return new OAuthProvider({
    apiRoute: [mcpPath(slug)],
    apiHandler: createGuardedApiHandler(slug) as any,
    defaultHandler: createAuthApp(slug) as any,
    authorizeEndpoint: "/authorize",
    tokenEndpoint: "/token",
    clientRegistrationEndpoint: "/register",
    allowPlainPKCE: false,
    allowImplicitFlow: false,
    accessTokenTTL: 3600,
    refreshTokenTTL: 2592000,
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return buildProvider(env).fetch(request, env, ctx);
  },
};
