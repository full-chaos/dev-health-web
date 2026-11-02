import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAnswerTokens, resetKeySetCacheForTests } from "@/lib/authServiceWire";
import * as mockTokens from "./mockTokens";

// RED-7. The tokens the ops mock answers with are EdDSA tokens that verify against the key set the
// mock serves, with the same reader the web server uses.
const { MOCK_ISSUER, mockAccessToken, mockDiscovery, mockJwks, mockPair } = mockTokens;

const fetchMock = vi.fn();
const nowSeconds = () => Math.floor(Date.now() / 1000);
const cfg = () => ({ issuer: MOCK_ISSUER, backendUrl: "http://mock.test", nowSeconds });

beforeEach(() => {
    resetKeySetCacheForTests();
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url === `${MOCK_ISSUER}/.well-known/openid-configuration`)
            return new Response(JSON.stringify(mockDiscovery()));
        if (url === `${MOCK_ISSUER}/.well-known/jwks.json`)
            return new Response(JSON.stringify(mockJwks()));
        throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("ops mock access tokens", () => {
    it.each(["admin", "member", "refreshed"] as const)(
        "the %s token and its session token verify against the mock key set",
        async (who) => {
            const pair = mockPair(who);
            const got = await readAnswerTokens(
                { accessToken: pair.access_token, sessionAccessToken: pair.session_access_token },
                cfg(),
                "login",
            );
            expect(got).toMatchObject({ ok: true, session: { kind: "ok" } });
            expect(got.ok && got.sid).toMatch(/^ses_/);
            expect(got.ok && got.sub).toMatch(/^prn_/);
        },
    );

    it("differ from each other", () => {
        expect(
            new Set([
                mockAccessToken("admin"),
                mockAccessToken("member"),
                mockAccessToken("refreshed"),
            ]).size,
        ).toBe(3);
    });

    it("the key set is the one that signs: a token of another key does not verify", async () => {
        const got = await readAnswerTokens(
            { accessToken: mockAccessToken("admin", { kid: "mock-unknown-kid" }) },
            cfg(),
            "login",
        );
        expect(got.ok).toBe(false);
    });
});
