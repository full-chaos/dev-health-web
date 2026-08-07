import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// NOTE (CHAOS-3589): there is deliberately NO `vi.mock("ioredis", ...)` here.
// `src/lib/redis.ts` loads the driver through a runtime `require("ioredis")`,
// which goes straight to Node's CJS loader and bypasses Vitest's module mocker
// entirely — a factory mock on "ioredis" is silently dead. It read as isolation
// while providing none: with `REDIS_URL` exported in the environment (every dev
// machine running the compose stack does) `getRedis()` handed back a *real*
// ioredis client and these tests talked to a live server.
//
// Isolation is enforced two ways instead:
//   1. Each `describe` pins `REDIS_URL` with `vi.stubEnv` instead of inheriting
//      whatever the ambient environment happens to have, and asserts the branch
//      it means to exercise (`getRedis()` null vs. non-null).
//   2. Tests that take the Redis branch call `stubRedisCommands()`, which
//      installs loud recording defaults for every command `rate-limit.ts` can
//      issue. `rate-limit.ts` swallows Redis errors by design, so a throwing
//      default alone would be invisible — `expectNoUnstubbedRedisCommands()`
//      turns any command the test forgot to stub into a failure.

vi.mock("@sentry/nextjs", () => ({
    withScope: vi.fn(
        (
            callback: (scope: {
                setTag: ReturnType<typeof vi.fn>;
                setContext: ReturnType<typeof vi.fn>;
            }) => void,
        ) => callback({ setTag: vi.fn(), setContext: vi.fn() }),
    ),
    captureException: vi.fn(),
    captureMessage: vi.fn(),
}));

// Mock logger to avoid pino in test
vi.mock("@/lib/logger", () => ({
    logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    },
}));

/** Commands `rate-limit.ts` can issue against the Redis client. */
const REDIS_COMMANDS = ["incr", "expire", "ttl"] as const;
type RedisCommand = (typeof REDIS_COMMANDS)[number];

/** Commands a test triggered without stubbing them first. */
let unstubbedRedisCommands: RedisCommand[] = [];

type CommandStubs = Record<RedisCommand, ReturnType<typeof vi.fn>>;

/**
 * Replace every command on `client` with a recording default.
 *
 * Tests then override the specific commands they mean to drive. Anything left
 * on the default is recorded and surfaced by `expectNoUnstubbedRedisCommands()`,
 * so a test can never quietly reach the live server `REDIS_URL` points at.
 */
function stubRedisCommands(client: unknown): CommandStubs {
    unstubbedRedisCommands = [];
    const stubbed = client as CommandStubs;
    for (const command of REDIS_COMMANDS) {
        stubbed[command] = vi.fn(async () => {
            unstubbedRedisCommands.push(command);
            throw new Error(`un-stubbed Redis ${command.toUpperCase()}`);
        });
    }
    return stubbed;
}

function expectNoUnstubbedRedisCommands(): void {
    expect(unstubbedRedisCommands).toEqual([]);
}

