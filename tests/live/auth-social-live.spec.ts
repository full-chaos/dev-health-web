/** UI GitHub sign-in against auth-service and the ops provider stand-in (providerstub). */
import { expect, test, type Page } from "@playwright/test";

// Four sign-in attempts and one refusal per job; no password login is spent, retries spend nothing.
test.describe.configure({ mode: "serial", retries: 0 });
test.setTimeout(120_000);

const WEB = "http://127.0.0.1:3002";
// The fixed user of the stand-in (ops ci/live_e2e_stub/github.json): GitHub id 920001.
const gitHubEmail = "live-social@example.test";
const authorizeUrl = "https://github.com/login/oauth/authorize*";

type SessionUser = { email?: string; id?: string };

async function sessionUser(page: Page): Promise<SessionUser | undefined> {
    const response = await page.request.get("/api/auth/session");
    if (!response.ok()) return undefined;
    const body = (await response.json()) as { user?: SessionUser } | null;
    return body?.user;
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

    test("the GitHub user signs in and a session names the provider's e-mail", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionUser(page))?.email, { timeout: 90_000 })
            .toBe(gitHubEmail);
        firstUserId = (await sessionUser(page))?.id;
        expect(typeof firstUserId === "string" && firstUserId !== "", "session.user.id").toBe(true);
    });

    test("signing in again as the same GitHub user is the same account", async ({ page }) => {
        await answerAuthorize(page, approve);
        await clickGitHub(page);
        await expect
            .poll(async () => (await sessionUser(page))?.email, { timeout: 90_000 })
            .toBe(gitHubEmail);
        const secondUserId = (await sessionUser(page))?.id;
        expect(typeof secondUserId === "string" && secondUserId !== "", "session.user.id").toBe(
            true,
        );
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
