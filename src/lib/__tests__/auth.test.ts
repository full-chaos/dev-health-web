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

    const REFRESH_BACKOFF_BASE = 60 * 1000;
    const REFRESH_BACKOFF_FLOOR = 5 * 1000;

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

    function refreshDueToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            id: "user-1",
            access_token: "valid-access",
            refresh_token: "valid-refresh",
            expires_at: Date.now() - 1000,
            last_validated: Date.now(),
            ...overrides,
        };
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

    it("(e1) 429 on /auth/refresh preserves refresh_token and backs off instead of retrying every request", async () => {
        vi.spyOn(Math, "random").mockReturnValue(1.0);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ detail: "rate limited" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const first = await jwt({
            token: refreshDueToken(),
            user: null,
            account: null,
        });

        expect(first.access_token).toBeUndefined();
        expect(first.refresh_token).toBe("valid-refresh");
        expect(first.error).toBe("refresh_unavailable");
        expect(first.refresh_failures).toBe(1);
        const nextRefreshAt = (first.expires_at as number) - 5 * 60 * 1000;
        expect(nextRefreshAt).toBeGreaterThan(Date.now());
        expect(nextRefreshAt).toBeLessThanOrEqual(Date.now() + REFRESH_BACKOFF_BASE + 100);

        const second = await jwt({ token: first, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.refresh_token).toBe("valid-refresh");
        expect(second.error).toBe("refresh_unavailable");
    });

    it("(e2) refresh success resets refresh_failures after a transient backoff", async () => {
        const newAccessToken = "recovered-access-token";
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({
                access_token: newAccessToken,
                expires_in: 3600,
            }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: refreshDueToken({
                access_token: undefined,
                error: "refresh_unavailable",
                refresh_failures: 3,
            }),
            user: null,
            account: null,
        });

        expect(result.access_token).toBe(newAccessToken);
        expect(result.refresh_token).toBe("valid-refresh");
        expect(result.refresh_failures).toBe(0);
        expect(result.error).toBeUndefined();
    });

    it("(e3) network error on /auth/refresh uses the full-jitter floor", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0.0);
        const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: refreshDueToken(),
            user: null,
            account: null,
        });

        const nextRefreshAt = (result.expires_at as number) - 5 * 60 * 1000;
        const delay = nextRefreshAt - Date.now();
        expect(result.refresh_failures).toBe(1);
        expect(delay).toBeGreaterThanOrEqual(REFRESH_BACKOFF_FLOOR - 100);
        expect(delay).toBeLessThanOrEqual(REFRESH_BACKOFF_FLOOR + 100);
    });

    // CHAOS-2232 / CHAOS-2458: periodic /auth/validate backoff — a 429/5xx/network failure must
    // not invalidate the session AND must not retry on every subsequent request. Backoff is
    // jittered exponential (base 60s, cap 15min) so concurrent tabs/instances spread out.
    const VALIDATION_INTERVAL = 5 * 60 * 1000;
    const VALIDATION_BACKOFF_BASE = 60 * 1000;
    const VALIDATION_BACKOFF_CAP = 15 * 60 * 1000;

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
        const first = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

        expect(first.access_token).toBe("valid-access");
        expect(first.refresh_token).toBe("valid-refresh");
        expect(first.error).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        // Backoff stamped: next attempt is deferred, not permanently skipped.
        // With full jitter the delay is in [floor, base] = [5s, 60s] for failure 1.
        const nextDue = (first.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now());
        expect(nextDue).toBeLessThanOrEqual(Date.now() + VALIDATION_BACKOFF_BASE);

        // Immediate follow-up callback must NOT re-fetch
        const second = await jwt({ token: first, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.access_token).toBe("valid-access");
    });

    it("(g) network error on /auth/validate preserves session and backs off", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

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
        const result = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

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
        const result = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

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
        const first = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

        expect(first.access_token).toBe("valid-access");
        expect(first.refresh_token).toBe("valid-refresh");
        expect(first.error).toBeUndefined();
        const nextDue = (first.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now());
        expect(nextDue).toBeLessThanOrEqual(Date.now() + VALIDATION_BACKOFF_BASE);

        // Immediate follow-up callback must NOT re-fetch
        await jwt({ token: first, user: null, account: null });
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    // CHAOS-2458: jittered exponential backoff — new tests

    it("(r) consecutive 429 failures produce escalating (capped) backoff delays", async () => {
        // Pin Math.random to 1.0 so jitter = cappedDelay (upper bound) — makes
        // the escalation easy to assert without floating-point ambiguity.
        vi.spyOn(Math, "random").mockReturnValue(1.0);
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ detail: "rate limited" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();

        // Failure 1: cappedDelay = min(cap, base * 2^0) = 60s; random=1 → delay = floor + 1*(60s-floor) = 60s
        const t1 = validationDueToken();
        const r1 = await jwt({ token: t1, user: null, account: null });
        expect(r1.validation_failures).toBe(1);
        const delay1 = (r1.last_validated as number) - (Date.now() - VALIDATION_INTERVAL);
        expect(delay1).toBeGreaterThanOrEqual(VALIDATION_BACKOFF_BASE - 100);
        expect(delay1).toBeLessThanOrEqual(VALIDATION_BACKOFF_BASE + 100);

        // Failure 2: cappedDelay = min(cap, base * 2^1) = 120s; random=1 → delay = 120s
        const t2 = {
            ...r1,
            last_validated: Date.now() - VALIDATION_INTERVAL - 1000,
        };
        const r2 = await jwt({ token: t2, user: null, account: null });
        expect(r2.validation_failures).toBe(2);
        const delay2 = (r2.last_validated as number) - (Date.now() - VALIDATION_INTERVAL);
        expect(delay2).toBeGreaterThan(delay1);

        // Failure 3: cappedDelay = min(cap, base * 2^2) = 240s; random=1 → delay = 240s
        const t3 = {
            ...r2,
            last_validated: Date.now() - VALIDATION_INTERVAL - 1000,
        };
        const r3 = await jwt({ token: t3, user: null, account: null });
        expect(r3.validation_failures).toBe(3);
        const delay3 = (r3.last_validated as number) - (Date.now() - VALIDATION_INTERVAL);
        expect(delay3).toBeGreaterThan(delay2);

        // Cap: delay never exceeds VALIDATION_BACKOFF_CAP (15 min)
        expect(delay3).toBeLessThanOrEqual(VALIDATION_BACKOFF_CAP + 100);
    });

    it("(s) jitter is applied — delay varies with Math.random (full window)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ detail: "rate limited" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // failure 1: cappedDelay = base = 60s
        // full jitter: delay = floor + random * (cappedDelay - floor)
        //   random=0 → delay = floor (5s)
        //   random=1 → delay = cappedDelay (60s)

        // Low random → delay near floor (5s)
        vi.spyOn(Math, "random").mockReturnValue(0.0);
        const tLow = validationDueToken();
        const rLow = await jwt({ token: tLow, user: null, account: null });
        const delayLow = (rLow.last_validated as number) - (Date.now() - VALIDATION_INTERVAL);

        // High random → delay near cappedDelay (60s)
        vi.spyOn(Math, "random").mockReturnValue(1.0);
        const tHigh = validationDueToken();
        const rHigh = await jwt({ token: tHigh, user: null, account: null });
        const delayHigh = (rHigh.last_validated as number) - (Date.now() - VALIDATION_INTERVAL);

        // Lower bound: ~5s (floor)
        expect(delayLow).toBeGreaterThanOrEqual(4900);
        expect(delayLow).toBeLessThanOrEqual(5100);
        // Upper bound: ~60s (cappedDelay = base)
        expect(delayHigh).toBeGreaterThanOrEqual(VALIDATION_BACKOFF_BASE - 100);
        expect(delayHigh).toBeLessThanOrEqual(VALIDATION_BACKOFF_BASE + 100);
        // High > Low — full window spread
        expect(delayHigh).toBeGreaterThan(delayLow);
    });

    it("(t) success after failures resets the failure counter to 0", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ valid: true }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // Token that already has 3 accumulated failures
        const token = {
            ...validationDueToken(),
            validation_failures: 3,
        };
        const result = await jwt({ token, user: null, account: null });

        expect(result.access_token).toBe("valid-access");
        expect(result.error).toBeUndefined();
        expect(result.validation_failures).toBe(0);
    });

    it("(u) many consecutive 429 failures keep the session recoverable (no forced logout)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 429,
            json: async () => ({ detail: "rate limited" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // Token already at 9 failures — well past the old threshold of 5
        const token = {
            ...validationDueToken(),
            validation_failures: 9,
        };
        const result = await jwt({ token, user: null, account: null });

        // Session must remain recoverable — tokens preserved, no terminal error
        expect(result.access_token).toBe("valid-access");
        expect(result.refresh_token).toBe("valid-refresh");
        expect(result.error).toBeUndefined();
        expect(result.validation_failures).toBe(10);
        // Delay is capped at 15 min regardless of failure count
        const nextDue = (result.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeLessThanOrEqual(Date.now() + VALIDATION_BACKOFF_CAP + 100);
    });

    it("(v) many consecutive network errors keep the session recoverable (no forced logout)", async () => {
        const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // Token already at 9 failures — well past the old threshold of 5
        const token = {
            ...validationDueToken(),
            validation_failures: 9,
        };
        const result = await jwt({ token, user: null, account: null });

        // Session must remain recoverable — tokens preserved, no terminal error
        expect(result.access_token).toBe("valid-access");
        expect(result.refresh_token).toBe("valid-refresh");
        expect(result.error).toBeUndefined();
        expect(result.validation_failures).toBe(10);
    });

    it("(x) long run of transient failures then success resets counter and restores normal cadence", async () => {
        const failMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 503,
            json: async () => ({ detail: "service unavailable" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", failMock);

        const jwt = getJwtCallback();

        // Simulate 6 consecutive failures — well past the old threshold of 5
        let tok: Record<string, unknown> = validationDueToken();
        for (let i = 1; i <= 6; i++) {
            tok = await jwt({
                token: {
                    ...tok,
                    last_validated: Date.now() - VALIDATION_INTERVAL - 1000,
                },
                user: null,
                account: null,
            });
            // Session must remain recoverable throughout
            expect(tok.access_token).toBe("valid-access");
            expect(tok.refresh_token).toBe("valid-refresh");
            expect(tok.error).toBeUndefined();
            expect(tok.validation_failures).toBe(i);
        }

        // Backend recovers — next validation succeeds
        const successMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ valid: true }),
        } as unknown as Response);
        vi.stubGlobal("fetch", successMock);

        const recovered = await jwt({
            token: {
                ...tok,
                last_validated: Date.now() - VALIDATION_INTERVAL - 1000,
            },
            user: null,
            account: null,
        });

        // Counter reset, normal 5-min cadence restored
        expect(recovered.access_token).toBe("valid-access");
        expect(recovered.refresh_token).toBe("valid-refresh");
        expect(recovered.error).toBeUndefined();
        expect(recovered.validation_failures).toBe(0);
        // last_validated is now (full interval stamp, not a backoff offset)
        const nextDue = (recovered.last_validated as number) + VALIDATION_INTERVAL;
        expect(nextDue).toBeGreaterThan(Date.now() + VALIDATION_INTERVAL - 1000);
    });

    it("(w) valid:false from /auth/validate still invalidates the session (unchanged)", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            json: async () => ({ valid: false }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: validationDueToken(),
            user: null,
            account: null,
        });

        expect(result.access_token).toBeUndefined();
        expect(result.refresh_token).toBeUndefined();
        expect(result.error).toBe("user_invalid");
    });

    // ── Impersonation status sync (CHAOS-2309 / CHAOS-2327 / CHAOS-2328) ───
    // The jwt callback mirrors backend impersonation state into the token by
    // polling the (Valkey-cached) status endpoint on superuser token reads,
    // bounded by a ~3s per-process memo that update() triggers bypass. These
    // pin the field lifecycle at the callback level so a future auth refactor
    // can't break it while component tests (which mock the session) still
    // pass. Each test uses a distinct token id — the memo is module-global.

    function superuserToken(overrides: Record<string, unknown> = {}): Record<string, unknown> {
        return {
            id: "admin-1",
            access_token: "valid-access",
            refresh_token: "valid-refresh",
            is_superuser: true,
            expires_at: Date.now() + 3600 * 1000,
            last_validated: Date.now(),
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

    it("(l) a plain superuser token read polls status and stores the target identity", async () => {
        const fetchMock = statusFetchMock({
            is_impersonating: true,
            target_user_id: "target-1",
            target_email: "target@example.com",
            target_org_id: "org-target",
        });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // Plain session read — no update trigger required (CHAOS-2328)
        const result = await jwt({
            token: superuserToken({ id: "admin-l" }),
            user: null,
            account: null,
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
                id: "admin-m",
                is_impersonating: true,
                impersonated_user_id: "target-1",
                impersonated_email: "target@example.com",
                impersonated_org_id: "org-target",
            }),
            user: null,
            account: null,
        });

        expect(result.is_impersonating).toBe(false);
        expect(result.impersonated_user_id).toBeUndefined();
        expect(result.impersonated_email).toBeUndefined();
        expect(result.impersonated_org_id).toBeUndefined();
    });

    it("(n) update payloads are never trusted — the server-verified status wins (CHAOS-2327)", async () => {
        // Client claims an active impersonation via the legacy payload, but
        // the backend says none is active: the token must reflect the server.
        const fetchMock = statusFetchMock({
            is_impersonating: false,
            target_user_id: null,
            target_email: null,
            target_org_id: null,
        });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken({ id: "admin-n" }),
            user: null,
            account: null,
            trigger: "update",
            session: {
                startImpersonation: { status: "active", target_user: { id: "x" } },
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.is_impersonating).toBe(false);
        expect(result.impersonated_user_id).toBeUndefined();
    });

    it("(o) non-superuser token reads never call the status endpoint", async () => {
        const fetchMock = statusFetchMock({ is_impersonating: false });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken({ id: "admin-o", is_superuser: false }),
            user: null,
            account: null,
        });

        expect(fetchMock).not.toHaveBeenCalled();
        expect(result.is_impersonating).toBeUndefined();
    });

    it("(p) update payloads are not trusted even when the status poll fails", async () => {
        // Codex finding: (n) only proved the property for a successful 200
        // false. A malicious payload must also be rejected when the server
        // can't be reached — fields stay at their previous (absent) values.
        const fetchMock = vi.fn().mockResolvedValue({
            ok: false,
            status: 500,
            json: async () => ({ detail: "boom" }),
        } as unknown as Response);
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        const result = await jwt({
            token: superuserToken({ id: "admin-p" }),
            user: null,
            account: null,
            trigger: "update",
            session: {
                startImpersonation: { status: "active", target_user: { id: "evil" } },
                impersonationChanged: true,
            },
        });

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(result.is_impersonating).toBeUndefined();
        expect(result.impersonated_user_id).toBeUndefined();
        expect(result.impersonated_org_id).toBeUndefined();
    });

    it("(q) consecutive plain reads share the memo; update() triggers bypass it", async () => {
        const fetchMock = statusFetchMock({
            is_impersonating: true,
            target_user_id: "target-q",
            target_email: "q@example.com",
            target_org_id: "org-q",
        });
        vi.stubGlobal("fetch", fetchMock);

        const jwt = getJwtCallback();
        // Two plain reads within the memo TTL → one backend fetch, but both
        // tokens carry the synced state.
        await jwt({
            token: superuserToken({ id: "admin-q" }),
            user: null,
            account: null,
        });
        const second = await jwt({
            token: superuserToken({ id: "admin-q" }),
            user: null,
            account: null,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(second.is_impersonating).toBe(true);
        expect(second.impersonated_user_id).toBe("target-q");

        // An update() trigger must bypass the memo and re-poll immediately.
        await jwt({
            token: superuserToken({ id: "admin-q" }),
            user: null,
            account: null,
            trigger: "update",
            session: { impersonationChanged: true },
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});
