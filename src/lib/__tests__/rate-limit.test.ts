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
    // instrumentation.ts re-exports this at module scope; the startup-hook
    // tests import that module for real.
    captureRequestError: vi.fn(),
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
const REDIS_COMMANDS = ["eval", "ttl"] as const;
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

        it("counts and expires the window in a single atomic EVAL", async () => {
            const redis = await openStubbedRedis();

            // count=1 (first request, under limit)
            const mockEval = vi.fn().mockResolvedValue(1);
            redis.eval = mockEval;

            const { checkRateLimit, isRateLimited } = await import("@/lib/rate-limit");
            const result = await isRateLimited("redis-user");

            expect(result).toBe(false);

            // One round trip per check. A separate EXPIRE would reintroduce the
            // TTL-less-key window that CHAOS-3589 was about.
            expect(mockEval).toHaveBeenCalledTimes(1);

            // scopedKey still namespaces the Redis key.
            await checkRateLimit("redis-user", { namespace: "auth-login" });
            expect(mockEval.mock.calls[1][2]).toBe("rate_limit:auth-login:redis-user");

            // One round trip, carrying the key and the window in seconds. A
            // separate EXPIRE would reintroduce the TTL-less-key window that
            // CHAOS-3589 was about.
            const [script, numKeys, redisKey, windowSeconds] = mockEval.mock.calls[0];
            expect(numKeys).toBe(1);
            expect(redisKey).toBe("rate_limit:redis-user");
            expect(windowSeconds).toBe(3600);
            // The script must anchor the window at the first hit and repair a
            // key that lost its TTL — not refresh the TTL on every hit.
            expect(script).toContain('redis.call("incr", KEYS[1])');
            expect(script).toContain('redis.call("expire", KEYS[1], ARGV[1])');
            expect(script).toMatch(/current == 1 or redis\.call\("ttl", KEYS\[1\]\) < 0/);
        });

        it("returns true when Redis count exceeds max", async () => {
            const redis = await openStubbedRedis();

            // Simulate 6th request (over the 5-request limit)
            redis.eval = vi.fn().mockResolvedValue(6);
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

        it("does not throw on a Redis error, and does not limit when failClosed is unset", async () => {
            const redis = await openStubbedRedis();
            redis.eval = vi.fn().mockRejectedValue(new Error("Connection refused"));

            const { isRateLimited } = await import("@/lib/rate-limit");
            expect(await isRateLimited("error-user")).toBe(false);
        });

        it("fails closed on Redis error when failClosed is true", async () => {
            const redis = await openStubbedRedis();
            redis.eval = vi.fn().mockRejectedValue(new Error("Connection refused"));

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
            redis.eval = vi.fn().mockResolvedValue(1);

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

        it("does not 429 when Redis throws connection-not-ready error and failClosed is false (CHAOS-1768)", async () => {
            // Non-auth routes (failClosed:false) must not be refused on a Redis
            // error, including the 'Stream isn't writeable' error the old
            // enableOfflineQueue:false config produced.
            const redis = await openStubbedRedis();
            redis.eval = vi
                .fn()
                .mockRejectedValue(
                    new Error("Stream isn't writeable and enableOfflineQueue options is false"),
                );

            const { checkRateLimit } = await import("@/lib/rate-limit");

            const result = await checkRateLimit("non-auth-coldstart-key", {
                failClosed: false,
                windowMs: 60_000,
                maxRequests: 100,
            });

            // Non-auth routes must not 429 on a cold-start Redis error.
            expect(result.limited).toBe(false);
        });
    });
});

// ---------------------------------------------------------------------------
// Backend invariants (CHAOS-3589)
//
// These drive `rate-limit.ts` through a fake Redis that models INCR/EXPIRE/TTL
// with a controllable clock, so window recovery is observable without a real
// server and without wall-clock sleeps.
// ---------------------------------------------------------------------------

type FakeEntry = { value: number; expiresAt: number | null };

class FakeRedis {
    readonly entries = new Map<string, FakeEntry>();
    now = 1_000_000;
    /** When set, the next EXPIRE rejects — models a blip between INCR and EXPIRE. */
    failNextExpire = false;

    private prune(): void {
        for (const [key, entry] of this.entries) {
            if (entry.expiresAt !== null && entry.expiresAt <= this.now) this.entries.delete(key);
        }
    }

    advance(ms: number): void {
        this.now += ms;
        this.prune();
    }

