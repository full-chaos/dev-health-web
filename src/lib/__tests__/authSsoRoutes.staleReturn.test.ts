import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ssoCompleteOidc, ssoCompleteSaml, ssoStart, type SsoProtocol } from "@/lib/authSsoRoutes";
import { eddsaFetch } from "@/test/eddsaAnswer";
import {
    OIDC_CALLBACK_PATH,
    ORIGIN,
    PROVIDER,
    SAML_ACS_PATH,
    json,
    sessionAnswer,
    setCookieLines,
    stubSsoEnv,
} from "@/test/ssoRoutes";

// CHAOS-13044: a new SSO start must not leave the return target of an abandoned earlier start in
// the browser. A start without a safe callbackUrl expires `sso_return`, so a completion afterwards
// lands on the default target.

vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));
const signIn = vi.fn();
const sealSsoTicket = vi.fn();
vi.mock("@/lib/auth", () => ({
    signIn: (...args: unknown[]) => signIn(...args),
    sealSsoTicket: (...args: unknown[]) => sealSsoTicket(...args),
}));

const fetchMock = vi.fn();
const IDP = "https://idp.example.test/start";

const PATH: Record<SsoProtocol, string> = { oidc: OIDC_CALLBACK_PATH, saml: SAML_ACS_PATH };
const SAME_SITE: Record<SsoProtocol, string> = { oidc: "Lax", saml: "None" };
const EXPIRED = (protocol: SsoProtocol) =>
    `sso_return=; Path=${PATH[protocol]}; Max-Age=0; HttpOnly; Secure; SameSite=${SAME_SITE[protocol]}`;
const returnLines = (res: Response) =>
    setCookieLines(res).filter((l) => l.startsWith("sso_return="));

function start(protocol: SsoProtocol, query: string): Promise<Response> {
    return ssoStart(
        new Request(`${ORIGIN}/auth/sso/${protocol}/${PROVIDER}${query}`),
        protocol,
        PROVIDER,
    );
}

// A browser jar reduced to the one cookie under test: Max-Age=0 removes it.
function jar(responses: Response[]): string | undefined {
    let value: string | undefined;
    for (const res of responses) {
        for (const line of returnLines(res)) {
            value = /Max-Age=0/.test(line) ? undefined : line.split(";")[0];
        }
    }
    return value;
}

function complete(protocol: SsoProtocol, cookie: string | undefined): Promise<Response> {
    const headers: Record<string, string> = cookie === undefined ? {} : { cookie };
    if (protocol === "oidc") {
        return ssoCompleteOidc(
            new Request(`${ORIGIN}${OIDC_CALLBACK_PATH}?code=c1&state=s1`, { headers }),
            PROVIDER,
        );
    }
    return ssoCompleteSaml(
        new Request(`${ORIGIN}${SAML_ACS_PATH}`, {
            method: "POST",
            headers: { ...headers, "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ SAMLResponse: "PHNhbWw+" }).toString(),
        }),
        PROVIDER,
    );
}

beforeEach(() => {
    fetchMock.mockReset();
    signIn.mockReset();
    sealSsoTicket.mockReset();
    sealSsoTicket.mockResolvedValue("sealed-ticket");
    fetchMock.mockImplementation(
        eddsaFetch({
            "/authorize": () => json(200, { authorization_url: IDP }),
            "/initiate": () => json(200, { redirect_url: IDP }),
            "/callback": () => json(200, sessionAnswer()),
            "/acs": () => json(200, sessionAnswer()),
        }),
    );
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    stubSsoEnv(true);
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe.each(["oidc", "saml"] as const)(
    "CHAOS-13044 %s start after an abandoned start",
    (protocol) => {
        it.each([
            ["missing", ""],
            ["unsafe", `?callbackUrl=${encodeURIComponent("https://evil.example/steal")}`],
        ])("a %s callbackUrl expires the earlier sso_return", async (_name, query) => {
            const first = await start(protocol, `?callbackUrl=${encodeURIComponent("/previous")}`);
            expect(jar([first])).toBe(`sso_return=${encodeURIComponent("/previous")}`);

            const second = await start(protocol, query);
            expect(returnLines(second)).toEqual([EXPIRED(protocol)]);

            const res = await complete(protocol, jar([first, second]));
            expect(res.status).toBe(303);
            expect(res.headers.get("location")).toBe(`${ORIGIN}/dashboard`);
        });

        it("a safe callbackUrl replaces the earlier sso_return and is the completion target", async () => {
            const first = await start(protocol, `?callbackUrl=${encodeURIComponent("/previous")}`);
            const second = await start(protocol, `?callbackUrl=${encodeURIComponent("/org/7")}`);
            expect(returnLines(second)).toHaveLength(1);
            expect(returnLines(second)[0]).toContain(`sso_return=${encodeURIComponent("/org/7")};`);
            expect(returnLines(second)[0]).not.toContain("Max-Age=0");

            const res = await complete(protocol, jar([first, second]));
            expect(res.headers.get("location")).toBe(`${ORIGIN}/org/7`);
        });
    },
);
