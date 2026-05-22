import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Session } from "next-auth";

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

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";
import { isPublicPath, sanitizeCallbackUrl, proxy } from "@/proxy";

const mockCheckRateLimit = vi.mocked(checkRateLimit);

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  mockCheckRateLimit.mockResolvedValue({ limited: false, retryAfter: 0 });
});

describe("isPublicPath", () => {
  it("returns true for exact public paths", () => {
    expect(isPublicPath("/")).toBe(true);
    expect(isPublicPath("/pricing")).toBe(true);
    expect(isPublicPath("/privacy")).toBe(true);
    expect(isPublicPath("/terms")).toBe(true);
    expect(isPublicPath("/auth/signin")).toBe(true);
    expect(isPublicPath("/favicon.ico")).toBe(true);
  });

  it("returns false for public paths with appended suffixes", () => {
    expect(isPublicPath("/auth/signin.evil")).toBe(false);
    expect(isPublicPath("/pricing-evil")).toBe(false);
    expect(isPublicPath("/privacy-policy")).toBe(false);
    expect(isPublicPath("/terms-and-conditions")).toBe(false);
    expect(isPublicPath("/healthcheck")).toBe(false);
  });

  it("returns true for prefix public paths with sub-routes", () => {
    expect(isPublicPath("/_next/static/chunk.js")).toBe(true);
    expect(isPublicPath("/api/auth/callback/github")).toBe(true);
    expect(isPublicPath("/api/v1/auth/session")).toBe(true);
    // marketing subroutes are public (buyer landings, pricing, privacy, terms, hub)
    expect(isPublicPath("/marketing")).toBe(true);
    expect(isPublicPath("/marketing/pricing")).toBe(true);
    expect(isPublicPath("/marketing/privacy")).toBe(true);
    expect(isPublicPath("/marketing/terms")).toBe(true);
    expect(isPublicPath("/marketing/vp-engineering")).toBe(true);
    expect(isPublicPath("/marketing/platform-devex")).toBe(true);
    expect(isPublicPath("/marketing/engineering-manager")).toBe(true);
    expect(isPublicPath("/marketing/cto-architecture")).toBe(true);
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

  const makeRequest = (path: string) => new NextRequest(new URL(path, "http://localhost:3000"));

  const baseUser = { id: "u-1", name: "Test", email: "t@t.com" } as const;

  const superuserNoOrg: Session = {
    access_token: "test-token",
    user: { ...baseUser, is_superuser: true },
    expires: "2099-01-01T00:00:00.000Z",
  };

  const superuserWithOrg: Session = {
    access_token: "test-token",
    user: { ...baseUser, is_superuser: true, org_id: "org-123" },
    expires: "2099-01-01T00:00:00.000Z",
  };

  const regularUserNoOrg: Session = {
    access_token: "test-token",
    user: { ...baseUser, is_superuser: false },
    expires: "2099-01-01T00:00:00.000Z",
  };

  const regularUserWithOrg: Session = {
    access_token: "test-token",
    user: { ...baseUser, is_superuser: false, org_id: "org-123" },
    expires: "2099-01-01T00:00:00.000Z",
  };

  it("allows superuser without org to access /settings", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("allows regular user without org to access /settings", async () => {
    mockAuth.mockResolvedValue(regularUserNoOrg);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("allows user with org to access /settings", async () => {
    mockAuth.mockResolvedValue(regularUserWithOrg);
    const res = await proxy(makeRequest("/settings"));
    expect(res.status).not.toBe(303);
  });

  it("redirects superuser without org from non-exempt path to /superadmin", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/superadmin");
  });

  it("redirects regular user without org from non-exempt path to /auth/onboard", async () => {
    mockAuth.mockResolvedValue(regularUserNoOrg);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).toBe(303);
    expect(new URL(res.headers.get("Location")!).pathname).toBe("/auth/onboard");
  });

  it("allows superuser without org to access other exempt paths", async () => {
    mockAuth.mockResolvedValue(superuserNoOrg);
    for (const path of ["/superadmin", "/demo", "/auth/onboard"]) {
      const res = await proxy(makeRequest(path));
      expect(res.status).not.toBe(303);
    }
  });

  it("does not redirect users with org from any path", async () => {
    mockAuth.mockResolvedValue(superuserWithOrg);
    const res = await proxy(makeRequest("/dashboard"));
    expect(res.status).not.toBe(303);
  });
});

describe("proxy rate limiting", () => {
  const mockAuth = vi.mocked(auth);
  const makeRequest = (path: string, method = "POST") =>
    new NextRequest(new URL(path, "http://localhost:3000"), {
      method,
      headers: {
        "user-agent": "proxy-test",
        "x-forwarded-for": "198.51.100.10",
      },
    });

  const session: Session = {
    access_token: "test-token",
    user: { id: "u-123", name: "Test", email: "t@t.com", org_id: "org-123" },
    expires: "2099-01-01T00:00:00.000Z",
  };

  it("limits login with the auth-login route options", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfter: 60 });

    const res = await proxy(makeRequest("/api/v1/auth/login"));

    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    await expect(res.json()).resolves.toEqual({ detail: "Rate limit exceeded", retry_after: 60 });
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^proxy:POST:auth-login:ip:anon:/),
      { failClosed: true, namespace: "auth-login", windowMs: 15 * 60_000, maxRequests: 10 },
    );
  });

  it("limits password reset with the auth-pwreset route options", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfter: 120 });

    const res = await proxy(makeRequest("/api/v1/auth/password-reset"));

    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^proxy:POST:auth-pwreset:ip:anon:/),
      { failClosed: true, namespace: "auth-pwreset", windowMs: 60 * 60_000, maxRequests: 3 },
    );
  });

  it("limits forgot-password with the auth-pwreset route options (CHAOS-1768)", async () => {
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfter: 120 });

    const res = await proxy(makeRequest("/api/v1/auth/forgot-password"));

    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      expect.stringMatching(/^proxy:POST:auth-pwreset:ip:anon:/),
      { failClosed: true, namespace: "auth-pwreset", windowMs: 60 * 60_000, maxRequests: 3 },
    );
  });

  it("keys authenticated credential tests by user id", async () => {
    mockAuth.mockResolvedValue(session);
    mockCheckRateLimit.mockResolvedValue({ limited: true, retryAfter: 30 });

    const res = await proxy(makeRequest("/api/v1/admin/credentials/test-connection"));

    expect(res.status).toBe(429);
    expect(mockCheckRateLimit).toHaveBeenCalledWith(
      "proxy:POST:admin-credentials-test-connection:user:u-123",
      { failClosed: true, namespace: "admin-cred-test", windowMs: 60 * 60_000, maxRequests: 10 },
    );
  });

  it("does not limit GET requests without a route table match", async () => {
    const res = await proxy(makeRequest("/api/v1/auth/login", "GET"));

    expect(res.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("does not limit NextAuth /api/auth routes", async () => {
    const res = await proxy(makeRequest("/api/auth/callback/github"));

    expect(res.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });

  it("bypasses proxy limiter in non-production test mode", async () => {
    vi.stubEnv("DEV_HEALTH_TEST_MODE", "true");
    vi.stubEnv("NODE_ENV", "test");

    const res = await proxy(makeRequest("/api/v1/auth/login"));

    expect(res.status).not.toBe(429);
    expect(mockCheckRateLimit).not.toHaveBeenCalled();
  });
});
