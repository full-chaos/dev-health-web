import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    expect,
    test,
    type APIRequestContext,
    type BrowserContext,
    type Page,
} from "@playwright/test";

import { serveAskDevAuthorize } from "./mocks/acr-browser-client";
import { AcrOAuthMock } from "./mocks/acr-oauth";
import { investigationStreamFor } from "./mocks/acr-investigation-stream";

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
const QUESTION = "Which projects are at risk this quarter?";
/** A well-formed thread id: its read goes to ACR (CHAOS-12336). */
const THREAD = "thread_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
/**
 * ACR's 409 on a read when the viewer's grant is empty: the example
 * `contracts/examples/v1/error_context_fabric_no_repository.v1.json` at web's acr pin. Web vendors
 * no copy of it.
 */
const NO_REPOSITORY = {
    schema_version: "error.v1",
    request_id: "req_00000000000000000000000000011912",
    error: {
        code: "no_repository",
        message: "No repository is in scope for this credential",
        http_status: 409,
        retryable: false,
    },
};

/** ACR's own example at web's pin. */
const EVIDENCE = JSON.parse(
    readFileSync(
        join(process.cwd(), "src/lib/acr/contracts/examples/expanded_evidence.v1.json"),
        "utf8",
    ),
) as { evidence: { citation: string } };
const EVIDENCE_PATH = "/api/v1/agent-context/evidence/";

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
    /** CHAOS-12439: ACR's thread routes answer 409 `no_repository`. */
    threadsRefused: boolean;
    /** CHAOS-12105: what ACR's evidence route answers. */
    evidenceAnswer: { readonly status: number; readonly body: unknown };
};

