import { test, expect, type Page } from "@playwright/test";

import { encodeFilter } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { ensureGroupExpanded } from "./helpers/sidebar";

/**
 * CHAOS-1588 / CHAOS-1767: AI workflow navigation e2e.
 *
 * Asserts the PrimaryNav AI links route between Impact, Review Load, Risk,
 * and Automations cleanly. After CHAOS-1760 the sidebar IA distributes AI
 * items across three collapsible groups (See Where Time Goes / Spot Pressure
 * Early / Improve Delivery Confidence). Only the active-route group expands
 * by default, so cross-group navigation must first expand the destination
 * group — same as real user behavior.
 */

const defaultFilter = encodeFilter({
  ...defaultMetricFilter,
  time: { range_days: 30, compare_days: 30 },
});

// PrimaryNav links carry the label + description in their accessible name
// (e.g. "Review Load Pressure"), so a `/^Review Load$/` regex misses them
// and `/^Risk/` also matches the TestOps "Risk Confidence" entry. Target the
// AI sidebar links by their href to stay unambiguous.
const aiImpactLink = (page: Page) => page.locator('a[href^="/ai/impact"]').first();
const aiReviewLoadLink = (page: Page) => page.locator('a[href^="/ai/review-load"]').first();
const aiRiskLink = (page: Page) => page.locator('a[href^="/ai/risk"]').first();
const aiAutomationsLink = (page: Page) => page.locator('a[href^="/ai/automations"]').first();

test.describe("AI workflow primary navigation", () => {
  test("Home exposes the guided AI Workflow Intelligence entry path", async ({ page }) => {
    await page.goto(`/dashboard?f=${defaultFilter}`);

    await expect(page.getByRole("heading", { name: "AI Workflow Intelligence" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Start with AI Impact/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Governance gaps/ })).toBeVisible();

    await page.getByRole("link", { name: /Start with AI Impact/ }).click();
    await expect(page).toHaveURL(/\/ai\/impact/);
    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
  });

  test("nav links route between the three AI views", async ({ page }) => {
    await page.goto(`/ai/impact?f=${defaultFilter}`);

    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
    await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

    await ensureGroupExpanded(page, "Spot Pressure Early");
    await aiReviewLoadLink(page).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "AI Review Load" })).toBeVisible();
    await expect(page.getByTestId("ai-review-load-dashboard")).toBeVisible();

    await ensureGroupExpanded(page, "Improve Delivery Confidence");
    await aiRiskLink(page).click();
    await expect(page).toHaveURL(/\/ai\/risk/);
    await expect(page.getByRole("heading", { name: "AI Risk" })).toBeVisible();
    await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();

    await ensureGroupExpanded(page, "See Where Time Goes");
    await aiImpactLink(page).click();
    await expect(page).toHaveURL(/\/ai\/impact/);
    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
  });

  test("Automations link owns the active nav state on its own route", async ({ page }) => {
    await page.goto(`/ai/impact?f=${defaultFilter}`);

    await ensureGroupExpanded(page, "Spot Pressure Early");
    await aiAutomationsLink(page).click();

    await expect(page).toHaveURL(/\/ai\/automations/);
    await expect(aiAutomationsLink(page)).toHaveAttribute("aria-current", "page");
    await expect(aiImpactLink(page)).not.toHaveAttribute("aria-current", "page");
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

    await ensureGroupExpanded(page, "Spot Pressure Early");
    await aiReviewLoadLink(page).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "AI Review Load" })).toBeVisible();
    await expect(page.getByTestId("filter-bar")).toBeVisible();
  });
});
