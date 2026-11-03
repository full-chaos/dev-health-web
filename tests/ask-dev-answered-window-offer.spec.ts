import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";
import { e2eOrigin, e2ePorts } from "../ci/e2e-ports.mjs";

const MOCK = e2eOrigin(e2ePorts.mockPort);

/**
 * An answered (degraded) completion forecast that also offers its window: ask-dev's fixture for
 * CHAOS-12725. The window picker used to open over the answer and cover its chart. It now opens on
 * its own only for a clarification; on an answer, the offer sits under it.
 */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/forecast-curve-window-offer.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

const QUESTION = "When will CHAOS finish its backlog?";

/** The test-mode transport plays the served answer as the stream of one asked question. */
async function seed(page: Page) {
    const event = (seq: number, body: Record<string, unknown>) => ({
        schema_version: "context_fabric_investigation_event.v1",
        request_id: "request_e2e_12725",
        seq,
        ...body,
    });
    const stream = [
        {
            events: [
                event(1, {
                    type: "accepted",
                    reserved_result_id: "result_reserved_e2e_12725",
                    started_at: "2026-11-03T12:00:00Z",
                    budget_seconds: 110,
                }),
                event(2, { type: "result", result: answer }),
            ],
        },
    ];
    await page.addInitScript(
        ([key, value]) => {
            if (window.sessionStorage.getItem("ask-dev:test-mode-seeded") === "1") return;
            window.sessionStorage.setItem("ask-dev:test-mode-seeded", "1");
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-stream", JSON.stringify(stream)] as const,
    );
}

/** The answer is drawn, no picker covers it, and its window offer sits under it. */
async function expectOfferUnderAnswer(page: Page, scope: Locator) {
    const figure = scope.locator("figure", { hasText: "Completion forecast" });
    await expect(figure.locator("canvas").first()).toBeVisible({ timeout: 30_000 });
    const offers = scope.getByRole("group", { name: "Answer offers" });
    await expect(offers).toBeVisible();
    await expect(offers).toContainText("Last 30 days");
    await expect(page.getByRole("dialog", { name: /Over what period/u })).toHaveCount(0);
    await expect(page.getByText("Over what period?")).toHaveCount(0);
    return { figure, offers };
}

test.describe("an answer that offers its window shows the offer under it (CHAOS-12725)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    for (const [name, width, height] of [
        ["desktop", 1280, 900],
        ["mobile", 390, 844],
    ] as const) {
        test(`the panel and /dev keep the chart clear and offer the window (${name})`, async ({
            page,
        }, testInfo) => {
            await page.setViewportSize({ width, height });
            await seed(page);
            await page.goto("/dashboard");
            await page.getByRole("button", { name: "Open Ask Dev" }).click();
            const panel = page
                .getByRole("complementary", { name: "Ask Dev" })
                .or(page.getByRole("dialog", { name: "Ask Dev" }));
            const input = panel.getByRole("textbox", { name: "Ask a question" });
            await input.fill(QUESTION);
            await input.press("Enter");
            await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
            await expect(panel.getByTestId("chat-progress")).toHaveCount(0);
            const inPanel = await expectOfferUnderAnswer(page, panel);
            await inPanel.figure.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`chart-panel-${name}.png`) });
            await inPanel.offers.evaluate((node) => node.scrollIntoView({ block: "end" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`window-offer-panel-${name}.png`) });

            await page.getByRole("button", { name: "Open full page" }).click();
            await expect(page).toHaveURL(/\/dev/u);
            const article = page.getByRole("article", { name: "Answer" });
            await expect(article).toBeVisible();
            const onPage = await expectOfferUnderAnswer(page, page.locator("body"));
            await onPage.figure.evaluate((node) => node.scrollIntoView({ block: "center" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`chart-dev-${name}.png`) });
            await onPage.offers.evaluate((node) => node.scrollIntoView({ block: "end" }));
            await page.waitForTimeout(900);
            await page.screenshot({ path: testInfo.outputPath(`window-offer-dev-${name}.png`) });

            // The offer still reaches the picker, on demand.
            await onPage.offers.getByRole("button", { name: "Change period" }).click();
            await expect(page.getByText("Over what period?")).toBeVisible();
            await expect(page.getByText("Last 90 days")).toBeVisible();
            await page.screenshot({ path: testInfo.outputPath(`window-picker-dev-${name}.png`) });
        });
    }
});
