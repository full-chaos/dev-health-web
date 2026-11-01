import {
    request as requestContext,
    expect,
    test,
    type BrowserContext,
    type Page,
} from "@playwright/test";

import {
    ACR,
    EVIDENCE_PATH,
    INVESTIGATIONS_PATH,
    closeEvidence,
    connect,
    evidenceState,
    investigations,
    openStoredAnswer,
    references,
    signIn,
    watchAcr,
} from "./stack";

/**
 * CHAOS-11933 (plan §4, Phase 1 exit, as the direct-to-ACR amendment changed it): the browser path
 * against a real ACR. No case here sends a question: each reads what the stack already stores, or
 * is refused before admission, so no model is called. `investigations()` holds that.
 */

test.describe.configure({ mode: "serial" });

/**
 * One sign-in for the run: the auth service limits logins, so a sign-in per test locks the user out.
 * The session stays in memory, never in a file. Each case has its own context, and so its own tab
 * storage and its own ACR tokens, through the real OAuth flow.
 */
type Session = Awaited<ReturnType<BrowserContext["storageState"]>>;
let session: Session;

test.beforeAll(async ({ browser, baseURL }) => {
    const context = await browser.newContext({ baseURL: baseURL!, ignoreHTTPSErrors: true });
    const page = await context.newPage();
    await signIn(page);
    session = await context.storageState();
    await context.close();
});

test.use({
    // Playwright reads a fixture's first argument, so it stays a destructuring pattern.
    storageState: async ({}, provide) => {
        await provide(session);
    },
});

async function signedIn(page: Page) {
    const calls = watchAcr(page);
    await connect(page);
    return calls;
}

/**
 * ACR allows one principal 60 requests a minute (`ACR_REQUESTS_PER_MINUTE`), and opening a stored
 * conversation is about 8 of them. A 429 there is ACR's real answer and the page shows it, so the
 * suite stays under the limit rather than treat that as a flake.
 */
const PACE_MS = 6_000;
test.afterEach(async () => {
    await new Promise((resolve) => setTimeout(resolve, PACE_MS));
});

test("the stack answers: ACR's metadata and web", async ({ request, baseURL }) => {
    const acr = await requestContext.newContext({ ignoreHTTPSErrors: true });
    const metadata = await acr.get(`${ACR}/.well-known/oauth-authorization-server`);
    expect(metadata.status(), "ACR is not reachable").toBe(200);
    expect(((await metadata.json()) as { issuer: string }).issuer).toBe(ACR);
    await acr.dispose();
    expect((await request.get(baseURL!)).status()).toBe(200);
});

test("P1-6: opening the panel sends nothing", async ({ page }) => {
    const calls = await signedIn(page);
    await page.reload();
    await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
        timeout: 30_000,
    });
    await page.waitForTimeout(1_500);
    calls.length = 0;
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    await expect(page.getByTestId("ask-dev-panel")).toBeVisible();
    await page.waitForTimeout(2_000);
    expect(calls.map((call) => call.path)).toEqual([]);
});

test.describe("P1-9: evidence", () => {
    test("a reference reads from ACR, scoped to its answer, with the bearer and no cookie", async ({
        page,
    }) => {
        const calls = await signedIn(page);
        const surface = await openStoredAnswer(page);
        await references(surface).first().click();
        expect(await evidenceState(page)).toBe("ready");
        await closeEvidence(page);

        const reads = calls.filter((call) => call.path.startsWith(EVIDENCE_PATH));
        expect(reads).toHaveLength(1);
        expect(reads[0]!.status).toBe(200);
        expect(reads[0]!.query.get("result_id")).toMatch(/^result_/u);
        expect(reads[0]!.bearer).not.toBeNull();
        expect(reads[0]!.cookie).toBe(false);
        expect(investigations(calls)).toEqual([]);
    });

    test("two answers that cite one ref each ask with their own result_id", async ({ page }) => {
        const calls = await signedIn(page);
        const surface = await openStoredAnswer(page);
        const total = await references(surface).count();
        expect(total, "the stored conversation has no ref cited twice").toBeGreaterThan(1);
        for (let index = 0; index < total; index += 1) {
            await references(surface).nth(index).click();
            await evidenceState(page);
            await closeEvidence(page);
            await expect(page.getByTestId("ask-dev-evidence-body")).toHaveCount(0);
        }
        const reads = calls.filter((call) => call.path.startsWith(EVIDENCE_PATH));
        expect(new Set(reads.map((call) => call.path)).size).toBeLessThan(reads.length);
        expect(new Set(reads.map((call) => call.query.get("result_id"))).size).toBeGreaterThan(1);
    });

    test("an unknown ref is ACR's 404, shown as one neutral state with no id", async ({ page }) => {
        const calls = await signedIn(page);
        const surface = await openStoredAnswer(page);
        const unknown = "acr%3Av1%3Ateam%3Alinear%3Ano-such-team-11933";
        await page.route(`${ACR}${EVIDENCE_PATH}**`, (route) => {
            const url = new URL(route.request().url());
            url.pathname = `${EVIDENCE_PATH}${unknown}`;
            return route.continue({ url: url.toString() });
        });
        await references(surface).first().click();
        expect(await evidenceState(page)).toBe("not_found");
        const body = page.getByTestId("ask-dev-evidence-body");
        await expect(body).not.toContainText("no-such-team");
        expect((await body.innerHTML()).includes("no-such-team")).toBe(false);
        expect(calls.filter((call) => call.path.startsWith(EVIDENCE_PATH)).at(-1)!.status).toBe(
            404,
        );
        await closeEvidence(page);
    });

    test("the panel gives up the edge, and closing the drawer brings it back", async ({ page }) => {
        await signedIn(page);
        await openStoredAnswer(page);
        // The same tab: the panel restores the conversation from its hint.
        await page.goto("/dashboard", { waitUntil: "commit" });
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
            timeout: 30_000,
        });
        await page.waitForTimeout(1_500);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await expect.poll(() => references(panel).count(), { timeout: 20_000 }).toBeGreaterThan(0);
        const shown = await references(panel).count();
        await references(panel).first().click();
        expect(await evidenceState(page)).toBe("ready");
        await expect(panel).toHaveCount(0);
        await closeEvidence(page);
        await expect(panel).toBeVisible();
        await expect(references(panel)).toHaveCount(shown);
    });
});

