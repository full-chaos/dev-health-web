import { describe, expect, it } from "vitest";
import { readAccessToken } from "@/lib/authServiceClient";
import {
    MOCK_ACCESS_TOKEN,
    MOCK_MEMBER_ACCESS_TOKEN,
    MOCK_REFRESHED_ACCESS_TOKEN,
} from "./mockTokens";

const ctx = {
    issuer: "",
    audience: "dev-health-api",
    nowSeconds: 0,
    publishedKeys: [],
    removedKids: [],
};

describe("ops mock access tokens", () => {
    it("are read by the web server under class hs256_compat, with an exp and a sid", () => {
        for (const token of [
            MOCK_ACCESS_TOKEN,
            MOCK_MEMBER_ACCESS_TOKEN,
            MOCK_REFRESHED_ACCESS_TOKEN,
        ]) {
            const got = readAccessToken(token, "hs256_compat", ctx);
            expect(got).toMatchObject({ ok: true, verified: false });
            expect(got.ok && got.exp).toBeGreaterThan(4_000_000_000);
            expect(got.ok && got.sid).toMatch(/^ses_/);
        }
    });

    it("differ from each other", () => {
        expect(
            new Set([MOCK_ACCESS_TOKEN, MOCK_MEMBER_ACCESS_TOKEN, MOCK_REFRESHED_ACCESS_TOKEN])
                .size,
        ).toBe(3);
    });
});
