import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    readExchangeAnswer,
    resetKeySetCacheForTests,
    wireConfigFromEnv,
    type WireConfig,
} from "@/lib/authServiceWire";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// CHAOS-10876 C2: the answers of switch-org, change-password and the social exchange are read by the
// class setting. Under hs256_compat nothing is read; under eddsa the access token and the service
// token are read the way C1 reads the login answer.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const fetchMock = vi.fn();
const eddsa: WireConfig = {
    tokenClassRaw: "eddsa",
    issuer: ISSUER,
    backendUrl: "http://auth.test",
};
const hs256: WireConfig = {
    tokenClassRaw: undefined,
    issuer: undefined,
    backendUrl: "http://auth.test",
};
const logged = () => vi.mocked(logSessionBranch).mock.calls.map(([f]) => f);
const OPERATIONS = ["switch_org", "change_password", "social_login"] as const;

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation(eddsaFetch({}));
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("readExchangeAnswer", () => {
    it("readExchangeAnswer: class eddsa reads the access token and the service token and returns exp, sid, actor and the token", async () => {
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        const got = await readExchangeAnswer(
            { accessToken: mint({ exp, act: ACTOR }), sessionAccessToken: service },
            eddsa,
            "switch_org",
        );
        expect(got).toMatchObject({
            kind: "read",
            accessExp: exp,
            sid: SID,
            actor: ACTOR,
            session: { kind: "ok", token: service, exp, sid: SID },
        });
    });

    it.each(OPERATIONS)(
        "a refused service token is refused under %s, with the C1 branch under that operation",
        async (operation) => {
            const exp = inSeconds(1800);
            const got = await readExchangeAnswer(
                {
                    accessToken: mint({ exp }),
                    sessionAccessToken: mint({ aud: "auth-service", exp: exp - 1 }),
                },
                eddsa,
                operation,
            );
            expect(got).toEqual({ kind: "refused" });
            expect(logged()).toEqual([{ operation, branch: "session_token_exp_mismatch" }]);
        },
    );

    it("an access token that fails verification is refused", async () => {
        const got = await readExchangeAnswer(
            { accessToken: mint({ kid: "kid-9" }), sessionAccessToken: undefined },
            eddsa,
            "social_login",
        );
        expect(got).toEqual({ kind: "refused" });
    });

    it("class eddsa: the key set unavailable is unavailable", async () => {
        fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
        const exp = inSeconds(1800);
        const got = await readExchangeAnswer(
            { accessToken: mint({ exp }), sessionAccessToken: mint({ aud: "auth-service", exp }) },
            eddsa,
            "switch_org",
        );
        expect(got).toEqual({ kind: "unavailable" });
    });

    it("class eddsa: an absent field is accepted and counted under the operation", async () => {
        const got = await readExchangeAnswer(
            { accessToken: mint(), sessionAccessToken: undefined },
            eddsa,
            "change_password",
        );
        expect(got).toMatchObject({ kind: "read", session: { kind: "absent" } });
        expect(logged()).toEqual([
            { operation: "change_password", branch: "session_token_missing" },
        ]);
    });

    it("class hs256_compat: the access token is not read and a present field is ignored and counted under the operation", async () => {
        for (const operation of OPERATIONS) {
            vi.mocked(logSessionBranch).mockClear();
            const got = await readExchangeAnswer(
                { accessToken: "not-a-token-at-all", sessionAccessToken: "svc-value" },
                hs256,
                operation,
            );
            expect(got, operation).toEqual({ kind: "legacy" });
            expect(logged()).toEqual([{ operation, branch: "session_token_ignored" }]);
        }
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("class hs256_compat: an absent field keeps today's path with no log line", async () => {
        expect(
            await readExchangeAnswer(
                { accessToken: "x", sessionAccessToken: undefined },
                hs256,
                "switch_org",
            ),
        ).toEqual({ kind: "legacy" });
        expect(logged()).toEqual([]);
    });

    it("an unknown class or a missing issuer is refused, counted auth_config_invalid under the operation, and nothing is fetched", async () => {
        const unknown = { ...eddsa, tokenClassRaw: "nope" };
        const noIssuer = { ...eddsa, issuer: undefined };
        expect(
            await readExchangeAnswer({ accessToken: mint() }, unknown, "change_password"),
        ).toEqual({ kind: "refused" });
        expect(await readExchangeAnswer({ accessToken: mint() }, noIssuer, "social_login")).toEqual(
            {
                kind: "refused",
            },
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logged()).toEqual([
            { operation: "change_password", branch: "auth_config_invalid" },
            { operation: "social_login", branch: "auth_config_invalid" },
        ]);
    });

    it("no log line holds a token, a session id or an actor id", async () => {
        const exp = inSeconds(1800);
        await readExchangeAnswer(
            {
                accessToken: mint({ exp, act: ACTOR }),
                sessionAccessToken: mint({ aud: "auth-service", exp: exp + 1 }),
            },
            eddsa,
            "switch_org",
        );
        const text = JSON.stringify(logged());
        for (const secret of [SID, ACTOR, "eyJ"]) expect(text).not.toContain(secret);
    });
});

describe("wireConfigFromEnv", () => {
    it("reads the class, the issuer and the backend URL from the server environment", () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
        vi.stubEnv("BACKEND_URL", "http://backend.test");
        expect(wireConfigFromEnv()).toMatchObject({
            tokenClassRaw: "eddsa",
            issuer: ISSUER,
            backendUrl: "http://backend.test",
        });
    });
});
