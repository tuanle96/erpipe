import { describe, expect, it } from "vitest";
import { FieldPolicy } from "./field-policy.js";
import { readCloudV1Resource } from "./resources.js";
import type { OdooTransport } from "./transport/types.js";

function transport(): OdooTransport {
  return {
    kind: "xmlrpc",
    async executeKw(model, method) {
      if (model === "ir.model" && method === "search") return [1, 2];
      if (model === "ir.model" && method === "read") {
        return [
          { id: 1, model: "res.partner", name: "Contact" },
          { id: 2, model: "sale.order", name: "Sales Order" },
        ];
      }
      if (model === "ir.model" && method === "search_read") {
        return [{ id: 1, model: "res.partner", name: "Contact" }];
      }
      if (method === "fields_get") {
        return { name: { type: "char", string: "Name" } };
      }
      if (method === "read") {
        return [{ id: 7, name: "Azure", secret: "hidden" }];
      }
      if (method === "search_read") {
        return [{ id: 7, name: "Azure", secret: "hidden" }];
      }
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

const policy = FieldPolicy.fromDoc({
  field_acl: {
    default: {
      "res.partner": { mode: "deny", fields: ["secret"] },
    },
  },
});

describe("D14 odoo:// resources", () => {
  it("returns the Python-compatible model catalog shape", async () => {
    const text = await readCloudV1Resource(new URL("odoo://models"), {
      transport: transport(),
    });
    expect(JSON.parse(text)).toEqual({
      model_names: ["res.partner", "sale.order"],
      models_details: {
        "res.partner": { name: "Contact" },
        "sale.order": { name: "Sales Order" },
      },
    });
  });

  it("returns model metadata with fields", async () => {
    const text = await readCloudV1Resource(new URL("odoo://model/res.partner"), {
      transport: transport(),
    });
    expect(JSON.parse(text)).toMatchObject({
      model: "res.partner",
      fields: { name: { type: "char" } },
    });
  });

  it("redacts record and search resource rows", async () => {
    const record = await readCloudV1Resource(new URL("odoo://record/res.partner/7"), {
      transport: transport(),
      fieldPolicy: policy,
    });
    expect(JSON.parse(record)).toEqual({
      id: 7,
      name: "Azure",
      _redacted_fields: ["secret"],
    });

    const domain = encodeURIComponent(JSON.stringify([["name", "ilike", "Azure"]]));
    const search = await readCloudV1Resource(new URL(`odoo://search/res.partner/${domain}`), {
      transport: transport(),
      fieldPolicy: policy,
    });
    expect(JSON.parse(search)).toEqual({
      results: [{ id: 7, name: "Azure" }],
      _redacted_fields: ["secret"],
    });
  });
});
