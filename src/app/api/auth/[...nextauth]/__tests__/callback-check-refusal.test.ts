/**
 * A social sign-in callback whose state or PKCE check fails is a refused request, not a server fault: it lands on the
 * sign-in page with a sign-in error and no session. These run the REAL next-auth handlers (no next-auth mock): a real
 * sign-in start sets the state and PKCE cookies, then each callback breaks one check.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const SECRET = "route-test-secret-route-test-secret";
const ORIGIN = "http://localhost:3000";
const SESSION_COOKIE = "authjs.session-token";

vi.stubEnv("AUTH_SECRET", SECRET);
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);
vi.stubEnv("AUTH_GITHUB_ID", "chaos-13653-github-client");
vi.stubEnv("AUTH_GITHUB_SECRET", "chaos-13653-github-secret");

type LogRecord = { level: string; fields: Record<string, unknown>; message: string | undefined };
const records = vi.hoisted(
    () => [] as { level: string; fields: Record<string, unknown>; message: string | undefined }[],
);

vi.mock("@/lib/logger", () => {
    const make = (bindings: Record<string, unknown>): Record<string, unknown> => {
        const write =
            (level: string) =>
            (fields: unknown, message?: string): void => {
                records.push(
                    typeof fields === "string"
                        ? { level, fields: { ...bindings }, message: fields }
                        : {
                              level,
                              fields: { ...bindings, ...(fields as Record<string, unknown>) },
                              message,
                          },
                );
            };
        return {
            trace: write("trace"),
            debug: write("debug"),
            info: write("info"),
            warn: write("warn"),
            error: write("error"),
            fatal: write("fatal"),
            child: (more: Record<string, unknown>) => make({ ...bindings, ...more }),
        };
    };
    return { logger: make({}) };
});

// No provider and no backend in this test: a call that leaves the process is a test defect.
const fetchSpy = vi.fn(async () => {
    throw new Error("no network in this test");
});

let GET: (req: NextRequest) => Promise<Response>;
let POST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
    vi.stubGlobal("fetch", fetchSpy);
    ({ GET, POST } = (await import("../route")) as unknown as {
        GET: typeof GET;
        POST: typeof POST;
    });
});

beforeEach(() => {
    records.length = 0;
    fetchSpy.mockClear();
});

afterAll(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

function cookiePairs(response: Response): Map<string, string> {
    const pairs = new Map<string, string>();
    for (const line of response.headers.getSetCookie()) {
        const pair = line.split(";")[0];
        const at = pair.indexOf("=");
        pairs.set(pair.slice(0, at), pair.slice(at + 1));
    }
    return pairs;
}

/** A real sign-in start: the state and PKCE cookies and the state the provider would send back. */
async function startGitHubSignIn(): Promise<{ cookies: Map<string, string>; state: string }> {
    const csrfResponse = await GET(new NextRequest(`${ORIGIN}/api/auth/csrf`));
    const { csrfToken } = (await csrfResponse.json()) as { csrfToken: string };
    const csrfCookies = cookiePairs(csrfResponse);
    const start = await POST(
        new NextRequest(`${ORIGIN}/api/auth/signin/github`, {
            method: "POST",
            headers: {
                cookie: [...csrfCookies].map(([name, value]) => `${name}=${value}`).join("; "),
                "content-type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({ csrfToken, callbackUrl: `${ORIGIN}/dashboard` }).toString(),
        }),
    );
    expect(start.status).toBe(302);
    const authorize = new URL(start.headers.get("location") ?? "");
    expect(authorize.origin).toBe("https://github.com");
    const state = authorize.searchParams.get("state") ?? "";
    expect(state).not.toBe("");
    const cookies = cookiePairs(start);
    expect([...cookies.keys()]).toEqual(
        expect.arrayContaining(["authjs.state", "authjs.pkce.code_verifier"]),
    );
    return { cookies, state };
}

async function callback(
    query: Record<string, string>,
    cookies: Map<string, string>,
): Promise<Response> {
    const url = new URL(`${ORIGIN}/api/auth/callback/github`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    return GET(
        new NextRequest(url, {
            headers: { cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join("; ") },
        }),
    );
}

const loggedAuthErrors = (): LogRecord[] => records.filter((r) => r.message === "next-auth error");

function expectRefusedToSignIn(response: Response): void {
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
        `${ORIGIN}/auth/signin?error=social_login_failed`,
    );
    expect(cookiePairs(response).has(SESSION_COOKIE)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
}

describe("a social sign-in callback whose check fails", () => {
    it("R-0 records which error Auth.js gives a callback whose state is not the one the sign-in started with", async () => {
        const { cookies } = await startGitHubSignIn();
        records.length = 0;
        await callback({ code: "chaos-13653-code", state: "not-the-state" }, cookies);
        const logged = loggedAuthErrors().map((r) => {
            const err = r.fields.err as {
                type?: string;
                cause?: { err?: { code?: string; message?: string } };
            };
            return { type: err.type, code: err.cause?.err?.code, message: err.cause?.err?.message };
        });
        expect(logged).toEqual([
            {
                type: "CallbackRouteError",
                code: "OAUTH_INVALID_RESPONSE",
                message: 'unexpected "state" response parameter value',
            },
        ]);
    });

    it("R-1 a state that differs from the state cookie lands on the sign-in page with no session", async () => {
        const { cookies } = await startGitHubSignIn();
        const response = await callback(
            { code: "chaos-13653-code", state: "not-the-state" },
            cookies,
        );
        expectRefusedToSignIn(response);
        expect(loggedAuthErrors().map((r) => (r.fields.err as { type?: string }).type)).toEqual([
            "CallbackRouteError",
        ]);
    });

    it("R-2 a callback with no state cookie lands on the sign-in page with no session", async () => {
        const { cookies, state } = await startGitHubSignIn();
        cookies.delete("authjs.state");
        const response = await callback({ code: "chaos-13653-code", state }, cookies);
        expectRefusedToSignIn(response);
        expect(loggedAuthErrors().map((r) => (r.fields.err as { type?: string }).type)).toEqual([
            "InvalidCheck",
        ]);
    });

    it("R-3 a callback with no PKCE cookie (the right state) lands on the sign-in page with no session", async () => {
        const { cookies, state } = await startGitHubSignIn();
        cookies.delete("authjs.pkce.code_verifier");
        const response = await callback({ code: "chaos-13653-code", state }, cookies);
        expectRefusedToSignIn(response);
        expect(loggedAuthErrors().map((r) => (r.fields.err as { type?: string }).type)).toEqual([
            "InvalidCheck",
        ]);
    });

    it("a provider error still lands on the sign-in page as OAuthCallbackError", async () => {
        const { cookies, state } = await startGitHubSignIn();
        const response = await callback({ error: "access_denied", state }, cookies);
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(
            `${ORIGIN}/auth/signin?error=OAuthCallbackError`,
        );
    });
});
