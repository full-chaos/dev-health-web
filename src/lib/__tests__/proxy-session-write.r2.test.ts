// CHAOS-14039 round-2 cells (the gpt-6.2-sol r2 repros, adopted; acp form on r2): R-A fixed in code, R-B and R-C
// named limits with their impact asserted.
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { decode, encode } from "next-auth/jwt";
import { NextRequest } from "next/server";
import { mint, ISSUER, discoveryResponse, keysResponse } from "@/test/eddsaAnswer";
import { resetValidationMemoForTests } from "@/lib/authValidationMemo";
import { resetImpersonationStatusForTests } from "@/lib/impersonationStatusMemo";
import { overrideDeadlinesForTests } from "@/lib/serverDeadline";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));

const origin = "http://localhost:3000";
const name = "authjs.session-token";
const secret = "offline-review-r2-auth-secret";
const originalRefresh = "fixture-original-refresh";
const rotatedRefresh = "fixture-rotated-refresh";
const fiveMinutes = 300_000;
const thirtySecondGrace = 30_000;

let proxy: typeof import("@/proxy").proxy;
let delegatedBearer: string;
type Backend = (path: string, init?: RequestInit) => Response | Promise<Response>;
let backend: Backend;

function checkpoint() {
    let release!: () => void;
    const reached = new Promise<void>((resolve) => {
        release = resolve;
    });
    return { reached, release };
}

function beforeResponse(reached: Promise<void>, response: Promise<Response>) {
    return Promise.race([
        reached,
        response.then((res) => {
            throw new Error(`Unexpected early response: ${res.status}`);
        }),
    ]);
}

function rotated() {
    return Response.json({
        access_token: mint({ exp: Math.floor(Date.now() / 1000) + 3000 }),
        refresh_token: rotatedRefresh,
    });
}

beforeAll(async () => {
    vi.stubEnv("AUTH_SECRET", secret);
    vi.stubEnv("AUTH_URL", `${origin}/api/auth`);
    vi.stubEnv("AUTH_ACCESS_TOKEN_ISSUER", ISSUER);
    vi.stubEnv("BACKEND_URL", "http://backend.test");
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        if (url.href === `${ISSUER}/.well-known/openid-configuration`) return discoveryResponse();
        if (url.href === `${ISSUER}/.well-known/jwks.json`) return keysResponse();
        if (url.origin !== "http://backend.test") throw new Error("Unexpected fixture origin");
        return backend(url.pathname, init);
    });
    ({ proxy } = await import("@/proxy"));
});

beforeEach(() => {
    resetValidationMemoForTests();
    resetImpersonationStatusForTests();
    backend = () => {
        throw new Error("Unexpected fixture request");
    };
});

afterEach(() => {
    overrideDeadlinesForTests(null);
    vi.useRealTimers();
});

afterAll(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
});

async function cookieFor({
    expiresInMs,
    delegatedExpiresInMs = 600_000,
    superuser = true,
}: {
    expiresInMs: number;
    delegatedExpiresInMs?: number;
    superuser?: boolean;
}) {
    const now = Date.now();
    delegatedBearer = mint({
        act: "prn_BBBBBBBBBBBBBBBBBBBBBB",
        exp: Math.floor((now + delegatedExpiresInMs) / 1000),
    });
    const jwt = await encode({
        salt: name,
        secret,
        token: {
            id: "fixture-user",
            name: "Fixture User",
            org_id: "fixture-org",
            is_superuser: superuser,
            access_token: mint({ exp: Math.floor((now + expiresInMs) / 1000) }),
            refresh_token: originalRefresh,
            expires_at: now + expiresInMs,
            last_validated: now - 120_000,
            ...(superuser && {
                imp_access_token: delegatedBearer,
                imp_expires_at: now + delegatedExpiresInMs,
                impersonated_user_id: "fixture-target",
                impersonated_org_id: "fixture-target-org",
            }),
        },
    });
    return `${name}=${jwt}`;
}

function load(cookie: string, path = "/dashboard") {
    return proxy(new NextRequest(new URL(path, origin), { headers: { cookie } }));
}

function sessionSetCookies(response: Response) {
    return response.headers.getSetCookie().filter((line) => line.startsWith(`${name}=`));
}

function applyBrowserCookie(prior: string, response: Response): string {
    const lines = sessionSetCookies(response);
    if (!lines.length) return prior;
    expect(lines).toHaveLength(1);
    return lines[0].split(";", 1)[0];
}

function readCookie(cookie: string) {
    return decode({ token: cookie.slice(name.length + 1), salt: name, secret });
}

