import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined, test: { skip: () => undefined } }));

import { setupFault, setupUser } from "../../tests/live/helpers";

/**
 * CHAOS-12865: a live journey's setup user. When the setup gives no token, the failure names the
 * step that failed, with its HTTP status and its body's kind, and never a backend string, token,
 * password or email. Before, each journey's beforeAll returned silently and its cases failed as
 * "No token — backend may be unavailable" (web #1804's CI live-e2e, twice), which named nothing.
 */

const EMAIL = "creds-1-abcde@example.com";
const PASSWORD = "TestPass123!";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.sentinel-access-token.do-not-print";
const TOKEN2 = "eyJhbGciOiJIUzI1NiJ9.sentinel-relogin-token.do-not-print";
const SU_TOKEN = "eyJhbGciOiJIUzI1NiJ9.sentinel-superuser-token.do-not-print";

type Reply = { status: number; body?: unknown; raw?: string; headers?: Record<string, string> };
type Options = { data?: unknown; headers?: Record<string, string> };
type Route = (call: string, options: Options, url: string) => Reply;
type Sent = { call: string; url: string; data?: unknown; headers?: Record<string, string> };

/**
 * The ops stack script, faked: every call's argv is appended to `calls.log`. The verb exits 1 when the
 * `fail` marker exists, else it writes the `verified` marker (the user can then log in).
 */
let stackDir = "";
const savedEnv = {
    script: process.env.LIVE_E2E_STACK_SCRIPT,
    state: process.env.LIVE_E2E_STACK_STATE,
};
const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
};
beforeEach(() => {
    stackDir = mkdtempSync(join(tmpdir(), "live-journey-stack-"));
    const script = join(stackDir, "stack.sh");
    writeFileSync(
        script,
        [
            "#!/bin/bash",
            `echo "$*" >> "${stackDir}/calls.log"`,
            `[ -f "${stackDir}/fail" ] && exit 1`,
            `[ "$1" = verify-user ] && touch "${stackDir}/verified"`,
            "exit 0",
            "",
        ].join("\n"),
    );
    chmodSync(script, 0o755);
    process.env.LIVE_E2E_STACK_SCRIPT = script;
    process.env.LIVE_E2E_STACK_STATE = join(stackDir, "state");
});
afterEach(() => {
    restore("LIVE_E2E_STACK_SCRIPT", savedEnv.script);
    restore("LIVE_E2E_STACK_STATE", savedEnv.state);
    rmSync(stackDir, { recursive: true, force: true });
});
const stackCalls = (): string[] => {
    const log = join(stackDir, "calls.log");
    return existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
};

/** A fake APIRequestContext: each call is answered by `route`, and every call is recorded. */
function fakeRequest(route: Route) {
    const sent: Sent[] = [];
    const answer =
        (method: string) =>
        async (url: string, options: Options = {}) => {
            const call = `${method} ${new URL(url).pathname}`;
            sent.push({ call, url, data: options.data, headers: options.headers });
            const reply = route(call, options, url);
            const text = reply.raw ?? (reply.body === undefined ? "" : JSON.stringify(reply.body));
            return {
                status: () => reply.status,
                ok: () => reply.status >= 200 && reply.status < 300,
                headers: () => reply.headers ?? {},
                text: async () => text,
                json: async () => JSON.parse(text) as unknown,
            };
        };
    return {
        request: { post: answer("POST"), get: answer("GET"), patch: answer("PATCH") } as never,
        sent,
        calls: () => sent.map((s) => s.call),
    };
}

const isUser = (options: Options) =>
    (options.data as { email?: string } | undefined)?.email === EMAIL;

/**
 * The healthy backend: every step answers as the live stack does. The user's own login gives a
 * token only once the user is verified; the second user login (the relogin) gives TOKEN2.
 */
function healthy(overrides: Partial<Record<string, Reply>> = {}): Route {
    let userLogins = 0;
    return (call, options) => {
        const login = call === "POST /api/v1/auth/login";
        const key = login ? `${call}#${isUser(options) ? "user" : "su"}` : call;
        if (overrides[key] !== undefined) return overrides[key];
        if (call === "POST /api/v1/auth/register") return { status: 202, body: { message: "ok" } };
        if (login && !isUser(options)) return { status: 200, body: { access_token: SU_TOKEN } };
        if (login) {
            if (!existsSync(join(stackDir, "verified")))
                return { status: 200, body: { needs_verification: true } };
            userLogins += 1;
            return { status: 200, body: { access_token: userLogins === 1 ? TOKEN : TOKEN2 } };
        }
        if (call === "GET /api/v1/admin/users") {
            return { status: 200, body: { items: [{ id: "user-1", email: EMAIL }] } };
        }
        if (call === "POST /api/v1/auth/onboard") return { status: 200, body: { org_id: "o1" } };
        return { status: 500, body: { error: { code: "unexpected_call" } } };
    };
}

