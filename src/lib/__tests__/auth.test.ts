import { describe, expect, it, vi, beforeEach } from "vitest";

// Mock nextAuth.auth() — controls what the internal auth() wrapper returns
const { mockNextAuthAuth } = vi.hoisted(() => ({
  mockNextAuthAuth: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    const error = new Error("NEXT_REDIRECT");
    (error as any).digest = "NEXT_REDIRECT";
    (error as any).url = url;
    throw error;
  }),
}));

vi.mock("next-auth", () => ({
  default: vi.fn(() => ({
    auth: mockNextAuthAuth,
    handlers: { GET: vi.fn(), POST: vi.fn() },
    signIn: vi.fn(),
    signOut: vi.fn(),
  })),
}));

vi.mock("next-auth/providers/credentials", () => ({
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
    } catch (error: any) {
      expect(error.digest).toBe("NEXT_REDIRECT");
      expect(error.url).toBe("/auth/signin");
    }
  });

  it("redirects to /auth/signin with callbackUrl when provided", async () => {
    mockNextAuthAuth.mockResolvedValueOnce(null);

    try {
      await requireSession("/dashboard");
      expect.fail("Should have thrown redirect");
    } catch (error: any) {
      expect(error.digest).toBe("NEXT_REDIRECT");
      expect(error.url).toBe(
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
    } catch (error: any) {
      expect(error.digest).toBe("NEXT_REDIRECT");
      expect(error.url).toBe("/auth/signin");
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
    } catch (error: any) {
      expect(error.digest).toBe("NEXT_REDIRECT");
      expect(error.url).toBe("/auth/onboard");
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
