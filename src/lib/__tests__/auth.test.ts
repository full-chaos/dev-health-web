import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

interface RedirectError extends Error {
    digest: string;
    url: string;
}

// Mock nextAuth.auth() — controls what the internal auth() wrapper returns
const { mockNextAuthAuth, nextAuthConfig } = vi.hoisted(() => {
    const config: { value: unknown } = { value: null };
    return {
        mockNextAuthAuth: vi.fn(),
        nextAuthConfig: config,
    };
});

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
    default: vi.fn((config: unknown) => {
        nextAuthConfig.value = config;
        return {
            auth: mockNextAuthAuth,
            handlers: { GET: vi.fn(), POST: vi.fn() },
            signIn: vi.fn(),
            signOut: vi.fn(),
        };
    }),
    CredentialsSignin: class CredentialsSignin extends Error {
        code = "credentials";
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

vi.mock("@/lib/origin", () => ({
    getBackendUrl: () => "http://localhost:8000",
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
                `/auth/signin?callbackUrl=${encodeURIComponent("/dashboard")}`,
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

    it("redirects to /auth/error?error=refresh_unavailable on transient refresh outage", async () => {
        mockNextAuthAuth.mockResolvedValueOnce({
            user: {
                id: "user-1",
                email: "test@example.com",
                org_id: "org-123",
                role: "owner",
                is_superuser: false,
                permissions: [],
                needs_onboarding: false,
            },
            access_token: undefined,
            error: "refresh_unavailable",
        });

        try {
            await requireSession();
            expect.fail("Should have thrown redirect");
        } catch (error: unknown) {
            const redirectErr = error as RedirectError;
            expect(redirectErr.digest).toBe("NEXT_REDIRECT");
            expect(redirectErr.url).toBe("/auth/error?error=refresh_unavailable");
        }
    });
});

describe("auth secret configuration", () => {
    it("loads without throwing when secrets are missing in production (Auth.js validates per-request)", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("NEXT_PHASE", "");
        delete process.env.AUTH_SECRET;
        delete process.env.NEXTAUTH_SECRET;

        vi.resetModules();

        await expect(import("@/lib/auth")).resolves.toBeDefined();

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

describe("jwt callback — token lifecycle", () => {
    interface JwtCallbackParams {
        token: Record<string, unknown>;
        user?: Record<string, unknown> | null;
        account?: Record<string, unknown> | null;
        trigger?: string;
        session?: Record<string, unknown> | null;
    }

    type JwtCallback = (params: JwtCallbackParams) => Promise<Record<string, unknown>>;

    interface NextAuthCallbacks {
        jwt?: JwtCallback;
    }

    interface CapturedNextAuthConfig {
        callbacks?: NextAuthCallbacks;
    }

    function getJwtCallback(): JwtCallback {
        const config = nextAuthConfig.value as CapturedNextAuthConfig | null;
        const jwt = config?.callbacks?.jwt;
        if (!jwt) throw new Error("JWT callback not captured from NextAuth config");
        return jwt;
    }

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("(a) clears token.error on fresh credentials login", async () => {
        const jwt = getJwtCallback();
        const result = await jwt({
            token: {
                id: "old-user",
                access_token: "stale-access",
                refresh_token: "stale-refresh",
                expires_at: Date.now() + 3600 * 1000,
                last_validated: Date.now(),
                error: "refresh_failed",
            },
            user: {
                id: "user-2",
                email: "fresh@example.com",
                org_id: "org-1",
                role: "member",
                is_superuser: false,
                permissions: [],
                needs_onboarding: false,
                access_token: "new-access-token",
                refresh_token: "new-refresh-token",
                expires_in: 3600,
            },
            account: null,
        });

        expect(result.error).toBeUndefined();
        expect(result.access_token).toBe("new-access-token");
    });

    it("(b) clears access_token but preserves refresh_token on transient 5xx failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 500,
                json: async () => ({ detail: "Internal server error" }),
            } as unknown as Response),
        );

        const jwt = getJwtCallback();
        const result = await jwt({
            token: {
                id: "user-1",
                access_token: "valid-access",
                refresh_token: "valid-refresh",
                expires_at: Date.now() - 1000,
                last_validated: Date.now(),
            },
            user: null,
            account: null,
        });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBe("valid-refresh");
        expect(result.error).toBe("refresh_unavailable");
    });

    it("(c) clears tokens on terminal 401 refresh failure", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: false,
                status: 401,
                json: async () => ({ detail: "Invalid or expired refresh token" }),
            } as unknown as Response),
        );

        const jwt = getJwtCallback();
        const result = await jwt({
            token: {
                id: "user-1",
                access_token: "valid-access",
                refresh_token: "valid-refresh",
                expires_at: Date.now() - 1000,
                last_validated: Date.now(),
            },
            user: null,
            account: null,
        });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBeUndefined();
        expect(result.error).toBe("refresh_failed");
    });

    it("(d) clears access_token but preserves refresh_token on network error (fetch throws)", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn().mockRejectedValueOnce(new Error("fetch failed: ECONNREFUSED")),
        );

        const jwt = getJwtCallback();
        const result = await jwt({
            token: {
                id: "user-1",
                access_token: "valid-access",
                refresh_token: "valid-refresh",
                expires_at: Date.now() - 1000,
                last_validated: Date.now(),
            },
            user: null,
            account: null,
        });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBe("valid-refresh");
        expect(result.error).toBe("refresh_unavailable");
    });

    it("(e) clears error on refresh success after prior transient failure", async () => {
        const newAccessToken = "recovered-access-token";
        const newRefreshToken = "recovered-refresh-token";
        vi.stubGlobal(
            "fetch",
            vi.fn().mockResolvedValueOnce({
                ok: true,
                status: 200,
                json: async () => ({
                    access_token: newAccessToken,
                    refresh_token: newRefreshToken,
                    expires_in: 3600,
                }),
            } as unknown as Response),
        );

        const jwt = getJwtCallback();
        const result = await jwt({
            token: {
                id: "user-1",
                access_token: undefined,
                refresh_token: "stale-refresh-token",
                expires_at: Date.now() - 1000, // expired, triggers refresh retry
                last_validated: Date.now() - 3600 * 1000,
                error: "refresh_unavailable",
            },
            user: null,
            account: null,
        });

        expect(result.access_token).toBe(newAccessToken);
        expect(result.refresh_token).toBe(newRefreshToken);
        expect(result.expires_at as number).toBeGreaterThan(Date.now());
        expect(result.error).toBeUndefined();
    });

    // CHAOS-2232: periodic /auth/validate backoff — a 429/5xx/network failure must
    // not invalidate the session AND must not retry on every subsequent request.
    const VALIDATION_INTERVAL = 5 * 60 * 1000;

    function validationDueToken(): Record<string, unknown> {
        return {
            id: "user-1",
            access_token: "valid-access",
            refresh_token: "valid-refresh",
            expires_at: Date.now() + 3600 * 1000, // not expired — skips refresh path
            last_validated: Date.now() - VALIDATION_INTERVAL - 1000, // validation due
        };
    }

    it("(f) 429 on /auth/validate preserves session and backs off instead of retrying every request", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ detail: "rate limited" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const first = await jwt({ token: validationDueToken(), user: null, account: null });

        expect(first.access_token).toBe("valid-access");
        expect(first.refresh_token).toBe("valid-refresh");
        expect(first.error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // Backoff stamped: next attempt is deferred, not permanently skipped
        const nextDue = (first.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now());
        expect(nextDue).toBeLessThanOrEqual(Date.now() + 60 * 1000);

        // Immediate follow-up callback must NOT re-fetch
        const second = await jwt({ token: first, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.access_token).toBe("valid-access");
    });

    it("(g) network error on /auth/validate preserves session and backs off", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({ token: validationDueToken(), user: null, account: null });

        expect(result.access_token).toBe("valid-access");
        expect(result.error).toBeUndefined();
        const nextDue = (result.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now());

        await jwt({ token: result, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("(h) successful validation after backoff window stamps a full interval", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ valid: true }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const token = validationDueToken();
        // Simulate an elapsed backoff: validation due again
        const before = Date.now();
        const result = await jwt({ token, user: null, account: null });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.access_token).toBe("valid-access");
        expect(result.last_validated as number).toBeGreaterThanOrEqual(before);
    });

    it("(i) valid:false from /auth/validate still invalidates the session", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ valid: false }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({ token: validationDueToken(), user: null, account: null });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBeUndefined();
        expect(result.error).toBe("user_invalid");
    });

    it("(j) 401 on /auth/validate invalidates the session — no backoff reprieve", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 401,
            json: async () => ({ detail: "invalid token" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({ token: validationDueToken(), user: null, account: null });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBeUndefined();
        expect(result.error).toBe("user_invalid");
    });

    it("(k) 503 on /auth/validate preserves session and backs off", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ detail: "service unavailable" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const first = await jwt({ token: validationDueToken(), user: null, account: null });

        expect(first.access_token).toBe("valid-access");
        expect(first.refresh_token).toBe("valid-refresh");
        expect(first.error).toBeUndefined();
        const nextDue = (first.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now());
        expect(nextDue).toBeLessThanOrEqual(Date.now() + 60 * 1000);

        // Immediate follow-up callback must NOT re-fetch
        await jwt({ token: first, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // ── Impersonation status sync (CHAOS-2309 / CHAOS-2327) ────────────────
    // The jwt callback mirrors backend impersonation state into the token via
    // a 30s-throttled poll; update({ impersonationChanged: true }) bypasses
    // the throttle. These pin the field lifecycle at the callback level so a
    // future auth refactor can't break it while component tests (which mock
    // the session) still pass.

    function superuserToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            id: "admin-1",
            access_token: "valid-access",
            refresh_token: "valid-refresh",
            is_superuser: true,
            expires_at: Date.now() + 3600 * 1000,
            last_validated: Date.now(),
            // Recent check — within the 30s throttle window
            last_impersonation_check: Date.now() - 1000,
            ...overrides,
        };
    }

    function statusFetchMock(body: Record<string, unknown>) {
        return vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => body,
        } as unknown as Response);
    }

    it("(l) impersonationChanged bypasses the poll throttle and stores the target identity", async () => {
        const fetchMock = statusFetchMock({
            is_impersonating: true,
            target_user_id: "target-1",
            target_email: "target@example.com",
            target_org_id: "org-target",
        });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken(),
            user: null,
            account: null,
            trigger: "update",
            session: { impersonationChanged: true },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v1/admin/impersonate/status");
        expect(result.is_impersonating).toBe(true);
        expect(result.impersonated_user_id).toBe("target-1");
        expect(result.impersonated_email).toBe("target@example.com");
        expect(result.impersonated_org_id).toBe("org-target");
    });

    it("(m) a status=false poll clears all impersonation fields, including the email", async () => {
        const fetchMock = statusFetchMock({
            is_impersonating: false,
            target_user_id: null,
            target_email: null,
            target_org_id: null,
        });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken({
                is_impersonating: true,
                impersonated_user_id: "target-1",
                impersonated_email: "target@example.com",
                impersonated_org_id: "org-target",
            }),
            user: null,
            account: null,
            trigger: "update",
            session: { impersonationChanged: true },
        });

        expect(result.is_impersonating).toBe(false);
        expect(result.impersonated_user_id).toBeUndefined();
        expect(result.impersonated_email).toBeUndefined();
        expect(result.impersonated_org_id).toBeUndefined();
    });

    it("(n) legacy startImpersonation update payloads are ignored and do not bypass the throttle (CHAOS-2327)", async () => {
        const fetchMock = statusFetchMock({ is_impersonating: true });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken(),
            user: null,
            account: null,
            trigger: "update",
            session: { startImpersonation: { status: "active" } },
        });

        // Throttle window still active — no poll, no trusted client payload
        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.is_impersonating).toBeUndefined();
    });
});
