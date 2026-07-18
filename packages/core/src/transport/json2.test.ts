import { describe, expect, it } from "vitest";
import { buildJson2Payload } from "./json2";
import { OdooError } from "../errors";

describe("buildJson2Payload", () => {
  it("maps search_read positionals", () => {
    const p = buildJson2Payload(
      "search_read",
      [[["name", "=", "x"]], ["name"], 0, 10],
      {},
    );
    expect(p).toEqual({
      domain: [["name", "=", "x"]],
      fields: ["name"],
      offset: 0,
      limit: 10,
    });
  });

  it("rejects unknown method positionals", () => {
    expect(() => buildJson2Payload("weird_method", [1], {})).toThrow(OdooError);
  });

  it("rejects duplicate kwargs", () => {
    expect(() =>
      buildJson2Payload("search", [[]], { domain: [] }),
    ).toThrow(/both positionally/);
  });
});
