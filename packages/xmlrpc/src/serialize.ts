/**
 * Minimal XML-RPC value serializer (expand in Phase 2).
 * Strings + ints + bools + arrays + structs — enough for smoke tests.
 */

export function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function serializeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "<value><nil/></value>";
  }
  if (typeof value === "string") {
    return `<value><string>${escapeXml(value)}</string></value>`;
  }
  if (typeof value === "boolean") {
    return `<value><boolean>${value ? 1 : 0}</boolean></value>`;
  }
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= -2147483648 && value <= 2147483647) {
      return `<value><int>${value}</int></value>`;
    }
    return `<value><double>${value}</double></value>`;
  }
  if (Array.isArray(value)) {
    const data = value.map(serializeValue).join("");
    return `<value><array><data>${data}</data></array></value>`;
  }
  if (typeof value === "object") {
    const members = Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `<member><name>${escapeXml(k)}</name>${serializeValue(v)}</member>`)
      .join("");
    return `<value><struct>${members}</struct></value>`;
  }
  return `<value><string>${escapeXml(String(value))}</string></value>`;
}

export function methodCall(methodName: string, params: unknown[]): string {
  const _serialized = params.map((p) => serializeValue(p)).join("");
  return (
    `<?xml version="1.0"?>` +
    `<methodCall>` +
    `<methodName>${escapeXml(methodName)}</methodName>` +
    `<params>${params.map((p) => `<param>${serializeValue(p)}</param>`).join("")}</params>` +
    `</methodCall>`
  );
}
