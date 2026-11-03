import { describe, expect, it, vi } from "vitest";

vi.mock("@playwright/test", () => ({ expect: () => undefined, test: { skip: () => undefined } }));

import { setupFault, setupUser } from "../../tests/live/helpers";

/**
 * CHAOS-12865: a live journey's setup user. When the setup gives no token, the failure names the
 * step that failed, with its HTTP status and error code, and never a token, password or email.
 * Before, each journey's beforeAll returned silently and its cases failed as "No token — backend
 * may be unavailable" (web #1804's CI live-e2e, twice), which named nothing.
 */

const EMAIL = "creds-1-abcde@example.com";
const PASSWORD = "TestPass123!";
const TOKEN = "eyJhbGciOiJIUzI1NiJ9.sentinel-access-token.do-not-print";
const SU_TOKEN = "eyJhbGciOiJIUzI1NiJ9.sentinel-superuser-token.do-not-print";

type Reply = { status: number; body?: unknown };
type Route = (url: string, options: { data?: unknown }) => Reply;

/** A fake APIRequestContext: each call is answered by `route`, and every call is recorded. */
function fakeRequest(route: Route) {
    const calls: string[] = [];
    const answer =
        (method: string) =>
        async (url: string, options: { data?: unknown } = {}) => {
            const path = new URL(url).pathname;
            calls.push(`${method} ${path}`);
            const reply = route(`${method} ${path}`, options);
            return {
                status: () => reply.status,
                ok: () => reply.status >= 200 && reply.status < 300,
                text: async () => (reply.body === undefined ? "" : JSON.stringify(reply.body)),
                json: async () => reply.body,
            };
        };
    return {
        request: { post: answer("POST"), get: answer("GET"), patch: answer("PATCH") } as never,
        calls,
    };
}

/**
 * The healthy backend: every step answers as the live stack does. The user's own login gives a
 * token only once the user is verified, as the live backend's does.
 */
function healthy(overrides: Partial<Record<string, Reply>> = {}): Route {
    let verified = false;
    return (call, options) => {
        if (overrides[call] !== undefined) return overrides[call];
        const data = options.data as { email?: string } | undefined;
        if (call === "POST /api/v1/auth/register") return { status: 202, body: { message: "ok" } };
        if (call === "POST /api/v1/auth/login") {
            if (data?.email !== EMAIL) return { status: 200, body: { access_token: SU_TOKEN } };
            return verified
                ? { status: 200, body: { access_token: TOKEN } }
                : { status: 200, body: { needs_verification: true } };
        }
        if (call === "GET /api/v1/admin/users") {
            return { status: 200, body: { items: [{ id: "user-1", email: EMAIL }] } };
        }
        if (call === "PATCH /api/v1/admin/users/user-1") {
            verified = true;
            return { status: 200, body: {} };
        }
        if (call === "POST /api/v1/auth/onboard") return { status: 200, body: { org_id: "o1" } };
        return { status: 500, body: { error: { code: "unexpected_call" } } };
    };
}

const user = { email: EMAIL, password: PASSWORD, fullName: "Creds User" };

