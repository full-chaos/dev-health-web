import { test, expect, type Page } from "@playwright/test";

import { encodeAIFilterParam } from "../src/lib/filters/ai";
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

const defaultFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
});

// PrimaryNav links carry the label + description in their accessible name
// (e.g. "Review Load Pressure"), so a `/^Review Load$/` regex misses them
// and `/^Risk/` also matches the TestOps "Risk Confidence" entry. Target the
// AI sidebar links by their href to stay unambiguous.
const aiImpactLink = (page: Page) =>
  page.locator('a[href^="/ai/impact"]').first();
const aiReviewLoadLink = (page: Page) =>
  page.locator('a[href^="/ai/review-load"]').first();
const aiRiskLink = (page: Page) =>
  page.locator('a[href^="/ai/risk"]').first();
const aiAutomationsLink = (page: Page) =>
  page.locator('a[href^="/ai/automations"]').first();


test.describe("AI workflow primary navigation", () => {
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

  test("AIFilterBar updates stay on the current AI route", async ({ page }) => {
    // Regression: AIFilterBar previously hardcoded /ai/impact, so changing
    // the date range on /ai/risk redirected back to /ai/impact. CHAOS-1588
    // fix routes the update through usePathname().
    await page.goto(`/ai/risk?f=${defaultFilter}`);
    await expect(page.getByTestId("ai-filter-bar")).toBeVisible();

    await page.getByLabel("Start").fill("2026-05-01");

    await expect(page).toHaveURL(/\/ai\/risk\?f=/);
    await expect(page).not.toHaveURL(/\/ai\/impact/);
    await expect(page.getByRole("heading", { name: "AI Risk" })).toBeVisible();
  });

  test("filter encoding round-trips across navigation", async ({ page }) => {
    const customFilter = encodeAIFilterParam({
      startDate: "2026-03-01",
      endDate: "2026-04-01",
      teamId: "team-platform",
    });

    await page.goto(`/ai/impact?f=${customFilter}`);
    await expect(page.getByLabel("Start")).toHaveValue("2026-03-01");
    await expect(page.getByLabel("End")).toHaveValue("2026-04-01");

    await ensureGroupExpanded(page, "Spot Pressure Early");
    await aiReviewLoadLink(page).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "AI Review Load" })).toBeVisible();
  });
});
