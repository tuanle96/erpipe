/**
 * Minimal XML-RPC response parser (methodResponse).
 */

import { XMLParser } from "fast-xml-parser";

const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: false,
  htmlEntities: false,
  trimValues: true,
  // Force list semantics for repeating XML-RPC nodes
  isArray: (name) =>
    name === "param" ||
    name === "member" ||
    name === "value" ||
    name === "data",
});

export class XmlRpcFault extends Error {
  readonly faultCode: number | string;
  constructor(faultCode: number | string, faultString: string) {
    super(faultString);
    this.name = "XmlRpcFault";
    this.faultCode = faultCode;
  }
}

export function parseMethodResponse(xml: string): unknown {
  const doc = parser.parse(xml);
  const root = doc.methodResponse;
  if (!root) {
    throw new Error("Not a methodResponse");
  }
  if (root.fault) {
    const faultVal = unwrapValue(first(root.fault.value));
    const struct =
      typeof faultVal === "object" && faultVal !== null
        ? (faultVal as Record<string, unknown>)
        : {};
    throw new XmlRpcFault(
      (struct.faultCode as number | string) ?? -1,
      String(struct.faultString ?? "XML-RPC fault"),
    );
  }
  const params = root.params?.param;
  if (!params) return null;
  const firstParam = Array.isArray(params) ? params[0] : params;
  return unwrapValue(first(firstParam?.value));
}

function first(node: unknown): unknown {
  return Array.isArray(node) ? node[0] : node;
}

function unwrapValue(node: unknown): unknown {
  if (node == null) return null;
  const n = first(node);
  if (n == null) return null;
  if (typeof n !== "object") return n;

  const o = n as Record<string, unknown>;

  if ("string" in o) return o.string == null ? "" : String(o.string);
  if ("int" in o || "i4" in o) return Number(o.int ?? o.i4);
  if ("i8" in o) return Number(o.i8);
  if ("double" in o) return Number(o.double);
  if ("boolean" in o) {
    const b = o.boolean;
    return b === true || b === 1 || b === "1";
  }
  if ("nil" in o) return null;
  if ("base64" in o) return String(o.base64 ?? "");
  if ("dateTime.iso8601" in o) return String(o["dateTime.iso8601"]);

  if ("array" in o) {
    const arr = o.array as { data?: unknown };
    let dataNode = arr?.data;
    // data may be forced to array by isArray
    dataNode = first(dataNode);
    const values = (dataNode as { value?: unknown } | undefined)?.value;
    if (values == null) return [];
    const list = Array.isArray(values) ? values : [values];
    return list.map((v) => unwrapValue(v));
  }

  if ("struct" in o) {
    const st = o.struct as { member?: unknown };
    const members = st?.member;
    if (members == null) return {};
    const list = Array.isArray(members) ? members : [members];
    const out: Record<string, unknown> = {};
    for (const m of list) {
      const mem = m as { name?: string; value?: unknown };
      const name = String(mem.name ?? "");
      out[name] = unwrapValue(first(mem.value));
    }
    return out;
  }

  if ("value" in o) return unwrapValue(o.value);

  return o;
}
