import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { decode, encode, type JWT } from "next-auth/jwt";
import { NextRequest } from "next/server";

// CHAOS-14039: a refresh the proxy's session read does is written back (Set-Cookie on the answer, the
// session-token chunks of the downstream request cookie replaced), only when that read changed the
// session; and the impersonation step honours the refresh back-off. Real proxy, Auth.js, jwt callback
// and impersonation step; only the backend answers are stubbed.

const requestScope = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
    headers: async () => requestScope.headers,
    cookies: async () => ({ get: () => undefined, getAll: () => [] }),
}));

const ORIGIN = "http://localhost:3000";
const SECRET = "offline-cell-auth-secret-14039";
const SESSION_COOKIE = "authjs.session-token";
const REFRESH_PATH = "/api/v1/auth/refresh";
const STOP_PATH = "/api/v1/admin/impersonate/stop";
const OLD_REFRESH = "refresh-before";
const NEW_REFRESH = "refresh-after";

type Backend = (url: string, init?: RequestInit) => Promise<Response> | Response;
let backendAnswer: Backend;
const calls: { url: string; init?: RequestInit }[] = [];

let auth: typeof import("@/lib/auth");
let proxyModule: typeof import("@/proxy");
let mint: typeof import("@/test/eddsaAnswer").mint;
let ISSUER: string;
let keyAnswer: (url: string) => Response | undefined;

beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", SECRET);
    vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    const eddsa = await import("@/test/eddsaAnswer");
    mint = eddsa.mint;
    ISSUER = eddsa.ISSUER;
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    keyAnswer = (url) =>
        url === `${ISSUER}/.well-known/openid-configuration`
            ? eddsa.discoveryResponse()
            : url === `${ISSUER}/.well-known/jwks.json`
              ? eddsa.keysResponse()
              : undefined;
    vi.stubGlobal(
        "fetch",
        vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input);
            const keys = keyAnswer(url);
            if (keys) return keys;
            calls.push({ url, init });
            return backendAnswer(url, init);
        }),
    );
    auth = await import("@/lib/auth");
    proxyModule = await import("@/proxy");
});

afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

beforeEach(() => {
    calls.length = 0;
    backendAnswer = rotating();
});

afterEach(() => {
    vi.useRealTimers();
});

const refreshCalls = () => calls.filter((c) => c.url.endsWith(REFRESH_PATH)).length;

function rotating(delayMs = 0): Backend {
    return async (url) => {
        if (url.endsWith(REFRESH_PATH)) {
            if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
            return Response.json({
                access_token: mint({ exp: Math.floor(Date.now() / 1000) + 3000 }),
                refresh_token: NEW_REFRESH,
            });
        }
        if (url.endsWith(STOP_PATH)) return Response.json({ status: "stopped" });
        return Response.json({ valid: true });
    };
}

function dueToken(overrides: Partial<JWT> = {}): JWT {
    return {
        id: "user-1",
        email: "u@example.test",
        org_id: "org-1",
        role: "member",
        access_token: mint({ exp: Math.floor(Date.now() / 1000) + 60 }),
        refresh_token: OLD_REFRESH,
        expires_at: Date.now() - 1_000,
        last_validated: Date.now(),
        ...overrides,
    };
}

async function seal(token: JWT, extra = ""): Promise<string> {
    const value = await encode({ token, salt: SESSION_COOKIE, secret: SECRET });
    return `${extra}${SESSION_COOKIE}=${value}`;
}

function request(path: string, cookie: string, headers: Record<string, string> = {}): NextRequest {
    const req = new NextRequest(new URL(path, ORIGIN), {
        headers: { cookie, "sec-fetch-mode": "navigate", ...headers },
    });
    requestScope.headers = req.headers;
    return req;
}

const sessionSetCookies = (res: Response) =>
    res.headers.getSetCookie().filter((l) => l.startsWith("authjs.session-token"));

/** The browser's jar after an answer: its session cookies replace the old ones. */
function jar(prior: string, res: Response): string {
    return proxyModule.withSessionCookies(prior, res.headers.getSetCookie());
}

async function tokenIn(cookie: string): Promise<JWT | null> {
    const value = cookie
        .split(";")
        .map((p) => p.trim())
        .find((p) => p.startsWith(`${SESSION_COOKIE}=`))
        ?.slice(SESSION_COOKIE.length + 1);
    if (!value) return null;
    return decode({ token: value, salt: SESSION_COOKIE, secret: SECRET });
}

/** The cookie header the proxy forwards to the page render (Next's request-override header). */
const forwardedCookie = (res: Response) => res.headers.get("x-middleware-request-cookie");