describe("a live journey's setup user (CHAOS-12865)", () => {
    it("gives the token and records every step, in order", async () => {
        const { request, calls } = fakeRequest(healthy());
        const setup = await setupUser(request, { ...user, orgName: "Creds Org" });
        expect(setup.token).toBe(TOKEN);
        expect(setup.steps.map((step) => step.split(" ")[0])).toEqual([
            "register",
            "superuser-login",
            "user-lookup",
            "verify",
            "login",
            "onboard",
            "relogin",
        ]);
        expect(calls).toEqual([
            "POST /api/v1/auth/register",
            "POST /api/v1/auth/login",
            "GET /api/v1/admin/users",
            "PATCH /api/v1/admin/users/user-1",
            "POST /api/v1/auth/login",
            "POST /api/v1/auth/onboard",
            "POST /api/v1/auth/login",
        ]);
        expect(setupFault(setup)).toBe("");
    });

    it("without an org, stops after the login", async () => {
        const { request } = fakeRequest(healthy());
        const setup = await setupUser(request, user);
        expect(setup.token).toBe(TOKEN);
        expect(setup.steps.at(-1)).toMatch(/^login 200 token=present/u);
    });

    for (const [label, call, reply, named] of [
        [
            "a refused register",
            "POST /api/v1/auth/register",
            { status: 429, body: { error: { code: "rate_limited" } } },
            /register 429 code=rate_limited/u,
        ],
        [
            "a failed superuser login",
            "POST /api/v1/auth/login#su",
            { status: 401, body: { detail: "invalid credentials" } },
            /superuser-login 401 code=invalid credentials/u,
        ],
        [
            "a user the lookup cannot find",
            "GET /api/v1/admin/users",
            { status: 200, body: { items: [] } },
            /user-lookup 200 not-found/u,
        ],
        [
            "a refused verify",
            "PATCH /api/v1/admin/users/user-1",
            { status: 403, body: { error: { code: "forbidden" } } },
            /verify 403 code=forbidden/u,
        ],
        [
            "a login with no token",
            "POST /api/v1/auth/login#user",
            { status: 400, body: { detail: "email not verified" } },
            /login 400 token=absent code=email not verified/u,
        ],
    ] as const) {
        it(`names the step on ${label}`, async () => {
            const route = healthy();
            const { request } = fakeRequest((at, options) => {
                const who = (options.data as { email?: string } | undefined)?.email;
                const key =
                    at === "POST /api/v1/auth/login"
                        ? `${at}#${who === EMAIL ? "user" : "su"}`
                        : at;
                return key === call ? reply : route(at, options);
            });
            const setup = await setupUser(request, { ...user, orgName: "Creds Org" });
            expect(setup.token).toBe("");
            const fault = setupFault(setup);
            expect(fault).toMatch(named);
            expect(fault).toMatch(/^setup gave no token: register /u);
        });
    }

    it("prints no token, password or email, even when the backend echoes them", async () => {
        const { request } = fakeRequest(
            healthy({
                "POST /api/v1/auth/register": {
                    status: 400,
                    body: { detail: `${EMAIL} is taken; token ${TOKEN}; password ${PASSWORD}` },
                },
            }),
        );
        const setup = await setupUser(request, user);
        const fault = setupFault(setup);
        expect(fault).toMatch(/register 400 code=\[redacted\]/u);
        for (const secret of [EMAIL, TOKEN, SU_TOKEN, PASSWORD])
            expect(fault).not.toContain(secret);
    });

    // Codex r2 on #1813: a short secret or id printed under the earlier rule. A code prints only
    // when it is letters joined by a space, `_` or `-`; a digit or any other symbol redacts it.
    for (const [label, detail, printed] of [
        ["a short mixed secret", "Abc123", "[redacted]"],
        ["a short id", "org-123", "[redacted]"],
        ["an email", "user creds@example.com exists", "[redacted]"],
        ["an id", "org 550e8400-e29b-41d4-a716-446655440000 missing", "[redacted]"],
        ["a digit run", "account 1234567 locked", "[redacted]"],
        ["a mixed key", "key ab12cd34ef56gh78 rejected", "[redacted]"],
        ["a character outside the plain set", "bad <input>", "[redacted]"],
        ["more than 80 characters", "a".repeat(81), "[redacted]"],
        ["a code that names a token", "access_token_expired", "access_token_expired"],
        [
            "a long plain code",
            "organization_membership_required",
            "organization_membership_required",
        ],
        ["a plain message", "email not verified", "email not verified"],
    ] as const) {
        it(`a register error with ${label} prints ${printed === "[redacted]" ? "[redacted]" : "the code"}`, async () => {
            const { request } = fakeRequest(
                healthy({ "POST /api/v1/auth/register": { status: 400, body: { detail } } }),
            );
            const fault = setupFault(await setupUser(request, user));
            expect(fault).toBe(`setup gave no token: register 400 code=${printed}`);
        });
    }

    it("takes only a string superuser token: a numeric one is no token, and no lookup is sent", async () => {
        const base = healthy();
        const { request, calls } = fakeRequest((at, options) => {
            const who = (options.data as { email?: string } | undefined)?.email;
            return at === "POST /api/v1/auth/login" && who !== EMAIL
                ? { status: 200, body: { access_token: 123 } }
                : base(at, options);
        });
        const setup = await setupUser(request, user);
        expect(setup.steps).toContain("superuser-login 200 token=absent");
        expect(calls).not.toContain("GET /api/v1/admin/users");
        expect(setupFault(setup)).toMatch(/user-lookup skipped .* login 200 token=absent/u);
    });

    it("names a step whose request throws, by the error's name only", async () => {
        for (const [method, step] of [
            ["POST", "register"],
            ["GET", "user-lookup"],
            ["PATCH", "verify"],
        ] as const) {
            const base = healthy();
            const { request } = fakeRequest(base);
            const thrower = async () => {
                const error = new Error(`connect ECONNREFUSED for ${EMAIL} with ${TOKEN}`);
                error.name = "ConnectionRefused";
                throw error;
            };
            const fault = setupFault(
                await setupUser(
                    {
                        ...(request as object),
                        [method.toLowerCase()]: thrower,
                    } as never,
                    user,
                ),
            );
            expect(fault).toMatch(new RegExp(`${step} threw ConnectionRefused$`, "u"));
            expect(fault).not.toContain(EMAIL);
            expect(fault).not.toContain(TOKEN);
        }
    });

    it("never prints a structured error: a validation error can carry the input", async () => {
        const { request } = fakeRequest(
            healthy({
                "POST /api/v1/auth/register": {
                    status: 422,
                    body: { detail: [{ loc: ["body", "password"], input: PASSWORD }] },
                },
            }),
        );
        const fault = setupFault(await setupUser(request, user));
        expect(fault).toBe("setup gave no token: register 422 code=[structured]");
    });

    it("takes only a string access_token: a false or numeric one is no token, and is named", async () => {
        for (const value of [false, 0]) {
            const base = healthy();
            const { request } = fakeRequest((at, options) => {
                const who = (options.data as { email?: string } | undefined)?.email;
                return at === "POST /api/v1/auth/login" && who === EMAIL
                    ? { status: 200, body: { access_token: value } }
                    : base(at, options);
            });
            const setup = await setupUser(request, { ...user, orgName: "Creds Org" });
            expect(setup.token).toBe("");
            expect(setupFault(setup)).toMatch(/login 200 token=absent/u);
        }
    });

    it("stops after a login that gives no token: no onboard, no relogin", async () => {
        const { request, calls } = fakeRequest(
            healthy({ "PATCH /api/v1/admin/users/user-1": { status: 403, body: {} } }),
        );
        await setupUser(request, { ...user, orgName: "Creds Org" });
        expect(calls.at(-1)).toBe("POST /api/v1/auth/login");
        expect(calls).not.toContain("POST /api/v1/auth/onboard");
    });

    it("keeps the first token when the relogin gives none, and records the relogin", async () => {
        let logins = 0;
        const base = healthy();
        const { request } = fakeRequest((at, options) => {
            const who = (options.data as { email?: string } | undefined)?.email;
            if (at === "POST /api/v1/auth/login" && who === EMAIL && ++logins === 2) {
                return { status: 200, body: {} };
            }
            return base(at, options);
        });
        const setup = await setupUser(request, { ...user, orgName: "Creds Org" });
        expect(setup.token).toBe(TOKEN);
        expect(setup.steps.at(-1)).toMatch(/^relogin 200 token=absent/u);
    });
});
