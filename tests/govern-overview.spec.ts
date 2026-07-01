import { expect, test } from "@playwright/test";

// ── Govern Overview hub cards render in test mode (CHAOS-2223) ───────────────
// Security + Compounding Risk previously short-circuited to `undefined` in
// DEV_HEALTH_TEST_MODE (the graphql-direct sources), so these cards could only
// ever render the honest-empty "Not yet connected" tier under Playwright.
// SAMPLE_GOVERN_SECURITY_OVERVIEW / SAMPLE_GOVERN_COMPOUNDING_RISK now flow
// through the real derivation instead (src/lib/areaSignals/govern-sample-data.ts).

test.describe("Govern Overview hub cards (CHAOS-2223)", () => {
    test("Security and Compounding Risk render populated signal values in test mode", async ({
        page,
    }) => {
        await page.goto("/govern", { waitUntil: "domcontentloaded" });
        await expect(page.getByTestId("area-overview")).toBeVisible();

        const card = (id: string) => page.locator(`[data-signal-id="${id}"]`);

        await expect(card("security")).toHaveAttribute("data-state", "high");
        await expect(card("security").getByTestId("area-signal-value")).toHaveText("9");

        await expect(card("risk-compounding")).toHaveAttribute("data-state", "medium");

        // Neither card collapsed into the honest-unavailable tier.
        await expect(card("security")).not.toHaveAttribute("data-state", "unavailable");
        await expect(card("risk-compounding")).not.toHaveAttribute("data-state", "unavailable");
    });
});
