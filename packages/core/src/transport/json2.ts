import { OdooError } from "../errors.js";
import { JSON2_POSITIONAL_ARG_MAP } from "./json2-map.js";
import type { OdooTransport, OdooVersion } from "./types.js";
import { assertSafeOdooUrl, normalizeOdooOrigin } from "./url-policy.js";

export type Json2Config = {
  url: string;
  db: string;
  apiKey: string;
  locale?: string;
  json2DbHeader?: boolean;
  timeoutMs?: number;
  maxResponseBytes?: number;
  allowHttp?: boolean;
};

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export function buildJson2Payload(
  method: string,
  args: unknown[],
  kwargs: Record<string, unknown> = {},
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...kwargs };
  if (!args.length) return payload;

  const argNames = JSON2_POSITIONAL_ARG_MAP[method];
  if (!argNames) {
    throw new OdooError(
      "TRANSPORT_ERROR",
      `JSON-2 requires keyword args for method ${method}; positional only mapped for common ORM methods.`,
    );
  }
  if (args.length > argNames.length) {
    throw new OdooError(
      "TRANSPORT_ERROR",
      `Too many positional args for ${method}: max ${argNames.length}, got ${args.length}.`,
    );
  }
  for (let i = 0; i < args.length; i++) {
    const name = argNames[i]!;
    if (name in payload) {
      throw new OdooError(
        "TRANSPORT_ERROR",
        `Argument ${name} passed both positionally and as keyword for ${method}.`,
      );
    }
    payload[name] = args[i];
  }
  return payload;
}

export class Json2Transport implements OdooTransport {
  readonly kind = "json2" as const;
  private readonly origin: string;
  private readonly db: string;
  private readonly apiKey: string;
  private readonly locale?: string;
  private readonly json2DbHeader: boolean;
  private readonly timeoutMs: number;
  private readonly maxResponseBytes: number;
  private versionCache: OdooVersion | null = null;

  constructor(config: Json2Config) {
    this.origin = normalizeOdooOrigin(config.url);
    assertSafeOdooUrl(this.origin, { allowHttp: config.allowHttp ?? true });
    this.db = config.db;
    this.apiKey = config.apiKey;
    this.locale = config.locale;
    this.json2DbHeader = config.json2DbHeader ?? true;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxResponseBytes = config.maxResponseBytes ?? DEFAULT_MAX_BYTES;
  }

  async connect(): Promise<void> {
    await this.executeKw("res.users", "context_get", []);
  }

  async serverVersion(): Promise<OdooVersion> {
    if (this.versionCache) return this.versionCache;
    // Odoo exposes version via /web/version or session; JSON-2 path varies.
    // Prefer ir.module.module is overkill — use res.users context + optional endpoint.
    try {
      const res = await this.fetchJson(`${this.origin}/web/version`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const raw =
        typeof res === "object" && res && "version" in res
          ? String((res as { version: unknown }).version)
          : String(res);
      this.versionCache = parseVersion(raw);
      return this.versionCache;
    } catch {
      this.versionCache = { major: 19, minor: 0, raw: "unknown" };
      return this.versionCache;
    }
  }

  async executeKw(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    let merged = { ...kwargs };
    if (this.locale) {
      const ctx =
        typeof merged.context === "object" && merged.context !== null
          ? { ...(merged.context as Record<string, unknown>) }
          : {};
      if (ctx.lang === undefined) {
        ctx.lang = this.locale;
        merged = { ...merged, context: ctx };
      }
    }
    const payload = buildJson2Payload(method, args, merged);
    const endpoint = `${this.origin}/json/2/${model}/${method}`;
    return this.fetchJson(endpoint, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(payload),
    });
  }

  private authHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Authorization: `bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.json2DbHeader && this.db) {
      headers["X-Odoo-Database"] = this.db;
    }
    return headers;
  }

  private async fetchJson(
    url: string,
    init: RequestInit,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal,
        redirect: "manual",
      });
      const buf = await readBodyCapped(res, this.maxResponseBytes);
      const text = new TextDecoder().decode(buf);
      if (!res.ok) {
        throw new OdooError(
          res.status === 401 || res.status === 403 ? "AUTH_FAILED" : "TRANSPORT_ERROR",
          `JSON-2 ${url} failed HTTP ${res.status}: ${text.slice(0, 500)}`,
        );
      }
      if (!text) return null;
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new OdooError(
          "TRANSPORT_ERROR",
          `JSON-2 returned invalid JSON: ${text.slice(0, 200)}`,
        );
      }
    } catch (e) {
      if (e instanceof OdooError) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new OdooError("TIMEOUT", `JSON-2 request timed out after ${this.timeoutMs}ms`);
      }
      throw new OdooError(
        "CONNECTION_FAILED",
        e instanceof Error ? e.message : String(e),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseVersion(raw: string): OdooVersion {
  const m = raw.match(/(\d+)\.(\d+)/);
  if (!m) return { major: 0, minor: 0, raw };
  return { major: Number(m[1]), minor: Number(m[2]), raw };
}

async function readBodyCapped(
  res: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  const cl = res.headers.get("content-length");
  if (cl && Number(cl) > maxBytes) {
    throw new OdooError("LIMIT_EXCEEDED", `Response Content-Length ${cl} exceeds cap ${maxBytes}`);
  }
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        throw new OdooError("LIMIT_EXCEEDED", `Response exceeded ${maxBytes} bytes`);
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}