describe("C1: the proxy persists its refresh", () => {
    it("C1: two page loads send one refresh POST; the first answer carries the rotated session", async () => {
        const prior = await seal(dueToken());
        const first = await proxyModule.proxy(request("/dashboard", prior));
        expect(sessionSetCookies(first)).toHaveLength(1);
        const second = await proxyModule.proxy(request("/dashboard", jar(prior, first)));
        expect(second.status).toBe(200);
        expect(refreshCalls()).toBe(1);
        expect((await tokenIn(jar(prior, first)))?.refresh_token).toBe(NEW_REFRESH);
    });

    it("C1b: the page render of the same load reads the forwarded cookie and does not refresh again", async () => {
        const prior = await seal(dueToken());
        const res = await proxyModule.proxy(request("/dashboard", prior));
        const forwarded = forwardedCookie(res);
        expect(forwarded).toBeTruthy();
        requestScope.headers = new Headers({ cookie: forwarded! });
        const rendered = await auth.auth();
        expect(rendered?.access_token).toBeTruthy();
        expect(refreshCalls()).toBe(1);
    });

    it("C1c: a 429 back-off is persisted: a second load inside it sends no refresh", async () => {
        backendAnswer = async (url) =>
            url.endsWith(REFRESH_PATH)
                ? new Response("{}", { status: 429, headers: { "Retry-After": "900" } })
                : Response.json({});
        const prior = await seal(dueToken());
        const first = await proxyModule.proxy(request("/dashboard", prior));
        expect(sessionSetCookies(first)).toHaveLength(1);
        expect((await tokenIn(jar(prior, first)))?.error).toBe("refresh_rate_limited");
        await proxyModule.proxy(request("/dashboard", jar(prior, first)));
        expect(refreshCalls()).toBe(1);
    });

    it("C1d (guard): a load with nothing to refresh sets no session cookie and forwards the cookie unchanged", async () => {
        const fresh = await seal(dueToken({ expires_at: Date.now() + 3_600_000 }), "theme=dark; ");
        const res = await proxyModule.proxy(request("/dashboard", fresh));
        expect(res.headers.getSetCookie()).toEqual([]);
        expect(forwardedCookie(res) ?? fresh).toBe(fresh);
        expect(refreshCalls()).toBe(0);
    });

    it("C1f (guard): every answer path carries the write; a signed-out request carries none", async () => {
        // the root redirect to /dashboard
        const root = await proxyModule.proxy(request("/", await seal(dueToken())));
        expect(root.status).toBe(303);
        expect(sessionSetCookies(root)).toHaveLength(1);
        // an Ops rewrite
        const ops = await proxyModule.proxy(request("/graphql", await seal(dueToken())));
        expect(sessionSetCookies(ops)).toHaveLength(1);
        // a refused refresh (401) ends the session: the sign-in redirect clears it
        backendAnswer = async () => new Response("{}", { status: 401 });
        const ended = await proxyModule.proxy(request("/dashboard", await seal(dueToken())));
        expect(ended.status).toBe(303);
        expect(sessionSetCookies(ended)).toHaveLength(1);
        expect((await tokenIn(jar(await seal(dueToken()), ended)))?.refresh_token).toBeUndefined();
        // signed out
        const out = await proxyModule.proxy(request("/dashboard", ""));
        expect(out.headers.getSetCookie()).toEqual([]);
    });
});

