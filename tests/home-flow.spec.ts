import { test, expect } from "@playwright/test";

// FLAKY (CHAOS-2164): under CI-constrained runners the evidence-panel open +
// "Open in Explore View" click can land before the panel is interactive, leaving
// the URL on /dashboard. Self-heals on retry. Stabilize with clickUntilUrl; do not skip.
test(
    "home loads and navigates to explore via panel",
    {
        annotation: {
            type: "flaky",
            description:
                "CHAOS-2164: pre-hydration evidence-panel/Explore-link click race under CI load; passes on retry.",
        },
    },
    async ({ page }) => {
        await page.goto("/");
        await expect(
            page.getByRole("heading", { name: "Developer Health Ops Cockpit" }),
        ).toBeVisible();

        await page.waitForFunction(() => {
            return new URL(window.location.href).searchParams.get("f");
        });
        const startFilter = new URL(page.url()).searchParams.get("f");

        // Open the evidence panel from the top ranked signal
        const firstSignal = page.getByTestId("signal-open-evidence").first();
        await firstSignal.click();

        // Panel should open with evidence - look for the "Open in Explore View" link
        const exploreLink = page.getByRole("link", {
            name: "Open in Explore View ↗",
        });
        await expect(exploreLink).toBeVisible();
        await exploreLink.click();

        // Should navigate to explore with filters preserved
        await expect(page).toHaveURL(/\/explore\?metric=.*&f=/);
        const nextFilter = new URL(page.url()).searchParams.get("f");
        expect(nextFilter).toBe(startFilter);
    },
);

test("opportunities page renders", async ({ page }) => {
    await page.goto("/opportunities");
    await expect(page.getByRole("heading", { name: "Opportunities", level: 1 })).toBeVisible();
    await expect(page.getByText("Reduce Review Latency")).toBeVisible();
});
