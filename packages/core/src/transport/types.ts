/** Odoo transport interface — Json2 / XmlRpc implement this. */

export type OdooVersion = {
  major: number;
  minor: number;
  raw: string;
};

export interface OdooTransport {
  readonly kind: "xmlrpc" | "json2";
  executeKw(
    model: string,
    method: string,
    args: unknown[],
    kwargs?: Record<string, unknown>,
  ): Promise<unknown>;
  serverVersion(): Promise<OdooVersion>;
}

export type ConnectionConfig = {
  url: string;
  db: string;
  username: string;
  /** Password or API key — never log. */
  secret: string;
  transport: "xmlrpc" | "json2" | "auto";
  locale?: string;
  json2DbHeader?: boolean;
};
