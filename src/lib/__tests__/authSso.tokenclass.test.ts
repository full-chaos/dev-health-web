import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetKeySetCacheForTests, type WireConfig } from "@/lib/authServiceWire";
import { completeOidc, completeSaml } from "@/lib/authSso";
import { ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";

// CHAOS-12928: SSO completion trusts only class eddsa. Any other token class refuses before the
// auth-service call and logs one error line, counted by branch.

const { logError, logWarn } = vi.hoisted(() => ({ logError: vi.fn(), logWarn: vi.fn() }));
vi.mock("@/lib/logger", () => ({
    logger: { child: () => ({ error: logError, warn: logWarn }) },
}));

const PROVIDER = "6f1d0f6e-62a1-4b3a-9f0e-1f2b3c4d5e6f";
const ORG = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const BACKEND = "http://auth.test";
const fetchMock = vi.fn();
const oidc = { providerId: PROVIDER, code: "c", state: "s", cookies: "dho_oidc_login_nonce_x=n" };
const saml = {
    providerId: PROVIDER,
    samlResponse: "PHNhbWw+",
    cookies: "dho_saml_login_nonce_x=n",
};
const cfg = (tokenClassRaw: string | undefined): WireConfig => ({
    tokenClassRaw,
    issuer: ISSUER,
    backendUrl: BACKEND,
});
const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
    });
const body = (accessToken: string) => ({
    access_token: accessToken,
    refresh_token: "ref-secret",
    user_id: "u1",
    email: "a@example.test",
    org_id: ORG,
    role: "member",
});
const good = () => mint({ exp: inSeconds(1800), org: ORG });
const badSignature = () => {
    const [h, p, sig] = good().split(".");
    return `${h}.${p}.${sig.slice(0, -4)}AAAA`;
};
const serve = (accessToken: string) =>
    fetchMock.mockImplementation(
        eddsaFetch({
            "/callback": () => json(body(accessToken)),
            "/acs": () => json(body(accessToken)),
        }),
    );
const calls = {
    oidc: () => completeOidc(oidc, cfg("eddsa")),
    saml: () => completeSaml(saml, cfg("eddsa")),
};

beforeEach(() => {
    fetchMock.mockReset();
    logError.mockReset();
    logWarn.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("AUTH_SSO_ENABLED", "true");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe.each([
    ["oidc", (c: WireConfig) => completeOidc(oidc, c)],
    ["saml", (c: WireConfig) => completeSaml(saml, c)],
] as const)("%s completion with a token class other than eddsa", (_name, complete) => {
    it.each([
        ["unset", undefined],
        ["empty", ""],
        ["hs256_compat", "hs256_compat"],
        ["unknown", "rs256"],
    ])("%s is refused, with no call and one error line", async (_label, raw) => {
        serve(badSignature());
        const got = await complete(cfg(raw));
        expect(got).toEqual({ kind: "refused", code: "sso_unavailable", clearCookies: [] });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logError).toHaveBeenCalledTimes(1);
        expect(logWarn).not.toHaveBeenCalled();
        const [fields] = logError.mock.calls[0] as [Record<string, unknown>];
        expect(fields).toEqual({ operation: "sso_login", branch: "sso_token_class_refused" });
        expect(JSON.stringify(logError.mock.calls)).not.toMatch(
            /ey[A-Za-z0-9_-]+\.|ref-secret|u1|@/,
        );
    });
});

describe.each(["oidc", "saml"] as const)("%s completion under eddsa", (name) => {
    it("a valid token is ok and logs nothing", async () => {
        serve(good());
        expect(await calls[name]()).toMatchObject({
            kind: "ok",
            session: { orgId: ORG, sid: SID },
        });
        expect(logError).not.toHaveBeenCalled();
    });

    it("an invalid signature is refused by the verifier", async () => {
        serve(badSignature());
        expect(await calls[name]()).toMatchObject({ kind: "refused", code: "sso_failed" });
        expect(logError).not.toHaveBeenCalled();
    });
});
