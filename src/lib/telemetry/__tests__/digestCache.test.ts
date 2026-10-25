import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
    digestGeneration,
    digestOnce,
    getCachedDigest,
    resetDigestCacheForTests,
} from "../digestCache";

const HEX_ORG_123 = "83e582565905f7e5bc0074cd776abd13d7ca413991011906c51d96696b92c199";

describe("digestCache", () => {
    beforeEach(() => {
        resetDigestCacheForTests();
    });
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it("hashes an id once, shares the in-flight hash and caches the SHA-256 hex", async () => {
        const digest = vi.spyOn(globalThis.crypto.subtle, "digest");
        const [first, second] = await Promise.all([digestOnce("org-123"), digestOnce("org-123")]);
        expect(first).toBe(HEX_ORG_123);
        expect(second).toBe(HEX_ORG_123);
        expect(await digestOnce("org-123")).toBe(HEX_ORG_123);
        expect(getCachedDigest("org-123")).toBe(HEX_ORG_123);
        expect(digest).toHaveBeenCalledTimes(1);
        digest.mockRestore();
    });

    it("caches nothing without SubtleCrypto", async () => {
        vi.stubGlobal("crypto", {});
        expect(await digestOnce("org-123")).toBeNull();
        expect(getCachedDigest("org-123")).toBeUndefined();
    });

    it("a reset empties the cache, moves the generation and drops a digest that was in flight", async () => {
        const before = digestGeneration();
        const inFlight = digestOnce("org-123");
        resetDigestCacheForTests();
        expect(digestGeneration()).not.toBe(before);
        await inFlight;
        expect(getCachedDigest("org-123")).toBeUndefined();
        await digestOnce("org-123");
        resetDigestCacheForTests();
        expect(getCachedDigest("org-123")).toBeUndefined();
    });
});
