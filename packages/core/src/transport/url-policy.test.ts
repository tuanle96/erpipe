import { describe, expect, it } from "vitest";
import { assertSafeOdooUrl, normalizeOdooOrigin } from "./url-policy.js";

describe("normalizeOdooOrigin", () => {
  it("strips path and query", () => {
    expect(normalizeOdooOrigin("https://odoo.example.com/web?x=1")).toBe(
      "https://odoo.example.com",
    );
  });

  it("rejects non-http(s)", () => {
    expect(() => normalizeOdooOrigin("ftp://odoo.example.com")).toThrow(/http\(s\)/);
  });

  it("rejects userinfo", () => {
    expect(() => normalizeOdooOrigin("https://user:pass@odoo.example.com")).toThrow(/userinfo/);
  });
});

describe("assertSafeOdooUrl", () => {
  it("allows public https hostname", () => {
    expect(() => assertSafeOdooUrl("https://odoo.example.com", { allowHttp: false })).not.toThrow();
  });

  it("rejects http when allowHttp=false", () => {
    expect(() => assertSafeOdooUrl("http://odoo.example.com", { allowHttp: false })).toThrow(
      /https/,
    );
  });

  it("allows localhost and loopback for self-host", () => {
    expect(() => assertSafeOdooUrl("http://localhost:8069")).not.toThrow();
    expect(() => assertSafeOdooUrl("http://127.0.0.1:8069")).not.toThrow();
    expect(() => assertSafeOdooUrl("http://[::1]:8069")).not.toThrow();
  });

  it("blocks private IPv4 ranges", () => {
    for (const host of [
      "10.0.0.1",
      "172.16.5.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.1.1",
      "0.0.0.0",
    ]) {
      expect(() => assertSafeOdooUrl(`http://${host}`), host).toThrow(/private|link-local/);
    }
  });

  it("allows public IPv4", () => {
    expect(() => assertSafeOdooUrl("https://8.8.8.8")).not.toThrow();
  });

  it("blocks unique-local and link-local IPv6", () => {
    for (const host of ["fc00::1", "fd12:3456:789a::1", "fe80::1", "feb0::1", "ff02::1", "::"]) {
      expect(() => assertSafeOdooUrl(`http://[${host}]`), host).toThrow(/private|link-local/);
    }
  });

  it("blocks IPv4-mapped private IPv6", () => {
    expect(() => assertSafeOdooUrl("http://[::ffff:192.168.0.1]")).toThrow(/private|link-local/);
  });

  it("allows public IPv6 for self-host", () => {
    expect(() => assertSafeOdooUrl("https://[2001:4860:4860::8888]")).not.toThrow();
  });
});
