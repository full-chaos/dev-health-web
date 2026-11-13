/** UI GitHub sign-in against auth-service and the ops provider stand-in (providerstub). */
import { expect, test, type Page } from "@playwright/test";

// Four sign-in attempts and one refusal per job; no password login is spent, retries spend nothing.
test.describe.configure({ mode: "serial", retries: 0 });
test.setTimeout(120_000);

// The web origin the browser uses: Next's dev server builds its own URLs from localhost, and cookies are bound to the host, so
// the browser, the stand-in redirect and the callback all use localhost (as the SSO tier).
const WEB = "http://localhost:3002";
// The fixed user of the stand-in (ops ci/live_e2e_stub/github.json): GitHub id 920001. A .test address is refused by the ops
// e-mail rule (special-use domain), so the fixture and this constant use example.com.
const gitHubEmail = "live-social@example.com";
const authorizeUrl = "https://github.com/login/oauth/authorize*";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type SessionUser = { email?: string; id?: string };

type SessionBody = { user?: SessionUser; error?: string } | null;

async function sessionBody(page: Page): Promise<SessionBody | undefined> {
    const response = await page.request.get("/api/auth/session");
    if (!response.ok()) return undefined;
    return (await response.json()) as SessionBody;
}

/** A refused social login must leave no session error behind a successful one. */
async function expectNoSessionError(page: Page) {
    expect((await sessionBody(page))?.error, "session.error").toBeUndefined();
}

async function sessionUser(page: Page): Promise<SessionUser | undefined> {
    return (await sessionBody(page))?.user;
}

/**
 * The browser leg to github.com is not stubbed: the route answers it the way GitHub does, a 302 back to the Auth.js callback with
 * the request's own state, unless the cell asks for another answer.
 */
async function answerAuthorize(page: Page, answer: (state: string) => string) {
    await page.route(authorizeUrl, (route) => {
        const state = new URL(route.request().url()).searchParams.get("state") ?? "";
        return route.fulfill({ status: 302, headers: { location: answer(state) } });
    });
}

const approve = (state: string) =>
    `${WEB}/api/auth/callback/github?code=live-code&state=${encodeURIComponent(state)}`;

// The stand-in's second user (ops ci/live_e2e_stub/github.json, selected by this code) has an e-mail the ops rule refuses.
const refuse = (state: string) =>
    `${WEB}/api/auth/callback/github?code=live-refused&state=${encodeURIComponent(state)}`;

async function clickGitHub(page: Page) {
    await page.goto("/auth/signin");
    // Seed the CSRF cookie in this context first: a click that races its own CSRF fetch posts without it (MissingCSRF).
    await page.request.get("/api/auth/csrf");
    await page.getByRole("button", { name: "Continue with GitHub", exact: true }).click();
}

/**
 * A refused social sign-in lands on an Auth.js page with an exact code and no session. A provider answer with an error is an
 * OAuthCallbackError on the sign-in page (a client-safe error with kind signIn); a state that cannot be decoded is an InvalidCheck,
 * which Auth.js does not send to the client: it answers Configuration on the error page (@auth/core 0.41.3: errors.js:190-192 and
 * :412-431, index.js:130-143, oauth/checks.js:147).
 */
async function expectRefused(page: Page, landing: { path: string; error: string }) {
    try {
        await expect(page).toHaveURL(
            (url) => url.pathname === landing.path && url.searchParams.has("error"),
            { timeout: 90_000 },
        );
    } finally {
        const landed = new URL(page.url());
        console.log(
            `DIAG refusal: path=${landed.pathname} error=${landed.searchParams.get("error") ?? "none"}`,
        );
    }
    expect(new URL(page.url()).searchParams.get("error")).toBe(landing.error);
    expect(await sessionUser(page)).toBeUndefined();
}

let firstUserId: string | undefined;