test.describe("P1-12, as amended: no web route", () => {
    test("the CSP names ACR's exact origin, and a call carries the browser bearer", async ({
        page,
    }) => {
        const calls = await signedIn(page);
        const response = await page.goto("/dev", { waitUntil: "commit" });
        const csp = response!.headers()["content-security-policy"] ?? "";
        const connectSrc = csp.split(";").find((part) => part.trim().startsWith("connect-src"));
        expect(connectSrc?.split(/\s+/u), "the CSP does not name ACR").toContain(ACR);
        expect(csp).not.toContain("'unsafe-eval'");

        await openStoredAnswer(page);
        const reads = calls.filter((call) => call.path.startsWith("/api/v1/context-fabric/"));
        expect(reads.length).toBeGreaterThan(0);
        for (const call of reads) {
            expect(call.bearer).not.toBeNull();
            expect(call.cookie).toBe(false);
        }
    });

    test("/api/v1/dev stays blocked", async ({ request, baseURL }) => {
        expect((await request.get(`${baseURL}/api/v1/dev`)).status()).toBe(404);
    });
});

test.describe("the amendment's new cases that need no question", () => {
    test("a create with no submission header is refused before admission", async ({ page }) => {
        const calls = await signedIn(page);
        await openStoredAnswer(page);
        const bearer = calls.find((call) => call.bearer !== null)!.bearer!;
        const acr = await requestContext.newContext({ ignoreHTTPSErrors: true });
        const refused = await acr.post(`${ACR}${INVESTIGATIONS_PATH}`, {
            headers: {
                Authorization: `Bearer ${bearer}`,
                "X-ACR-Resource": ACR,
                "X-ACR-Client-Version": "0.1.0",
                Accept: "text/event-stream",
            },
            data: {},
        });
        expect(refused.status()).toBe(400);
        const body = (await refused.json()) as { error: { code: string } };
        expect(body.error.code).toBe("submission_required");
        await acr.dispose();
    });

    test("a cloned tab holds no token: it asks to connect, and reads nothing", async ({
        page,
        context,
    }) => {
        await signedIn(page);
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const copied = await page.evaluate(() =>
            Object.fromEntries(Object.entries(window.sessionStorage)),
        );
        const clone = await context.newPage();
        const calls = watchAcr(clone);
        await clone.addInitScript((entries) => {
            if (window.sessionStorage.length > 0) return;
            for (const [key, value] of Object.entries(entries)) {
                window.sessionStorage.setItem(key, value);
            }
        }, copied);
        await clone.goto("/dashboard", { waitUntil: "commit" });
        await expect(clone.getByRole("button", { name: "Open Ask Dev" })).toBeVisible({
            timeout: 30_000,
        });
        await clone.waitForTimeout(1_500);
        await clone.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = clone.getByTestId("ask-dev-panel");
        await panel.getByTestId("ask-dev-history-toggle").click();
        await expect(panel.getByTestId("ask-dev-history-connect")).toBeVisible({ timeout: 20_000 });
        expect(calls).toEqual([]);
        await clone.close();
    });

    test("sign-out: the token that tab held is refused on its next call", async ({ page }) => {
        const calls = await signedIn(page);
        await openStoredAnswer(page);
        const bearer = calls.find((call) => call.bearer !== null)!.bearer!;
        const acr = await requestContext.newContext({ ignoreHTTPSErrors: true });
        const read = () =>
            acr.get(`${ACR}/api/v1/context-fabric/threads?limit=1`, {
                headers: {
                    Authorization: `Bearer ${bearer}`,
                    "X-ACR-Resource": ACR,
                    "X-ACR-Client-Version": "0.1.0",
                },
            });
        expect((await read()).status(), "control: the live token reads").toBe(200);

        await page.getByRole("button", { name: "Account options" }).click();
        await page.getByRole("button", { name: /sign out/iu }).click();
        await page.waitForURL((url) => url.pathname.startsWith("/auth/"), { timeout: 30_000 });
        await expect.poll(async () => (await read()).status(), { timeout: 20_000 }).not.toBe(200);
        expect([401, 403]).toContain((await read()).status());
        await acr.dispose();
    });
});