test.describe.configure({ mode: "serial" });

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
            url.origin === harness.origin &&
            (url.pathname.startsWith("/api/v1/context-fabric/") ||
                url.pathname.startsWith(EVIDENCE_PATH)),
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
                    body: investigationStreamFor(
                        headers["x-acr-thread-id"] ?? "",
                        headers["x-acr-submission-id"] ?? "",
                    ),
                });
                return;
            }
            if (new URL(request.url()).pathname.startsWith(EVIDENCE_PATH)) {
                await route.fulfill({
                    status: harness.evidenceAnswer.status,
                    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                    body: JSON.stringify(harness.evidenceAnswer.body),
                });
                return;
            }
            if (
                harness.threadsRefused &&
                /^\/api\/v1\/context-fabric\/threads(\/|$)/u.test(new URL(request.url()).pathname)
            ) {
                await route.fulfill({
                    status: 409,
                    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                    body: JSON.stringify(NO_REPOSITORY),
                });
                return;
            }
            // T14b (CHAOS-12336): the answer's feedback control reads its feedback. A never-rated
            // result, as ACR answers it.
            const feedback = /^\/api\/v1\/context-fabric\/investigations\/feedback\/([^/]+)$/u.exec(
                new URL(request.url()).pathname,
            );
            if (request.method() === "GET" && feedback !== null) {
                await route.fulfill({
                    status: 200,
                    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
                    body: JSON.stringify({
                        schema_version: "context_fabric_result_feedback.v1",
                        result_id: decodeURIComponent(feedback[1]!),
                        correct: "unset",
                        useful: "unset",
                    }),
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
        threadsRefused: false,
        evidenceAnswer: { status: 200, body: EVIDENCE },
    };
    await clientOn(page.context(), origin);
    await acrOn(page.context(), harness);
    await serveAskDevAuthorize(page.context(), harness.acr, origin, origin);
    return harness;
}

/** Every thread read refused: a signed-in viewer with no repository in scope. */
async function withNoRepository(page: Page): Promise<Harness> {
    const harness = await setUp(page);
    harness.threadsRefused = true;
    await page.goto("/dashboard");
    return harness;
}

/** Web's route refuses: the silent step fails, by name (CHAOS-12474). */
async function authorizeFails(page: Page, harness: Harness) {
    await page.context().route(`${harness.origin}/api/ask-dev/authorize`, (route) =>
        route.fulfill({
            status: 503,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
            body: JSON.stringify({ error: { code: "acr_unavailable" } }),
        }),
    );
}

const callsTo = (harness: Harness, path: string) =>
    harness.calls.filter((call) => call.url.includes(`/context-fabric/${path}`));

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

    test("signed in: the first question authorizes, goes to ACR from the browser, and the answer comes back", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await page.goto("/dashboard");

        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await expect(panel.getByRole("textbox", { name: "Ask a question" })).toBeEnabled();
        // Opening the panel calls nothing. (When the full checks' chunk loads is not observable
        // here: `next dev` loads async chunks at page load; the production build loads it only
        // when the transport imports it. The unit tests pin the import's timing.)
        expect(harness.calls).toEqual([]);
        expect(harness.acr.calls).toEqual([]);

        await ask(page, panel);
        await expect(panel.getByTestId("answer-panel")).toBeVisible();
        expect(harness.tokens).toHaveLength(1);
        // The question and (T14b) the answer's feedback read: both from the browser, with the bearer
        // and no cookie. The history list stays off screen in the panel, so nothing reads it.
        await expect.poll(() => harness.calls.length).toBe(2);
        expect(harness.calls.filter((c) => c.url.includes("/context-fabric/threads?"))).toEqual([]);
        const sent = harness.calls.find((c) => c.method === "POST");
        const feedbackRead = harness.calls.find((c) => c.url.includes("/investigations/feedback/"));
        expect(feedbackRead!.method).toBe("GET");
        expect(feedbackRead!.url).toMatch(
            new RegExp(
                `^${harness.origin}/api/v1/context-fabric/investigations/feedback/[^/?]+$`,
                "u",
            ),
        );
        expect(feedbackRead!.headers).toMatchObject({
            authorization: `Bearer ${harness.tokens[0]}`,
            "x-acr-resource": harness.origin,
        });
        expect(feedbackRead!.headers.cookie).toBeUndefined();
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

    test("the silent step fails: Retry, no link, and nothing is sent to ACR", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await ask(page, panel);
        await expect(panel.getByTestId("chat-status")).toHaveAttribute("data-status", "failed");
        await expect(panel.getByRole("button", { name: "Retry" })).toBeVisible();
        await expect(panel.getByRole("link", { name: /connect/iu })).toHaveCount(0);
        await expect(panel).not.toContainText(/\bconnect\b/iu);
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-transport-authorize-failed-desktop.png"),
            animations: "disabled",
        });
    });
});

