import { describe, expect, it } from "vitest";
import { parseMethodResponse } from "./parse";

describe("parseMethodResponse", () => {
  it("parses int", () => {
    const xml = `<?xml version="1.0"?><methodResponse><params><param><value><int>2</int></value></param></params></methodResponse>`;
    expect(parseMethodResponse(xml)).toBe(2);
  });

  it("parses array of structs", () => {
    const xml = `<?xml version="1.0"?>
<methodResponse>
<params>
<param>
<value><array><data>
<value><struct>
<member><name>id</name><value><int>1</int></value></member>
<member><name>name</name><value><string>A</string></value></member>
</struct></value>
<value><struct>
<member><name>id</name><value><int>2</int></value></member>
<member><name>name</name><value><string>B</string></value></member>
</struct></value>
</data></array></value>
</param>
</params>
</methodResponse>`;
    expect(parseMethodResponse(xml)).toEqual([
      { id: 1, name: "A" },
      { id: 2, name: "B" },
    ]);
  });
});