    async incr(key: string): Promise<number> {
        this.prune();
        const entry = this.entries.get(key) ?? { value: 0, expiresAt: null };
        entry.value += 1;
        this.entries.set(key, entry);
        return entry.value;
    }

    async expire(key: string, seconds: number): Promise<number> {
        this.prune();
        if (this.failNextExpire) {
            this.failNextExpire = false;
            throw new Error("READONLY You can't write against a read only replica.");
        }
        const entry = this.entries.get(key);
        if (!entry) return 0;
        entry.expiresAt = this.now + seconds * 1000;
        return 1;
    }

    async ttl(key: string): Promise<number> {
        this.prune();
        const entry = this.entries.get(key);
        if (!entry) return -2;
        if (entry.expiresAt === null) return -1;
        return Math.ceil((entry.expiresAt - this.now) / 1000);
    }

    /**
     * Models the contract of `INCR_AND_EXPIRE_LUA`: increment, and anchor a TTL
     * when this is the first hit or the key somehow lost its expiry.
     *
     * `failNextExpire` deliberately does NOT apply here. Redis runs a script to
     * completion, so there is no instant at which the INCR landed and the EXPIRE
     * did not — that partial state is reachable only by issuing EXPIRE as its
     * own round trip. Code that does so inherits the failure mode; code that
     * uses the script does not. That difference is exactly what is under test.
     *
     * CAVEAT: this models the script, it does not execute the Lua. The script
     * text itself is unverified at unit level — it is pinned by assertion in
     * "counts and expires the window in a single atomic EVAL", and an
     * integration test against a real Redis is the CHAOS-3589 follow-up.
     */
    async eval(_script: string, _numKeys: number, key: string, seconds: number): Promise<number> {
        this.prune();
        const entry = this.entries.get(key) ?? { value: 0, expiresAt: null };
        entry.value += 1;
        if (entry.value === 1 || entry.expiresAt === null) {
            entry.expiresAt = this.now + seconds * 1000;
        }
        this.entries.set(key, entry);
        return entry.value;
    }
}

describe("rate-limit backend invariants (CHAOS-3589)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    /** Load rate-limit with `getRedis()` wired to `fake` and Date.now on its clock. */
    async function loadWithFakeRedis(fake: FakeRedis) {
        vi.stubEnv("REDIS_URL", "redis://fake:6379/0");
        vi.doMock("@/lib/redis", () => ({
            getRedis: () => fake,
            _resetRedisClient: () => {},
        }));
        vi.spyOn(Date, "now").mockImplementation(() => fake.now);
        return import("@/lib/rate-limit");
    }

    it("recovers when the window elapses even if the EXPIRE after the first INCR was lost", async () => {
        // INCR and EXPIRE are two round trips. If the EXPIRE is lost the counter
        // has no TTL, so it can never fall out of the window on its own: the key
        // is limited forever and no amount of waiting clears it. Only a human
        // deleting the key in Redis recovers the caller.
        const fake = new FakeRedis();
        const { checkRateLimit } = await loadWithFakeRedis(fake);
        const opts = { namespace: "auth-login", windowMs: 60_000, maxRequests: 3 };

        fake.failNextExpire = true;
        await checkRateLimit("victim", opts); // INCR ok, EXPIRE lost

        for (let i = 0; i < 3; i++) await checkRateLimit("victim", opts);
        expect((await checkRateLimit("victim", opts)).limited).toBe(true);

        // Wait out ten full windows.
        fake.advance(10 * 60_000);

        expect((await checkRateLimit("victim", opts)).limited).toBe(false);
    });

    it("keeps the counter bounded by the window under a lost EXPIRE", async () => {
        const fake = new FakeRedis();
        const { checkRateLimit } = await loadWithFakeRedis(fake);
        const opts = { namespace: "auth-login", windowMs: 60_000, maxRequests: 3 };

        fake.failNextExpire = true;
        await checkRateLimit("victim", opts);

        // Every key this limiter writes must carry a TTL; a TTL-less key is an
        // immortal counter.
        const [redisKey] = [...fake.entries.keys()];
        expect(await fake.ttl(redisKey)).toBeGreaterThan(0);
    });

    it("anchors the window at the first hit instead of extending it on later hits", async () => {
        // A script that refreshed the TTL on every call would let a client that
        // keeps hammering a blocked key hold its own window open indefinitely.
        const fake = new FakeRedis();
        const { checkRateLimit } = await loadWithFakeRedis(fake);
        const opts = { namespace: "auth-login", windowMs: 60_000, maxRequests: 3 };

        for (let i = 0; i < 3; i++) await checkRateLimit("chatty", opts);
        expect((await checkRateLimit("chatty", opts)).limited).toBe(true);

        fake.advance(30_000);
        // Still inside the window opened by the first hit.
        expect((await checkRateLimit("chatty", opts)).limited).toBe(true);

        fake.advance(31_000);
        // 61s after the FIRST hit the window is over, despite the hits at +30s.
        expect((await checkRateLimit("chatty", opts)).limited).toBe(false);
    });
});