// CHAOS-12474: with no ACR access token, opening History or a conversation runs the silent step.
// When it fails, each says the read failed, with Try again. Nothing says Connect.
test.describe("desktop (1280px), T14b", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("History opens with no connect step", async ({ page }, testInfo) => {
        const harness = await setUp(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await panel.getByTestId("ask-dev-history-toggle").click();
        await expect.poll(() => harness.tokens.length).toBe(1);
        await expect(panel.getByTestId("ask-dev-history-read-failed")).toHaveCount(0);
        await expect(panel).not.toContainText(/\bconnect\b/iu);
        await page.screenshot({
            path: testInfo.outputPath("browser-calls-history-desktop.png"),
            animations: "disabled",
        });
    });

    test("the silent step fails: History says the read failed, and claims no empty list", async ({
        page,
    }) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByTestId("ask-dev-panel");
        await panel.getByTestId("ask-dev-history-toggle").click();
        await expect(panel.getByTestId("ask-dev-history-read-failed")).toBeVisible();
        await expect(panel.getByTestId("ask-dev-history-retry")).toBeVisible();
        await expect(panel.getByTestId("ask-dev-history-empty")).toHaveCount(0);
        expect(harness.calls).toEqual([]);
    });

    test("the silent step fails: a conversation opened by its link offers Try again", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto(`/dev?thread=${THREAD}`);
        await expect(page.getByTestId("ask-dev-conversation-read-failed")).toBeVisible();
        await expect(page.getByTestId("ask-dev-conversation-retry")).toBeVisible();
        await expect(page.locator("main")).not.toContainText(/\bconnect\b/iu);
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-calls-conversation-failed-desktop.png"),
            animations: "disabled",
        });
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the silent step fails, in the sheet: History offers Try again, with no sideways scroll", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await sheet.getByTestId("ask-dev-history-toggle").click();
        await expect(sheet.getByTestId("ask-dev-history-retry")).toBeVisible();
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-calls-history-failed-mobile.png"),
            animations: "disabled",
        });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });

    test("the silent step fails: a conversation opened by its link has no sideways scroll", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto(`/dev?thread=${THREAD}`);
        await expect(page.getByTestId("ask-dev-conversation-retry")).toBeVisible();
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-calls-conversation-failed-mobile.png"),
            animations: "disabled",
        });
        expect(
            await page.evaluate(
                () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
            ),
        ).toBe(true);
    });

    test("the silent step fails, in the sheet: Retry, with no sideways scroll", async ({
        page,
    }, testInfo) => {
        const harness = await setUp(page);
        await authorizeFails(page, harness);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const sheet = page.getByTestId("ask-dev-sheet");
        await ask(page, sheet);
        await expect(sheet.getByRole("button", { name: "Retry" })).toBeVisible();
        expect(harness.calls).toEqual([]);
        await page.screenshot({
            path: testInfo.outputPath("browser-transport-authorize-failed-mobile.png"),
            animations: "disabled",
        });
        expect(await sheet.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    });
});

