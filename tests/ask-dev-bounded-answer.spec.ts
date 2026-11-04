import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

/**
 * CHAOS-12643: ACR's bounded answer (`context_fabric_answer_projection.v1`) in web's real Ask Dev
 * panel and on `/dev`, drawn by the ask-dev render as the shortened answer, never as a failure.
 * The stream is the test-mode transport's script (session storage); the projections are ACR's
 * real projector output (`tests/fixtures/ask-dev/bounded-answers/`). Nothing is fetched from ACR.
 */
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;
const BOUNDED = join(process.cwd(), "tests/fixtures/ask-dev/bounded-answers");
const STREAM_KEY = "ask-dev:test-mode-stream";
const QUESTION = "Which teams are struggling right now, and why?";

const projection = (name: string) =>
    JSON.parse(readFileSync(join(BOUNDED, `${name}.json`), "utf8")) as Record<string, unknown>;
const FIXTURES = {
    answer: projection("bounded-answer"),
    rows: projection("bounded-partial-table"),
} as const;

const event = (seq: number, body: Record<string, unknown>) => ({
    schema_version: "context_fabric_investigation_event.v1",
    request_id: "request_e2e",
    seq,
    ...body,
});
const run = (result: Record<string, unknown>) => ({
    events: [
        event(1, {
            type: "accepted",
            reserved_result_id: "result_reserved_e2e_0001",
            started_at: "2026-10-31T12:00:00Z",
            budget_seconds: 110,
        }),
        event(2, { type: "result", result }),
    ],
});

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

async function seed(page: Page, result: Record<string, unknown>): Promise<void> {
    await page.addInitScript(
        ([key, value]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(key, value);
        },
        [STREAM_KEY, JSON.stringify([run(result)])] as const,
    );
}

async function ask(input: Locator): Promise<Locator> {
    await expect(input).toBeEnabled();
    await input.fill(QUESTION);
    await input.press("Enter");
    return input;
}

/** The capture starts at the shortened answer's first line (the transcript scrolls to the end). */
const showFromTheTop = (view: Locator) =>
    view.evaluate((node) => node.scrollIntoView({ block: "start" }));

const scrollsSideways = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
const pageOverflow = (page: Page) =>
    page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
const fitsItsWidth = (scope: Locator) =>
    scope.evaluate((node) => node.scrollWidth <= node.clientWidth);

async function expectBounded(scope: Locator, fixture: keyof typeof FIXTURES): Promise<Locator> {
    const view = scope.getByRole("region", { name: "Shortened answer" });
    await expect(view).toBeVisible();
    await expect(view.getByRole("note")).toContainText("This answer was shortened to fit");
    await expect(
        view.getByText(String(FIXTURES[fixture].direct_judgment).trim()).first(),
    ).toBeVisible();
    if (fixture === "rows") {
        // A date from the kept rows, drawn by the row panel.
        await expect(view.getByText(/2026-08-25/u).first()).toBeVisible();
    }
    return view;
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

for (const [name, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["phone", { width: 390, height: 844 }],
] as const) {
    test.describe(`${name} (${viewport.width}px)`, () => {
        test.use({ viewport });

        for (const fixture of ["answer", "rows"] as const) {
            test(`the panel draws ACR's bounded answer (${fixture})`, async ({
                page,
            }, testInfo) => {
                await seed(page, FIXTURES[fixture]);
                await page.goto("/dashboard");
                // The page behind may overflow on its own; the panel must add nothing to it.
                const before = await pageOverflow(page);
                await page.getByRole("button", { name: "Open Ask Dev" }).click();
                // A side panel on desktop; a sheet (a dialog) on a phone.
                const panel = page.getByRole(name === "phone" ? "dialog" : "complementary", {
                    name: "Ask Dev",
                });
                const input = await ask(panel.getByRole("textbox", { name: "Ask a question" }));
                const view = await expectBounded(panel, fixture);
                // An answer, so the composer clears, as for a whole answer.
                await expect(input).toHaveValue("");
                await expect(panel.getByText(/could not|not answered/iu)).toHaveCount(0);
                expect(await pageOverflow(page)).toBeLessThanOrEqual(before);
                expect(await fitsItsWidth(panel)).toBe(true);
                expect(await fitsItsWidth(view)).toBe(true);
                await showFromTheTop(view);
                await page.screenshot({
                    path: testInfo.outputPath(`bounded-panel-${fixture}-${name}.png`),
                });
                await panel.screenshot({
                    path: testInfo.outputPath(`bounded-panel-${fixture}-${name}-panel.png`),
                });
            });

            test(`/dev draws ACR's bounded answer (${fixture})`, async ({ page }, testInfo) => {
                await seed(page, FIXTURES[fixture]);
                await page.goto("/dev");
                const input = await ask(page.getByRole("textbox", { name: "Ask a question" }));
                const conversation = page.getByTestId("ask-dev-page-conversation");
                const view = await expectBounded(conversation, fixture);
                await expect(input).toHaveValue("");
                expect(await scrollsSideways(page)).toBe(false);
                await showFromTheTop(view);
                await page.screenshot({
                    path: testInfo.outputPath(`bounded-dev-${fixture}-${name}.png`),
                });
            });
        }
    });
}
