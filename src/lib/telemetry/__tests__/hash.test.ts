import { describe, expect, it } from "vitest";

import { fallbackHash, hashIdentifier } from "../hash";

describe("fallbackHash", () => {
    it("is deterministic for the same input", () => {
        expect(fallbackHash("org-123")).toBe(fallbackHash("org-123"));
    });

    it("never returns the raw input and uses the fnv1a prefix", () => {
        const hashed = fallbackHash("org-123");
        expect(hashed).not.toBe("org-123");
        expect(hashed).toMatch(/^fnv1a-[0-9a-f]{8}$/);
    });

    it("distinguishes different inputs", () => {
        expect(fallbackHash("org-1")).not.toBe(fallbackHash("org-2"));
    });
});

describe("hashIdentifier", () => {
    it("produces a SHA-256 hex digest when SubtleCrypto is available", async () => {
        const hashed = await hashIdentifier("org-123");
        expect(hashed).not.toBe("org-123");
        // jsdom exposes SubtleCrypto, so we expect a 64-char hex SHA-256 digest.
        expect(hashed).toMatch(/^[0-9a-f]{64}$/);
    });

    it("is deterministic for the same input", async () => {
        expect(await hashIdentifier("org-123")).toBe(await hashIdentifier("org-123"));
    });
});
