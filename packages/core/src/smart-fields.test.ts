import { describe, expect, it } from "vitest";
import { buildTextQueryDomain, rankRelevantFields, selectSmartFields } from "./smart-fields";

const meta = {
  id: { type: "integer" },
  name: { type: "char", searchable: true, store: true },
  email: { type: "char", searchable: true, store: true },
  create_uid: { type: "many2one", relation: "res.users" },
  message_ids: { type: "one2many", relation: "mail.message" },
  binary_field: { type: "binary" },
  amount_total: { type: "monetary", store: true },
  partner_id: { type: "many2one", relation: "res.partner", store: true },
  unstored: { type: "char", compute: "x", store: false },
};

describe("selectSmartFields", () => {
  it("prefers name/email and drops technical/binary", () => {
    const fields = selectSmartFields(meta, 10);
    expect(fields[0]).toBe("id");
    expect(fields).toContain("name");
    expect(fields).toContain("email");
    expect(fields).not.toContain("create_uid");
    expect(fields).not.toContain("binary_field");
    expect(fields).not.toContain("unstored");
  });
});

describe("rankRelevantFields", () => {
  it("boosts required fields", () => {
    const ranked = rankRelevantFields({
      ...meta,
      code: { type: "char", required: true, searchable: true },
    });
    expect(ranked[0]?.field).toBe("code");
  });
});

describe("buildTextQueryDomain", () => {
  it("builds OR ilike domain", () => {
    const { domain, fieldsUsed } = buildTextQueryDomain("acme", meta);
    expect(fieldsUsed).toContain("name");
    expect(domain[0]).toBe("|");
    expect(domain.some((t) => Array.isArray(t) && t[0] === "name")).toBe(true);
  });
});
