import { describe, expect, it } from "vitest";
import { FieldPolicy } from "./field-policy.js";

describe("FieldPolicy", () => {
  it("inactive when empty", () => {
    const p = new FieldPolicy();
    expect(p.active()).toBe(false);
    expect(p.deniedWriteFields("default", "res.partner", ["name", "email"])).toEqual([]);
    expect(p.checkWriteValues("default", "res.partner", { name: "x" })).toBeNull();
  });

  it("fromDoc parses deny and allow modes", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["vat", "email"] },
          "sale.order": { mode: "allow", fields: ["note"] },
        },
      },
    });
    expect(p.active()).toBe(true);
    expect(p.deniedWriteFields("default", "res.partner", ["name", "vat", "email"])).toEqual([
      "vat",
      "email",
    ]);
    expect(p.deniedWriteFields("default", "sale.order", ["note", "amount_total"])).toEqual([
      "amount_total",
    ]);
  });

  it("always keeps id and display_name", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "allow", fields: [] },
        },
      },
    });
    expect(p.deniedWriteFields("default", "res.partner", ["id", "display_name", "name"])).toEqual([
      "name",
    ]);
  });

  it("merges star deny with model-specific allow (intersection of allow)", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        prod: {
          "*": { mode: "deny", fields: ["secret"] },
          "res.partner": { mode: "allow", fields: ["name", "email", "secret"] },
        },
      },
    });
    // allow list includes secret but star deny still blocks it
    expect(
      p.deniedWriteFields("prod", "res.partner", ["name", "email", "secret", "phone"]),
    ).toEqual(["secret", "phone"]);
  });

  it("intersects multiple allow rules (star then model)", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        prod: {
          "*": { mode: "allow", fields: ["name", "email", "phone"] },
          "res.partner": { mode: "allow", fields: ["name", "vat"] },
        },
      },
    });
    // intersection → only name
    expect(p.deniedWriteFields("prod", "res.partner", ["name", "email", "phone", "vat"])).toEqual([
      "email",
      "phone",
      "vat",
    ]);
  });

  it("returns null from checkWriteValues when all fields allowed", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["vat"] },
        },
      },
    });
    expect(p.checkWriteValues("default", "res.partner", { name: "Acme" })).toBeNull();
  });

  it("returns human-readable message when denied", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["vat"] },
        },
      },
    });
    const msg = p.checkWriteValues("default", "res.partner", { vat: "x" });
    expect(msg).toMatch(/denies write access/);
    expect(msg).toMatch(/vat/);
    expect(msg).toMatch(/res\.partner/);
  });

  it("unknown instance or model has no effect", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["vat"] },
        },
      },
    });
    expect(p.deniedWriteFields("other", "res.partner", ["vat"])).toEqual([]);
    expect(p.deniedWriteFields("default", "sale.order", ["vat"])).toEqual([]);
  });

  it("defaults unknown mode to deny", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "weird" as "deny", fields: ["x"] },
        },
      },
    });
    expect(p.deniedWriteFields("default", "res.partner", ["x", "y"])).toEqual(["x"]);
  });

  it("redacts read records while always retaining id", () => {
    const p = FieldPolicy.fromDoc({
      field_acl: {
        default: {
          "res.partner": { mode: "deny", fields: ["secret"] },
        },
      },
    });
    const [records, redacted] = p.redactRecords("default", "res.partner", [
      { id: 1, name: "Azure", secret: "hidden" },
      { id: 2, name: "Bestmix", secret: "hidden" },
    ]);
    expect(records).toEqual([
      { id: 1, name: "Azure" },
      { id: 2, name: "Bestmix" },
    ]);
    expect(redacted).toEqual(["secret"]);
  });
});
