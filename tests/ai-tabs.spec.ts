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
        // The AI destinations are the sidebar children of the AI area; there is no
        // area tab strip.
        await expect(page.getByRole("navigation", { name: "AI views" })).toHaveCount(0);
        const aiChildren = page.getByTestId("nav-children-ai");
        await expect(aiChildren.getByRole("link", { name: /^Overview$/ })).toHaveAttribute(
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

    test("preview-only AI routes are hidden from the AI sidebar children", async ({ page }) => {
        await page.goto("/ai");
        const aiChildren = page.getByTestId("nav-children-ai");
        await expect(aiChildren.getByRole("link")).toHaveCount(5);

        // CHAOS-2197: Test Gaps + Evidence are tabs inside Governance Risk now,
        // so Attribution is the only remaining preview route kept off the list.
        for (const hidden of ["Attribution", "Test Gaps", "Evidence"]) {
            await expect(aiChildren.getByRole("link", { name: hidden })).toHaveCount(0);
        }
    });

    test("the Attribution route claims no false active destination (CHAOS-2200)", async ({
        page,
    }) => {
        await page.goto("/ai/attribution");

        // CHAOS-2744 wired this route to the live aiAttributionOverview
        // resolver -- it's no longer the static preview stub, so the old
        // preview marker no longer renders here by design. It still isn't one
        // of the canonical AI destinations, though, so the sidebar must not
        // claim a false active child for it.
        await expect(page.getByRole("heading", { name: "Attribution" })).toBeVisible();
        const aiChildren = page.getByTestId("nav-children-ai");
        await expect(aiChildren.locator('a[aria-current="page"]')).toHaveCount(0);
    });
});
