import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

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

import { auth } from "@/lib/auth";
import { isPublicPath, sanitizeCallbackUrl, proxy } from "@/proxy";

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

describe("org-scoped route guard", () => {
  const mockAuth = vi.mocked(auth);

  const makeRequest = (path: string) =>
    new NextRequest(new URL(path, "http://localhost:3000"));

  const superuserNoOrg = {
    access_token: "test-token",
    user: { is_superuser: true, org_id: undefined, needs_onboarding: false },
  };

  const superuserWithOrg = {
    access_token: "test-token",
    user: { is_superuser: true, org_id: "org-123", needs_onboarding: false },
  };

  const regularUserNoOrg = {
    access_token: "test-token",
    user: { is_superuser: false, org_id: undefined, needs_onboarding: false },
  };

  const regularUserWithOrg = {
    access_token: "test-token",
    user: { is_superuser: false, org_id: "org-123", needs_onboarding: false },
  };

  it("allows superuser without org to access /settings", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg as any);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("allows regular user without org to access /settings", async () => {
    mockAuth.mockResolvedValue(regularUserNoOrg as any);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("allows user with org to access /settings", async () => {
    mockAuth.mockResolvedValue(regularUserWithOrg as any);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("redirects superuser without org from non-exempt path to /superadmin", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg as any);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/superadmin");
  });

  it("redirects regular user without org from non-exempt path to /auth/onboard", async () => {
    mockAuth.mockResolvedValue(regularUserNoOrg as any);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/onboard");
  });

  it("allows superuser without org to access other exempt paths", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg as any);
    for (const path of ["/superadmin", "/demo", "/auth/onboard"]) {
      const res = await proxy(makeRequest(path));
      expect(res.status).not.toBe(303);
    }
  });

  it("does not redirect users with org from any path", async () => {
    mockAuth.mockResolvedValue(superuserWithOrg as any);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).not.toBe(303);
  });
});
