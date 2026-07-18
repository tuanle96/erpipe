import { describe, expect, it } from "vitest";
import { buildDomain } from "./domain";

describe("buildDomain", () => {
  it("builds AND domain", () => {
    const r = buildDomain({
      conditions: [
        { field: "name", operator: "ilike", value: "acme" },
        { field: "active", operator: "=", value: true },
      ],
    });
    expect(r.success).toBe(true);
    expect(r.domain).toEqual([
      ["name", "ilike", "acme"],
      ["active", "=", true],
    ]);
  });

  it("builds OR domain with | operators", () => {
    const r = buildDomain({
      logical_operator: "or",
      conditions: [
        { field: "a", operator: "=", value: 1 },
        { field: "b", operator: "=", value: 2 },
      ],
    });
    expect(r.domain).toEqual(["|", ["a", "=", 1], ["b", "=", 2]]);
  });

  it("rejects bad operator", () => {
    const r = buildDomain({
      conditions: [{ field: "name", operator: ">>>", value: "x" }],
    });
    expect(r.success).toBe(false);
  });
});
