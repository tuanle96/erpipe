import { assertDomainList } from "./domain.js";
import { FieldPolicy } from "./field-policy.js";
import { fieldsGet, validateModelName } from "./tools/helpers.js";
import type { OdooTransport } from "./transport/types.js";

export const CLOUD_V1_RESOURCES = [
  {
    name: "odoo_models",
    uri: "odoo://models",
    template: false,
    description: "List all available models in the Odoo system",
  },
  {
    name: "odoo_model",
    uri: "odoo://model/{model_name}",
    template: true,
    description: "Get detailed model information including fields",
  },
  {
    name: "odoo_record",
    uri: "odoo://record/{model_name}/{record_id}",
    template: true,
    description: "Get one Odoo record by model and ID",
  },
  {
    name: "odoo_search",
    uri: "odoo://search/{model_name}/{domain}",
    template: true,
    description: "Search Odoo records with a JSON-encoded domain",
  },
] as const;

export type OdooResourceContext = {
  transport: OdooTransport | null;
  fieldPolicy?: FieldPolicy;
  instance?: string;
};

function asRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (row): row is Record<string, unknown> =>
          typeof row === "object" && row !== null && !Array.isArray(row),
      )
    : [];
}

function pathParts(uri: URL): string[] {
  return uri.pathname
    .split("/")
    .filter(Boolean)
    .map((part) => decodeURIComponent(part));
}

async function modelsPayload(transport: OdooTransport): Promise<Record<string, unknown>> {
  try {
    const rawIds = await transport.executeKw("ir.model", "search", [[]], {});
    const ids = Array.isArray(rawIds)
      ? rawIds.filter((id): id is number => Number.isInteger(id))
      : [];
    if (!ids.length) {
      return { model_names: [], models_details: {}, error: "No models found" };
    }
    const rows = asRecords(
      await transport.executeKw("ir.model", "read", [ids, ["model", "name"]], {}),
    );
    const modelNames = rows
      .map((row) => row.model)
      .filter((model): model is string => typeof model === "string")
      .sort();
    const modelsDetails = Object.fromEntries(
      rows
        .filter((row) => typeof row.model === "string")
        .map((row) => [row.model as string, { name: row.name ?? "" }]),
    );
    return { model_names: modelNames, models_details: modelsDetails };
  } catch (error) {
    return {
      model_names: [],
      models_details: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Read one of the four Python-compatible D14 odoo:// resources. */
export async function readCloudV1Resource(uri: URL, context: OdooResourceContext): Promise<string> {
  const transport = context.transport;
  if (!transport) {
    return JSON.stringify({ error: "Odoo connection is not configured" }, null, 2);
  }
  const parts = pathParts(uri);
  const instance = context.instance ?? "default";
  const fieldPolicy = context.fieldPolicy ?? new FieldPolicy();

  if (uri.hostname === "models" && parts.length === 0) {
    return JSON.stringify(await modelsPayload(transport), null, 2);
  }

  try {
    const model = parts[0] ?? "";
    validateModelName(model);

    if (uri.hostname === "model" && parts.length === 1) {
      const rows = asRecords(
        await transport.executeKw("ir.model", "search_read", [[["model", "=", model]]], {
          fields: ["name", "model"],
        }),
      );
      const info = rows[0] ?? { error: `Model ${model} not found` };
      return JSON.stringify({ ...info, fields: await fieldsGet(transport, model) }, null, 2);
    }

    if (uri.hostname === "record" && parts.length === 2) {
      const recordId = Number(parts[1]);
      if (!Number.isInteger(recordId) || recordId < 1) {
        throw new Error("record_id must be greater than 0");
      }
      const rows = asRecords(await transport.executeKw(model, "read", [[recordId]], {}));
      if (!rows.length) {
        return JSON.stringify({ error: `Record not found: ${model} ID ${parts[1]}` }, null, 2);
      }
      const [record, redacted] = fieldPolicy.redactRecord(instance, model, rows[0]!);
      if (redacted.length) record._redacted_fields = redacted;
      return JSON.stringify(record, null, 2);
    }

    if (uri.hostname === "search" && parts.length >= 2) {
      const domain = JSON.parse(parts.slice(1).join("/")) as unknown;
      assertDomainList(domain);
      const rows = asRecords(
        await transport.executeKw(model, "search_read", [domain], { limit: 10 }),
      );
      const [records, redacted] = fieldPolicy.redactRecords(instance, model, rows);
      return JSON.stringify(
        redacted.length ? { results: records, _redacted_fields: redacted } : records,
        null,
        2,
      );
    }

    throw new Error(`Unsupported Odoo resource URI: ${uri.href}`);
  } catch (error) {
    return JSON.stringify(
      { error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    );
  }
}
