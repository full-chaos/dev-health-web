import type { Page } from "@playwright/test";

/**
 * CHAOS-1760: PrimaryNav default-collapses groups other than Cockpit and the
 * active-route group. E2E tests that click cross-group nav links (or iterate
 * across many routes) must ensure the destination group is expanded first,
 * otherwise the link sits inside `max-h-0 opacity-0` and `locator.click`
 * times out.
 */

/** Expand a specific group by its label (no-op when already expanded). */
export async function ensureGroupExpanded(page: Page, label: string) {
  const button = page.getByRole("button", { name: label, exact: true });
  const chevron = button.locator("svg").first();
  const cls = (await chevron.getAttribute("class")) ?? "";
  if (cls.includes("-rotate-90")) {
    await button.click();
    // Wait for the max-h / opacity transition (300ms in CSS).
    await page.waitForTimeout(350);
  }
}

/**
 * Expand every collapsed group in the sidebar so every nav link is
 * clickable. Useful for tests that iterate across routes without caring
 * about IA mechanics. No-op for already-expanded groups.
 */
export async function expandAllSidebarGroups(page: Page) {
  // Group toggle buttons live inside `aside nav` and carry a chevron `<svg>`.
  // Collapsed groups have the chevron rotated via `-rotate-90`.
  const collapsedButtons = page.locator(
    'aside nav button:has(svg.-rotate-90)'
  );
  // Snapshot the count up-front; clicks rerender React and re-issue locators.
  const count = await collapsedButtons.count();
  for (let i = 0; i < count; i++) {
    // Always click the first remaining collapsed button — the list shrinks
    // as each click expands a group.
    const remaining = page.locator('aside nav button:has(svg.-rotate-90)');
    const stillCollapsed = await remaining.count();
    if (stillCollapsed === 0) break;
    await remaining.first().click();
    await page.waitForTimeout(50); // brief settle between clicks
  }
  await page.waitForTimeout(350); // final transition settle
}
