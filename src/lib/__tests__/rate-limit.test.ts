import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock ioredis before any imports that might trigger redis.ts
vi.mock("ioredis", () => {
  const MockRedis = vi.fn().mockImplementation(() => ({
    incr: vi.fn(),
    expire: vi.fn(),
    ttl: vi.fn(),
    disconnect: vi.fn(),
    on: vi.fn(),
  }));
  return { default: MockRedis };
});

vi.mock("@sentry/nextjs", () => ({
  withScope: vi.fn((callback: (scope: { setTag: ReturnType<typeof vi.fn>; setContext: ReturnType<typeof vi.fn> }) => void) =>
    callback({ setTag: vi.fn(), setContext: vi.fn() })
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

describe("rate-limit", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  describe("in-memory fallback (no REDIS_URL)", () => {
    it("allows requests under the limit", async () => {
      // No REDIS_URL → in-memory mode
      const { isRateLimited, _resetMemoryStore } = await import("@/lib/rate-limit");
      _resetMemoryStore();

      const result = await isRateLimited("user-1");
      expect(result).toBe(false);
    });

    it("fails closed when Redis is missing and failClosed is true", async () => {
      const { checkRateLimit, isRateLimited, _resetMemoryStore } = await import("@/lib/rate-limit");
      _resetMemoryStore();

      await expect(isRateLimited("must-have-redis", { failClosed: true })).resolves.toBe(true);
      await expect(
        checkRateLimit("must-have-redis-meta", { failClosed: true, windowMs: 15_000 }),
      ).resolves.toEqual({ limited: true, retryAfter: 15 });
    });

    it("blocks after RATE_LIMIT_MAX_REQUESTS", async () => {
      const { isRateLimited, _resetMemoryStore, RATE_LIMIT_MAX_REQUESTS } = await import(
        "@/lib/rate-limit"
      );
      _resetMemoryStore();

      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        const result = await isRateLimited("user-block");
        expect(result).toBe(false);
      }

      // Next request should be blocked
      const blocked = await isRateLimited("user-block");
      expect(blocked).toBe(true);
    });

    it("tracks keys independently", async () => {
      const { isRateLimited, _resetMemoryStore, RATE_LIMIT_MAX_REQUESTS } = await import(
        "@/lib/rate-limit"
      );
      _resetMemoryStore();

      // Exhaust limit for user-a
      for (let i = 0; i < RATE_LIMIT_MAX_REQUESTS; i++) {
        await isRateLimited("user-a");
      }
      expect(await isRateLimited("user-a")).toBe(true);

      // user-b should be unaffected
      expect(await isRateLimited("user-b")).toBe(false);
    });

    it("allows requests after the window expires", async () => {
      const { isRateLimited, _resetMemoryStore, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS } =
        await import("@/lib/rate-limit");
      _resetMemoryStore();

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
    it("uses Redis INCR when REDIS_URL is set", async () => {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient } = await import("@/lib/redis");
      _resetRedisClient();

      const { getRedis } = await import("@/lib/redis");
      const redis = getRedis();
      expect(redis).not.toBeNull();

      // Set up mock to return count=1 (first request, under limit)
      const mockIncr = vi.fn().mockResolvedValue(1);
      const mockExpire = vi.fn().mockResolvedValue(1);
      redis!.incr = mockIncr;
      redis!.expire = mockExpire;

      const { isRateLimited } = await import("@/lib/rate-limit");
      const result = await isRateLimited("redis-user");

      expect(result).toBe(false);
      expect(mockIncr).toHaveBeenCalledWith("rate_limit:redis-user");
      // First request → TTL should be set
      expect(mockExpire).toHaveBeenCalledWith("rate_limit:redis-user", 3600);

      _resetRedisClient();
    });

    it("returns true when Redis count exceeds max", async () => {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      expect(redis).not.toBeNull();

      // Simulate 6th request (over the 5-request limit)
      redis!.incr = vi.fn().mockResolvedValue(6);
      redis!.expire = vi.fn().mockResolvedValue(1);
      redis!.ttl = vi.fn().mockResolvedValue(123);

      const { isRateLimited } = await import("@/lib/rate-limit");
      const result = await isRateLimited("over-limit-user");

      expect(result).toBe(true);

      const { checkRateLimit } = await import("@/lib/rate-limit");
      await expect(checkRateLimit("over-limit-user", { namespace: "custom", maxRequests: 5 })).resolves.toEqual({
        limited: true,
        retryAfter: 123,
      });

      _resetRedisClient();
    });

    it("does not set expire on subsequent requests in the window", async () => {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      const mockExpire = vi.fn().mockResolvedValue(1);
      redis!.incr = vi.fn().mockResolvedValue(3);
      redis!.expire = mockExpire;

      const { isRateLimited } = await import("@/lib/rate-limit");
      await isRateLimited("mid-window-user");

      // count=3 (not first request) → expire should NOT be called
      expect(mockExpire).not.toHaveBeenCalled();

      _resetRedisClient();
    });

    it("falls back to in-memory on Redis error", async () => {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      redis!.incr = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const { isRateLimited, _resetMemoryStore } = await import("@/lib/rate-limit");
      _resetMemoryStore();

      // Should not throw, should fall back to in-memory
      const result = await isRateLimited("error-user");
      expect(result).toBe(false);

      _resetRedisClient();
    });

    it("fails closed on Redis error when failClosed is true", async () => {
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      redis!.incr = vi.fn().mockRejectedValue(new Error("Connection refused"));

      const { checkRateLimit } = await import("@/lib/rate-limit");
      await expect(
        checkRateLimit("error-user", { failClosed: true, windowMs: 30_000, namespace: "auth-login" }),
      ).resolves.toEqual({ limited: true, retryAfter: 30 });

      _resetRedisClient();
    });

    it("does not return 429 when Redis INCR succeeds via offline queue on cold start (CHAOS-1768)", async () => {
      // Regression: before the fix, enableOfflineQueue:false caused ioredis to
      // throw 'Stream isn't writeable' on the very first command after a web
      // container restart.  Combined with failClosed:true that produced an
      // erroneous 429.  After the fix the offline queue is re-enabled, the
      // command is buffered during the TCP handshake and resolves normally.
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      expect(redis).not.toBeNull();

      // Simulate offline-queue path: command was buffered while connecting,
      // then resolved successfully once the socket was ready.
      redis!.incr = vi.fn().mockResolvedValue(1);
      redis!.expire = vi.fn().mockResolvedValue(1);

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

      _resetRedisClient();
    });

    it("falls back to in-memory (not 429) when Redis throws connection-not-ready error and failClosed is false (CHAOS-1768)", async () => {
      // Non-auth routes (failClosed:false) must always fall back to the
      // in-memory store on any Redis error, including the 'Stream isn't
      // writeable' error that the old enableOfflineQueue:false config produced.
      vi.stubEnv("REDIS_URL", "redis://localhost:6379/0");

      const { _resetRedisClient, getRedis } = await import("@/lib/redis");
      _resetRedisClient();

      const redis = getRedis();
      redis!.incr = vi.fn().mockRejectedValue(
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

      _resetRedisClient();
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

