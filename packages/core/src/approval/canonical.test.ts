import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical";

describe("canonicalJson", () => {
  it("sorts object keys", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  it("is stable for nested objects", () => {
    const a = canonicalJson({ z: { y: 1, x: 2 }, a: true });
    const b = canonicalJson({ a: true, z: { x: 2, y: 1 } });
    expect(a).toBe(b);
  });
});
