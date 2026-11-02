import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { serveAskDevAuthorize } from "./mocks/acr-browser-client";
import { ACR_DEV_BROWSER_CLIENT_ID, AcrOAuthMock } from "./mocks/acr-oauth";

/**
 * CHAOS-12303 (c2 of the T13 split), CHAOS-12474: the browser's silent ACR authorization, offline.
 * A user signed in to web never sees a connect step, and the page never leaves.
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
const FAMILY_KEY = "ask-dev:acr-family";
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;

async function shot(page: Page, name: string) {
    if (SHOTS === "") return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`) });
}

type Harness = {
    readonly acr: AcrOAuthMock;
    readonly origin: string;
};

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ request }) => {
    const response = await request.post(`${MOCK}/__test/entitlements`, {
        data: { scenario: "provisioned" },
    });
    expect(response.ok()).toBe(true);
});

test.afterEach(async ({ request }) => {
    await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "unprovisioned" } });
});

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

/** Serves ACR's OAuth endpoints on the issuer origin from the mock, and web's route over it. */
async function acrOn(context: BrowserContext, harness: Harness) {
    await context.route(
        (url) => harness.acr.owns(url.href),
        async (route) => {
            const request = route.request();
            const answer = harness.acr.handle({
                method: request.method(),
                url: request.url(),
                body: request.postData(),
            });
            await route.fulfill({
                status: answer.status,
                headers: answer.headers,
                body: answer.body,
            });
        },
    );
    await serveAskDevAuthorize(context, harness.acr, harness.origin, harness.origin);
}

async function setUp(page: Page, options: { on?: boolean } = {}): Promise<Harness> {
    const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3000").origin;
    const harness: Harness = {
        acr: new AcrOAuthMock({ issuer: origin, redirectUri: `${origin}/ask-dev/oauth/callback` }),
        origin,
    };
    if (options.on !== false) await clientOn(page.context(), origin);
    await acrOn(page.context(), harness);
    return harness;
}

const tokenCalls = (harness: Harness) => harness.acr.calls.filter((call) => call.kind === "token");
const authorizeCalls = (harness: Harness) =>
    harness.acr.calls.filter((call) => call.kind === "authorize");

/** The panel, open on /dashboard. A panel open sends nothing: History is the act here. */
async function openHistory(page: Page) {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Open Ask Dev" }).click();
    const panel = page.getByTestId("ask-dev-panel");
    await panel.getByTestId("ask-dev-history-toggle").click();
    return panel;
}

test.describe("Ask Dev ACR browser authorization (offline)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("authorizes with no step and no navigation: route → token, on the same page", async ({
        page,
    }) => {
        const harness = await setUp(page);
        const pages: string[] = [];
        page.on("framenavigated", (frame) => {
            if (frame === page.mainFrame()) pages.push(frame.url());
        });
        await openHistory(page);
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

        // The page never left, and nothing of the flow reached a URL.
        expect(pages.filter((url) => /oauth|authorize|code=|state=/u.test(url))).toEqual([]);
        expect(page.url()).not.toMatch(/code=|state=|iss=/u);
        // The family lands one session read after /token: the sign-out guard reads it first.
        await expect
            .poll(() => page.evaluate((key) => window.sessionStorage.getItem(key), FAMILY_KEY))
            .not.toBeNull();
        const stored = await page.evaluate(
            ([family]) => ({
                family: window.sessionStorage.getItem(family),
                session: JSON.stringify({ ...window.sessionStorage }),
                local: JSON.stringify({ ...window.localStorage }),
                cookie: document.cookie,
            }),
            [FAMILY_KEY] as const,
        );
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
            // CHAOS-12474: the verifier stays in one call's memory.
            expect(where).not.toContain(form.code_verifier!);
        }
        expect(stored.local).not.toMatch(/acrrt_/u);
    });

    test("a denied consent is a failed read with Try again, and sends no code", async ({
        page,
    }) => {
        const harness = await setUp(page);
        harness.acr.consent = "deny";
        const panel = await openHistory(page);
        await expect(panel.getByTestId("ask-dev-history-read-failed")).toBeVisible();
        expect(tokenCalls(harness)).toHaveLength(0);
        await shot(page, "authorize-refused");
    });

    test("an answer naming another issuer is refused, and sends no code", async ({ page }) => {
        const harness = await setUp(page);
        harness.acr.redirectIss = "https://evil.example";
        const panel = await openHistory(page);
        await expect(panel.getByTestId("ask-dev-history-read-failed")).toBeVisible();
        expect(tokenCalls(harness)).toHaveLength(0);
    });

    test("a tab keeps its own family: another tab authorizes for itself", async ({
        page,
        context,
    }) => {
        const harness = await setUp(page);
        await openHistory(page);
        await expect.poll(() => tokenCalls(harness).length).toBe(1);
        const other = await context.newPage();
        await openHistory(other);
        await expect.poll(() => tokenCalls(harness).length).toBe(2);
        await other.close();
    });

    test("without the browser client nothing is sent", async ({ page }) => {
        const harness = await setUp(page, { on: false });
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(page.getByTestId("ask-dev-panel")).toBeVisible();
        expect(harness.acr.calls).toEqual([]);
    });

    test("ACR unreachable: Try again repeats the act, and works", async ({ page }) => {
        const harness = await setUp(page);
        let fail = true;
        await page
            .context()
            .route(`${harness.origin}/.well-known/oauth-authorization-server`, async (route) => {
                if (fail) await route.fulfill({ status: 503, body: "" });
                else await route.fallback();
            });
        const panel = await openHistory(page);
        const retry = panel.getByTestId("ask-dev-history-retry");
        await expect(retry).toBeVisible();
        await shot(page, "authorize-unavailable");
        expect(tokenCalls(harness)).toHaveLength(0);
        fail = false;
        await retry.click();
        await expect.poll(() => tokenCalls(harness).length).toBe(1);
    });

    test("a web session that has ended goes to the normal sign-in, and sends no code", async ({
        page,
    }) => {
        const harness = await setUp(page);
        await page.context().route(`${harness.origin}/api/ask-dev/authorize`, (route) =>
            route.fulfill({
                status: 401,
                headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                body: JSON.stringify({ error: { code: "signed_out" } }),
            }),
        );
        const signIn = page.waitForRequest((request) => request.url().includes("/auth/signin"));
        await openHistory(page);
        expect(new URL((await signIn).url()).searchParams.get("callbackUrl")).toMatch(
            /^\/dashboard/u,
        );
        expect(tokenCalls(harness)).toHaveLength(0);
    });
});
