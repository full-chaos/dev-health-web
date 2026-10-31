import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from "@playwright/test";

import { AcrOAuthMock } from "./mocks/acr-oauth";

/**
 * CHAOS-12104 (T14a): the browser's ACR transport, offline, through the real panel.
 *
 * The browser client is turned on the way production turns it on (the two runtime-config keys),
 * with the page's own loopback origin as ACR's issuer, so the nonce CSP's `connect-src` is
 * exercised. ACR's OAuth endpoints are c2's mock (`tests/mocks/acr-oauth.ts`); its investigation
 * endpoint plays the real ACR capture (#1608), naming the request's thread and submission in
 * `accepted` as ACR does since T9. Nothing here uses the test-mode transport.
 *
 * The live proof (a real ACR) rides the tickets T14 blocks, after CHAOS-12313.
 */

const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const CAPTURE = readFileSync(
    join(
        process.cwd(),
        "src/lib/ask-dev/acr-transport/__tests__/captures/context_fabric_investigation_event_stream.v1.sse",
    ),
    "utf8",
);
const QUESTION = "Which projects are at risk this quarter?";

type AcrCall = {
    readonly method: string;
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: string | null;
};

type Harness = {
    readonly origin: string;
    readonly acr: AcrOAuthMock;
    /** Every call to acr-api's data routes (`/api/v1/context-fabric/…`). */
    readonly calls: AcrCall[];
    /** The access tokens the mock's /token issued. */
    readonly tokens: string[];
};

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

/** The capture, with `accepted` naming this request's thread and submission (ACR since T9). */
function streamFor(threadId: string, submissionId: string): string {
    const [first, ...rest] = CAPTURE.split("\n\n");
    const lines = first!.split("\n");
    const at = lines.findIndex((line) => line.startsWith("data: "));
    const accepted = JSON.parse(lines[at]!.slice("data: ".length)) as Record<string, unknown>;
    lines[at] =
        `data: ${JSON.stringify({ ...accepted, thread_id: threadId, submission_id: submissionId })}`;
    return [lines.join("\n"), ...rest].join("\n\n");
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

/** acr-api on the issuer origin: c2's OAuth mock, and the investigation stream. */
async function acrOn(context: BrowserContext, harness: Harness) {
    await context.route(
        (url) => url.origin === harness.origin && harness.acr.owns(url.href),
        async (route) => {
            const request = route.request();
            const answer = harness.acr.handle({
                method: request.method(),
                url: request.url(),
                body: request.postData(),
            });
            if (request.method() === "POST" && new URL(request.url()).pathname === "/token") {
                const issued = (JSON.parse(answer.body || "{}") as { access_token?: string })
                    .access_token;
                if (issued !== undefined) harness.tokens.push(issued);
            }
            await route.fulfill({
                status: answer.status,
                headers: answer.headers,
                body: answer.body,
            });
        },
    );
    await context.route(
        (url) =>
            url.origin === harness.origin && url.pathname.startsWith("/api/v1/context-fabric/"),
        async (route) => {
            const request = route.request();
            const headers = await request.allHeaders();
            harness.calls.push({
                method: request.method(),
                url: request.url(),
                headers,
                body: request.postData(),
            });
            if (
                request.method() === "POST" &&
                new URL(request.url()).pathname === "/api/v1/context-fabric/investigations"
            ) {
                await route.fulfill({
                    status: 200,
                    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store" },
                    body: streamFor(
                        headers["x-acr-thread-id"] ?? "",
                        headers["x-acr-submission-id"] ?? "",
                    ),
                });
                return;
            }
            await route.fulfill({ status: 404, body: "" });
        },
    );
}

async function setUp(page: Page): Promise<Harness> {
    const origin = new URL(test.info().project.use.baseURL ?? "http://127.0.0.1:3000").origin;
    const harness: Harness = {
        origin,
        acr: new AcrOAuthMock({ issuer: origin, redirectUri: `${origin}/ask-dev/oauth/callback` }),
        calls: [],
        tokens: [],
    };
    await clientOn(page.context(), origin);
    await acrOn(page.context(), harness);
    return harness;
}

async function ask(page: Page, surface: ReturnType<Page["getByTestId"]>) {
    const input = surface.getByRole("textbox", { name: "Ask a question" });
    await expect(input).toBeEnabled();
    await input.fill(QUESTION);
    await input.press("Enter");
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("connected: the question goes to ACR from the browser, and the answer comes back", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await page.goto("/ask-dev/oauth/start?return=%2Fdashboard");
        await page.waitForURL((url) => url.pathname === "/dashboard");
        await expect.poll(() => harness.tokens.length).toBe(1);

        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        // Opening the panel calls nothing. (When the full checks' chunk loads is not observable
        // here: `next dev` loads async chunks at page load; the production build loads it only
        // when the transport imports it. The unit tests pin the import's timing.)
        expect(harness.calls).toEqual([]);

        await ask(page, panel);
        await expect(panel.getByTestId("ask-dev-answer")).toBeVisible();
        expect(harness.calls).toHaveLength(1);
        const [sent] = harness.calls;
        expect(sent!.method).toBe("POST");
        expect(sent!.url).toBe(`${harness.origin}/api/v1/context-fabric/investigations`);
        expect(sent!.url).not.toContain(harness.tokens[0]!);
        expect(sent!.headers).toMatchObject({
            authorization: `Bearer ${harness.tokens[0]}`,
            "x-acr-resource": harness.origin,
            "x-acr-client-version": "0.1.0",
            accept: "text/event-stream",
            "content-type": "application/json",
        });
        expect(sent!.headers["x-acr-submission-id"]).toMatch(/^sub_[0-9a-f]{32}$/u);
        expect(sent!.headers["x-acr-thread-id"]).toMatch(/^thread_[0-9a-f]{32}$/u);
        expect(Number(sent!.headers["x-acr-wait-budget-seconds"])).toBeGreaterThanOrEqual(10);
        // credentials: "omit": the web session cookie never goes to ACR.
        expect(sent!.headers.cookie).toBeUndefined();
        expect(JSON.parse(sent!.body ?? "{}")).toMatchObject({ question: QUESTION });
        await page.screenshot({
            path: testInfo.outputPath("browser-transport-answer-desktop.png"),
            animations: "disabled",
        });
    });

    test("not connected: Connect Ask Dev, and nothing is sent to ACR", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await ask(page, panel);
        const connect = panel.getByRole("link", { name: "Connect Ask Dev" });
        await expect(connect).toBeVisible();
        // The way back is this page, its query (the dashboard's filter) included.
        await expect(connect).toHaveAttribute(
            "href",
            /^\/ask-dev\/oauth\/start\?return=%2Fdashboard(%3F|$)/u,
        );
        expect(harness.calls).toEqual([]);
        expect(harness.acr.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-transport-connect-desktop.png"),
            animations: "disabled",
        });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("not connected, in the sheet: Connect Ask Dev, with no sideways scroll", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await ask(page, sheet);
        await expect(sheet.getByRole("link", { name: "Connect Ask Dev" })).toBeVisible();
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-transport-connect-mobile.png"),
            animations: "disabled",
        });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});
