import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Wait for client hydration. The app appends an `?f=` filter param to the URL once
 * client JS runs, so its presence is a reliable "the page is interactive" signal.
 * Clicking a Next.js <Link> before hydration (handler attached) can be swallowed,
 * leaving the URL unchanged — especially on the chart-heavy dashboard under CI load.
 */
export async function waitForHydration(page: Page, timeout = 15000) {
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("f"), {
    timeout,
  });
}

/**
 * Click a link/tab and retry until the navigation actually lands. Under CI's
 * resource-constrained runners the heavy pages can swallow the first click (SPA
 * handler not yet attached / mid re-render), leaving the URL unchanged. Retrying the
 * whole click+assert is the robust fix for these lost clicks.
 */
export async function clickUntilUrl(
  page: Page,
  locator: Locator,
  urlPattern: RegExp,
  timeout = 30000,
) {
  await expect(async () => {
    await locator.click();
    await expect(page).toHaveURL(urlPattern, { timeout: 3000 });
  }).toPass({ timeout, intervals: [300, 700, 1500] });
}

/**
 * Click a tab/link and retry until the expected heading is visible. Used where the
 * destination is identified by its rendered <h1> rather than a URL change.
 */
export async function clickUntilHeading(page: Page, locator: Locator, heading: Locator) {
  await expect(async () => {
    await locator.click();
    await expect(heading).toBeVisible({ timeout: 3000 });
  }).toPass({ timeout: 30000, intervals: [300, 700, 1500] });
}
