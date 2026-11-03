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
const superuserEmail = process.env.TEST_SUPERUSER_EMAIL || "admin@devhealth.example";
const superuserPassword = process.env.TEST_SUPERUSER_PASSWORD || "devhealth123";

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
    await expect(page).toHaveURL(/\/dashboard(?:\?|$)/u);
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
 * Mark a user as email-verified via the admin API.
 * Requires a superuser token. Returns true on success.
 */
export async function verifyUser(
    request: APIRequestContext,
    userId: string,
    superuserToken: string,
): Promise<boolean> {
    const res = await request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
        headers: authHeaders(superuserToken),
        data: { is_verified: true },
    });
    return res.ok();
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
 * A code or detail this helper prints: words of letters only, joined by a space, `_` or `-`
 * (`access_token_expired`, `email not verified`), at most 80 characters. A digit or any other
 * symbol makes it "[redacted]": every token, key and id the backend issues carries one, as do an
 * email (`@`) and the journeys' password. Codex r2 on #1813: `Abc123` and `org-123` printed under
 * the earlier rule.
 */
const PRINTABLE_CODE = /^[A-Za-z]+(?:[ _-][A-Za-z]+)*$/u;

/**
 * One response's error code, for a setup step: `error.code`, `code` or `detail`. A string is printed
 * only when PRINTABLE_CODE allows it, else "[redacted]"; an object or array (a validation error can
 * carry the input) is "[structured]". So no token, password, email or id reaches a log line.
 */
async function errorCodeOf(res: { text: () => Promise<string> }): Promise<string> {
    const text = await res.text().catch(() => "");
    let body: unknown;
    try {
        body = JSON.parse(text);
    } catch {
        return text === "" ? "-" : "non-json";
    }
    const record = (typeof body === "object" && body !== null ? body : {}) as Record<
        string,
        unknown
    >;
    const raw =
        (record.error as { code?: unknown } | undefined)?.code ?? record.code ?? record.detail;
    if (raw === undefined || raw === null) return "-";
    if (typeof raw !== "string") return "[structured]";
    return raw.length <= 80 && PRINTABLE_CODE.test(raw) ? raw : "[redacted]";
}

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
        const kind =
            error instanceof Error && PRINTABLE_CODE.test(error.name) ? error.name : "Error";
        steps.push(`${name} threw ${kind}`);
        return undefined;
    }
}

/**
 * CHAOS-12865: registers, verifies and logs in a fresh journey user (and with `orgName` onboards it
 * and logs in again), recording each step's name, HTTP status and error code. A setup that gives
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
        steps.push(`${name} ${String(res.status())} code=${await errorCodeOf(res)}`);

    const register = await attempt(steps, "register", () =>
        request.post(`${liveBackendUrl}/api/v1/auth/register`, {
            data: { email: user.email, password: user.password, full_name: user.fullName },
            headers: { Origin: liveBackendUrl },
        }),
    );
    if (register === undefined) return none();
    await step("register", register);
    if (!register.ok()) return none();

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
            : `superuser-login ${String(suLogin.status())} code=${await errorCodeOf(suLogin)}`,
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
            steps.push(`user-lookup ${String(lookup.status())} ${userId ? "found" : "not-found"}`);
        } else {
            await step("user-lookup", lookup);
        }
    } else {
        steps.push("user-lookup skipped (no superuser token)");
    }
    if (suToken && userId) {
        const verify = await attempt(steps, "verify", () =>
            request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
                headers: authHeaders(suToken),
                data: { is_verified: true },
            }),
        );
        if (verify === undefined) return none();
        await step("verify", verify);
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
        const code = await errorCodeOf({ text: async () => text });
        steps.push(
            `${name} ${String(res.status())} token=${token ? "present" : "absent"} code=${code}`,
        );
        return token;
    };
    const first = await login("login");
    if (first === undefined || first === "") return none();
    if (user.orgName === undefined) return { token: first, steps };

    // Onboard first so admin endpoints are accessible, then log in again for the org's token.
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
    if (!res.ok()) return "";
    const userId = await userIdByEmail(request, email, superuserToken);
    if (!userId) return "";
    const patch = await request.patch(`${liveBackendUrl}/api/v1/admin/users/${userId}`, {
        headers: authHeaders(superuserToken),
        data: superuser ? { is_verified: true, is_superuser: true } : { is_verified: true },
    });
    return patch.ok() ? userId : "";
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
