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

        it("counts and expires the window in a single atomic EVAL", async () => {
            const redis = await openStubbedRedis();

            // count=1 (first request, under limit)
            const mockEval = vi.fn().mockResolvedValue(1);
            redis.eval = mockEval;

            const { isRateLimited } = await import("@/lib/rate-limit");
            const result = await isRateLimited("redis-user");

            expect(result).toBe(false);

            // One round trip, carrying the key and the window in seconds. A
            // separate EXPIRE would reintroduce the TTL-less-key window that
            // CHAOS-3589 was about.
            expect(mockEval).toHaveBeenCalledTimes(1);
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

        it("falls back to in-memory on Redis error", async () => {
            const redis = await openStubbedRedis();
            redis.eval = vi.fn().mockRejectedValue(new Error("Connection refused"));

            const { isRateLimited, _resetMemoryStore } = await import("@/lib/rate-limit");
            _resetMemoryStore();

            // Should not throw, should fall back to in-memory
            const result = await isRateLimited("error-user");
            expect(result).toBe(false);
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

        it("falls back to in-memory (not 429) when Redis throws connection-not-ready error and failClosed is false (CHAOS-1768)", async () => {
            // Non-auth routes (failClosed:false) must always fall back to the
            // in-memory store on any Redis error, including the 'Stream isn't
            // writeable' error that the old enableOfflineQueue:false config produced.
            const redis = await openStubbedRedis();
            redis.eval = vi
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
        const rateLimit = await import("@/lib/rate-limit");
        rateLimit._resetMemoryStore();
        return rateLimit;
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

    describe("in-memory fallback isolation", () => {
        /** Load rate-limit with no Redis at all, so every call takes the memory path. */
        async function loadInMemory() {
            vi.stubEnv("REDIS_URL", undefined);
            vi.doMock("@/lib/redis", () => ({
                getRedis: () => null,
                _resetRedisClient: () => {},
            }));
            const rateLimit = await import("@/lib/rate-limit");
            rateLimit._resetMemoryStore();
            return rateLimit;
        }

        it("does not let one namespace consume another namespace's budget", async () => {
            // `redisKeyFor` namespaces the Redis key, but the memory store is keyed
            // by the bare key. Two routes that both key on a client IP — e.g.
            // /api/acr/device (namespace acr-device-general, 20/min) and
            // /api/feedback (no namespace, 5/hour) — therefore share one counter
            // whenever Redis is down, which is precisely when the fallback runs.
            const { checkRateLimit } = await loadInMemory();
            const ip = "203.0.113.7";
            const device = { namespace: "acr-device-general", windowMs: 60_000, maxRequests: 20 };
            const feedback = { windowMs: 60 * 60_000, maxRequests: 5 };

            // Six device calls — well inside the device budget of 20.
            for (let i = 0; i < 6; i++) {
                expect((await checkRateLimit(ip, device)).limited).toBe(false);
            }

            // The feedback budget (5/hour) must be untouched by those.
            expect((await checkRateLimit(ip, feedback)).limited).toBe(false);
        });

        it("does not let a short-window namespace erase a long-window namespace's history", async () => {
            // checkRateLimitedInMemory writes back the array it filtered with the
            // *calling* namespace's window. A short-window caller therefore drops
            // the long-window caller's timestamps and persists the truncation —
            // one cheap call to the short-window route resets the strict limit.
            const { checkRateLimit } = await loadInMemory();
            const ip = "203.0.113.8";
            const strict = { namespace: "auth-pwreset", windowMs: 60 * 60_000, maxRequests: 3 };
            const lax = { namespace: "acr-device-general", windowMs: 1_000, maxRequests: 20 };

            const now = Date.now();
            vi.spyOn(Date, "now").mockReturnValue(now);

            for (let i = 0; i < 3; i++) await checkRateLimit(ip, strict);
            expect((await checkRateLimit(ip, strict)).limited).toBe(true);

            // One call to the lax route, two seconds later.
            vi.spyOn(Date, "now").mockReturnValue(now + 2_000);
            await checkRateLimit(ip, lax);

            // The strict hourly limit must still be exhausted.
            expect((await checkRateLimit(ip, strict)).limited).toBe(true);
        });

        it("holds the key ceiling even for a burst inside one sweep interval", async () => {
            // The timed sweep runs at most once a minute; a burst of unique IPs
            // inside that minute must not be able to grow the store without
            // bound while it waits.
            const { checkRateLimit, _memoryStoreSize } = await loadInMemory();
            const opts = { namespace: "acr-device-general", windowMs: 60_000, maxRequests: 20 };

            const now = Date.now();
            vi.spyOn(Date, "now").mockReturnValue(now);
            for (let i = 0; i < 10_500; i++) await checkRateLimit(`burst-ip-${i}`, opts);

            expect(_memoryStoreSize()).toBeLessThanOrEqual(10_000);
        });

        it("does not retain entries for keys whose window elapsed long ago", async () => {
            // The store is a module-level Map keyed by client IP / anon fingerprint
            // and nothing ever removes an entry, so a long-lived server accumulates
            // one array per unique IP for the life of the process.
            const { checkRateLimit, _memoryStoreSize } = await loadInMemory();
            const opts = { namespace: "acr-device-general", windowMs: 60_000, maxRequests: 20 };

            const now = Date.now();
            vi.spyOn(Date, "now").mockReturnValue(now);
            for (let i = 0; i < 500; i++) await checkRateLimit(`ip-${i}`, opts);
            expect(_memoryStoreSize()).toBe(500);

            // An hour later every one of those windows is long gone.
            vi.spyOn(Date, "now").mockReturnValue(now + 60 * 60_000);
            await checkRateLimit("someone-else", opts);

            expect(_memoryStoreSize()).toBeLessThan(500);
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
