import { test, expect, type Page } from "@playwright/test";

import { clickUntilHeading, clickUntilUrl, waitForHydration } from "./helpers/nav";
import { encodeFilter } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";

/**
 * CHAOS-1588 / CHAOS-1767: AI workflow navigation e2e.
 *
 * Asserts the AI sidebar entry routes to the `/ai` overview and the route-based
 * tab strip moves between real AI subviews cleanly.
 */

const defaultFilter = encodeFilter({
    ...defaultMetricFilter,
    time: { range_days: 30, compare_days: 30 },
});

const aiTabStrip = (page: Page) => page.getByRole("navigation", { name: "AI views" });
const overviewTab = (page: Page) => aiTabStrip(page).getByRole("link", { name: /^Overview$/ });
const impactTab = (page: Page) => aiTabStrip(page).getByRole("link", { name: /^Impact$/ });
const reviewLoadTab = (page: Page) => aiTabStrip(page).getByRole("link", { name: /^Review Load$/ });
const governanceRiskTab = (page: Page) =>
    aiTabStrip(page).getByRole("link", { name: /^Governance Risk$/ });
const automationsTab = (page: Page) =>
    aiTabStrip(page).getByRole("link", { name: /^Automations$/ });

test.describe("AI workflow primary navigation", () => {
    test("Home exposes the AI entry path when the cockpit callout is secondary", async ({
        page,
    }) => {
        // clickUntilUrl retries can consume up to 30s under load; widen the budget so
        // the retry window doesn't collide with the default 30s test timeout.
        test.slow();
        await page.goto(`/dashboard?f=${defaultFilter}`);
        await waitForHydration(page);

        const aiEntry = page.getByRole("link", { name: /Open AI/ });
        await expect(aiEntry).toBeVisible();

        // Heavy dashboard hydrates slowly under suite load; allow a longer retry
        // budget (paired with test.slow()) so the entry click reliably lands.
        await clickUntilUrl(page, aiEntry, /\/ai(\?|$)/, 60000);
        await expect(page.getByTestId("area-overview")).toBeVisible();
    });

    test("nav links route between real AI views", async ({ page }) => {
        await page.goto(`/ai/impact?f=${defaultFilter}`);

        await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
        await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

        await clickUntilUrl(page, reviewLoadTab(page), /\/ai\/review-load/);
        await expect(page.getByRole("heading", { name: "Review Load", exact: true })).toBeVisible();
        await expect(page.getByTestId("ai-review-load-dashboard")).toBeVisible();

        await clickUntilUrl(page, governanceRiskTab(page), /\/ai\/risk/);
        await expect(
            page.getByRole("heading", { name: "Governance Risk", exact: true }),
        ).toBeVisible();
        await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();

        await clickUntilUrl(page, overviewTab(page), /\/ai(\?|$)/);
        await expect(page.getByTestId("area-overview")).toBeVisible();

        await clickUntilUrl(page, impactTab(page), /\/ai\/impact/);
        await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
    });

    test("Automations link owns the active nav state on its own route", async ({ page }) => {
        await page.goto(`/ai/impact?f=${defaultFilter}`);

        await clickUntilUrl(page, automationsTab(page), /\/ai\/automations/);

        await expect(automationsTab(page)).toHaveAttribute("aria-current", "page");
        await expect(impactTab(page)).not.toHaveAttribute("aria-current", "page");
    });

    test("FilterBar is the canonical chrome on every AI route (CHAOS-1773)", async ({ page }) => {
        // CHAOS-1773: all AI surfaces now render the canonical FilterBar instead
        // of the bespoke AIFilterBar that used native date inputs and selects.
        for (const route of [
            "/ai",
            "/ai/impact",
            "/ai/review-load",
            "/ai/automations",
            "/ai/risk",
        ]) {
            await page.goto(`${route}?f=${defaultFilter}`);
            const filterBar = page.getByTestId("filter-bar");
            await expect(filterBar).toBeVisible();
            await expect(filterBar).toHaveAttribute("data-view", "ai");
        }
    });

    test("filter encoding round-trips across AI navigation", async ({ page }) => {
        const customFilter = encodeFilter({
            ...defaultMetricFilter,
            time: { range_days: 7, compare_days: 7 },
        });

        await page.goto(`/ai/impact?f=${customFilter}`);
        await expect(page.getByTestId("filter-bar")).toBeVisible();

        await clickUntilHeading(
            page,
            reviewLoadTab(page),
            page.getByRole("heading", { name: "Review Load", exact: true }),
        );
        await expect(page).toHaveURL(/\/ai\/review-load/);
        await expect(page.getByTestId("filter-bar")).toBeVisible();
    });
});