// CHAOS-12439: a signed-in viewer whose grant holds no repository. ACR answers every thread read
// with 409 `no_repository`; reading again cannot help, so nothing offers it, and no code shows.
for (const [name, viewport, surface] of [
    ["desktop", { width: 1280, height: 900 }, "ask-dev-panel"],
    ["mobile", { width: 390, height: 844 }, "ask-dev-sheet"],
] as const) {
    test.describe(`no repository in scope, ${name}`, () => {
        test.use({ viewport });

        test("History says so, once, with no Try again", async ({ page }, testInfo) => {
            const harness = await withNoRepository(page);
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const view = page.getByTestId(surface);
            await view.getByTestId("ask-dev-history-toggle").click();
            const note = view.getByTestId("ask-dev-history-no-repository");
            await expect(note).toBeVisible();
            await expect(note).not.toContainText("no_repository");
            await expect(view.getByTestId("ask-dev-history-retry")).toHaveCount(0);
            await expect(view.getByTestId("ask-dev-history-row")).toHaveCount(0);
            expect(callsTo(harness, "threads?")).toHaveLength(1);
            await page.screenshot({
                path: testInfo.outputPath(`no-repository-history-${name}.png`),
                animations: "disabled",
            });
            expect(await view.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
        });

        test("a conversation opened by its link is unavailable, with no Try again", async ({
            page,
        }, testInfo) => {
            const harness = await withNoRepository(page);
            await page.goto(`/dev?thread=${THREAD}`);
            const unavailable = page.getByTestId("ask-dev-conversation-unavailable");
            await expect(unavailable).toBeVisible();
            await expect(unavailable).not.toContainText("no_repository");
            await expect(page.getByTestId("ask-dev-conversation-retry")).toHaveCount(0);
            await expect(page.getByTestId("ask-dev-conversation-read-failed")).toHaveCount(0);
            // One read of the thread. The list is another call: the render reads it once for
            // each conversation shown, so this page's list runs for the thread and for none.
            expect(callsTo(harness, `threads/${THREAD}`)).toHaveLength(1);
            await page.screenshot({
                path: testInfo.outputPath(`no-repository-conversation-${name}.png`),
                animations: "disabled",
            });
            expect(
                await page.evaluate(
                    () =>
                        document.documentElement.scrollWidth <=
                        document.documentElement.clientWidth,
                ),
            ).toBe(true);
        });
    });
}

const refused = (code: string, status: number, retryable: boolean) => ({
    status,
    body: {
        schema_version: "error.v1",
        request_id: "req_00000000000000000000000000012105",
        error: { code, message: "Refused", http_status: status, retryable },
    },
});

// CHAOS-12105: an evidence reference, read from the browser and drawn by ask-dev's body in the app's
// one drawer. The drawer takes the right edge from the panel, and closing it brings the panel back.
for (const [name, viewport, surface] of [
    ["desktop", { width: 1280, height: 900 }, "ask-dev-panel"],
    ["mobile", { width: 390, height: 844 }, "ask-dev-sheet"],
] as const) {
    test.describe(`evidence, ${name}`, () => {
        test.use({ viewport });

        async function answered(page: Page) {
            const harness = await setUp(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const view = page.getByTestId(surface);
            await ask(page, view);
            await expect(view.getByTestId("answer-panel")).toBeVisible();
            return { harness, view };
        }
        const openRef = (view: ReturnType<Page["getByTestId"]>) =>
            view.locator("button.evidence-ref--open:visible").last().click();
        const evidenceCalls = (harness: Harness) =>
            harness.calls.filter((call) => call.url.includes(EVIDENCE_PATH));

        test("a reference opens from the browser, and closing brings the panel back", async ({
            page,
        }, testInfo) => {
            const { harness, view } = await answered(page);
            await openRef(view);
            const body = page.getByTestId("ask-dev-evidence-body");
            await expect(body).toContainText(EVIDENCE.evidence.citation);
            await expect(body).toHaveAttribute("data-state", "ready");
            await expect(view).toHaveCount(0);

            const [call] = evidenceCalls(harness);
            expect(evidenceCalls(harness)).toHaveLength(1);
            expect(new URL(call!.url).searchParams.get("result_id")).toBeTruthy();
            expect(call!.url).not.toContain(harness.tokens[0]!);
            expect(call!.headers).toMatchObject({
                authorization: `Bearer ${harness.tokens[0]}`,
                "x-acr-resource": harness.origin,
            });
            expect(call!.headers.cookie).toBeUndefined();
            await page.screenshot({
                path: testInfo.outputPath(`evidence-ready-${name}.png`),
                animations: "disabled",
            });
            expect(
                await page
                    .getByRole("dialog", { name: "Evidence & Context" })
                    .evaluate((node) => node.scrollWidth <= node.clientWidth),
            ).toBe(true);

            await page.getByRole("button", { name: "Close" }).first().click();
            await expect(body).toHaveCount(0);
            await expect(view.getByTestId("answer-panel")).toBeVisible();
        });

        test("each refused or partial answer has its own state", async ({ page }, testInfo) => {
            const { harness, view } = await answered(page);
            const expanded = EVIDENCE as unknown as Record<string, unknown>;
            for (const [state, answer] of [
                [
                    "redacted",
                    {
                        status: 200,
                        body: {
                            ...expanded,
                            availability: "redacted",
                            redaction_reason: "Removed at the source.",
                        },
                    },
                ],
                ["stale", { status: 200, body: { ...expanded, availability: "stale" } }],
                ["not_found", refused("not_found", 404, false)],
                ["denied", refused("access_denied", 403, false)],
                ["no_repository", refused("no_repository", 409, false)],
                ["unavailable", refused("upstream_unavailable", 503, true)],
            ] as const) {
                harness.evidenceAnswer = answer;
                await openRef(view);
                const body = page.getByTestId("ask-dev-evidence-body");
                await expect(body).toHaveAttribute("data-state", state);
                await expect(body).not.toContainText(/no_repository|access_denied|\b40[39]\b/u);
                await page.screenshot({
                    path: testInfo.outputPath(`evidence-${state}-${name}.png`),
                    animations: "disabled",
                });
                await page.getByRole("button", { name: "Close" }).first().click();
                await expect(view.getByTestId("answer-panel")).toBeVisible();
            }
        });
    });
}
