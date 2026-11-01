import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// CHAOS-10876 C2: the change-password Bearer and answer under the class setting. The CLASS decides
// the Bearer, not the session: after a rollback to hs256_compat a live cookie still holds a service
// token.

const { logs } = vi.hoisted(() => ({ logs: [] as unknown[][] }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn(), sealSessionHandoff: vi.fn() }));
vi.mock("@/lib/origin", () => ({ getBackendUrl: () => "http://ops.example.test" }));
vi.mock("@/lib/authSessionLog", () => ({
    logSessionBranch: vi.fn((fields: unknown) => logs.push([fields])),
    thrownErrorName: (e: unknown) => (e instanceof Error ? e.name : typeof e),
}));
vi.mock("@/lib/logger", () => {
    const capture = (...args: unknown[]) => logs.push(args);
    const l = {
        trace: capture,
        debug: capture,
        info: capture,
        warn: capture,
        error: capture,
        fatal: capture,
        child: vi.fn(),
    };
    l.child.mockReturnValue(l);
    return { logger: l };
});

import { auth, sealSessionHandoff } from "@/lib/auth";
import { resetKeySetCacheForTests } from "@/lib/authServiceWire";
import { ACTOR, ISSUER, SID, eddsaFetch, inSeconds, mint } from "@/test/eddsaAnswer";
import { POST } from "../route";

const CHANGE = "/api/v1/auth/change-password";
const CURRENT = "current-secret-value-1";
const NEWPW = "brand-new-secret-value-2";
const fetchMock = vi.fn();

function call() {
    return POST(
        new Request("http://web.example.test/api/auth/change-password", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ current_password: CURRENT, new_password: NEWPW }),
        }),
    );
}
function answer(
    exp: number,
    extra: Record<string, unknown> = {},
    access = mint({ exp, act: ACTOR }),
) {
    return () =>
        new Response(
            JSON.stringify({
                access_token: access,
                refresh_token: "fresh-refresh",
                expires_in: 3000,
                user: { org_id: "org-a", role: "owner", is_superuser: false },
                ...extra,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
        );
}
const bearerSent = () => {
    const sent = fetchMock.mock.calls.find(([u]) => String(u).endsWith(CHANGE));
    return ((sent?.[1] as RequestInit).headers as Record<string, string>).Authorization;
};
const pairGiven = () => vi.mocked(sealSessionHandoff).mock.calls[0]?.[1] as Record<string, unknown>;
const eddsaEnv = () => {
    vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
};
const session = (withService: boolean) =>
    ({
        access_token: "session-access",
        ...(withService ? { session_access_token: "session-service" } : {}),
        user: { id: "u" },
        expires: "2026-12-31T00:00:00.000Z",
    }) as never;

beforeEach(() => {
    logs.length = 0;
    fetchMock.mockReset();
    resetKeySetCacheForTests();
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(auth).mockResolvedValue(session(true));
    vi.mocked(sealSessionHandoff).mockReset();
    vi.mocked(sealSessionHandoff).mockResolvedValue("sealed-handoff");
});
afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

describe("the change-password Bearer", () => {
    it("under eddsa the Bearer is the service token when the session holds one", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(
            eddsaFetch({
                [CHANGE]: answer(exp, { session_access_token: mint({ aud: "auth-service", exp }) }),
            }),
        );
        await call();
        expect(bearerSent()).toBe("Bearer session-service");
    });

    it("under eddsa the Bearer is the access token when the session holds no service token", async () => {
        eddsaEnv();
        vi.mocked(auth).mockResolvedValue(session(false));
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(eddsaFetch({ [CHANGE]: answer(exp) }));
        await call();
        expect(bearerSent()).toBe("Bearer session-access");
    });

    it("the class decides, not the session: under hs256_compat a cookie that still holds a service token sends the access token", async () => {
        fetchMock.mockResolvedValue(answer(0, {}, "any-access")());
        await call();
        expect(bearerSent()).toBe("Bearer session-access");
    });

    it("an unknown class or eddsa without an issuer is a generic 502 and calls no backend", async () => {
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "nope");
        const unknown = await call();
        expect(unknown.status).toBe(502);
        vi.stubEnv("AUTH_ACCESS_TOKEN_CLASS", "eddsa");
        vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", "");
        const noIssuer = await call();
        expect(noIssuer.status).toBe(502);
        expect(fetchMock).not.toHaveBeenCalled();
    });
});

describe("the change-password answer under eddsa", () => {
    it("the new pair's service token is sealed with access_exp, sid and act_sub", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        fetchMock.mockImplementation(
            eddsaFetch({ [CHANGE]: answer(exp, { session_access_token: service }) }),
        );
        const response = await call();
        expect(response.status).toBe(200);
        expect(pairGiven()).toMatchObject({
            refresh_token: "fresh-refresh",
            session_access_token: service,
            session_exp: exp,
            access_exp: exp,
            sid: SID,
            act_sub: ACTOR,
        });
    });

    it("a refused service token gives the sign-in-again 502, seals nothing and logs no token", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp: exp + 1 });
        const access = mint({ exp, act: ACTOR });
        fetchMock.mockImplementation(
            eddsaFetch({ [CHANGE]: answer(exp, { session_access_token: service }, access) }),
        );
        const response = await call();
        expect(response.status).toBe(502);
        expect(await response.json()).toEqual({
            error: "Password changed. Sign in again to continue.",
        });
        expect(sealSessionHandoff).not.toHaveBeenCalled();
        const text = JSON.stringify(logs);
        for (const secret of [
            service,
            access,
            ACTOR,
            "fresh-refresh",
            CURRENT,
            NEWPW,
            "session-service",
        ]) {
            expect(text).not.toContain(secret);
        }
    });

    it("the key set unavailable gives the same sign-in-again 502 and seals nothing", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).startsWith(ISSUER)) return new Response("down", { status: 503 });
            return eddsaFetch({
                [CHANGE]: answer(exp, { session_access_token: mint({ aud: "auth-service", exp }) }),
            })(input, init);
        });
        const response = await call();
        expect(response.status).toBe(502);
        expect(sealSessionHandoff).not.toHaveBeenCalled();
    });

    it("answers the handoff only: no token in the body, any header or a cookie", async () => {
        eddsaEnv();
        const exp = inSeconds(1800);
        const service = mint({ aud: "auth-service", exp });
        const access = mint({ exp });
        fetchMock.mockImplementation(
            eddsaFetch({ [CHANGE]: answer(exp, { session_access_token: service }, access) }),
        );
        const response = await call();
        const text = await response.text();
        const headers = [...response.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
        for (const secret of [service, access, "fresh-refresh"]) {
            expect(text).not.toContain(secret);
            expect(headers).not.toContain(secret);
        }
        expect(response.headers.getSetCookie()).toEqual([]);
    });
});

describe("the change-password answer under hs256_compat", () => {
    it("the handoff is unchanged: no new field, the access token is not read, a present field is counted", async () => {
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
        expect(logs).toContainEqual([
            { operation: "change_password", branch: "session_token_ignored" },
        ]);
    });
});
