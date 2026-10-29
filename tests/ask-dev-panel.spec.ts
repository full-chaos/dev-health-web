import { readFileSync } from "node:fs";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

// CHAOS-11927 (plan 2.5): the Ask Dev panel is a non-modal right region from `md` up and a modal
// full-height sheet below it; one right drawer at a time; Escape closes it and focus returns to
// the launcher that is visible. Axe runs in the real browser (layout, contrast).
const MOCK = "http://127.0.0.1:8001";

test.describe.configure({ mode: "serial" });

async function setScenario(request: APIRequestContext, scenario: string): Promise<void> {
    const response = await request.post(`${MOCK}/__test/entitlements`, { data: { scenario } });
    expect(response.ok()).toBe(true);
}

function askDevRequests(page: Page): string[] {
    const urls: string[] = [];
    page.on("request", (request) => {
        if (/\/api\/ask-dev|\/api\/v1\/dev|context-fabric\/investigations/u.test(request.url())) {
            urls.push(request.url());
        }
    });
    return urls;
}

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    // The page CSP blocks an injected script tag; a CDP evaluate is not a script load.
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

test.beforeEach(async ({ request }) => {
    await setScenario(request, "provisioned");
});

test.afterEach(async ({ request }) => {
    await setScenario(request, "unprovisioned");
});

test.describe("desktop (1280px)", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("opens a non-modal right region, closes with Escape and returns focus", async ({
        page,
    }, testInfo) => {
        const requests = askDevRequests(page);
        await page.goto("/dashboard");
        const launcher = page.getByRole("button", { name: "Open Ask Dev" });
        await launcher.click();

        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel).toBeVisible();
        await expect(panel).toBeFocused();
        // Non-modal: the page behind is still reachable.
        await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
        await expect(page.getByTestId("drawer-backdrop")).toHaveCount(0);
        await page.screenshot({ path: testInfo.outputPath("panel-desktop-open.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        await page.keyboard.press("Escape");

        await expect(panel).toHaveCount(0);
        await expect(launcher).toBeFocused();
        expect(requests).toEqual([]);
    });

    test("is the only right drawer: opening the filter drawer closes Ask Dev", async ({
        page,
    }) => {
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        await expect(page.getByRole("complementary", { name: "Ask Dev" })).toBeVisible();

        // The panel is non-modal, so the page behind it is still operable.
        await page.getByRole("button", { name: "Filters" }).click();

        await expect(page.locator("#scope-bar-filters")).toBeVisible();
        await expect(page.getByRole("complementary", { name: "Ask Dev" })).toHaveCount(0);
    });
});

test.describe("mobile (390px)", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("opens a modal full-height sheet, closes with Escape and returns focus", async ({
        page,
    }, testInfo) => {
        const requests = askDevRequests(page);
        await page.goto("/dashboard");
        const launcher = page.getByRole("button", { name: "Open Ask Dev" });
        await launcher.click();

        const sheet = page.getByRole("dialog", { name: "Ask Dev" });
        await expect(sheet).toBeVisible();
        await expect(sheet).toHaveAttribute("aria-modal", "true");
        await page.screenshot({ path: testInfo.outputPath("panel-mobile-open.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-sheet]")).toEqual([]);
        // Tab stays inside the sheet.
        for (let i = 0; i < 4; i += 1) await page.keyboard.press("Tab");
        expect(await sheet.evaluate((node) => node.contains(document.activeElement))).toBe(true);

        await page.keyboard.press("Escape");

        await expect(sheet).toHaveCount(0);
        await expect(launcher).toBeFocused();
        expect(requests).toEqual([]);
    });
});
