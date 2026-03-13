import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/origin", () => ({
  getBackendUrl: vi.fn(() => "http://localhost:8000"),
}));

vi.mock("@/lib/logger", () => ({
  logger: {
    child: vi.fn(() => ({
      info: vi.fn(),
    })),
  },
}));

import { isPublicPath, sanitizeCallbackUrl } from "@/proxy";

describe("isPublicPath", () => {
  it("returns true for exact public paths", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/pricing")).toBe(true);
    expect(isPublicPath("/auth/signin")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("returns false for public paths with appended suffixes", () => {
    expect(isPublicPath("/auth/signin.evil")).toBe(false);
    expect(isPublicPath("/pricing-evil")).toBe(false);
    expect(isPublicPath("/healthcheck")).toBe(false);
  });

  it("returns true for prefix public paths with sub-routes", () => {
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/api/auth/callback/github")).toBe(true);
    expect(isPublicPath("/api/v1/auth/session")).toBe(true);
  });
});

describe("sanitizeCallbackUrl", () => {
  it("rejects absolute and protocol-relative callback URLs", () => {
    expect(sanitizeCallbackUrl("https://evil.example/steal")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("//evil.example/steal")).toBe("/dashboard");
  });

  it("allows relative callback URLs", () => {
    expect(sanitizeCallbackUrl("/dashboard")).toBe("/dashboard");
    expect(sanitizeCallbackUrl("/org/123?tab=settings")).toBe("/org/123?tab=settings");
  });
});
