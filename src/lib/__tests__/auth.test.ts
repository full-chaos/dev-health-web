import { describe, expect, it, vi, beforeEach } from "vitest";

interface RedirectError extends Error {
  digest: string;
  url: string;
}

// Mock nextAuth.auth() — controls what the internal auth() wrapper returns
const { mockNextAuthAuth } = vi.hoisted(() => ({
  mockNextAuthAuth: vi.fn(),
}));

function createRedirectError(url: string): RedirectError {
  const error = new Error("NEXT_REDIRECT") as RedirectError;
  error.digest = "NEXT_REDIRECT";
  error.url = url;
  return error;
}

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw createRedirectError(url);
  }),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: mockNextAuthAuth,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
  CredentialsSignin: class CredentialsSignin extends Error {
    code = "credentials"
  },
}));

vi.mock("next-auth/providers/credentials", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/providers/github", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/providers/google", () => ({
  default: vi.fn(),
}));

vi.mock("next-auth/providers/gitlab", () => ({
  default: vi.fn(),
}));

import { requireSession } from "@/lib/auth";

describe("requireSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /auth/signin when no session exists", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(null);

    try {
      await requireSession();
      expect.fail("Should have thrown redirect");
    } catch (error: unknown) {
      const redirectErr = error as RedirectError;
      expect(redirectErr.digest).toBe("NEXT_REDIRECT");
      expect(redirectErr.url).toBe("/auth/signin");
    }
  });

  it("redirects to /auth/signin with callbackUrl when provided", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(null);

    try {
      await requireSession("/dashboard");
      expect.fail("Should have thrown redirect");
    } catch (error: unknown) {
      const redirectErr = error as RedirectError;
      expect(redirectErr.digest).toBe("NEXT_REDIRECT");
      expect(redirectErr.url).toBe(
        `/auth/signin?callbackUrl=${encodeURIComponent("/dashboard")}`
      );
    }
  });

  it("redirects to /auth/signin when session has no access_token", async () => {
    // auth() wrapper returns null when access_token is missing
    mockNextAuthAuth.mockResolvedValueOnce({ user: { id: "u1" } });

    try {
      await requireSession();
      expect.fail("Should have thrown redirect");
    } catch (error: unknown) {
      const redirectErr = error as RedirectError;
      expect(redirectErr.digest).toBe("NEXT_REDIRECT");
      expect(redirectErr.url).toBe("/auth/signin");
    }
  });

  it("redirects to /auth/onboard when user needs onboarding", async () => {
    mockNextAuthAuth.mockResolvedValueOnce({
      user: {
        id: "user-1",
        email: "test@example.com",
        org_id: "",
        role: "",
        is_superuser: false,
        permissions: [],
        needs_onboarding: true,
      },
      access_token: "token-123",
    });

    try {
      await requireSession();
      expect.fail("Should have thrown redirect");
    } catch (error: unknown) {
      const redirectErr = error as RedirectError;
      expect(redirectErr.digest).toBe("NEXT_REDIRECT");
      expect(redirectErr.url).toBe("/auth/onboard");
    }
  });

  it("returns session when user is fully onboarded", async () => {
    const session = {
      user: {
        id: "user-1",
        email: "test@example.com",
        org_id: "org-123",
        role: "owner",
        is_superuser: false,
        permissions: ["read", "write"],
        needs_onboarding: false,
      },
      access_token: "token-123",
    };

    mockNextAuthAuth.mockResolvedValueOnce(session);

    const result = await requireSession();
    expect(result).toEqual(session);
    expect(result.user.org_id).toBe("org-123");
    expect(result.user.needs_onboarding).toBe(false);
  });
});

describe("auth secret configuration", () => {
  it("throws at module load when secrets are missing in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    vi.resetModules();

    await expect(import("@/lib/auth")).rejects.toThrow(
      "AUTH_SECRET or NEXTAUTH_SECRET must be set in production"
    );

    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("does not throw during next build phase even without secrets", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-build");
    delete process.env.AUTH_SECRET;
    delete process.env.NEXTAUTH_SECRET;

    vi.resetModules();

    // Should resolve without throwing — build phase uses fallback
    await expect(import("@/lib/auth")).resolves.toBeDefined();

    vi.unstubAllEnvs();
    vi.resetModules();
  });
});
