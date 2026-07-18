import { describe, expect, it } from "vitest";
import { escapeXml, methodCall, serializeValue } from "./serialize";

describe("serializeValue", () => {
  it("serializes string with escape", () => {
    expect(serializeValue("a<b")).toContain("&lt;");
  });

  it("serializes bool", () => {
    expect(serializeValue(true)).toBe("<value><boolean>1</boolean></value>");
  });
});

describe("methodCall", () => {
  it("builds methodCall envelope", () => {
    const xml = methodCall("authenticate", ["db", "user", "pass", {}]);
    expect(xml).toContain("<methodName>authenticate</methodName>");
    expect(xml).toContain("<methodCall>");
  });
});

describe("escapeXml", () => {
  it("escapes entities", () => {
    expect(escapeXml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&apos;");
  });
});
