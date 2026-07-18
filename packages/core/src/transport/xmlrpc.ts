import { XmlRpcClient } from "@erpipe/odoo-xmlrpc";
import { OdooError } from "../errors.js";
import type { OdooTransport, OdooVersion } from "./types.js";
import { assertSafeOdooUrl, normalizeOdooOrigin } from "./url-policy.js";

export type XmlRpcConfig = {
  url: string;
  db: string;
  username: string;
  password: string;
  locale?: string;
  timeoutMs?: number;
  allowHttp?: boolean;
};

export class XmlRpcTransport implements OdooTransport {
  readonly kind = "xmlrpc" as const;
  private readonly client: XmlRpcClient;
  private readonly db: string;
  private readonly username: string;
  private readonly password: string;
  private readonly locale?: string;
  private uid: number | null = null;

  constructor(config: XmlRpcConfig) {
    const origin = normalizeOdooOrigin(config.url);
    assertSafeOdooUrl(origin, { allowHttp: config.allowHttp ?? true });
    this.client = new XmlRpcClient({
      baseUrl: origin,
      timeoutMs: config.timeoutMs ?? 30_000,
    });
    this.db = config.db;
    this.username = config.username;
    this.password = config.password;
    this.locale = config.locale;
  }

  async connect(): Promise<void> {
    await this.ensureUid();
  }

  async serverVersion(): Promise<OdooVersion> {
    const v = (await this.client.call("/xmlrpc/2/common", "version", [])) as {
      server_version?: string;
      server_version_info?: number[];
    };
    const raw = String(v?.server_version ?? "unknown");
    const info = v?.server_version_info;
    return {
      major: info?.[0] ?? 0,
      minor: info?.[1] ?? 0,
      raw,
    };
  }

  async executeKw(
    model: string,
    method: string,
    args: unknown[],
    kwargs: Record<string, unknown> = {},
  ): Promise<unknown> {
    const uid = await this.ensureUid();
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
    try {
      return await this.client.call("/xmlrpc/2/object", "execute_kw", [
        this.db,
        uid,
        this.password,
        model,
        method,
        args,
        merged,
      ]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/access denied|accesserror/i.test(msg)) {
        throw new OdooError("ACCESS_DENIED", msg);
      }
      throw new OdooError("TRANSPORT_ERROR", msg);
    }
  }

  private async ensureUid(): Promise<number> {
    if (this.uid != null) return this.uid;
    const uid = await this.client.call("/xmlrpc/2/common", "authenticate", [
      this.db,
      this.username,
      this.password,
      {},
    ]);
    if (typeof uid !== "number" || uid === 0) {
      throw new OdooError("AUTH_FAILED", "XML-RPC authenticate failed");
    }
    this.uid = uid;
    return uid;
  }
}
