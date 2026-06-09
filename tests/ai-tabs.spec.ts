import { expect, test } from "@playwright/test";

const aiTabs = [
    { name: "Impact", path: "/ai/impact" },
    { name: "Review Load", path: "/ai/review-load" },
    { name: "Governance Risk", path: "/ai/risk" },
    { name: "Automations", path: "/ai/automations" },
] as const;

test.describe("AI views", () => {
    test("/ai renders the AI overview", async ({ page }) => {
        await page.goto("/ai");

        await expect(page).toHaveURL(/\/ai(?:[?#].*)?$/);
        await expect(page.getByRole("heading", { level: 1, name: "AI" })).toBeVisible();
        await expect(page.getByTestId("area-overview")).toBeVisible();
        const tabStrip = page.getByRole("navigation", { name: "AI views" });
        await expect(tabStrip.getByRole("link", { name: /^Overview$/ })).toHaveAttribute(
            "aria-current",
            "page",
        );
    });

    test("each visible AI tab renders a distinct heading and distinct content", async ({
        page,
    }) => {
        const rendered = new Map<string, string>();

        for (const tab of aiTabs) {
            await page.goto(tab.path);
            await expect(page.getByRole("heading", { level: 2, name: tab.name })).toBeVisible();
            const mainText = await page.locator("main").innerText();
            expect(mainText, `${tab.name} should include its heading`).toContain(tab.name);
            rendered.set(tab.name, mainText.replace(/\s+/g, " ").trim());
        }

        expect(new Set(rendered.values()).size).toBe(rendered.size);
    });

    test("preview-only AI routes are hidden from the tab strip", async ({ page }) => {
        await page.goto("/ai");
        const tabStrip = page.getByRole("navigation", { name: "AI views" });

        // CHAOS-2197: Test Gaps + Evidence are tabs inside Governance Risk now,
        // so Attribution is the only remaining preview route kept off the strip.
        for (const hiddenTab of ["Attribution", "Test Gaps", "Evidence"]) {
            await expect(tabStrip.getByRole("link", { name: hiddenTab })).toHaveCount(0);
        }
    });

    test("the preview Attribution route claims no false active tab (CHAOS-2200)", async ({
        page,
    }) => {
        await page.goto("/ai/attribution");

        // The preview marker carries its copy as a tooltip (title attr), not text.
        await expect(page.getByTitle("This feature is in preview.")).toBeVisible();
        const tabStrip = page.getByRole("navigation", { name: "AI views" });
        await expect(tabStrip.locator('a[aria-current="page"]')).toHaveCount(0);
    });
});
