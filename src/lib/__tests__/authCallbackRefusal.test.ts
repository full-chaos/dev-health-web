import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const ORIGIN = "http://localhost:3000";
vi.stubEnv("AUTH_URL", `${ORIGIN}/api/auth`);

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

import {
    authCallbackRefusal,
    callbackCheckRefusal,
    noteCallbackRefusal,
    OAUTH_INVALID_RESPONSE,
    STATE_CHECK_MESSAGES,
} from "../authCallbackRefusal";

beforeEach(() => {
    records.length = 0;
});

afterAll(() => {
    vi.unstubAllEnvs();
});

const CONFIGURATION = `${ORIGIN}/auth/error?error=Configuration`;
const SIGNIN_REFUSED = `${ORIGIN}/auth/signin?error=social_login_failed`;
const CALLBACK = `${ORIGIN}/api/auth/callback/github?code=c&state=s`;

function authError(type: string, cause?: unknown): Error {
    const error = new Error("auth error", cause === undefined ? undefined : { cause });
    (error as Error & { type: string }).type = type;
    return error;
}

function oauthError(code: string, message: string): Error {
    const error = new Error(message);
    (error as Error & { code: string }).code = code;
    return error;
}

const stateMismatch = (): Error =>
    authError("CallbackRouteError", {
        err: oauthError(OAUTH_INVALID_RESPONSE, STATE_CHECK_MESSAGES[0]),
    });

function redirect(location: string, setCookies: string[] = []): Response {
    const headers = new Headers({ location });
    for (const line of setCookies) headers.append("set-cookie", line);
    return new Response(null, { status: 302, headers });
}

/** A stand-in for the Auth.js handler: logs `error` (as Auth.js does) and answers `response`. */
const authJs = (error: Error | null, response: () => Response) => async (): Promise<Response> => {
    if (error) noteCallbackRefusal(error);
    return response();
};

describe("callbackCheckRefusal: which Auth.js errors are a failed callback check", () => {
    it.each([
        ["InvalidCheck", authError("InvalidCheck"), "InvalidCheck"],
        ["the state differs", stateMismatch(), "StateMismatch"],
        [
            "the state is missing",
            authError("CallbackRouteError", {
                err: oauthError(OAUTH_INVALID_RESPONSE, STATE_CHECK_MESSAGES[1]),
            }),
            "StateMismatch",
        ],
    ])("%s -> %s", (_name, error, want) => {
        expect(callbackCheckRefusal(error)).toBe(want);
    });

    it.each([
        [
            "an issuer mismatch (a real configuration fault)",
            authError("CallbackRouteError", {
                err: oauthError(
                    OAUTH_INVALID_RESPONSE,
                    'unexpected "iss" (issuer) response parameter value',
                ),
            }),
        ],
        [
            "the state message under another code",
            authError("CallbackRouteError", {
                err: oauthError("OAUTH_OTHER", STATE_CHECK_MESSAGES[0]),
            }),
        ],
        [
            "a CallbackRouteError with a plain cause",
            authError("CallbackRouteError", { err: new Error("boom") }),
        ],
        ["a CallbackRouteError with no cause", authError("CallbackRouteError")],
        [
            "a CallbackRouteError whose cause is not an Error",
            authError("CallbackRouteError", { err: "text" }),
        ],
        ["MissingSecret", authError("MissingSecret")],
        ["a plain Error", new Error("boom")],
        ["not an Error", { type: "InvalidCheck" }],
    ])("%s -> not a refusal", (_name, error) => {
        expect(callbackCheckRefusal(error)).toBeNull();
    });
});