describe("acp conditions", () => {
    it("1: two interleaved requests: only the one that refreshes gets Set-Cookie", async () => {
        backendAnswer = rotating(50);
        const due = request("/dashboard", await seal(dueToken()));
        const freshCookie = await seal(dueToken({ expires_at: Date.now() + 3_600_000 }));
        const [a, b] = await Promise.all([
            proxyModule.proxy(due),
            (async () => {
                await new Promise((r) => setTimeout(r, 10));
                return proxyModule.proxy(request("/dashboard", freshCookie));
            })(),
        ]);
        expect(sessionSetCookies(a)).toHaveLength(1);
        expect(b.headers.getSetCookie()).toEqual([]);
        expect(refreshCalls()).toBe(1);
    });

    it("2: the Set-Cookie names and attributes are byte-equal to Auth.js's own session route", async () => {
        const prior = await seal(dueToken());
        const viaProxy = sessionSetCookies(await proxyModule.proxy(request("/dashboard", prior)));
        const route = await auth.handlers.GET(
            new NextRequest(new URL("/api/auth/session", ORIGIN), { headers: { cookie: prior } }),
        );
        const viaRoute = route.headers
            .getSetCookie()
            .filter((l) => l.startsWith("authjs.session-token"));
        const shape = (line: string) => {
            const [pair, ...attributes] = line.split(";");
            return `${pair.split("=", 1)[0]};${attributes.join(";")}`;
        };
        expect(viaProxy.map(shape)).toEqual(viaRoute.map(shape));
        expect(viaProxy.length).toBeGreaterThan(0);
    });

    it("3 / C1e: the rewrite touches only session-token chunks; chunks that grow or shrink are replaced", () => {
        const header =
            "a=1; authjs.session-token.0=OLD0; b=2; authjs.session-token.1=OLD1; __Secure-x=3";
        // shrink: two chunks become one, the stale chunk is expired
        expect(
            proxyModule.withSessionCookies(header, [
                "authjs.session-token=NEW; Path=/; HttpOnly; SameSite=Lax",
                "authjs.session-token.0=; Path=/; Max-Age=0",
                "authjs.session-token.1=; Path=/; Max-Age=0",
            ]),
        ).toBe("a=1; b=2; __Secure-x=3; authjs.session-token=NEW");
        // grow: one cookie becomes three chunks
        expect(
            proxyModule.withSessionCookies("a=1; authjs.session-token=OLD; c=9", [
                "authjs.session-token.0=N0; Path=/",
                "authjs.session-token.1=N1; Path=/",
                "authjs.session-token.2=N2; Path=/",
                "authjs.session-token=; Path=/; Max-Age=0",
            ]),
        ).toBe(
            "a=1; c=9; authjs.session-token.0=N0; authjs.session-token.1=N1; authjs.session-token.2=N2",
        );
        // other Set-Cookie lines never enter the request cookie, and leave the session cookies as they are
        expect(
            proxyModule.withSessionCookies("a=1; authjs.session-token=KEEP", ["other=x; Path=/"]),
        ).toBe("a=1; authjs.session-token=KEEP");
    });

    it("3 / C1e end to end: a token over the chunk size is forwarded as its new chunks only", async () => {
        const big = await seal(dueToken({ padding: "x".repeat(6_000) }), "keep=me; ");
        const res = await proxyModule.proxy(request("/dashboard", big));
        const lines = sessionSetCookies(res);
        expect(lines.length).toBeGreaterThan(1);
        const forwarded = forwardedCookie(res)!;
        expect(forwarded.startsWith("keep=me; ")).toBe(true);
        const names = forwarded.split("; ").map((p) => p.split("=", 1)[0]);
        expect(names.filter((n) => n === SESSION_COOKIE)).toHaveLength(0);
        expect(names.filter((n) => n.startsWith(`${SESSION_COOKIE}.`)).length).toBe(
            lines.filter((l) => !/max-age=0/i.test(l)).length,
        );
    });

    it("4: two concurrent loads with an expiring token: one refresh POST, both answers carry the same rotated credential", async () => {
        backendAnswer = rotating(30);
        const prior = await seal(dueToken());
        const [a, b] = await Promise.all([
            proxyModule.proxy(request("/dashboard", prior)),
            proxyModule.proxy(request("/dashboard", prior)),
        ]);
        expect(refreshCalls()).toBe(1);
        expect((await tokenIn(jar(prior, a)))?.refresh_token).toBe(NEW_REFRESH);
        expect((await tokenIn(jar(prior, b)))?.refresh_token).toBe(NEW_REFRESH);
    });
});

describe("C2 (D1): the impersonation step honours the refresh back-off", () => {
    const impersonating = (overrides: Partial<JWT> = {}) =>
        dueToken({
            is_superuser: true,
            access_token: mint({ exp: Math.floor(Date.now() / 1000) + 60 }),
            expires_at: Date.now() + 60_000,
            imp_access_token: "delegated-token",
            imp_expires_at: Date.now() - 500,
            impersonated_user_id: "user-2",
            impersonated_org_id: "org-2",
            ...overrides,
        });

    it("C2: inside the back-off: one refresh POST, the session kept, no Authorization forwarded; after it, the stop ends the impersonation", async () => {
        vi.useFakeTimers({ toFake: ["Date"], now: Date.now() });
        backendAnswer = async (url) =>
            url.endsWith(REFRESH_PATH)
                ? new Response("{}", { status: 429, headers: { "Retry-After": "900" } })
                : url.endsWith(STOP_PATH)
                  ? new Response("{}", { status: 503 })
                  : Response.json({});
        let cookie = await seal(impersonating());
        const first = await proxyModule.proxy(request("/dashboard", cookie));
        cookie = jar(cookie, first);
        expect(refreshCalls()).toBe(1);

        vi.setSystemTime(Date.now() + 1_000);
        const second = await proxyModule.proxy(request("/graphql", cookie));
        cookie = jar(cookie, second);
        expect(refreshCalls()).toBe(1);
        const kept = await tokenIn(cookie);
        expect(kept?.refresh_token).toBe(OLD_REFRESH);
        expect(kept?.imp_access_token).toBe("delegated-token");
        expect(second.headers.get("x-middleware-request-authorization")).toBeNull();

        // after the back-off: the refresh rotates and the stop records, so the impersonation ends cleanly
        backendAnswer = rotating();
        vi.setSystemTime(Date.now() + 901_000);
        const third = await proxyModule.proxy(request("/dashboard", cookie));
        cookie = jar(cookie, third);
        expect(refreshCalls()).toBe(2);
        const after = await tokenIn(cookie);
        expect(after?.refresh_token).toBe(NEW_REFRESH);
        expect(after?.imp_access_token).toBeUndefined();
        expect(calls.filter((c) => c.url.endsWith(STOP_PATH)).length).toBeGreaterThanOrEqual(2);
    });
});
