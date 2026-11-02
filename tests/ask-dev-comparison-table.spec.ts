import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Locator, type Page } from "@playwright/test";

const MOCK = "http://127.0.0.1:8001";

/** ask-dev's fixture: a real served comparison, with the claims and the table added by hand. */
const answer = JSON.parse(
    readFileSync(
        join(
            process.cwd(),
            "node_modules/@full-chaos/ask-dev/src/test/fixtures/served-shapes/comparison-table.json",
        ),
        "utf8",
    ),
) as Record<string, unknown>;

async function axeViolations(page: Page, selector: string): Promise<string[]> {
    await page.evaluate(readFileSync(require.resolve("axe-core/axe.min.js"), "utf8"));
    return page.evaluate(async (target) => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        const node = document.querySelector(target);
        if (!node) return ["target not found"];
        const result = await axe.run(node);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`);
    }, selector);
}

async function seed(page: Page) {
    await page.addInitScript(
        ([key, value]) => {
            window.sessionStorage.setItem(key, value);
        },
        ["ask-dev:test-mode-answer", JSON.stringify(answer)] as const,
    );
}

async function liesInside(inner: Locator, outer: Locator) {
    const [a, b] = await Promise.all([inner.boundingBox(), outer.boundingBox()]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.x).toBeGreaterThanOrEqual(b!.x - 0.5);
    expect(a!.x + a!.width).toBeLessThanOrEqual(b!.x + b!.width + 0.5);
}

async function expectTable(scope: Locator) {
    const table = scope.getByTestId("comparison-table");
    await expect(table).toBeVisible({ timeout: 30_000 });
    await expect(scope.getByTestId("comparison-table-withheld")).toHaveCount(0);
    await expect(scope.getByTestId("render-shapes-not-drawn")).toHaveCount(0);
    const rows = table.getByRole("row");
    await expect(rows.nth(1).getByRole("cell").first()).toHaveText("1.95");
    await expect(rows.nth(3).getByRole("cell").nth(1)).toHaveText("—");
    return table;
}

test.describe("a served comparison draws in web (CHAOS-12546)", () => {
    test.beforeEach(async ({ request }) => {
        await request.post(`${MOCK}/__test/entitlements`, { data: { scenario: "provisioned" } });
    });

    test("the panel and /dev show every side, with no host chart", async ({ page }, testInfo) => {
        await page.setViewportSize({ width: 1280, height: 900 });
        await seed(page);
        await page.goto("/dashboard");
        await page.getByRole("button", { name: "Open Ask Dev" }).click();
        const panel = page.getByRole("complementary", { name: "Ask Dev" });
        await expect(panel.getByRole("article", { name: "Answer" })).toBeVisible();
        const inPanel = await expectTable(panel);
        await inPanel.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await liesInside(
            inPanel.getByRole("row").nth(1).getByRole("cell").first(),
            inPanel.locator(".fact-table-wrap").first(),
        );
        await page.screenshot({ path: testInfo.outputPath("comparison-panel.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-panel]")).toEqual([]);

        await page.getByRole("button", { name: "Open full page" }).click();
        await expect(page).toHaveURL(/\/dev/u);
        const article = page.getByRole("article", { name: "Answer" });
        await expect(article).toBeVisible();
        const onPage = await expectTable(article);
        await onPage.evaluate((node) => node.scrollIntoView({ block: "center" }));
        await onPage.getByText("Exact values").click();
        await expect(
            onPage.getByTestId("comparison-table-exact").getByRole("row").nth(1),
        ).toContainText("1.9530555555555558");
        await page.screenshot({ path: testInfo.outputPath("comparison-dev.png") });
        expect(await axeViolations(page, "[data-testid=ask-dev-page]")).toEqual([]);
    });
});