describe("authCallbackRefusal: the route wrapper", () => {
    it("rewrites a refused callback to the sign-in page, status and cookies kept", async () => {
        const cookies = [
            "authjs.state=; Path=/; Max-Age=0",
            "authjs.pkce.code_verifier=; Path=/; Max-Age=0",
        ];
        const response = await authCallbackRefusal(
            authJs(stateMismatch(), () => redirect(CONFIGURATION, cookies)),
        )(new NextRequest(CALLBACK));
        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe(SIGNIN_REFUSED);
        expect(response.headers.getSetCookie()).toEqual(cookies);
    });

    it("C-1 marks per request: of two concurrent callbacks only the refused one is rewritten", async () => {
        let release = (): void => {};
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const slowRefused = authCallbackRefusal(async () => {
            noteCallbackRefusal(stateMismatch());
            await gate;
            return redirect(CONFIGURATION);
        });
        const slowConfigFault = authCallbackRefusal(async () => {
            noteCallbackRefusal(authError("CallbackRouteError", { err: new Error("boom") }));
            await gate;
            return redirect(CONFIGURATION);
        });
        const both = Promise.all([
            slowRefused(new NextRequest(CALLBACK)),
            slowConfigFault(new NextRequest(CALLBACK)),
        ]);
        release();
        const [refused, fault] = await both;
        expect(refused.headers.get("location")).toBe(SIGNIN_REFUSED);
        expect(fault.headers.get("location")).toBe(CONFIGURATION);
    });

    it.each([
        ["an extra parameter", `${CONFIGURATION}&x=1`],
        ["another origin", "http://evil.example/auth/error?error=Configuration"],
        ["another error code", `${ORIGIN}/auth/error?error=AccessDenied`],
        ["the dashboard", `${ORIGIN}/dashboard`],
    ])(
        "C-2 / K-4 a marked callback whose redirect is not exactly the Configuration page (%s) is unchanged",
        async (_n, at) => {
            const response = await authCallbackRefusal(authJs(stateMismatch(), () => redirect(at)))(
                new NextRequest(CALLBACK),
            );
            expect(response.headers.get("location")).toBe(at);
            expect(records.filter((r) => r.level === "info")).toEqual([]);
        },
    );

    it.each([
        [
            "K-1 an issuer mismatch",
            authError("CallbackRouteError", {
                err: oauthError(
                    OAUTH_INVALID_RESPONSE,
                    'unexpected "iss" (issuer) response parameter value',
                ),
            }),
        ],
        [
            "K-2 a CallbackRouteError with another cause",
            authError("CallbackRouteError", { err: new Error("boom") }),
        ],
        ["no error logged", null],
    ])("%s keeps Configuration", async (_n, error) => {
        const response = await authCallbackRefusal(authJs(error, () => redirect(CONFIGURATION)))(
            new NextRequest(CALLBACK),
        );
        expect(response.headers.get("location")).toBe(CONFIGURATION);
    });

    it.each([
        ["K-3 the sign-in start", `${ORIGIN}/api/auth/signin/github`],
        ["the session route", `${ORIGIN}/api/auth/session`],
        ["a nested callback path", `${ORIGIN}/api/auth/callback/github/extra`],
    ])("%s keeps Configuration even after an InvalidCheck", async (_n, url) => {
        const response = await authCallbackRefusal(
            authJs(authError("InvalidCheck"), () => redirect(CONFIGURATION)),
        )(new NextRequest(url));
        expect(response.headers.get("location")).toBe(CONFIGURATION);
    });

    it("K-5 outside a wrapped route request the logger hook does nothing", () => {
        expect(() => noteCallbackRefusal(authError("InvalidCheck"))).not.toThrow();
    });

    it("C-3 logs one INFO line per rewrite with the refusal type only", async () => {
        const request = new NextRequest(
            `${ORIGIN}/api/auth/callback/github?code=one-time-code&state=the-state`,
            {
                headers: {
                    cookie: "authjs.state=state-cookie; authjs.pkce.code_verifier=verifier-cookie",
                },
            },
        );
        await authCallbackRefusal(authJs(stateMismatch(), () => redirect(CONFIGURATION)))(request);
        expect(records).toEqual([
            {
                level: "info",
                fields: { module: "auth", refusal: "StateMismatch" },
                message: "oauth callback check failed; sent to the sign-in page",
            },
        ]);
        const text = JSON.stringify(records);
        for (const secret of [
            "one-time-code",
            "the-state",
            "state-cookie",
            "verifier-cookie",
            "/api/auth/callback",
        ]) {
            expect(text).not.toContain(secret);
        }
    });
});

describe("C-4 the oauth4webapi strings the rule depends on", () => {
    it("are in the oauth4webapi build Auth.js resolves", () => {
        const fromNextAuth = createRequire(require.resolve("next-auth"));
        const fromAuthCore = createRequire(fromNextAuth.resolve("@auth/core"));
        const entry = fromAuthCore.resolve("oauth4webapi");
        const manifest = JSON.parse(
            readFileSync(entry.replace(/build\/index\.js$/u, "package.json"), "utf8"),
        ) as {
            name: string;
            version: string;
        };
        expect(manifest).toMatchObject({ name: "oauth4webapi", version: "3.8.6" });
        const source = readFileSync(entry, "utf8");
        expect(source).toContain(`export const INVALID_RESPONSE = '${OAUTH_INVALID_RESPONSE}';`);
        expect(source).toContain(`'${STATE_CHECK_MESSAGES[1]}'`);
        expect(source).toContain(`'${STATE_CHECK_MESSAGES[0]}'`);
    });
});
