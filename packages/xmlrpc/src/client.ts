import { methodCall } from "./serialize.js";
import { parseMethodResponse, XmlRpcFault } from "./parse.js";

export type XmlRpcClientOptions = {
  baseUrl: string;
  timeoutMs?: number;
};

export class XmlRpcClient {
  private readonly origin: string;
  private readonly timeoutMs: number;

  constructor(opts: XmlRpcClientOptions) {
    this.origin = opts.baseUrl.replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? 30_000;
  }

  async call(path: string, method: string, params: unknown[]): Promise<unknown> {
    const url = `${this.origin}${path.startsWith("/") ? path : `/${path}`}`;
    const body = methodCall(method, params);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "text/xml",
          Accept: "text/xml",
        },
        body,
        signal: controller.signal,
        redirect: "manual",
      });
      const text = await res.text();
      if (!res.ok) {
        throw new Error(`XML-RPC HTTP ${res.status}: ${text.slice(0, 300)}`);
      }
      return parseMethodResponse(text);
    } catch (e) {
      if (e instanceof XmlRpcFault) throw e;
      if (e instanceof Error && e.name === "AbortError") {
        throw new Error(`XML-RPC timeout after ${this.timeoutMs}ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
  }
}