function isOriginalRefresh(init: RequestInit | undefined) {
    return JSON.parse(String(init?.body)).refresh_token === originalRefresh;
}

function redirectPath(response: Response) {
    const location = response.headers.get("location");
    return location ? new URL(location).pathname : null;
}

it("round-one periodic validation is skipped after rotation", async () => {
    let validations = 0;
    backend = (path) => {
        if (path.endsWith("/refresh")) return rotated();
        if (path.endsWith("/validate")) validations++;
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: 60_000, superuser: false });
    const res = await load(prior);
    const written = await readCookie(applyBrowserCookie(prior, res));
    expect(res.status).toBe(200);
    expect(validations).toBe(0);
    expect(written?.refresh_token).toBe(rotatedRefresh);
});

it("round-one backend status clear is persisted when the read completes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    let statusReads = 0;
    backend = (path) => {
        if (path.endsWith("/status")) {
            statusReads++;
            return statusReads === 1
                ? Response.json({ is_impersonating: false })
                : new Response(null, { status: 503 });
        }
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: 3_000_000 });
    const cleared = await load(prior, "/graphql");
    const cookie = applyBrowserCookie(prior, cleared);
    vi.setSystemTime(Date.now() + 3001);
    const later = await load(cookie, "/graphql");
    const staleBearerForwarded =
        later.headers.get("x-middleware-request-authorization") === `Bearer ${delegatedBearer}`;
    expect(statusReads).toBe(2);
    expect((await readCookie(cookie))?.imp_access_token).toBeUndefined();
    expect(staleBearerForwarded).toBe(false);
});

it("R-A: a rotation is kept when an impersonation status read would follow: the read skips it", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    overrideDeadlinesForTests({ auth: 10_000, outerMargin: 5_000, slow: 60_000 });
    const releaseRefresh = checkpoint();
    const refreshStarted = checkpoint();
    const statusStarted = checkpoint();
    let statusReads = 0;
    backend = async (path) => {
        if (path.endsWith("/refresh")) {
            refreshStarted.release();
            await releaseRefresh.reached;
            return rotated();
        }
        if (path.endsWith("/status")) {
            statusReads++;
            statusStarted.release();
            // a status read in this read would take 7.1 s and push it past the 15 s deadline
            await new Promise((r) => setTimeout(r, 7_100));
            return Response.json({ is_impersonating: false });
        }
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: 60_000 });
    const pending = load(prior);
    await beforeResponse(refreshStarted.reached, pending);
    await vi.advanceTimersByTimeAsync(8_000);
    releaseRefresh.release();
    // the read answers, or (at the base) starts the 7.1 s status read, which the 15 s deadline cuts
    if (
        (await Promise.race([pending.then(() => "answered"), statusStarted.reached])) !== "answered"
    ) {
        await vi.advanceTimersByTimeAsync(7_100);
    }
    const first = await pending;
    expect(first.status).not.toBe(503);
    expect(statusReads).toBe(0);
    expect((await readCookie(applyBrowserCookie(prior, first)))?.refresh_token).toBe(
        rotatedRefresh,
    );
});

it("R-A: a status clear is kept when a validation would follow: the read skips it, and the stale bearer is never forwarded", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    overrideDeadlinesForTests({ auth: 10_000, outerMargin: 5_000, slow: 60_000 });
    const statusStarted = checkpoint();
    const releaseStatus = checkpoint();
    let statusReads = 0;
    let validations = 0;
    const validationStarted = checkpoint();
    backend = async (path) => {
        if (path.endsWith("/status")) {
            statusReads++;
            if (statusReads > 1) return new Response(null, { status: 503 });
            statusStarted.release();
            await releaseStatus.reached;
            return Response.json({ is_impersonating: false });
        }
        if (path.endsWith("/validate")) {
            validations++;
            // a validation in the first read would take 7.1 s and push it past the 15 s deadline
            if (statusReads === 1) {
                validationStarted.release();
                await new Promise((r) => setTimeout(r, 7_100));
            }
        }
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: 3_000_000 });
    const pending = load(prior, "/graphql");
    await beforeResponse(statusStarted.reached, pending);
    await vi.advanceTimersByTimeAsync(8_000);
    releaseStatus.release();
    // the read answers, or (at the base) starts the 7.1 s validation, which the 15 s deadline cuts
    if (
        (await Promise.race([pending.then(() => "answered"), validationStarted.reached])) !==
        "answered"
    ) {
        await vi.advanceTimersByTimeAsync(7_100);
    }
    const first = await pending;
    expect(first.status).not.toBe(503);
    expect(validations).toBe(0);
    const cookie = applyBrowserCookie(prior, first);
    expect((await readCookie(cookie))?.imp_access_token).toBeUndefined();
    resetImpersonationStatusForTests();
    const retry = await load(cookie, "/graphql");
    expect(retry.headers.get("x-middleware-request-authorization")).not.toBe(
        `Bearer ${delegatedBearer}`,
    );
});

