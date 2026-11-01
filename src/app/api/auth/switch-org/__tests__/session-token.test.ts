import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10876 C2: the switch-org answer under the class setting. The seal is mocked so the pair it
// is given can be read; the key source and the readers are the real ones.

vi.mock("@/lib/auth", () => ({ auth: vi.fn(), sealSessionHandoff: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));
vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn(),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));

import { auth, sealSessionHandoff } from "@/lib/auth";
import { logSessionBranch } from "@/lib/authSessionLog";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";
import { POST } from "../route";

const SWITCH = "/api/v1/auth/switch-org";
const fetchMock = vi.fn();
const logged = () => vi.mocked(logSessionBranch).mock.calls.map(([f]) => f);

function answer(
    exp: number,
    extra: Record<string, unknown> = {},
    access = mint({ exp, act: ACTOR }),
) {
    return () =>
        new Response(
            JSON.stringify({
                access_token: access,
                refresh_token: "switched-refresh",
                expires_in: 3000,
                user: { org_id: "org-b", role: "admin", is_superuser: false },
                ...extra,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
}

function call() {
    return POST(
        new Request("http://web.example.test/api/auth/switch-org", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ org_id: "org-b" }),
        }),
    );
}
const pairGiven = () => vi.mocked(sealSessionHandoff).mock.calls[0]?.[1] as Record<string, unknown>;

function eddsaEnv() {
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
}

beforeEach(() => {
    vi.mocked(logSessionBranch).mockClear();
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(auth).mockResolvedValue({
        access_token: "session-access",
        session_access_token: "session-service",
        user: { id: "user-1" },
        expires: "2026-12-31T00:00:00.000Z",
    } as never);
    vi.mocked(sealSessionHandoff).mockReset();
    vi.mocked(sealSessionHandoff).mockResolvedValue("sealed-handoff");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("POST /api/auth/switch-org under eddsa", () => {
    it("the sealed pair carries session_access_token, session_exp, access_exp, sid and act_sub", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        fetchMock.mockImplementation(
            eddsaFetch({ [SWITCH]: answer(exp, { session_access_token: service }) }),
        );
        const response = await call();
        expect(response.status).toBe(200);
        expect(pairGiven()).toMatchObject({
            refresh_token: "switched-refresh",
            session_access_token: service,
            session_exp: exp,
            access_exp: exp,
            sid: SID,
            act_sub: ACTOR,
            user: { org_id: "org-b", role: "admin" },
        });
    });

    it("its own Bearer stays access_token, not the service token", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(
            eddsaFetch({
                [SWITCH]: answer(exp, { session_access_token: mint({ aud: "auth-service", exp }) }),
            }),
        );
        await call();
        const sent = fetchMock.mock.calls.find(([u]) => String(u).endsWith(SWITCH));
        expect((sent?.[1] as RequestInit).headers as Record<string, string>).toMatchObject({
            Authorization: "Bearer session-access",
        });
    });

    it("a refused service token leaves the session unchanged: the fixed 502 and no seal", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(
            eddsaFetch({
                [SWITCH]: answer(exp, {
                    session_access_token: mint({ aud: "auth-service", exp: exp + 1 }),
                }),
            }),
        );
        const response = await call();
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Organization switch failed" });
        expect(sealSessionHandoff).not.toHaveBeenCalled();
        expect(logged()).toEqual([
            { operation: "switch_org", branch: "session_token_exp_mismatch" },
        ]);
    });

    it("the key set unavailable is the same fixed 502 and no seal", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(ISSUER)) return new Response("down", { status: 503 });
            return eddsaFetch({
                [SWITCH]: answer(exp, { session_access_token: mint({ aud: "auth-service", exp }) }),
            })(input, init);
        });
        const response = await call();
        expect(response.status).toBe(502);
        expect(sealSessionHandoff).not.toHaveBeenCalled();
    });

    it("an unknown class gives the fixed 502 and calls no backend", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "nope");
        fetchMock.mockImplementation(eddsaFetch({}));
        const response = await call();
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({ error: "Organization switch failed" });
        expect(fetchMock).not.toHaveBeenCalled();
        expect(logged()).toEqual([{ operation: "switch_org", branch: "auth_config_invalid" }]);
    });

    it("eddsa without an issuer gives the fixed 502 and calls no backend", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", "");
        const response = await call();
        expect(response.status).toBe(502);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("answers the org and the handoff only: no token in the body, any header, a redirect or a cookie", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        const access = mint({ exp, act: ACTOR });
        fetchMock.mockImplementation(
            eddsaFetch({ [SWITCH]: answer(exp, { session_access_token: service }, access) }),
        );
        const response = await call();
        const text = await response.text();
        const headers = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
        for (const secret of [service, access, ACTOR, "switched-refresh"]) {
            expect(text).not.toContain(secret);
            expect(headers).not.toContain(secret);
        }
        expect(Object.keys(JSON.parse(text)).sort()).toEqual(["org_id", "sessionHandoff"]);
        expect(response.headers.getSetCookie()).toEqual([]);
        expect(response.headers.get("location")).toBeNull();
    });
});

describe("POST /api/auth/switch-org under hs256_compat", () => {
    it("the pair is unchanged: no new field, the access token is not read, and a present field is counted", async () => {
        fetchMock.mockResolvedValue(
            answer(0, { session_access_token: "svc-value" }, "not-a-decodable-token")(),
        );
        const response = await call();
        expect(response.status).toBe(200);
        expect(Object.keys(pairGiven()).sort()).toEqual([
            "access_token",
            "expires_in",
            "refresh_token",
            "user",
        ]);
        expect(pairGiven().access_token).toBe("not-a-decodable-token");
        expect(logged()).toEqual([{ operation: "switch_org", branch: "session_token_ignored" }]);
    });
});
