import { test, expect } from "@playwright/test";

import { encodeAIFilterParam } from "../src/lib/filters/ai";

/**
 * CHAOS-1588: AI workflow navigation e2e.
 *
 * Asserts the PrimaryNav AI group routes between Impact, Review Load, and Risk
 * cleanly, that each page mounts the correct dashboard, and that AIFilterBar
 * lives on the current pathname rather than redirecting back to /ai/impact.
 */

const defaultFilter = encodeAIFilterParam({
  startDate: "2026-04-20",
  endDate: "2026-05-19",
});

test.describe("AI workflow primary navigation", () => {
  test("nav links route between the three AI views", async ({ page }) => {
    await page.goto(`/ai/impact?f=${defaultFilter}`);

    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
    await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

    await page.getByRole("link", { name: /^Review Load$/i }).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "AI Review Load" })).toBeVisible();
    await expect(page.getByTestId("ai-review-load-dashboard")).toBeVisible();

    await page.getByRole("link", { name: /^Risk$/i }).click();
    await expect(page).toHaveURL(/\/ai\/risk/);
    await expect(page.getByRole("heading", { name: "AI Risk" })).toBeVisible();
    await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();

    await page.getByRole("link", { name: /^Impact$/i }).click();
    await expect(page).toHaveURL(/\/ai\/impact/);
    await expect(page.getByRole("heading", { name: "AI Impact" })).toBeVisible();
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

    await page.getByRole("link", { name: /^Review Load$/i }).click();
    await expect(page).toHaveURL(/\/ai\/review-load/);
    await expect(page.getByRole("heading", { name: "AI Review Load" })).toBeVisible();
  });
});
