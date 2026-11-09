/**
 * Live E2E helpers (CHAOS-709 / CHAOS-2684).
 *
 * Two DELIBERATELY distinct actor types back the live onboarding journey:
 *   - Per-test ORGLESS new users: created fresh via {@link registerUser} with a
 *     unique {@link testEmail}. After verification they have needs_onboarding
 *     true and must walk onboarding (explicit workspace creation) before any
 *     org-scoped endpoint is reachable. New-signup specs must NOT assume a
 *     workspace exists implicitly — they call {@link onboardOrg}.
 *   - The seeded SUPERUSER admin ({@link getSuperuserToken}): a pre-provisioned
 *     platform admin used only to verify those new users. It is never conflated
 *     with the orgless test users.
 */
import { execFileSync } from "node:child_process";
import {
    expect,
    test,
    type APIRequestContext,
    type Locator,
    type Page,
    type Request,
} from "@playwright/test";

// Backend URL resolution — mirrors impersonation.spec.ts convention
export const liveBackendUrl =
    process.env.PLAYWRIGHT_LIVE_BACKEND_URL ?? process.env.BACKEND_URL ?? "http://127.0.0.1:8000";

/** Generate a unique test email to avoid collisions across parallel runs. */
export function testEmail(prefix = "test"): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
}

/**
 * The one answer register gives to every sign-up that passed validation (ops
 * internal/api/session/register.go, internal/auth/authapi/register.go): 202. No backend answers
 * 201 any more, so every register site in this tier asserts 202 strictly (CHAOS-11082).
 */
export const REGISTER_ACCEPTED_STATUS = 202;

/** "" when `status` is the register answer; else the reason (the status only, never a body). */
export function registerStatusFault(status: number): string {
    return status === REGISTER_ACCEPTED_STATUS
        ? ""
        : `register answered ${String(status)}, want ${String(REGISTER_ACCEPTED_STATUS)}`;
}

/**
 * Assert a register response is the 202 answer. A 429 (the register rate limit) is an environment
 * fault, as before; any other status fails the test.
 */
export function expectRegisterAccepted(res: { status: () => number }): void {
    if (res.status() === 429) {
        envFault("Register rate-limited (429)");
        return;
    }
    const fault = registerStatusFault(res.status());
    expect(fault, fault).toBe("");
}

/** Register a new user. Returns the parsed response body. */
export async function registerUser(
    request: APIRequestContext,
    email: string,
    password: string,
    fullName = "Test User",
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password, full_name: fullName },
        headers: { Origin: liveBackendUrl },
    });
    expectRegisterAccepted(res);
    return (await res.json()) as Record<string, unknown>;
}

/** Login a user. Returns the parsed response body (contains access_token, needs_onboarding, …). */
export async function loginUser(
    request: APIRequestContext,
    email: string,
    password: string,
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
        data: { email, password },
    });
    return (await res.json()) as Record<string, unknown>;
}

/**
 * Delete the org that register auto-created for a verified user, as the superuser, so the user has no membership and a later
 * add-member row is its only (session) org. Login picks the earliest membership (ops auth/authapi/users.go:201-211), so the
 * auto org would win. No user login: auth-service budgets logins at 20 per 15 min per IP (authapi/limits.go:35-36). The org is
 * found through the superuser admin API: the user id (GET /api/v1/admin/users?q=, apiservice/admin/users.go:145) and the newest
 * orgs (GET /api/v1/admin/orgs, orgs.go:23, newest first, orgstore.go:66), whose members (GET /api/v1/admin/orgs/{id}/members,
 * orgs.go:28, answer field user_id and role, orgs.go:60-70) name the user. Right after register the user has exactly one
 * membership, the auto org with role owner; anything else fails with a message. A real delete removes the memberships and the
 * org (apiservice/admin/orgdeletion_targets.go:100,103) and deprovisions it in auth (orgs_provision.go:238).
 */
