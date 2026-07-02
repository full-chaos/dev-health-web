import { describe, expect, it } from "vitest";
import { deriveTokenStatus } from "../token-status";

describe("deriveTokenStatus", () => {
    it("revoked takes precedence over everything else", () => {
        expect(
            deriveTokenStatus({
                revoked_at: "2026-01-01T00:00:00.000Z",
                expires_at: null,
                last_used_at: "2026-01-01T00:00:00.000Z",
            }),
        ).toBe("revoked");
    });

    it("expired when expires_at is in the past and not revoked", () => {
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: "2000-01-01T00:00:00.000Z",
                last_used_at: "2001-01-01T00:00:00.000Z",
            }),
        ).toBe("expired");
    });

    it("never_used when last_used_at is null and not revoked/expired", () => {
        expect(deriveTokenStatus({ revoked_at: null, expires_at: null, last_used_at: null })).toBe(
            "never_used",
        );
    });

    it("active when used, not revoked, and not expired", () => {
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: null,
                last_used_at: "2026-01-01T00:00:00.000Z",
            }),
        ).toBe("active");
    });

    it("a future expires_at does not mark the token expired", () => {
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString();
        expect(
            deriveTokenStatus({
                revoked_at: null,
                expires_at: future,
                last_used_at: "2026-01-01T00:00:00.000Z",
            }),
        ).toBe("active");
    });
});
