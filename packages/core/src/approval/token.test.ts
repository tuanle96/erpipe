import { describe, expect, it } from "vitest";
import { buildApprovalToken, canonicalWritePayload, verifyWriteApproval } from "./token.js";

const payload = {
  model: "res.partner",
  operation: "create",
  record_ids: [],
  values: { name: "Acme" },
  context: {},
  instance: "east",
};

describe("write approval instance binding", () => {
  it("rejects a missing or empty instance", () => {
    expect(() => canonicalWritePayload({ ...payload, instance: "" })).toThrow(/instance is required/);
    expect(() => canonicalWritePayload({ ...payload, instance: undefined })).toThrow(
      /instance is required/,
    );
  });

  it("invalidates the token when the target instance changes", async () => {
    const token = await buildApprovalToken(canonicalWritePayload(payload));
    await expect(verifyWriteApproval({ ...payload, instance: "west", token })).resolves.toMatchObject({
      ok: false,
    });
  });
});
