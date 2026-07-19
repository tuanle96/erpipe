/** SSRF-ish checks for stored Odoo base URL (insert-time + fetch-time). */

export function normalizeOdooOrigin(raw: string): string {
  const u = new URL(raw);
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("odoo_url must be http(s)");
  }
  // Production cloud requires https; self-host may use http for local Odoo
  if (u.username || u.password) {
    throw new Error("odoo_url must not include userinfo");
  }
  // Strip path/query — origin only
  return u.origin;
}

/** True for IPv4 dotted-quad hostnames. */
function isIPv4Literal(host: string): boolean {
  return /^\d+\.\d+\.\d+\.\d+$/.test(host);
}

/**
 * True for IPv6 hostnames as returned by URL.hostname
 * (often without brackets, e.g. "::1" or "fe80::1").
 */
function isIPv6Literal(host: string): boolean {
  if (host.startsWith("[") && host.endsWith("]")) {
    return host.includes(":");
  }
  // Unbracketed IPv6 always contains ":" and is not a hostname with port
  // (URL.hostname never includes port).
  return host.includes(":");
}

function isPrivateIPv4(host: string): boolean {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/**
 * Block private / link-local / loopback / unique-local IPv6.
 * Local loopback (::1) is allowed separately for self-host (same as 127.0.0.1).
 */
function isBlockedIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::1" || h === "0:0:0:0:0:0:0:1") {
    return false; // loopback handled as local-dev allow
  }
  // Unspecified
  if (h === "::" || h === "0:0:0:0:0:0:0:0") {
    return true;
  }
  // IPv4-mapped IPv6 — URL.hostname may be ::ffff:x.x.x.x or ::ffff:c0a8:1 (hex)
  const v4dotted = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4dotted?.[1] && isPrivateIPv4(v4dotted[1])) {
    return true;
  }
  const v4hex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4hex) {
    const hi = parseInt(v4hex[1]!, 16);
    const lo = parseInt(v4hex[2]!, 16);
    const dotted = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    if (isPrivateIPv4(dotted)) return true;
  }
  // Unique local fc00::/7 (fc.. / fd..)
  if (h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  // Link-local fe80::/10
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) {
    return true;
  }
  // Site-local deprecated fec0::/10
  if (h.startsWith("fec") || h.startsWith("fed") || h.startsWith("fee") || h.startsWith("fef")) {
    return true;
  }
  // Multicast ff00::/8
  if (h.startsWith("ff")) {
    return true;
  }
  return false;
}

export function assertSafeOdooUrl(origin: string, { allowHttp = true } = {}): void {
  const u = new URL(origin);
  if (u.protocol === "http:" && !allowHttp) {
    throw new Error("odoo_url must be https");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") {
    throw new Error("odoo_url must be http(s)");
  }
  if (u.username || u.password) {
    throw new Error("odoo_url must not include userinfo");
  }
  const host = u.hostname.toLowerCase();
  // Local dev OK for self-host
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1") {
    return;
  }
  if (isIPv4Literal(host)) {
    if (isPrivateIPv4(host)) {
      throw new Error("odoo_url must not target private/link-local IPs");
    }
    return;
  }
  if (isIPv6Literal(host)) {
    if (isBlockedIPv6(host)) {
      throw new Error("odoo_url must not target private/link-local IPs");
    }
    // Public IPv6 literals are allowed for self-host (cloud routing blocks all IP literals)
  }
}
