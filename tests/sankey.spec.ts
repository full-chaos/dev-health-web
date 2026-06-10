import { test, expect } from "@playwright/test";

test("sankey chart renders and shows tooltip", async ({ page }) => {
    await page.goto("/demo");
    const chart = page.getByTestId("chart-sankey");

    await expect(chart.locator("canvas").first()).toBeVisible();
    await expect(chart.locator("[data-chart-ready='true']")).toBeVisible();
});

// FLAKY (CHAOS-2164): on /demo the quadrant "view flow" link click can land before
// hydration under CI load, leaving the URL on /demo instead of /metrics?tab=flow.
// Self-heals on retry. Stabilize with waitForHydration + clickUntilUrl; do not skip.
test(
    "sankey investigation opens from quadrant panel",
    {
        annotation: {
            type: "flaky",
            description:
                "CHAOS-2164: pre-hydration quadrant->flow link click race under CI load; passes on retry.",
        },
    },
    async ({ page }) => {
        await page.goto("/demo");
        const quadrantPanel = page.getByTestId("quadrant-investigation");

        await quadrantPanel.getByRole("button", { name: "Core" }).click();
        const flowLink = quadrantPanel.getByRole("link", {
            name: /view flow/i,
        });
        await expect(flowLink).toBeVisible();
        await expect(flowLink).toHaveAttribute("href", /\/metrics\?tab=flow/);
        await flowLink.click();

        await expect(page).toHaveURL(/\/metrics\?tab=flow/);
        await expect(page.getByRole("heading", { name: "Monitoring view" })).toBeVisible();
        await expect(page.getByText("Flow monitoring")).toBeVisible();
    },
);
