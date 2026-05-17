import { describe, expect, it } from "vitest";

import { getClientIp, isTrustProxyEnabled } from "@/lib/client-ip";

function requestWithHeaders(headers: Record<string, string>) {
  return { headers: new Headers(headers) };
}

describe("client-ip", () => {
  it("does not trust x-forwarded-for when trustProxy is false", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "198.51.100.10, 10.0.0.1",
      "user-agent": "test-agent",
    });

    expect(getClientIp(request, { trustProxy: false })).toMatch(/^anon:/);
  });

  it("trusts the first x-forwarded-for hop when trustProxy is true", () => {
    const request = requestWithHeaders({
      "x-forwarded-for": "198.51.100.10, 10.0.0.1",
      "x-real-ip": "203.0.113.20",
    });

    expect(getClientIp(request, { trustProxy: true })).toBe("198.51.100.10");
  });

  it("falls back to x-real-ip when proxy trust is enabled and x-forwarded-for is absent", () => {
    const request = requestWithHeaders({ "x-real-ip": "203.0.113.20" });

    expect(getClientIp(request, { trustProxy: true })).toBe("203.0.113.20");
  });

  it("parses TRUST_PROXY-style booleans", () => {
    expect(isTrustProxyEnabled("true")).toBe(true);
    expect(isTrustProxyEnabled("1")).toBe(true);
    expect(isTrustProxyEnabled("false")).toBe(false);
    expect(isTrustProxyEnabled(undefined)).toBe(false);
  });
});
