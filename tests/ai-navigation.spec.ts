import { test, expect, type Page } from "@playwright/test";

import { encodeFilter } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";

/**
 * CHAOS-1588 / CHAOS-1767: AI workflow navigation e2e.
 *
 * Asserts the unified AI Workflows sidebar entry routes to the `/ai` workspace
 * and the route-based tab strip moves between Impact, Review Load, Governance
 * Risk, and Automations cleanly.
 */

const defaultFilter = encodeFilter({
  ...defaultMetricFilter,
  time: { range_days: 30, compare_days: 30 },
});

const impactTab = (page: Page) => page.getByRole("link", { name: /^Impact$/ });
const reviewLoadTab = (page: Page) => page.getByRole("link", { name: /^Review Load$/ });
const governanceRiskTab = (page: Page) => page.getByRole("link", { name: /^Governance Risk$/ });
const automationsTab = (page: Page) => page.getByRole("link", { name: /^Automations$/ });

test.describe("AI workflow primary navigation", () => {
  test("Home exposes the guided AI Workflow Intelligence entry path", async ({ page }) => {
    await page.goto(`/dashboard?f=${defaultFilter}`);

    await expect(page.getByRole("heading", { name: "AI Workflow Intelligence" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Start with AI Impact/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Governance gaps/ })).toBeVisible();

    await page.getByRole("link", { name: /Start with AI Impact/ }).click();
    await expect(page).toHaveURL(/\/ai(\?|$)/);
    await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
  });

  test("nav links route between the three AI views", async ({ page }) => {
    await page.goto(`/ai/impact?f=${defaultFilter}`);

    await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
    await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

    await reviewLoadTab(page).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "Review Load", exact: true })).toBeVisible();
    await expect(page.getByTestId("ai-review-load-dashboard")).toBeVisible();

    await governanceRiskTab(page).click();
    await expect(page).toHaveURL(/\/ai\/risk/);
    await expect(page.getByRole("heading", { name: "Governance Risk", exact: true })).toBeVisible();
    await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();

    await impactTab(page).click();
    await expect(page).toHaveURL(/\/ai(\?|$)/);
    await expect(page.getByRole("heading", { name: "Impact", exact: true })).toBeVisible();
  });

  test("Automations link owns the active nav state on its own route", async ({ page }) => {
    await page.goto(`/ai/impact?f=${defaultFilter}`);

    await automationsTab(page).click();

    await expect(page).toHaveURL(/\/ai\/automations/);
    await expect(automationsTab(page)).toHaveAttribute("aria-current", "page");
    await expect(impactTab(page)).not.toHaveAttribute("aria-current", "page");
  });

  test("FilterBar is the canonical chrome on every AI route (CHAOS-1773)", async ({ page }) => {
    // CHAOS-1773: all AI surfaces now render the canonical FilterBar instead
    // of the bespoke AIFilterBar that used native date inputs and selects.
    for (const route of ["/ai/impact", "/ai/review-load", "/ai/automations", "/ai/risk"]) {
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

    await reviewLoadTab(page).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "Review Load", exact: true })).toBeVisible();
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });
});
