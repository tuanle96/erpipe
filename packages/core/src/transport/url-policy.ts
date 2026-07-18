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

export function assertSafeOdooUrl(origin: string, { allowHttp = true } = {}): void {
  const u = new URL(origin);
  if (u.protocol === "http:" && !allowHttp) {
    throw new Error("odoo_url must be https");
  }
  const host = u.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") {
    return; // local dev OK for self-host
  }
  // Block obvious private/link-local literals (IPv4)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    const parts = host.split(".").map(Number);
    const [a, b] = parts;
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b !== undefined && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    ) {
      throw new Error("odoo_url must not target private/link-local IPs");
    }
  }
}