test.describe("@auth-social GitHub sign-in", () => {
    test("the sign-in page offers GitHub", async ({ page }) => {
        await page.goto("/auth/signin");
        await expect(
            page.getByRole("button", { name: "Continue with GitHub", exact: true }),
        ).toBeVisible();
    });

    // PIN (CHAOS-13642): a login the backend refuses leaves no identity in the browser's session answer, and /dashboard bounces to
    // sign-in. The GraphQL answer is only recorded (see the next cell).
    test("a refused social login leaves a session with no user, e-mail or id", async ({ page }) => {
        await answerAuthorize(page, refuse);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionBody(page)) !== undefined, { timeout: 60_000 })
            .toBe(true);
        await page.waitForTimeout(3_000);
        const body = await sessionBody(page);
        expect(Object.keys(body ?? {}).sort(), "session keys").toEqual(["error", "expires"]);
        expect(typeof body?.error, "session.error").toBe("string");
        const dashboard = await page.goto("/dashboard");
        const landed = new URL(page.url());
        const line = `status=${String(dashboard?.status())} path=${landed.pathname}`;
        console.log(`REPRO dashboard: ${line}`);
        expect(landed.pathname).toBe("/auth/signin");
    });

    // RECORD ONLY: the browser GraphQL client posts to the web origin's /graphql (urqlClient.ts:21,36); src/proxy.ts rewrites it to
    // the backend with the session bearer. Without following redirects, what does the proxy answer after a refused login?
    test("repro: the GraphQL client path through the web proxy after a refused login", async ({
        page,
    }) => {
        await answerAuthorize(page, refuse);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionBody(page)) !== undefined, { timeout: 60_000 })
            .toBe(true);
        await page.waitForTimeout(3_000);
        const answer = await page.request.post("/graphql", {
            data: { query: "{ __typename }" },
            headers: { "content-type": "application/json" },
            maxRedirects: 0,
        });
        const headers = answer.headers();
        const text = await answer.text();
        const location = headers.location ? new URL(headers.location, WEB).pathname : "none";
        const line = `status=${String(answer.status())} location=${location} content-type=${headers["content-type"] ?? "none"} bytes=${String(text.length)} data=${String(text.includes('"data"'))} errors=${String(text.includes('"errors"'))}`;
        console.log(`REPRO graphql-nofollow: ${line}`);
        test.info().annotations.push({ type: "repro-graphql-nofollow", description: line });
    });

    test("the GitHub user signs in and a session names the provider's e-mail", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionUser(page))?.email, { timeout: 90_000 })
            .toBe(gitHubEmail);
        await expectNoSessionError(page);
        firstUserId = (await sessionUser(page))?.id;
        expect(firstUserId, "session.user.id").toMatch(UUID);
    });

    test("signing in again as the same GitHub user is the same account", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionUser(page))?.email, { timeout: 90_000 })
            .toBe(gitHubEmail);
        await expectNoSessionError(page);
        const secondUserId = (await sessionUser(page))?.id;
        expect(secondUserId, "session.user.id").toMatch(UUID);
        expect(secondUserId).toBe(firstUserId);
    });

    test("a provider answer with an error is refused and no session starts", async ({ page }) => {
        await answerAuthorize(page, (state) => {
            const url = new URL(`${WEB}/api/auth/callback/github`);
            url.searchParams.set("error", "access_denied");
            url.searchParams.set("state", state);
            return url.toString();
        });
        await clickGitHub(page);
        await expectRefused(page, { path: "/auth/signin", error: "OAuthCallbackError" });
    });

    // CURRENT ANSWER, NOT THE INTENDED ONE (CHAOS-13653): Auth.js turns the state check failure into the generic Configuration page
    // instead of the sign-in page with a sign-in error. This cell pins what the product answers today; when the fix lands the
    // landing changes and this pin changes with it.
    test("a callback whose state is not the one the sign-in started with is refused (the current answer, not the intended one)", async ({
        page,
    }) => {
        await answerAuthorize(
            page,
            () => `${WEB}/api/auth/callback/github?code=live-code&state=not-the-state`,
        );
        await clickGitHub(page);
        await expectRefused(page, { path: "/auth/error", error: "Configuration" });
    });
});
