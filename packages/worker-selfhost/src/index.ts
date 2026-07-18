/**
 * ERPipe self-host Worker — OAuth + /{slug}/mcp + Phase-1/2 tools.
 */
import OAuthProvider from "@cloudflare/workers-oauth-provider";
import {
  PHASE1_TOOLS,
  PHASE2_TOOLS,
  PHASE3_TOOLS,
  Json2Transport,
  XmlRpcTransport,
  listModels,
  getModelFields,
  searchRecords,
  readRecord,
  healthCheck,
  buildDomainTool,
  getOdooProfile,
  schemaCatalog,
  aggregateRecords,
  searchEmployee,
  searchHolidays,
  diagnoseOdooCall,
  inspectModelRelationships,
  diagnoseAccess,
  previewWrite,
  validateWrite,
  executeApprovedWrite,
  chatterPost,
  executeMethod,
  MemoryApprovalStore,
  FieldPolicy,
  type OdooTransport,
  type DomainConditionInput,
  type WriteApproval,
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
  ODOO_PASSWORD?: string;
  ODOO_TRANSPORT?: string;
  ODOO_LOCALE?: string;
  ODOO_JSON2_DB_HEADER?: string;
  ODOO_MCP_ENABLE_WRITES?: string;
  ODOO_MCP_ALLOW_UNKNOWN_METHODS?: string;
  ODOO_MCP_FIELD_POLICY_JSON?: string;
};

function connectionSlug(env: Env): string {
  const s = (env.CONNECTION_SLUG ?? "default").toLowerCase().trim();
  return s || "default";
}

function makeTransport(env: Env): OdooTransport | null {
  const url = env.ODOO_URL?.trim();
  const db = env.ODOO_DB?.trim();
  if (!url || !db) return null;

  const transportPref = (env.ODOO_TRANSPORT ?? "").toLowerCase();
  const apiKey = env.ODOO_API_KEY?.trim();
  const password = env.ODOO_PASSWORD?.trim() || apiKey;
  const username = env.ODOO_USERNAME?.trim() || "admin";

  const useJson2 =
    transportPref === "json2" ||
    (transportPref !== "xmlrpc" && !!apiKey && !env.ODOO_PASSWORD);

  if (useJson2) {
    if (!apiKey) return null;
    return new Json2Transport({
      url,
      db,
      apiKey,
      locale: env.ODOO_LOCALE,
      json2DbHeader: env.ODOO_JSON2_DB_HEADER !== "0",
      allowHttp: true,
    });
  }

  if (!password) return null;
  return new XmlRpcTransport({
    url,
    db,
    username,
    password,
    locale: env.ODOO_LOCALE,
    allowHttp: true,
  });
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
      "Odoo not configured. Set ODOO_URL, ODOO_DB, and ODOO_PASSWORD (xmlrpc) or ODOO_API_KEY (json2).",
  });
}

export class SelfhostMcp extends McpAgent<Env, Record<string, never>, Props> {
  server = new McpServer({
    name: "erpipe-selfhost",
    version: "0.3.0",
  });

  /** Per-session approval tokens (consume-once). */
  private approvalStore = new MemoryApprovalStore();

  async init() {
    const transport = makeTransport(this.env);
    const writesEnabled =
      this.env.ODOO_MCP_ENABLE_WRITES === "1" ||
      this.env.ODOO_MCP_ENABLE_WRITES === "true";
    const allowUnknown =
      this.env.ODOO_MCP_ALLOW_UNKNOWN_METHODS === "1" ||
      this.env.ODOO_MCP_ALLOW_UNKNOWN_METHODS === "true";
    let fieldPolicy = new FieldPolicy();
    if (this.env.ODOO_MCP_FIELD_POLICY_JSON) {
      try {
        fieldPolicy = FieldPolicy.fromDoc(
          JSON.parse(this.env.ODOO_MCP_FIELD_POLICY_JSON) as object,
        );
      } catch {
        /* ignore invalid policy JSON */
      }
    }
    const allTools = [
      ...PHASE1_TOOLS,
      ...PHASE2_TOOLS,
      ...PHASE3_TOOLS,
      "ping",
    ];

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
          transport: transport?.kind ?? null,
          tools: allTools,
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
            toolCount: allTools.length,
            writesEnabled,
            transport: transport?.kind ?? null,
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
      "Search Odoo records with read-only search_read; optional free-text query",
      {
        model: z.string(),
        domain: z.unknown().optional(),
        fields: z.array(z.string()).optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        order: z.string().optional(),
        query: z.string().optional(),
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

    // --- Phase 2 ---
    this.server.tool(
      "get_odoo_profile",
      "Read a bounded profile of the connected Odoo environment",
      {
        include_modules: z.boolean().optional(),
        module_limit: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await getOdooProfile(transport, args));
      },
    );

    this.server.tool(
      "schema_catalog",
      "Build a bounded Odoo model schema catalog",
      {
        query: z.string().optional(),
        models: z.array(z.string()).optional(),
        include_fields: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await schemaCatalog(transport, args));
      },
    );