export async function dropAutoOrg(
    request: APIRequestContext,
    email: string,
    superToken: string,
): Promise<void> {
    const userId = await userIdByEmail(request, email, superToken);
    expect(userId, `${email} is not in the admin user list`).not.toBe("");
    const orgsRes = await request.get(`${liveBackendUrl}/api/v1/admin/orgs?limit=100`, {
        headers: authHeaders(superToken),
    });
    expect(orgsRes.status(), `listing organizations answered ${orgsRes.status()}`).toBe(200);
    const orgs = (await orgsRes.json()) as Array<{ id?: string }>;
    const memberships: Array<{ orgId: string; role: string }> = [];
    for (const org of orgs) {
        if (!org.id) continue;
        const res = await request.get(`${liveBackendUrl}/api/v1/admin/orgs/${org.id}/members`, {
            headers: authHeaders(superToken),
        });
        expect(res.status(), `listing members of ${org.id} answered ${res.status()}`).toBe(200);
        const members = (await res.json()) as Array<{ user_id?: string; role?: string }>;
        for (const member of members) {
            if (member.user_id === userId)
                memberships.push({ orgId: org.id, role: member.role ?? "" });
        }
        // The auto org is the newest org the user has, and a user has no other membership right after register.
        if (memberships.length > 0) break;
    }
    expect(
        memberships.length,
        `${email} has ${memberships.length} memberships among the newest ${orgs.length} organizations, want exactly one (the auto-created org)`,
    ).toBe(1);
    expect(
        memberships[0].role,
        `the auto-created membership of ${email} has role ${memberships[0].role}, want owner`,
    ).toBe("owner");
    const res = await request.delete(
        `${liveBackendUrl}/api/v1/admin/orgs/${memberships[0].orgId}`,
        {
            headers: authHeaders(superToken),
        },
    );
    expect(res.status(), `deleting the auto-created organization answered ${res.status()}`).toBe(
        200,
    );
}

/**
 * Explicitly create the org/workspace for a freshly-registered user (the
 * onboarding action). New-signup specs use this so workspace creation is an
 * explicit, asserted step rather than a hidden side effect of registration.
 */
export async function onboardOrg(
    request: APIRequestContext,
    token: string,
    orgName: string,
): Promise<Record<string, unknown>> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
        headers: authHeaders(token),
        data: { action: "create_org", org_name: orgName },
    });
    return (await res.json()) as Record<string, unknown>;
}

/** Build an Authorization header object from a bearer token. */
export function authHeaders(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
}

// Superuser credentials — set in CI secrets or use defaults for local dev
export const superuserEmail = process.env.TEST_SUPERUSER_EMAIL || "admin@devhealth.example";
export const superuserPassword = process.env.TEST_SUPERUSER_PASSWORD || "devhealth123";

function sessionEmail(session: unknown): string | undefined {
    if (typeof session !== "object" || session === null) return undefined;
    const user = Reflect.get(session, "user");
    if (typeof user !== "object" || user === null) return undefined;
    const email = Reflect.get(user, "email");
    return typeof email === "string" ? email : undefined;
}

/** Sign the seeded canonical user in through the real Auth.js browser flow. */
export async function signInCanonicalUser(page: Page): Promise<void> {
    await page.goto("/auth/signin");
    const initialSessionResponse = await page.request.get("/api/auth/session");
    expect(initialSessionResponse.ok()).toBe(true);

    await page.getByLabel("Email").fill(superuserEmail);
    await page.getByLabel("Password").fill(superuserPassword);
    const callbackResponse = page.waitForResponse(
        (response) =>
            new URL(response.url()).pathname === "/api/auth/callback/credentials" &&
            response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sign In" }).click();
    expect((await callbackResponse).ok(), "The canonical acceptance user could not sign in.").toBe(
        true,
    );

    await expect
        .poll(async () => {
            const response = await page.request.get("/api/auth/session");
            if (!response.ok()) return undefined;
            return sessionEmail(await response.json());
        })
        .toBe(superuserEmail);
    // A fresh dev server compiles /dashboard on this first landing; that can take far longer than the 5 s default.
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u, { timeout: 60_000 });
}

