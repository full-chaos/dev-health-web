/** UI GitHub sign-in against auth-service and the ops provider stand-in (providerstub). */
import { expect, test, type Page } from "@playwright/test";

// Four sign-in attempts and one refusal per job; no password login is spent, retries spend nothing.
test.describe.configure({ mode: "serial", retries: 0 });
test.setTimeout(120_000);

const WEB = "http://127.0.0.1:3002";
// The fixed user of the stand-in (ops ci/live_e2e_stub/github.json): GitHub id 920001.
const gitHubEmail = "live-social@example.test";
const authorizeUrl = "https://github.com/login/oauth/authorize*";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

type SessionUser = { email?: string; id?: string };

type SessionBody = { user?: SessionUser; error?: string } | null;

async function sessionBody(page: Page): Promise<SessionBody | undefined> {
    const response = await page.request.get("/api/auth/session");
    if (!response.ok()) return undefined;
    return (await response.json()) as SessionBody;
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

async function clickGitHub(page: Page) {
    await page.goto("/auth/signin");
    // Seed the CSRF cookie in this context first: a click that races its own CSRF fetch posts without it (MissingCSRF).
    await page.request.get("/api/auth/csrf");
    await page.getByRole("button", { name: "Continue with GitHub", exact: true }).click();
}

async function expectRefused(page: Page) {
    await expect(page).toHaveURL(/\/auth\/signin\?(?:.*&)?error=/u, { timeout: 90_000 });
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

    // RECORD ONLY (no assertion on the answers): what a browser holding the session of a login the backend refused can reach.
    test("repro: what a refused social login leaves reachable", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionBody(page)) !== undefined, { timeout: 60_000 })
            .toBe(true);
        await page.waitForTimeout(3_000);
        const record: Record<string, string> = {};
        const body = await sessionBody(page);
        record.session = `user=${String(body?.user !== undefined)} email=${String(
            body?.user?.email !== undefined,
        )} id=${String(body?.user?.id !== undefined)} error=${String(body?.error ?? "none")} keys=${Object.keys(body ?? {}).join(",")}`;
        const dashboard = await page.goto("/dashboard");
        const landed = new URL(page.url());
        record.dashboard = `status=${String(dashboard?.status())} path=${landed.pathname} error=${landed.searchParams.get("error") ?? "none"}`;
        const graphql = await page.request.post("/graphql", {
            data: { query: "{ __typename }" },
            headers: { "content-type": "application/json" },
        });
        const text = await graphql.text();
        record.graphql = `status=${String(graphql.status())} bytes=${String(text.length)} errors=${String(text.includes('"errors"'))} data=${String(text.includes('"data"'))}`;
        for (const [name, answer] of Object.entries(record)) {
            console.log(`REPRO ${name}: ${answer}`);
            test.info().annotations.push({ type: `repro-${name}`, description: answer });
        }
    });

    // RECORD ONLY: the browser GraphQL client posts to the web origin's /graphql (urqlClient.ts:21,36); src/proxy.ts rewrites it to
    // the backend with the session bearer. Without following redirects, what does the proxy answer after a refused login?
    test("repro: the GraphQL client path through the web proxy after a refused login", async ({
        page,
    }) => {
        await answerAuthorize(page, approve);
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
        firstUserId = (await sessionUser(page))?.id;
        expect(firstUserId, "session.user.id").toMatch(UUID);
    });

    test("signing in again as the same GitHub user is the same account", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionUser(page))?.email, { timeout: 90_000 })
            .toBe(gitHubEmail);
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
        await expectRefused(page);
    });

    test("a callback whose state is not the one the sign-in started with is refused", async ({
        page,
    }) => {
        await answerAuthorize(
            page,
            () => `${WEB}/api/auth/callback/github?code=live-code&state=not-the-state`,
        );
        await clickGitHub(page);
        await expectRefused(page);
    });
});