    this.server.tool(
      "aggregate_records",
      "Group records server-side and aggregate measures (read_group)",
      {
        model: z.string(),
        group_by: z.array(z.string()),
        measures: z.array(z.string()).optional(),
        domain: z.unknown().optional(),
        lazy: z.boolean().optional(),
        limit: z.number().int().positive().optional(),
        offset: z.number().int().nonnegative().optional(),
        order: z.string().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await aggregateRecords(transport, args));
      },
    );

    this.server.tool(
      "search_employee",
      "Search for employees by name",
      {
        name: z.string(),
        limit: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await searchEmployee(transport, args));
      },
    );

    this.server.tool(
      "search_holidays",
      "Search holidays within a date range",
      {
        start_date: z.string(),
        end_date: z.string(),
        employee_id: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await searchHolidays(transport, args));
      },
    );

    this.server.tool(
      "diagnose_odoo_call",
      "Diagnose model/method/payload issues without executing the call",
      {
        model: z.string(),
        method: z.string(),
        args: z.array(z.unknown()).optional(),
        kwargs: z.record(z.string(), z.unknown()).optional(),
        transport: z.string().optional(),
        target_version: z.string().optional(),
      },
      async (args) => textResult(diagnoseOdooCall(args)),
    );

    this.server.tool(
      "inspect_model_relationships",
      "Inspect model relationships and required field metadata",
      {
        model: z.string(),
        include_readonly: z.boolean().optional(),
        include_computed: z.boolean().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await inspectModelRelationships(transport, args));
      },
    );

    this.server.tool(
      "diagnose_access",
      "Diagnose ACL visibility for an Odoo model (current credentials)",
      {
        model: z.string(),
        operation: z.string().optional(),
        domain: z.unknown().optional(),
        record_ids: z.array(z.number().int().positive()).optional(),
        expected_count: z.number().int().nonnegative().optional(),
        limit: z.number().int().positive().optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(await diagnoseAccess(transport, args));
      },
    );

    // --- Phase 3 writes ---
    this.server.tool(
      "preview_write",
      "Preview a standard write and build an approval token (does not execute)",
      {
        model: z.string(),
        operation: z.string(),
        values: z.record(z.string(), z.unknown()).optional(),
        values_list: z.array(z.record(z.string(), z.unknown())).optional(),
        record_ids: z.array(z.number().int().positive()).optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      },
      async (args) =>
        textResult(
          await previewWrite({
            ...args,
            instance: "default",
          }),
        ),
    );

    this.server.tool(
      "validate_write",
      "Validate write payload against live fields_get and store approval token",
      {
        model: z.string(),
        operation: z.string(),
        values: z.record(z.string(), z.unknown()).optional(),
        values_list: z.array(z.record(z.string(), z.unknown())).optional(),
        record_ids: z.array(z.number().int().positive()).optional(),
        context: z.record(z.string(), z.unknown()).optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(
          await validateWrite(transport, this.approvalStore, {
            ...args,
            instance: "default",
            fieldPolicy,
          }),
        );
      },
    );

    this.server.tool(
      "execute_approved_write",
      "Execute a previously validated write (requires writes_enabled + confirm)",
      {
        approval: z.record(z.string(), z.unknown()),
        confirm: z.boolean().optional(),
      },
      async ({ approval, confirm }) => {
        if (!transport) return noOdoo();
        return textResult(
          await executeApprovedWrite(transport, this.approvalStore, {
            approval: approval as WriteApproval,
            confirm: !!confirm,
            writesEnabled,
            fieldPolicy,
          }),
        );
      },
    );

    this.server.tool(
      "chatter_post",
      "Post a chatter note (writes_enabled only; no approval token)",
      {
        model: z.string(),
        record_id: z.number().int().positive(),
        body: z.string(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(
          await chatterPost(transport, { ...args, writesEnabled }),
        );
      },
    );

    this.server.tool(
      "execute_method",
      "Execute a non-CRUD model method (create/write/unlink blocked)",
      {
        model: z.string(),
        method: z.string(),
        args: z.array(z.unknown()).optional(),
        kwargs: z.record(z.string(), z.unknown()).optional(),
      },
      async (args) => {
        if (!transport) return noOdoo();
        return textResult(
          await executeMethod(transport, {
            ...args,
            writesEnabled,
            allowUnknownMethods: allowUnknown,
          }),
        );
      },
    );
  }
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
