import { describe, expect, it } from "vitest";
import {
  ABS_MAX_ATTACHMENT_BYTES,
  DEFAULT_MAX_ATTACHMENT_BYTES,
  readAttachment,
} from "./phase2.js";
import type { OdooTransport } from "../transport/types.js";

function mockTransport(
  rows: Record<string, unknown>[],
): OdooTransport & { calls: { method: string; args: unknown[] }[] } {
  const calls: { method: string; args: unknown[] }[] = [];
  return {
    kind: "xmlrpc",
    calls,
    async executeKw(_model, method, args, kwargs) {
      calls.push({ method, args: args as unknown[] });
      if (method === "search_read") {
        const fields = (kwargs?.fields as string[]) ?? [];
        return rows.map((r) => {
          const out: Record<string, unknown> = {};
          for (const f of fields) out[f] = r[f];
          return out;
        });
      }
      if (method === "read") {
        const ids = (args[0] as number[]) ?? [];
        const fields = (kwargs?.fields as string[]) ?? [];
        return rows
          .filter((r) => ids.includes(Number(r.id)))
          .map((r) => {
            const out: Record<string, unknown> = {};
            for (const f of fields) out[f] = r[f];
            return out;
          });
      }
      return null;
    },
    async serverVersion() {
      return { major: 18, minor: 0, raw: "18.0" };
    },
  };
}

describe("readAttachment", () => {
  it("lists metadata without datas", async () => {
    const t = mockTransport([
      {
        id: 1,
        name: "po.pdf",
        mimetype: "application/pdf",
        file_size: 100,
        type: "binary",
        datas: "AAAA",
      },
    ]);
    const res = await readAttachment(t, { limit: 10 });
    expect(res.success).toBe(true);
    expect(res.datas_included).toBe(false);
    expect((res.result as unknown[]).length).toBe(1);
    expect((res.result as { datas?: unknown }[])[0]).not.toHaveProperty("datas");
    expect(t.calls[0]?.method).toBe("search_read");
  });

  it("returns base64 when under size cap", async () => {
    const t = mockTransport([
      {
        id: 7,
        name: "invoice.pdf",
        mimetype: "application/pdf",
        file_size: 12,
        type: "binary",
        datas: "aGVsbG8=", // "hello"
      },
    ]);
    const res = await readAttachment(t, { attachment_id: 7 });
    expect(res.success).toBe(true);
    expect(res.datas_included).toBe(true);
    expect((res.result as { datas: string }).datas).toBe("aGVsbG8=");
  });

  it("refuses oversized attachments", async () => {
    const t = mockTransport([
      {
        id: 9,
        name: "big.bin",
        mimetype: "application/octet-stream",
        file_size: DEFAULT_MAX_ATTACHMENT_BYTES + 1,
        type: "binary",
        datas: "xxxx",
      },
    ]);
    const res = await readAttachment(t, { attachment_id: 9 });
    expect(res.success).toBe(false);
    expect(res.code).toBe("ATTACHMENT_TOO_LARGE");
    expect(res.datas_included).toBe(false);
  });

  it("handles url-type attachments without datas", async () => {
    const t = mockTransport([
      {
        id: 3,
        name: "remote",
        mimetype: "application/pdf",
        file_size: 0,
        type: "url",
        url: "https://files.example.com/x.pdf",
        datas: false,
      },
    ]);
    const res = await readAttachment(t, { attachment_id: 3 });
    expect(res.success).toBe(true);
    expect(res.datas_included).toBe(false);
    expect((res.result as { url: string }).url).toContain("https://");
  });

  it("caps max_bytes at absolute ceiling", async () => {
    expect(ABS_MAX_ATTACHMENT_BYTES).toBeGreaterThan(DEFAULT_MAX_ATTACHMENT_BYTES);
    const t = mockTransport([
      {
        id: 1,
        name: "x",
        mimetype: "text/plain",
        file_size: 10,
        type: "binary",
        datas: "YQ==",
      },
    ]);
    const res = await readAttachment(t, {
      attachment_id: 1,
      max_bytes: ABS_MAX_ATTACHMENT_BYTES * 10,
    });
    expect(res.success).toBe(true);
    expect(res.max_bytes).toBe(ABS_MAX_ATTACHMENT_BYTES);
  });
});
