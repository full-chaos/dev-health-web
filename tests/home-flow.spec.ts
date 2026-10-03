import { test, expect } from "@playwright/test";

// FLAKY (CHAOS-2164): under CI-constrained runners the evidence-panel open +
// "Open evidence" click can land before the panel is interactive, leaving
// the URL on /dashboard. Self-heals on retry. Stabilize with clickUntilUrl; do not skip.
test(
    "home loads and navigates to explore via panel",
    {
        annotation: {
            type: "flaky",
            description:
                "CHAOS-2164: pre-hydration evidence-panel/Open-evidence click race under CI load; passes on retry.",
        },
    },
    async ({ page }) => {
        await page.goto("/");
        await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

        await page.waitForFunction(() => {
            return new URL(window.location.href).searchParams.get("f");
        });
        const startFilter = new URL(page.url()).searchParams.get("f");

        // Open the evidence drawer from the top ranked signal: it is the primary-signal hero,
        // and its one action is "Open evidence". The other signals are rows of the table below.
        const primarySignal = page.getByTestId("cockpit-top-change-evidence");
        await expect(primarySignal).toHaveText("Open evidence");
        await primarySignal.click();

        // The drawer opens; its footer link leads to the evidence page. CHAOS-8187: the arrow is an
        // icon before the text, so the link's name is the text only.
        const exploreLink = page
            .getByRole("dialog", { name: "Evidence & Context" })
            .getByRole("link", { name: "Open evidence", exact: true });
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
    // The first opportunity is selected: its title is in the list and in the detail card.
    await expect(
        page.getByTestId("opportunity-list").getByRole("button", { name: /Reduce Review Latency/ }),
    ).toBeVisible();
    await expect(
        page
            .getByTestId("opportunity-detail")
            .getByRole("heading", { name: "Reduce Review Latency" }),
    ).toBeVisible();
});
