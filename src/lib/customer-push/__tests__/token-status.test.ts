import { describe, expect, it } from "vitest";
import { deriveTokenStatus } from "../token-status";

describe("deriveTokenStatus", () => {
    it("returns revoked when revoked_at is set, regardless of other fields", () => {
        expect(
            deriveTokenStatus({
                revoked_at: "2026-01-01T00:00:00Z",
                expires_at: null,
                last_used_at: "2026-01-02T00:00:00Z",
            }),
        ).toBe("revoked");
    });

    it("returns expired when expires_at is in the past", () => {
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: "2000-01-01T00:00:00Z",
                last_used_at: null,
            }),
        ).toBe("expired");
    });

    it("returns never_used when last_used_at is null and not revoked/expired", () => {
        expect(deriveTokenStatus({ revoked_at: null, expires_at: null, last_used_at: null })).toBe(
            "never_used",
        );
    });

    it("returns active when last_used_at is set and not revoked/expired", () => {
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: null,
                last_used_at: "2026-01-01T00:00:00Z",
            }),
        ).toBe("active");
    });

    it("does not treat a future expires_at as expired", () => {
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: future,
                last_used_at: "2026-01-01T00:00:00Z",
            }),
        ).toBe("active");
    });
});
