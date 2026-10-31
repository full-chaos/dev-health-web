import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { ACR_DEV_BROWSER_CLIENT_ID, AcrOAuthMock } from "./mocks/acr-oauth";

/**
 * CHAOS-12303 (c2 of the T13 split): the browser's ACR authorization flow, offline.
 *
 * acr-api is `tests/mocks/acr-oauth.ts`. Its answers are acr-api's own, captured on askdev-1, and
 * it keeps ACR's rules: `iss` on the redirect, single-use codes, PKCE S256 and the 30 s refresh
 * grace. The issuer is the page's own loopback origin, so the nonce CSP's `connect-src 'self'`
 * covers it. The browser client is turned on the way production turns it on: by the two
 * runtime-config keys, served here by a route.
 *
 * The live proof (a real ACR, a real consent, a real data call) is T14's, after CHAOS-12313.
 */

const SHOTS = process.env.ASK_DEV_ACR_SHOTS ?? "";
const PENDING_KEY = "ask-dev:acr-authorization";
const FAMILY_KEY = "ask-dev:acr-family";

async function shot(page: Page, name: string) {
    if (SHOTS === "") return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

type Harness = {
    readonly acr: AcrOAuthMock;
    readonly origin: string;
    /** Every Location the mock's /authorize answered (the callback URLs). */
    readonly redirects: string[];
};

/** Turns the browser client on for this context, as runtime config does in production. */
async function clientOn(context: BrowserContext, origin: string) {
    await context.route(`${origin}/runtime-config.js`, async (route) => {
        const response = await route.fetch();
        const text = await response.text();
        const match = text.match(/^window\.__DEV_HEALTH_RUNTIME__ = (.*);$/mu);
        expect(match, "runtime-config.js has its one assignment").not.toBeNull();
        const payload = JSON.parse(match![1]!) as { publicEnv: Record<string, string> };
        payload.publicEnv.NEXT_PUBLIC_ACR_OAUTH_ISSUER = origin;
        payload.publicEnv.NEXT_PUBLIC_ACR_WEB_ORIGIN = origin;
        await route.fulfill({
            response,
            body: `// Auto-generated at start-up.\nwindow.__DEV_HEALTH_RUNTIME__ = ${JSON.stringify(payload)};\n`,
        });
    });
}

/** Serves ACR's four OAuth endpoints on the issuer origin from the mock. */
async function acrOn(context: BrowserContext, harness: Harness, follow = true) {
    await context.route(
        (url) => harness.acr.owns(url.href),
        async (route) => {
            const request = route.request();
            const answer = harness.acr.handle({
                method: request.method(),
                url: request.url(),
                body: request.postData(),
            });
            if (answer.headers.Location !== undefined)
                harness.redirects.push(answer.headers.Location);
            if (!follow && answer.headers.Location !== undefined) {
                await route.fulfill({ status: 204, body: "" });
                return;
            }
            await route.fulfill({
                status: answer.status,
                headers: answer.headers,
                body: answer.body,
            });
        },
    );
}

async function setUp(
    page: Page,
    options: { follow?: boolean; on?: boolean } = {},
): Promise<Harness> {
    const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3000").origin;
    const harness: Harness = {
        acr: new AcrOAuthMock({ issuer: origin, redirectUri: `${origin}/ask-dev/oauth/callback` }),
        origin,
        redirects: [],
    };
    if (options.on !== false) await clientOn(page.context(), origin);
    await acrOn(page.context(), harness, options.follow ?? true);
    return harness;
}

const tokenCalls = (harness: Harness) => harness.acr.calls.filter((call) => call.kind === "token");
const authorizeCalls = (harness: Harness) =>
    harness.acr.calls.filter((call) => call.kind === "authorize");

const callbackCard = (page: Page) => page.getByTestId("ask-dev-acr-callback");

test.describe("Ask Dev ACR browser authorization (offline)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("connects: start → ACR → callback → token → back where the user was", async ({ page }) => {
        const harness = await setUp(page);
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await page.waitForURL((url) => url.pathname === "/dashboard");
        await expect.poll(() => tokenCalls(harness).length).toBe(1);

        const [authorize] = authorizeCalls(harness);
        expect(authorize!.kind === "authorize" && authorize.params).toEqual({
            response_type: "code",
            client_id: ACR_DEV_BROWSER_CLIENT_ID,
            redirect_uri: `${harness.origin}/ask-dev/oauth/callback`,
            code_challenge: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            code_challenge_method: "S256",
            state: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/u),
            resource: harness.origin,
            scope: "context:read evidence:read",
        });
        const [exchange] = tokenCalls(harness);
        const form = exchange!.kind === "token" ? exchange.form : {};
        expect(form).toMatchObject({
            grant_type: "authorization_code",
            client_id: ACR_DEV_BROWSER_CLIENT_ID,
            redirect_uri: `${harness.origin}/ask-dev/oauth/callback`,
            resource: harness.origin,
        });
        const params = authorize!.kind === "authorize" ? authorize.params : {};
        expect(createHash("sha256").update(form.code_verifier!).digest("base64url")).toBe(
            params.code_challenge,
        );

        // Nothing of the flow is left in the URL; the access token is in no storage and no cookie.
        expect(page.url()).not.toMatch(/code=|state=|iss=/u);
        const stored = await page.evaluate(
            ([pending, family]) => ({
                pending: window.sessionStorage.getItem(pending),
                family: window.sessionStorage.getItem(family),
                session: JSON.stringify({ ...window.sessionStorage }),
                local: JSON.stringify({ ...window.localStorage }),
                cookie: document.cookie,
            }),
            [PENDING_KEY, FAMILY_KEY] as const,
        );
        expect(stored.pending).toBeNull();
        // CHAOS-12305: v2 binds the family to the web principal and names it for the refresh lock.
        expect(JSON.parse(stored.family!)).toMatchObject({
            v: 2,
            userId: expect.any(String),
            familyId: expect.stringMatching(/^[A-Za-z0-9_-]{22}$/u),
            issuer: harness.origin,
            clientId: ACR_DEV_BROWSER_CLIENT_ID,
            refreshToken: expect.stringMatching(/^acrrt_[A-Za-z0-9_-]{43}$/u),
            revocationEndpoint: `${harness.origin}/revoke`,
        });
        for (const where of [stored.session, stored.local, stored.cookie]) {
            expect(where).not.toMatch(/fcacr_/u);
        }
        expect(stored.local).not.toMatch(/acrrt_/u);

        // Back does not start the flow again: the start page replaced itself with ACR.
        await page.goBack();
        await page.waitForLoadState("domcontentloaded");
        expect(page.url()).not.toContain("/ask-dev/oauth/");
        expect(authorizeCalls(harness)).toHaveLength(1);
    });

    test("a replayed callback URL is refused, and the code is never sent twice", async ({
        page,
    }) => {
        const harness = await setUp(page);
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await page.waitForURL((url) => url.pathname === "/dashboard");
        const [callbackUrl] = harness.redirects;

        await page.goto(callbackUrl!);
        await expect(callbackCard(page)).toHaveAttribute("data-state", "failed");
        await expect(
            page.getByRole("heading", { name: "This sign-in link is not valid here" }),
        ).toBeVisible();
        // The page scrubbed the replayed URL too.
        expect(new URL(page.url()).search).toBe("");
        expect(tokenCalls(harness)).toHaveLength(1);
        await shot(page, "callback-not-valid");
    });

    test("a consent denial has its own state, and sends no code", async ({ page }) => {
        const harness = await setUp(page);
        harness.acr.consent = "deny";
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect(
            page.getByRole("heading", { name: "Ask Dev was not connected" }),
        ).toBeVisible();
        await expect(page.getByRole("link", { name: "Return to Ask Dev" })).toHaveAttribute(
            "href",
            "/dashboard",
        );
        expect(tokenCalls(harness)).toHaveLength(0);
        await shot(page, "callback-denied");
    });

    test("a callback naming another issuer is refused, and sends no code", async ({ page }) => {
        const harness = await setUp(page);
        harness.acr.redirectIss = "https://evil.example";
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect(
            page.getByRole("heading", { name: "This sign-in link is not valid here" }),
        ).toBeVisible();
        expect(tokenCalls(harness)).toHaveLength(0);
    });

    test("another tab cannot complete this tab's authorization", async ({ page, context }) => {
        const harness = await setUp(page, { follow: false });
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect.poll(() => harness.redirects.length).toBe(1);
        const [callbackUrl] = harness.redirects;

        const other = await context.newPage();
        await other.goto(callbackUrl!);
        await expect(
            other.getByRole("heading", { name: "This sign-in link is not valid here" }),
        ).toBeVisible();
        expect(tokenCalls(harness)).toHaveLength(0);

        // The tab that started it still can: the other tab took nothing from it.
        await page.goto(callbackUrl!);
        await page.waitForURL((url) => url.pathname === "/dashboard");
        expect(tokenCalls(harness)).toHaveLength(1);
        await other.close();
    });

    test("a duplicated tab and the original cannot both exchange a code for one start (r1)", async ({
        page,
        context,
    }) => {
        const harness = await setUp(page, { follow: false });
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect.poll(() => harness.redirects.length).toBe(1);
        const [callbackUrl] = harness.redirects;
        // A duplicated tab gets a copy of the original's sessionStorage, pending entry included.
        const copied = await page.evaluate(() => JSON.stringify({ ...window.sessionStorage }));

        const clone = await context.newPage();
        await clone.addInitScript((entries) => {
            for (const [key, value] of Object.entries(
                JSON.parse(entries) as Record<string, string>,
            )) {
                window.sessionStorage.setItem(key, value);
            }
        }, copied);
        await clone.goto(callbackUrl!);
        await clone.waitForURL((url) => url.pathname === "/dashboard");
        expect(tokenCalls(harness)).toHaveLength(1);

        await page.goto(callbackUrl!);
        await expect(
            page.getByRole("heading", { name: "This sign-in link is not valid here" }),
        ).toBeVisible();
        expect(tokenCalls(harness)).toHaveLength(1);
        await clone.close();
    });

    test("without the browser client the start page sends nothing", async ({ page }) => {
        const harness = await setUp(page, { on: false });
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect(
            page.getByRole("heading", { name: "Ask Dev sign-in is not available" }),
        ).toBeVisible();
        expect(harness.acr.calls).toEqual([]);
        await shot(page, "start-off");
    });

    test("ACR unreachable: the start page offers Try again, and Try again starts it", async ({
        page,
    }) => {
        const harness = await setUp(page);
        let fail = true;
        await page
            .context()
            .route(`${harness.origin}/.well-known/oauth-authorization-server`, async (route) => {
                if (fail) await route.fulfill({ status: 503, body: "" });
                else await route.fallback();
            });
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await expect(
            page.getByRole("heading", { name: "Ask Dev could not be reached" }),
        ).toBeVisible();
        await shot(page, "start-unavailable");
        fail = false;
        await page.getByRole("button", { name: "Try again" }).click();
        await page.waitForURL((url) => url.pathname === "/dashboard");
        expect(tokenCalls(harness)).toHaveLength(1);
    });
});