const user = { email: EMAIL, password: PASSWORD, fullName: "Creds User" };
const withOrg = { ...user, orgName: "Creds Org" };

describe("a live journey's setup user (CHAOS-12865)", () => {
    it("sends the same requests as before, in order, and gives the relogin's token", async () => {
        const { request, sent, calls } = fakeRequest(healthy());
        const setup = await setupUser(request, withOrg);
        expect(setup.token).toBe(TOKEN2);
        expect(setup.steps).toEqual([
            "register 202 body=json",
            "superuser-login 200 token=present",
            "user-lookup 200 found",
            "verify ok",
            "login 200 token=present body=json",
            "onboard 200 body=json",
            "relogin 200 token=present body=json",
        ]);
        expect(calls()).toEqual([
            "POST /api/v1/auth/register",
            "POST /api/v1/auth/login",
            "GET /api/v1/admin/users",
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/onboard",
            "POST /api/v1/auth/login",
        ]);
        const [register, , lookup, , onboard] = sent;
        expect(register?.data).toEqual({
            email: EMAIL,
            password: PASSWORD,
            full_name: "Creds User",
        });
        expect(register?.headers?.Origin).toBeTruthy();
        const query = new URL(lookup!.url).searchParams;
        expect([query.get("q"), query.get("limit")]).toEqual([EMAIL, "5"]);
        expect(lookup?.headers?.Authorization).toBe(`Bearer ${SU_TOKEN}`);
        expect(stackCalls()).toEqual([`verify-user ${join(stackDir, "state")} ${EMAIL}`]);
        expect(onboard?.data).toEqual({ action: "create_org", org_name: "Creds Org" });
        expect(onboard?.headers?.Authorization).toBe(`Bearer ${TOKEN}`);
        expect(setupFault(setup)).toBe("");
    });

    it("without an org, stops after the login", async () => {
        const { request, calls } = fakeRequest(healthy());
        const setup = await setupUser(request, user);
        expect(setup.token).toBe(TOKEN);
        expect(calls().at(-1)).toBe("POST /api/v1/auth/login");
        expect(calls()).not.toContain("POST /api/v1/auth/onboard");
    });

    it("stops after a refused register: nothing else is sent", async () => {
        const { request, calls } = fakeRequest(
            healthy({ "POST /api/v1/auth/register": { status: 429, body: { error: {} } } }),
        );
        const setup = await setupUser(request, withOrg);
        expect(setupFault(setup)).toBe("setup gave no token: register 429 body=error");
        expect(calls()).toEqual(["POST /api/v1/auth/register"]);
    });

    for (const [label, key, reply, named] of [
        [
            "a failed superuser login",
            "POST /api/v1/auth/login#su",
            { status: 401, body: { detail: "x" } },
            "superuser-login 401 body=error | user-lookup skipped (no superuser token) | verify skipped | login 200 token=absent body=json",
        ],
        [
            "a user the lookup cannot find",
            "GET /api/v1/admin/users",
            { status: 200, body: { items: [] } },
            "user-lookup 200 not-found | verify skipped | login 200 token=absent body=json",
        ],
        [
            "a lookup a live impersonation session scoped to another org (CHAOS-13327)",
            "GET /api/v1/admin/users",
            { status: 200, body: { items: [] }, headers: { "x-impersonating": "true" } },
            "user-lookup 200 not-found impersonating=true | verify skipped | login 200 token=absent body=json",
        ],
        [
            "a refused lookup",
            "GET /api/v1/admin/users",
            { status: 403, body: { error: { code: "x" } } },
            "user-lookup 403 body=error | verify skipped | login 200 token=absent body=json",
        ],
        [
            "a login with no token",
            "POST /api/v1/auth/login#user",
            { status: 400, body: { detail: "x" } },
            "login 400 token=absent body=error",
        ],
    ] as const) {
        it(`names the step on ${label}, and sends no onboard`, async () => {
            const { request, calls } = fakeRequest(healthy({ [key]: reply }));
            const setup = await setupUser(request, withOrg);
            expect(setup.token).toBe("");
            expect(setupFault(setup)).toMatch(/^setup gave no token: register 202 body=json \| /u);
            expect(setupFault(setup).endsWith(named)).toBe(true);
            expect(calls()).not.toContain("POST /api/v1/auth/onboard");
            expect(calls().filter((c) => c === "POST /api/v1/auth/login").length).toBe(2);
        });
    }

    it("names a failed verify step and gives no token, no login, no onboard", async () => {
        writeFileSync(join(stackDir, "fail"), "");
        const { request, calls } = fakeRequest(healthy());
        const setup = await setupUser(request, withOrg);
        expect(setup.token).toBe("");
        expect(setupFault(setup).endsWith("user-lookup 200 found | verify failed")).toBe(true);
        expect(stackCalls()).toEqual([`verify-user ${join(stackDir, "state")} ${EMAIL}`]);
        expect(calls().filter((c) => c === "POST /api/v1/auth/login").length).toBe(1);
        expect(calls()).not.toContain("POST /api/v1/auth/onboard");
    });

    it("skips the verb, and the user cannot log in, when the stack env is unset", async () => {
        delete process.env.LIVE_E2E_STACK_SCRIPT;
        const ci = process.env.CI; // envFault throws under CI; locally it skips (mocked here)
        delete process.env.CI;
        const { request } = fakeRequest(healthy());
        const setup = await setupUser(request, user).finally(() => restore("CI", ci));
        expect(setup.token).toBe("");
        expect(setup.steps).toContain("verify skipped (no stack env)");
        expect(stackCalls()).toEqual([]);
    });

    // Codex r2 and r3 on #1813: `Abc123`, `org-123` and then a letters-only `SecretToken` passed a
    // shape filter. No backend string is printed at all: only the body's kind.
    for (const [label, reply, kind] of [
        ["a letters-only secret", { status: 400, body: { detail: "SecretToken" } }, "error"],
        ["a short mixed secret", { status: 400, body: { error: { code: "Abc123" } } }, "error"],
        ["an id", { status: 400, body: { code: "org-123" } }, "error"],
        ["the email and a token", { status: 400, body: { detail: `${EMAIL} ${TOKEN}` } }, "error"],
        ["a structured detail", { status: 422, body: { detail: [{ input: PASSWORD }] } }, "error"],
        ["an object code", { status: 400, body: { error: { code: { value: TOKEN } } } }, "error"],
        ["a JSON body with no error", { status: 400, body: { message: TOKEN } }, "json"],
        ["a JSON array", { status: 400, body: [TOKEN] }, "json"],
        ["a non-JSON body", { status: 502, raw: `<html>${EMAIL}</html>` }, "non-json"],
        ["an empty body", { status: 503 }, "empty"],
    ] as const) {
        it(`prints only the body's kind for ${label}`, async () => {
            const { request } = fakeRequest(
                healthy({ "POST /api/v1/auth/register": reply as Reply }),
            );
            const fault = setupFault(await setupUser(request, user));
            expect(fault).toBe(
                `setup gave no token: register ${String(reply.status)} body=${kind}`,
            );
            for (const secret of [EMAIL, TOKEN, PASSWORD, "SecretToken", "Abc123", "org-123"])
                expect(fault).not.toContain(secret);
        });
    }

    it("takes only a string token, for the user and for the superuser", async () => {
        for (const value of [false, 0]) {
            const { request } = fakeRequest(
                healthy({
                    "POST /api/v1/auth/login#user": { status: 200, body: { access_token: value } },
                }),
            );
            const setup = await setupUser(request, withOrg);
            expect(setup.token).toBe("");
            expect(setupFault(setup).endsWith("login 200 token=absent body=json")).toBe(true);
        }
        const { request, calls } = fakeRequest(
            healthy({ "POST /api/v1/auth/login#su": { status: 200, body: { access_token: 123 } } }),
        );
        const setup = await setupUser(request, user);
        expect(setup.steps).toContain("superuser-login 200 token=absent");
        expect(calls()).not.toContain("GET /api/v1/admin/users");
    });

    it("keeps the first token when the relogin gives none, and records it", async () => {
        let logins = 0;
        const base = healthy();
        const { request } = fakeRequest((call, options, url) => {
            if (call === "POST /api/v1/auth/login" && isUser(options) && ++logins === 2) {
                return { status: 200, body: {} };
            }
            return base(call, options, url);
        });
        const setup = await setupUser(request, withOrg);
        expect(setup.token).toBe(TOKEN);
        expect(setup.steps.at(-1)).toBe("relogin 200 token=absent body=json");
    });

    it("goes on after a refused onboard, as before: register can have made the org already", async () => {
        const { request, calls } = fakeRequest(
            healthy({ "POST /api/v1/auth/onboard": { status: 400, body: { detail: "x" } } }),
        );
        const setup = await setupUser(request, withOrg);
        expect(setup.token).toBe(TOKEN2);
        expect(setup.steps).toContain("onboard 400 body=error");
        expect(calls().at(-1)).toBe("POST /api/v1/auth/login");
    });

    it("names a step whose request throws, by a fixed error name, never its message", async () => {
        for (const [method, step, name, recorded] of [
            ["post", "register", "TimeoutError", "TimeoutError"],
            ["get", "user-lookup", "SecretToken", "Error"],
        ] as const) {
            const { request } = fakeRequest(healthy());
            const thrower = async () => {
                const error = new Error(`connect ECONNREFUSED for ${EMAIL} with ${TOKEN}`);
                error.name = name;
                throw error;
            };
            const setup = await setupUser(
                { ...(request as object), [method]: thrower } as never,
                user,
            );
            const fault = setupFault(setup);
            expect(fault.endsWith(`${step} threw ${recorded}`)).toBe(true);
            for (const secret of [EMAIL, TOKEN, "SecretToken", "ECONNREFUSED"])
                expect(fault).not.toContain(secret);
        }
    });
});
