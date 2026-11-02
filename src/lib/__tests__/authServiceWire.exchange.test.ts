import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logSessionBranch } from "@/lib/authSessionLog";
import {
    readExchangeAnswer,
    resetKeySetCacheForTests,
    wireConfigFromEnv,
    type WireConfig,
} from "@/lib/authServiceWire";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// CHAOS-10876 C2: the answers of switch-org, change-password and the social exchange are read the
// way the login answer is: the access token and the service token.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

const fetchMock = vi.fn();
const eddsa: WireConfig = {
    issuer: ISSUER,
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
    it("readExchangeAnswer: reads the access token and the service token and returns exp, sid, actor and the token", async () => {
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

    it("the key set unavailable is unavailable", async () => {
        fetchMock.mockImplementation(async () => new Response("down", { status: 503 }));
        const exp = inSeconds(1800);
        const got = await readExchangeAnswer(
            { accessToken: mint({ exp }), sessionAccessToken: mint({ aud: "auth-service", exp }) },
            eddsa,
            "switch_org",
        );
        expect(got).toEqual({ kind: "unavailable" });
    });

    it("an absent field is accepted and counted under the operation", async () => {
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

    it("a missing issuer is refused, counted auth_config_invalid under the operation, and nothing is fetched", async () => {
        const noIssuer = { ...eddsa, issuer: undefined };
        expect(
            await readExchangeAnswer({ accessToken: mint() }, noIssuer, "change_password"),
        ).toEqual({ kind: "refused" });
        expect(await readExchangeAnswer({ accessToken: mint() }, noIssuer, "social_login")).toEqual(
            { kind: "refused" },
        );
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logged()).toEqual([
            { operation: "change_password", branch: "auth_config_invalid" },
            { operation: "social_login", branch: "auth_config_invalid" },
        ]);
    });

    it("an HS256 access token is refused for every operation", async () => {
        const hs256 = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${Buffer.from("{}").toString("base64url")}.c2ln`;
        for (const operation of OPERATIONS) {
            expect(
                await readExchangeAnswer({ accessToken: hs256 }, eddsa, operation),
                operation,
            ).toEqual({ kind: "refused" });
        }
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
    it("reads the issuer and the backend URL from the server environment, and no class", () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
        vi.stubEnv("BACKEND_URL", "http://backend.test");
        const config = wireConfigFromEnv();
        expect(config).toMatchObject({ issuer: ISSUER, backendUrl: "http://backend.test" });
        expect(config).not.toHaveProperty("tokenClassRaw");
    });
});
