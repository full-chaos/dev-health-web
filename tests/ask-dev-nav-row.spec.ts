import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";

// CHAOS-12210, chris's ruling (2026-10-31): "For now put Ask Dev after AI". The left-nav row "Ask
// Dev" sits right after AI and opens the full page /dev; it is listed only where Ask Dev is on
// (scenario `provisioned`: `ask_dev` and `agent_context_runtime`).
const MOCK = `http://127.0.0.1:${process.env.PLAYWRIGHT_MOCK_PORT ?? "8001"}`;

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

const primaryRows = (page: Page) =>
    page.getByRole("navigation", { name: "Primary areas" }).getByRole("link");

/**
 * Clicks until `isDone` holds: a click before the shell hydrates is lost on a slow runner. Never
 * clicks again once `isDone` is true, so a late first click is not undone by a second.
 */
async function clickUntil(target: Locator, isDone: () => Promise<boolean>) {
    await expect(async () => {
        if (!(await isDone())) await target.click({ timeout: 3000 });
        expect(await isDone()).toBe(true);
    }).toPass({ timeout: 30000, intervals: [300, 700, 1500] });
}

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test("Ask Dev is the row right after AI and opens /dev as the current page", async ({
        page,
        request,
    }, testInfo) => {
        await setScenario(request, "provisioned");
        await page.goto("/dashboard");
        const labels = (await primaryRows(page).allTextContents()).map((label) => label.trim());
        expect(labels[labels.indexOf("AI") + 1]).toBe("Ask Dev");
        await page
            .getByRole("navigation", { name: "Primary areas" })
            .screenshot({ path: testInfo.outputPath("nav-ask-dev-desktop.png") });

        const row = page.getByRole("link", { name: "Ask Dev" });
        await clickUntil(row, async () => new URL(page.url()).pathname === "/dev");
        await expect(row).toHaveAttribute("aria-current", "page");
        await page.screenshot({ path: testInfo.outputPath("nav-ask-dev-current-desktop.png") });
    });

    test("no Ask Dev row where Ask Dev is off", async ({ page, request }) => {
        await setScenario(request, "ask-dev-off");
        await page.goto("/dashboard");
        await expect(primaryRows(page).filter({ hasText: "AI" }).first()).toBeVisible();
        await expect(page.getByRole("link", { name: "Ask Dev" })).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("the slide-over lists Ask Dev after AI", async ({ page, request }, testInfo) => {
        await setScenario(request, "provisioned");
        await page.goto("/dashboard");
        const nav = page.getByRole("navigation", { name: "Primary areas" });
        await clickUntil(page.getByRole("button", { name: "Show navigation" }), () =>
            nav.isVisible(),
        );
        const labels = (await primaryRows(page).allTextContents()).map((label) => label.trim());
        expect(labels[labels.indexOf("AI") + 1]).toBe("Ask Dev");
        await page.screenshot({ path: testInfo.outputPath("nav-ask-dev-mobile.png") });
    });
});