// ---------------------------------------------------------------------------
// Startup verification (CHAOS-3589 option (a): ops parity, no fallback)
// ---------------------------------------------------------------------------

describe("verifyRateLimitConfig", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("refuses to boot in production without REDIS_URL", async () => {
        // Mirrors ops's verify_rate_limit_config(): a per-process limiter is
        // ineffective across replicas, so the deploy must fail loudly at startup
        // rather than silently under-enforcing every limit at runtime.
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", undefined);

        const { verifyRateLimitConfig } = await import("@/lib/rate-limit");
        expect(() => verifyRateLimitConfig()).toThrow(/REDIS_URL/);
    });

    it("boots in production when REDIS_URL is set", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", "redis://redis:6379/0");

        const { verifyRateLimitConfig } = await import("@/lib/rate-limit");
        expect(() => verifyRateLimitConfig()).not.toThrow();
    });

    it("allows development to run without REDIS_URL", async () => {
        vi.stubEnv("NODE_ENV", "development");
        vi.stubEnv("REDIS_URL", undefined);

        const { verifyRateLimitConfig } = await import("@/lib/rate-limit");
        expect(() => verifyRateLimitConfig()).not.toThrow();
    });

    it("refuses to boot the production server, through the real startup hook", async () => {
        // A verification nothing calls is not a guard. This drives Next.js's
        // actual `register()` rather than grepping the file for a symbol: an
        // earlier version of this test asserted the source merely CONTAINED
        // "verifyRateLimitConfig", and happily passed when the call was deleted
        // and only the import remained.
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", undefined);
        vi.stubEnv("NEXT_RUNTIME", "nodejs");
        vi.doMock("../../../sentry.server.config", () => ({}));

        const { register } = await import("../../../instrumentation");
        await expect(register()).rejects.toThrow(/REDIS_URL/);
    });

    it("boots the production server when REDIS_URL is set", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("REDIS_URL", "redis://redis:6379/0");
        vi.stubEnv("NEXT_RUNTIME", "nodejs");
        vi.doMock("../../../sentry.server.config", () => ({}));

        const { register } = await import("../../../instrumentation");
        await expect(register()).resolves.toBeUndefined();
    });
});

describe("no in-memory fallback (ops parity)", () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllEnvs();
    });

    it("no longer exposes an in-memory store", async () => {
        const rateLimit = await import("@/lib/rate-limit");
        expect(rateLimit).not.toHaveProperty("_resetMemoryStore");
        expect(rateLimit).not.toHaveProperty("_memoryStoreSize");
    });

    it("fails closed when Redis is unavailable and failClosed is set", async () => {
        vi.stubEnv("REDIS_URL", undefined);
        vi.doMock("@/lib/redis", () => ({ getRedis: () => null, _resetRedisClient: () => {} }));

        const { checkRateLimit } = await import("@/lib/rate-limit");
        await expect(checkRateLimit("k", { failClosed: true, windowMs: 15_000 })).resolves.toEqual({
            limited: true,
            retryAfter: 15,
        });
    });

    it("does not silently count in-process when Redis is unavailable and failClosed is unset", async () => {
        // The old code answered this from a per-process store, which under N
        // replicas enforced N x the limit while reporting success. With the
        // fallback gone the caller is simply not limited — and, unlike before,
        // the degradation is reported every time rather than hidden behind a
        // store that looked like it was working.
        vi.stubEnv("REDIS_URL", undefined);
        vi.doMock("@/lib/redis", () => ({ getRedis: () => null, _resetRedisClient: () => {} }));

        const { checkRateLimit } = await import("@/lib/rate-limit");
        const opts = { maxRequests: 2, windowMs: 60_000 };

        // Previously the 3rd call would have been limited by the memory store.
        for (let i = 0; i < 5; i++) {
            expect(await checkRateLimit("k", opts)).toEqual({ limited: false, retryAfter: 0 });
        }

        const Sentry = await import("@sentry/nextjs");
        expect(Sentry.withScope).toHaveBeenCalled();
    });
});