it("R-B (named limit): a stop the deadline drops leaves only an EXPIRED delegated token, which web never forwards", async () => {
    // The step stops only an expired delegated token (impersonationToken.ts, delegatedExpired). After a
    // rotation, a slow stop can still overrun the deadline; the browser keeps the old cookie, whose delegated
    // token is expired: the session callback serves no bearer for it, and the backend refuses an expired token.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    overrideDeadlinesForTests({ auth: 10_000, outerMargin: 5_000, slow: 60_000 });
    const refreshStarted = checkpoint();
    const releaseRefresh = checkpoint();
    const stopStarted = checkpoint();
    const releaseStop = checkpoint();
    let stops = 0;
    backend = async (path) => {
        if (path.endsWith("/refresh")) {
            refreshStarted.release();
            await releaseRefresh.reached;
            return rotated();
        }
        if (path.endsWith("/stop")) {
            stops++;
            if (stops === 1) {
                stopStarted.release();
                await releaseStop.reached;
            }
            return new Response(null, { status: 503 });
        }
        if (path.endsWith("/status")) return new Response(null, { status: 503 });
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: 60_000, delegatedExpiresInMs: -1 });
    const pending = load(prior, "/graphql");
    await beforeResponse(refreshStarted.reached, pending);
    await vi.advanceTimersByTimeAsync(8_000);
    releaseRefresh.release();
    await beforeResponse(stopStarted.reached, pending);
    await vi.advanceTimersByTimeAsync(7_100);
    releaseStop.release();
    const first = await pending;
    expect(first.status).toBe(503);
    expect(first.headers.get("x-middleware-request-authorization")).toBeNull();
    const cookie = applyBrowserCookie(prior, first);
    const held = await readCookie(cookie);
    expect(held?.imp_access_token).toBe(delegatedBearer);
    expect(Number(held?.imp_expires_at)).toBeLessThanOrEqual(Date.now());
    const retry = await load(cookie, "/graphql");
    expect(retry.headers.get("x-middleware-request-authorization")).not.toBe(
        `Bearer ${delegatedBearer}`,
    );
});

it("R-C (named limit, same race as /api/auth/session today): a late status-only write restores the spent JWT; impact is availability only", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const firstStatusStarted = checkpoint();
    const releaseFirstStatus = checkpoint();
    let rotatedAt: number | undefined;
    let statusReads = 0;
    backend = async (path, init) => {
        if (path.endsWith("/status")) {
            // request A's status read is slow; it answers "ended" after request B rotated
            if (++statusReads === 1) {
                firstStatusStarted.release();
                await releaseFirstStatus.reached;
            }
            return Response.json({ is_impersonating: false });
        }
        if (path.endsWith("/refresh")) {
            if (rotatedAt === undefined) {
                rotatedAt = Date.now();
                return rotated();
            }
            // the backend's grace: a replay of the spent credential inside 30 s gets the same successor;
            // after it, the replay is refused
            if (isOriginalRefresh(init) && Date.now() - rotatedAt <= thirtySecondGrace)
                return rotated();
            return new Response(null, { status: 401 });
        }
        return Response.json({ valid: true });
    };
    const prior = await cookieFor({ expiresInMs: fiveMinutes + 100 });
    const earlierRequest = load(prior);
    await beforeResponse(firstStatusStarted.reached, earlierRequest);
    vi.setSystemTime(Date.now() + 200);
    const newerResponse = await load(prior);
    let browser = applyBrowserCookie(prior, newerResponse);
    releaseFirstStatus.release();
    const earlierResponse = await earlierRequest;
    browser = applyBrowserCookie(browser, earlierResponse);
    const restored = await readCookie(browser);
    // A's write holds NO delegation: no impersonation survives the race
    expect(restored?.imp_access_token).toBeUndefined();
    expect(restored?.refresh_token).toBe(originalRefresh);
    // inside the grace the next refresh gets the successor: the session continues
    vi.setSystemTime(rotatedAt! + 10_000);
    const inGrace = await load(browser);
    expect((await readCookie(applyBrowserCookie(browser, inGrace)))?.refresh_token).toBe(
        rotatedRefresh,
    );
    // after the grace it ends in sign-in: availability only, no access is gained
    vi.setSystemTime(rotatedAt! + thirtySecondGrace + 1_000);
    const late = await load(browser);
    expect(redirectPath(late)).toBe("/auth/signin");
});