/** Authenticate as superuser and return the access token, or null on failure. */
export async function getSuperuserToken(request: APIRequestContext): Promise<string | null> {
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/login`, {
        data: { email: superuserEmail, password: superuserPassword },
    });
    if (!res.ok()) return null;
    const data = (await res.json()) as { access_token?: string };
    return data.access_token ?? null;
}

/**
 * The id of the user registered with email, found through the admin API: the
 * sign-up answer carries no id. Returns "" when the user is not found.
 */
export async function userIdByEmail(
    request: APIRequestContext,
    email: string,
    superuserToken: string,
): Promise<string> {
    const res = await request.get(
        `${liveBackendUrl}/api/v1/admin/users?q=${encodeURIComponent(email)}&limit=5`,
        { headers: authHeaders(superuserToken) },
    );
    if (!res.ok()) return "";
    const body = (await res.json()) as unknown;
    const rows = (
        Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])
    ) as Array<{ id?: string; email?: string }>;
    return rows.find((row) => row.email?.toLowerCase() === email.toLowerCase())?.id ?? "";
}

/**
 * One verb of the ops live e2e auth stack script (LIVE_E2E_STACK_SCRIPT, state LIVE_E2E_STACK_STATE). Users are owned by
 * auth-service, so the go-api admin PATCH no longer sets is_verified or is_superuser (409 operation_moved, CHAOS-11017):
 * test setup goes through the venue verbs. Returns false (after envFault) when the stack env is missing; throws when the verb fails.
 */
export function stackVerb(...args: string[]): boolean {
    const script = process.env.LIVE_E2E_STACK_SCRIPT;
    const state = process.env.LIVE_E2E_STACK_STATE;
    if (!script || !state) {
        envFault(
            "LIVE_E2E_STACK_SCRIPT and LIVE_E2E_STACK_STATE name the ops auth stack script and its state directory",
        );
        return false;
    }
    execFileSync("bash", [script, args[0], state, ...args.slice(1)], {
        stdio: "pipe",
        timeout: 90_000,
    });
    return true;
}

/** Mark a user's e-mail verified in auth.users and public.users (stack verb verify-user). Test setup only. */
export function verifyUserViaStack(email: string): boolean {
    return stackVerb("verify-user", email);
}

/** Make a user a platform admin in auth (stack verb grant-platform-admin, new in ops PR-V). Test setup only. */
export function grantPlatformAdminViaStack(email: string): boolean {
    return stackVerb("grant-platform-admin", email);
}

/**
 * An environment fault (backend unreachable, seed missing, credentials wrong) must
 * FAIL the live tier in CI, never skip it (CHAOS-12138). Locally, with no CI env,
 * the test still skips so a developer without the full stack is not blocked.
 */
export function envFault(reason: string): void {
    if (process.env.CI) {
        throw new Error(`ENVIRONMENT FAULT (live-e2e would have skipped): ${reason}`);
    }
    test.skip(true, reason);
}

/** A journey's setup user: its token ("" when the setup gave none) and every step it took. */
export type SetupUser = { readonly token: string; readonly steps: readonly string[] };

/**
 * What a setup step records about a response body: its kind only, never its text. "error" is a
 * JSON object with `error`, `code` or `detail`; "json" is any other JSON; then "non-json" or
 * "empty". No backend string is printed: Codex r2 and r3 on #1813 each showed a secret-shaped
 * string (`Abc123`, then a letters-only `SecretToken`) passing a shape filter, so none is used.
 */
async function bodyKindOf(res: { text: () => Promise<string> }): Promise<string> {
    const text = await res.text().catch(() => "");
    if (text === "") return "empty";
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return "non-json";
    }
    if (typeof body !== "object" || body === null || Array.isArray(body)) return "json";
    const record = body as Record<string, unknown>;
    return ["error", "code", "detail"].some(
        (key) => record[key] !== undefined && record[key] !== null,
    )
        ? "error"
        : "json";
}

/** The error names a thrown setup request is recorded by; any other name is recorded as "Error". */
const THROWN_NAMES = new Set(["TimeoutError", "AbortError", "TypeError", "Error"]);

/** A login answer's token: a non-empty string, or "" for anything else in `access_token`. */
function tokenOf(body: unknown): string {
    const value = (body as { access_token?: unknown } | null | undefined)?.access_token;
    return typeof value === "string" ? value : "";
}

type SetupResponse = Awaited<ReturnType<APIRequestContext["post"]>>;

/**
 * Sends one setup request. A request that throws (a refused connection, a timeout) is a step too:
 * it is recorded by its error's name only (its message can hold the URL, which holds the email),
 * and gives undefined, so the setup stops there and still names the step.
 */
async function attempt(
    steps: string[],
    name: string,
    send: () => Promise<SetupResponse>,
): Promise<SetupResponse | undefined> {
    try {
        return await send();
    } catch (error) {
        const kind = error instanceof Error && THROWN_NAMES.has(error.name) ? error.name : "Error";
        steps.push(`${name} threw ${kind}`);
        return undefined;
    }
}

/**
 * CHAOS-12865: registers, verifies and logs in a fresh journey user (and with `orgName` onboards it
 * and logs in again), recording each step's name, HTTP status and body kind. A setup that gives
 * no token is then named by `setupFault`, never "backend may be unavailable" (web #1804's CI
 * live-e2e failed twice on that message, and the step that failed was never known).
 */
export async function setupUser(
    request: APIRequestContext,
    user: {
        readonly email: string;
        readonly password: string;
        readonly fullName: string;
        readonly orgName?: string;
    },
): Promise<SetupUser> {
    const steps: string[] = [];
    const none = (): SetupUser => ({ token: "", steps });
    const step = async (name: string, res: { status: () => number; text: () => Promise<string> }) =>
        steps.push(`${name} ${String(res.status())} body=${await bodyKindOf(res)}`);

    const register = await attempt(steps, "register", () =>
        request.post(`${liveBackendUrl}/api/v1/auth/register`, {
            data: { email: user.email, password: user.password, full_name: user.fullName },
            headers: { Origin: liveBackendUrl },
        }),
    );
    if (register === undefined) return none();
    await step("register", register);
    if (registerStatusFault(register.status()) !== "") return none();

    // Verify the user's email so login returns tokens.
    const suLogin = await attempt(steps, "superuser-login", () =>
        request.post(`${liveBackendUrl}/api/v1/auth/login`, {
            data: { email: superuserEmail, password: superuserPassword },
        }),
    );
    if (suLogin === undefined) return none();
    const suToken = suLogin.ok() ? tokenOf(await suLogin.json().catch(() => ({}))) : "";
    steps.push(
        suLogin.ok()
            ? `superuser-login ${String(suLogin.status())} token=${suToken ? "present" : "absent"}`
            : `superuser-login ${String(suLogin.status())} body=${await bodyKindOf(suLogin)}`,
    );
    let userId = "";
    if (suToken) {
        const lookup = await attempt(steps, "user-lookup", () =>
            request.get(
                `${liveBackendUrl}/api/v1/admin/users?q=${encodeURIComponent(user.email)}&limit=5`,
                { headers: authHeaders(suToken) },
            ),
        );
        if (lookup === undefined) return none();
        if (lookup.ok()) {
            const body = (await lookup.json().catch(() => [])) as unknown;
            const rows = (
                Array.isArray(body) ? body : ((body as { items?: unknown[] }).items ?? [])
            ) as Array<{ id?: string; email?: string }>;
            userId =
                rows.find((row) => row.email?.toLowerCase() === user.email.toLowerCase())?.id ?? "";
            // CHAOS-13327: a live impersonation session of this superuser scopes the list to the target's org.
            const scoped =
                lookup.headers()["x-impersonating"] === "true" ? " impersonating=true" : "";
            steps.push(
                `user-lookup ${String(lookup.status())} ${userId ? "found" : "not-found"}${scoped}`,
            );
        } else {
            await step("user-lookup", lookup);
        }
    } else {
        steps.push("user-lookup skipped (no superuser token)");
    }
    if (suToken && userId) {
        try {
            steps.push(
                verifyUserViaStack(user.email) ? "verify ok" : "verify skipped (no stack env)",
            );
        } catch {
            steps.push("verify failed");
            return none();
        }
    } else {
        steps.push("verify skipped");
    }

    /** One user login: its token, "" when it gave none, or undefined when the request threw. */
    const login = async (name: string): Promise<string | undefined> => {
        const res = await attempt(steps, name, () =>
            request.post(`${liveBackendUrl}/api/v1/auth/login`, {
                data: { email: user.email, password: user.password },
            }),
        );
        if (res === undefined) return undefined;
        const text = await res.text().catch(() => "");
        let token = "";
        try {
            token = tokenOf(JSON.parse(text));
        } catch {
            token = "";
        }
        const body = await bodyKindOf({ text: async () => text });
        steps.push(
            `${name} ${String(res.status())} token=${token ? "present" : "absent"} body=${body}`,
        );
        return token;
    };
    const first = await login("login");
    if (first === undefined || first === "") return none();
    if (user.orgName === undefined) return { token: first, steps };

    // Onboard first so admin endpoints are accessible, then log in again for the org's token. A
    // refused onboard does not stop the setup, as before: in the default pass register already
    // created the org, so onboard can answer 400 by design (the onboarding journey's own case).
    const orgName = user.orgName;
    const onboard = await attempt(steps, "onboard", () =>
        request.post(`${liveBackendUrl}/api/v1/auth/onboard`, {
            headers: authHeaders(first),
            data: { action: "create_org", org_name: orgName },
        }),
    );
    if (onboard === undefined) return none();
    await step("onboard", onboard);
    const again = await login("relogin");
    if (again === undefined) return none();
    return { token: again || first, steps };
}

/** Why a journey has no token: its setup steps, or "" when the setup gave a token. */
export function setupFault(setup: SetupUser): string {
    return setup.token === "" ? `setup gave no token: ${setup.steps.join(" | ")}` : "";
}

/**
 * Register and verify a fresh user through the public API plus the admin API and
 * return its id, or "" when any step fails. With `superuser` the user is also
 * promoted. Replaces the TEST_TARGET_USER_ID secrets, which CI never set.
 */
export async function provisionUser(
    request: APIRequestContext,
    superuserToken: string,
    prefix: string,
    superuser = false,
): Promise<string> {
    const email = testEmail(prefix);
    const res = await request.post(`${liveBackendUrl}/api/v1/auth/register`, {
        data: { email, password: "TestPass123!", full_name: "Provisioned User" },
        headers: { Origin: liveBackendUrl },
    });
    if (registerStatusFault(res.status()) !== "") return "";
    const userId = await userIdByEmail(request, email, superuserToken);
    if (!userId) return "";
    try {
        if (!verifyUserViaStack(email)) return "";
        if (superuser && !grantPlatformAdminViaStack(email)) return "";
    } catch {
        return "";
    }
    return userId;
}

/** The onboarding steps mark themselves interactive once React has attached their handlers. */
export const ONBOARDING_HYDRATED = '[data-onboarding-interactive="true"]';

/** How long a hydrated control may take to show its handler ran, before the click counts as dropped. */
export const CLICK_REACTION_MS = 5_000;

/** A Next server action call: a POST to the page carrying the `next-action` header. */
export const isServerActionTo =
    (pathname: string) =>
    (request: Request): boolean =>
        request.method() === "POST" &&
        request.headers()["next-action"] !== undefined &&
        new URL(request.url()).pathname === pathname;

/**
 * Clicks an onboarding control only after its step has hydrated, then proves its handler ran
 * (CHAOS-12176).
 *
 * The live suite runs `next dev`, which compiles a route on its first request: the server-rendered
 * button is visible, but its handler is attached only when the client JS has loaded. A click in that
 * window is discarded, and the journey then sat on a 30 s URL wait that ended at the test timeout,
 * with the button still unpressed (a fallback path, three CI occurrences). So: wait for the step's
 * hydration marker, click, and require the handler's own first effect, `handlerRequest` (armed before
 * the click), within {@link CLICK_REACTION_MS}. An unrelated navigation is not proof (codex r1 on
 * #1633); a handler that runs and then fails still sends its request, so it is not called dropped.
 */
export async function clickHydratedOnboardingControl(
    page: Page,
    control: Locator,
    label: string,
    handlerRequest: (request: Request) => boolean,
): Promise<void> {
    await expect(
        page.locator(ONBOARDING_HYDRATED),
        `onboarding step hydrated before clicking "${label}" (CHAOS-12176)`,
    ).toBeVisible({ timeout: 30_000 });
    const handlerRan = page.waitForRequest(handlerRequest, { timeout: CLICK_REACTION_MS }).then(
        () => true,
        () => false,
    );
    await control.click();
    expect(
        await handlerRan,
        `"${label}" was clicked but its handler sent no request: the click was dropped (CHAOS-12176)`,
    ).toBe(true);
}
