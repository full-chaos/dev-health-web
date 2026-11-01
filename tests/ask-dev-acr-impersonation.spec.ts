import { mkdirSync } from "node:fs";
import { join } from "node:path";

import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from "@playwright/test";

/**
 * CHAOS-12306 (c5), offline, with the browser ACR client turned on the way production turns it on
 * (the two runtime-config keys):
 * - P1-6: loading a page and opening the panel sends nothing to ACR: no metadata fetch, no
 *   /authorize, no /token, no data call, even when this tab holds a token family.
 * - Decision 6: while the web session impersonates, Ask Dev is hidden (no launcher, no panel) and
 *   /dev says it is not available. The session is marked impersonating by answering the browser's
 *   own session read (`/api/auth/session`), which is where the client learns it.
 */

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const SHOTS = process.env.ASK_DEV_ACR_SHOTS ?? "";
const FAMILY_KEY = "ask-dev:acr-family";
const ACR_PATHS = ["/.well-known/oauth-authorization-server", "/authorize", "/token", "/revoke"];

test.describe.configure({ mode: "serial" });

async function shot(page: Page, name: string) {
    if (SHOTS === "") return;
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: join(SHOTS, `${name}.png`), animations: "disabled" });
}

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

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

/** Records (and refuses) every request to ACR's routes on the issuer origin. */
async function recordAcr(context: BrowserContext, origin: string): Promise<string[]> {
    const seen: string[] = [];
    await context.route(
        (url) =>
            url.origin === origin &&
            (ACR_PATHS.includes(url.pathname) ||
                url.pathname.startsWith("/api/v1/context-fabric/")),
        async (route) => {
            const url = new URL(route.request().url());
            seen.push(`${route.request().method()} ${url.pathname}`);
            await route.fulfill({ status: 503, body: "" });
        },
    );
    return seen;
}

/** Answers the browser's session read as an impersonating session of the signed-in admin. */
async function impersonating(context: BrowserContext) {
    await context.route("**/api/auth/session", async (route) => {
        // A navigation can abort a session read in flight: its answer is then gone, and nothing
        // waits for it. Only that case is ignored; every answered read is marked impersonating.
        let session: { user?: Record<string, unknown> } | null;
        let response: Awaited<ReturnType<typeof route.fetch>>;
        try {
            response = await route.fetch();
            session = (await response.json()) as typeof session;
        } catch {
            return;
        }
        if (session?.user !== undefined) {
            session.user.is_impersonating = true;
            session.user.impersonated_user_id = "user-impersonated-0001";
            session.user.impersonated_email = "someone@example.invalid";
        }
        await route.fulfill({ response, json: session }).catch(() => undefined);
    });
}

/** A token family this tab stored on an earlier page load (c4's v2 entry), bound to `user`. */
async function heldFamily(page: Page, origin: string) {
    const session = (await (await page.request.get("/api/auth/session")).json()) as {
        user: { id: string; org_id?: string };
    };
    await page.addInitScript(([key, entry]) => window.sessionStorage.setItem(key, entry), [
        FAMILY_KEY,
        JSON.stringify({
            v: 2,
            familyId: "F".repeat(22),
            issuer: origin,
            clientId: "https://localhost/acr/dev-browser-client",
            refreshToken: `acrrt_${"R".repeat(43)}`,
            tokenEndpoint: `${origin}/token`,
            revocationEndpoint: `${origin}/revoke`,
            userId: session.user.id,
            orgId: session.user.org_id ?? null,
        }),
    ] as const);
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

function originOf(): string {
    return new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3000").origin;
}

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("P1-6: a page load and opening the panel send nothing to ACR, with a family held", async ({
        page,
    }) => {
        const origin = originOf();
        await clientOn(page.context(), origin);
        const seen = await recordAcr(page.context(), origin);
        await heldFamily(page, origin);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        // Anything the open would trigger has had time to leave.
        await page.waitForTimeout(1_500);
        expect(seen).toEqual([]);
        expect(page.url()).not.toContain("/ask-dev/oauth/");
        expect(
            await page.evaluate((key) => sessionStorage.getItem(key), FAMILY_KEY),
        ).not.toBeNull();
    });

    test("impersonating: no launcher and no panel, and /dev says Ask Dev is not available", async ({
        page,
    }) => {
        const origin = originOf();
        await clientOn(page.context(), origin);
        const seen = await recordAcr(page.context(), origin);
        await impersonating(page.context());
        await page.goto("/dashboard");
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await page.waitForTimeout(1_000);
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toHaveCount(0);
        await expect(page.getByTestId("ask-dev-panel")).toHaveCount(0);
        // The sidebar row is listed only where the launcher is.
        await expect(page.getByRole("link", { name: "Ask Dev", exact: true })).toHaveCount(0);
        await shot(page, "impersonating-dashboard-desktop");

        await page.goto("/dev");
        await expect(
            page.getByRole("heading", { name: "Ask Dev is not available while impersonating" }),
        ).toBeVisible();
        await expect(page.getByText("Stop impersonating to use Ask Dev.")).toBeVisible();
        await expect(page.getByRole("textbox", { name: "Ask a question" })).toHaveCount(0);
        await shot(page, "impersonating-dev-desktop");
        expect(seen).toEqual([]);
    });

    test("not impersonating, the same page shows the launcher (control)", async ({ page }) => {
        const origin = originOf();
        await clientOn(page.context(), origin);
        await page.goto("/dashboard");
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Ask Dev", exact: true })).toBeVisible();
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("impersonating: no launcher in the mobile bar, and /dev says Ask Dev is not available", async ({
        page,
    }) => {
        const origin = originOf();
        await clientOn(page.context(), origin);
        const seen = await recordAcr(page.context(), origin);
        await impersonating(page.context());
        await page.goto("/dashboard");
        await page.waitForTimeout(1_000);
        await expect(page.getByRole("button", { name: "Open Ask Dev" })).toHaveCount(0);
        await shot(page, "impersonating-dashboard-mobile");
        await page.goto("/dev");
        await expect(
            page.getByRole("heading", { name: "Ask Dev is not available while impersonating" }),
        ).toBeVisible();
        await shot(page, "impersonating-dev-mobile");
        expect(
            await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
        ).toBe(true);
        expect(seen).toEqual([]);
    });
});