describe("rate-limit", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
        unstubbedRedisCommands = [];
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    describe("in-memory fallback (no REDIS_URL)", () => {
        beforeEach(() => {
            // Pin the premise rather than inheriting it. Developer machines and
            // compose-backed lanes export REDIS_URL=redis://localhost:6379/0,
            // which used to route this whole block at a live Redis: the
            // fail-closed test saw a healthy backend, and the window-expiry test
            // could not move Redis's server-side window with a mocked Date.now.
            // The surviving assertions then depended on real counter state that
            // outlives the run by the 1-hour window TTL (CHAOS-3589).
            vi.stubEnv("REDIS_URL", undefined);
        });

        /**
         * Load `rate-limit` with the in-memory branch proven to be the one in
         * play. Asserting `getRedis()` is null makes an ambient REDIS_URL fail
         * loudly here instead of silently changing which code path is tested.
         */
        async function loadInMemoryRateLimit() {
            const { getRedis, _resetRedisClient } = await import("@/lib/redis");
            _resetRedisClient();
            expect(getRedis()).toBeNull();

            const rateLimit = await import("@/lib/rate-limit");
            rateLimit._resetMemoryStore();
            return rateLimit;
        }

        it("allows requests under the limit", async () => {
            const { isRateLimited } = await loadInMemoryRateLimit();

            const result = await isRateLimited("user-1");
            expect(result).toBe(false);
        });

        it("fails closed when Redis is missing and failClosed is true", async () => {
            const { checkRateLimit, isRateLimited } = await loadInMemoryRateLimit();

            await expect(isRateLimited("must-have-redis", { failClosed: true })).resolves.toBe(
                true,
            );
            await expect(
                checkRateLimit("must-have-redis-meta", { failClosed: true, windowMs: 15_000 }),
            ).resolves.toEqual({ limited: true, retryAfter: 15 });
        });

        it("blocks after RATE_LIMIT_MAX_REQUESTS", async () => {
            const { isRateLimited, RATE_LIMIT_MAX_REQUESTS } = await loadInMemoryRateLimit();

            for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
                const result = await isRateLimited("user-block");
                expect(result).toBe(false);
            }

            // Next request should be blocked
            const blocked = await isRateLimited("user-block");
            expect(blocked).toBe(true);
        });

        it("tracks keys independently", async () => {
            const { isRateLimited, RATE_LIMIT_MAX_REQUESTS } = await loadInMemoryRateLimit();

            // Exhaust limit for user-a
            for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
                await isRateLimited("user-a");
            }
            expect(await isRateLimited("user-a")).toBe(true);

            // user-b should be unaffected
            expect(await isRateLimited("user-b")).toBe(false);
        });

        it("allows requests after the window expires", async () => {
            const { isRateLimited, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } =
                await loadInMemoryRateLimit();

            const now = Date.now();
            // Freeze time
            vi.spyOn(Date, "now").mockReturnValue(now);

            for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
                await isRateLimited("user-expire");
            }
            expect(await isRateLimited("user-expire")).toBe(true);

            // Advance past window
            vi.spyOn(Date, "now").mockReturnValue(now + RATE_LIMIT_WINDOW_MS + 1);
            expect(await isRateLimited("user-expire")).toBe(false);
        });
    });

    describe("Redis backend", () => {
        beforeEach(() => {
            vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");
        });

        afterEach(async () => {
            const { _resetRedisClient } = await import("@/lib/redis");
            _resetRedisClient();
            // A command this test never stubbed would have gone to whatever the
            // stubbed REDIS_URL resolves to. Fail rather than let that pass.
            expectNoUnstubbedRedisCommands();
        });

        /**
         * Bring up the Redis branch with every command replaced by a recording
         * default.
         *
         * `getRedis()` hands back a *real* ioredis instance — the driver is
         * pulled in via a runtime `require()` that Vitest cannot intercept — so
         * the commands must be replaced before `rate-limit.ts` issues any of
         * them. `lazyConnect` means no socket is opened until a command runs,
         * and after this call no un-stubbed command can run.
         */
        async function openStubbedRedis(): Promise<CommandStubs> {
            const { _resetRedisClient, getRedis } = await import("@/lib/redis");
            _resetRedisClient();

            const redis = getRedis();
            expect(redis).not.toBeNull();
            return stubRedisCommands(redis);
        }

        it("uses Redis INCR when REDIS_URL is set", async () => {
            const redis = await openStubbedRedis();

            // count=1 (first request, under limit)
            const mockIncr = vi.fn().mockResolvedValue(1);
            const mockExpire = vi.fn().mockResolvedValue(1);
            redis.incr = mockIncr;
            redis.expire = mockExpire;

            const { isRateLimited } = await import("@/lib/rate-limit");
            const result = await isRateLimited("redis-user");

            expect(result).toBe(false);
            expect(mockIncr).toHaveBeenCalledWith("rate_limit:redis-user");
            // First request → TTL should be set
            expect(mockExpire).toHaveBeenCalledWith("rate_limit:redis-user", 3600);
        });

        it("returns true when Redis count exceeds max", async () => {
            const redis = await openStubbedRedis();

            // Simulate 6th request (over the 5-request limit)
            redis.incr = vi.fn().mockResolvedValue(6);
            redis.expire = vi.fn().mockResolvedValue(1);
            redis.ttl = vi.fn().mockResolvedValue(123);

            const { checkRateLimit, isRateLimited } = await import("@/lib/rate-limit");
            const result = await isRateLimited("over-limit-user");

            expect(result).toBe(true);

            await expect(
                checkRateLimit("over-limit-user", { namespace: "custom", maxRequests: 5 }),
            ).resolves.toEqual({
                limited: true,
                retryAfter: 123,
            });
        });

        it("does not set expire on subsequent requests in the window", async () => {
            const redis = await openStubbedRedis();

            const mockExpire = vi.fn().mockResolvedValue(1);
            redis.incr = vi.fn().mockResolvedValue(3);
            redis.expire = mockExpire;

            const { isRateLimited } = await import("@/lib/rate-limit");
            await isRateLimited("mid-window-user");

            // count=3 (not first request) → expire should NOT be called
            expect(mockExpire).not.toHaveBeenCalled();
        });

        it("falls back to in-memory on Redis error", async () => {
            const redis = await openStubbedRedis();
            redis.incr = vi.fn().mockRejectedValue(new Error("Connection refused"));

            const { isRateLimited, _resetMemoryStore } = await import("@/lib/rate-limit");
            _resetMemoryStore();

            // Should not throw, should fall back to in-memory
            const result = await isRateLimited("error-user");
            expect(result).toBe(false);
        });

        it("fails closed on Redis error when failClosed is true", async () => {
            const redis = await openStubbedRedis();
            redis.incr = vi.fn().mockRejectedValue(new Error("Connection refused"));

            const { checkRateLimit } = await import("@/lib/rate-limit");
            await expect(
                checkRateLimit("error-user", {
                    failClosed: true,
                    windowMs: 30_000,
                    namespace: "auth-login",
                }),
            ).resolves.toEqual({ limited: true, retryAfter: 30 });
        });

        it("does not return 429 when Redis INCR succeeds via offline queue on cold start (CHAOS-1768)", async () => {
            // Regression: before the fix, enableOfflineQueue:false caused ioredis to
            // throw 'Stream isn't writeable' on the very first command after a web
            // container restart.  Combined with failClosed:true that produced an
            // erroneous 429.  After the fix the offline queue is re-enabled, the
            // command is buffered during the TCP handshake and resolves normally.
            const redis = await openStubbedRedis();

            // Simulate offline-queue path: command was buffered while connecting,
            // then resolved successfully once the socket was ready.
            redis.incr = vi.fn().mockResolvedValue(1);
            redis.expire = vi.fn().mockResolvedValue(1);

            const { checkRateLimit } = await import("@/lib/rate-limit");
            const result = await checkRateLimit("coldstart-key", {
                failClosed: true,
                namespace: "auth-pwreset",
                windowMs: 60 * 60_000,
                maxRequests: 3,
            });

            // First request in window — must NOT be rate-limited.
            expect(result.limited).toBe(false);
            expect(result.retryAfter).toBe(0);
        });

        it("falls back to in-memory (not 429) when Redis throws connection-not-ready error and failClosed is false (CHAOS-1768)", async () => {
            // Non-auth routes (failClosed:false) must always fall back to the
            // in-memory store on any Redis error, including the 'Stream isn't
            // writeable' error that the old enableOfflineQueue:false config produced.
            const redis = await openStubbedRedis();
            redis.incr = vi
                .fn()
                .mockRejectedValue(
                    new Error("Stream isn't writeable and enableOfflineQueue options is false"),
                );

            const { checkRateLimit, _resetMemoryStore } = await import("@/lib/rate-limit");
            _resetMemoryStore();

            const result = await checkRateLimit("non-auth-coldstart-key", {
                failClosed: false,
                windowMs: 60_000,
                maxRequests: 100,
            });

            // First request in in-memory window is always allowed.
            expect(result.limited).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// getClientIp — TRUST_PROXY gate (CHAOS-1563)
// ---------------------------------------------------------------------------
describe("getClientIp trust-proxy gate", () => {
    function makeRequest(headers: Record<string, string>) {
        return { headers: new Headers(headers) };
    }

    it("ignores X-Forwarded-For when TRUST_PROXY is false (spoofing prevention)", async () => {
        const { getClientIp, isTrustProxyEnabled } = await import("@/lib/client-ip");
        const request = makeRequest({
            "x-forwarded-for": "1.2.3.4, 10.0.0.1",
            "user-agent": "test-browser",
        });
        const ip = getClientIp(request, { trustProxy: isTrustProxyEnabled("false") });
        expect(ip).not.toBe("1.2.3.4");
        // Should fall back to anon fingerprint
        expect(ip).toMatch(/^anon:/);
    });

    it("returns the leftmost X-Forwarded-For hop when TRUST_PROXY is true", async () => {
        const { getClientIp, isTrustProxyEnabled } = await import("@/lib/client-ip");
        const request = makeRequest({
            "x-forwarded-for": "1.2.3.4, 10.0.0.1",
        });
        const ip = getClientIp(request, { trustProxy: isTrustProxyEnabled("true") });
        expect(ip).toBe("1.2.3.4");
    });

    it("ignores X-Forwarded-For when TRUST_PROXY env is undefined (default false)", async () => {
        const { getClientIp, isTrustProxyEnabled } = await import("@/lib/client-ip");
        const request = makeRequest({
            "x-forwarded-for": "1.2.3.4",
            "user-agent": "test-browser",
        });
        const ip = getClientIp(request, { trustProxy: isTrustProxyEnabled(undefined) });
        expect(ip).not.toBe("1.2.3.4");
    });
});
