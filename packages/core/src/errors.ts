/** Shared Odoo / gate error taxonomy (parity with Python odoo-mcp). */

export type OdooErrorCode =
  | "AUTH_FAILED"
  | "ACCESS_DENIED"
  | "RECORD_RULE_DENIED"
  | "MODEL_NOT_FOUND"
  | "FIELD_INVALID"
  | "VALIDATION_ERROR"
  | "CONNECTION_FAILED"
  | "TIMEOUT"
  | "TRANSPORT_ERROR"
  | "WRITE_GATE_DENIED"
  | "LIMIT_EXCEEDED"
  | "UNKNOWN";

export class OdooError extends Error {
  readonly code: OdooErrorCode;
  readonly hint?: string;

  constructor(code: OdooErrorCode, message: string, hint?: string) {
    super(message);
    this.name = "OdooError";
    this.code = code;
    this.hint = hint;
  }

  toStructured(): { code: OdooErrorCode; message: string; hint?: string } {
    return {
      code: this.code,
      message: this.message,
      ...(this.hint !== undefined ? { hint: this.hint } : {}),
    };
  }
}

export function isOdooError(e: unknown): e is OdooError {
  return e instanceof OdooError;
}
