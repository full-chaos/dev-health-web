import { test, expect, Page } from "@playwright/test";

import { decodeFilter } from "../src/lib/filters/encode";
import { expandAllSidebarGroups } from "./helpers/sidebar";
import { clickUntilUrl } from "./helpers/nav";

const getFilterParam = (url: string) => new URL(url).searchParams.get("f");

const waitForFilterParam = async (page: Page) => {
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("f"), {
    timeout: 10000,
  });
  const value = getFilterParam(page.url());
  expect(value).toBeTruthy();
  return value as string;
};

const updateDeveloperFilter = async (page: Page, value: string, previous: string) => {
  // Click "Filters" button to expand the advanced filters panel. Anchor the
  // name so it targets only the advanced toggle, not the adjacent "Reset
  // filters" CTA (CHAOS-2058 registry label) under substring matching.
  await expect(page.getByRole("button", { name: /^Filters$/ })).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: /^Filters$/ }).click();
  await page.locator("summary", { hasText: "Who" }).click();
  await page.getByPlaceholder("alice, bob").fill(value);
  await page.waitForFunction(
    (prev) => {
      const current = new URL(window.location.href).searchParams.get("f");
      return Boolean(current && current !== prev);
    },
    previous,
    { timeout: 10000 },
  );
  const nextValue = getFilterParam(page.url());
  expect(nextValue).toBeTruthy();

  // Click "Filters" again to collapse the panel (toggle behavior)
  await page.getByRole("button", { name: /^Filters$/ }).click();

  return nextValue as string;
};

const expectFilterParam = async (page: Page, expected: string) => {
  await page.waitForFunction(
    (value) => new URL(window.location.href).searchParams.get("f") === value,
    expected,
  );
};

const expectDeveloperFilter = async (page: Page, expected: string) => {
  await expect
    .poll(() => {
      const encoded = getFilterParam(page.url());
      const filters = decodeFilter(encoded);
      return filters.who.developers?.join(",") ?? "";
    })
    .toBe(expected);
};

test.describe("filter propagation", () => {
  test("primary routes retain filter param", async ({ page }) => {
    await page.goto("/dashboard");
    const initialFilter = await waitForFilterParam(page);
    // CHAOS-1760: sidebar groups other than Cockpit + active-route are
    // collapsed by default. Iterating across primary routes spans multiple
    // groups, so expand them all up-front to keep nav links clickable.
    await expandAllSidebarGroups(page);
    const updatedFilter = await updateDeveloperFilter(page, "dev-health-web", initialFilter);

    const nav = page.locator("aside nav");
    // Routes that exist in the primary navigation
    const routes = [
      { label: /People/i, path: "/people" },
      { label: /Metrics/i, path: "/metrics" },
      { label: /Landscape/i, path: "/explore/landscape" },
      { label: /^Work$/, path: "/work" },
      { label: /Code/i, path: "/code" },
      { label: /Opportunities/i, path: "/opportunities" },
      { label: /Home/i, path: "/dashboard" },
    ];

    for (const route of routes) {
      await clickUntilUrl(
        page,
        nav.getByRole("link", { name: route.label }),
        new RegExp(`${route.path}(?:[?#].*)?$`),
      );
      await expectFilterParam(page, updatedFilter);
      await expectDeveloperFilter(page, "dev-health-web");
    }
  });

  test("filter change updates URL and persists across nav", async ({ page }) => {
    await page.goto("/metrics?tab=dora");
    const initialFilter = await waitForFilterParam(page);
    await expandAllSidebarGroups(page);
    const updatedFilter = await updateDeveloperFilter(page, "metrics-owner", initialFilter);
    expect(updatedFilter).not.toBe(initialFilter);

    const nav = page.locator("aside nav");
    await clickUntilUrl(page, nav.getByRole("link", { name: /^Work$/ }), /\/work(?:[?#].*)?$/);
    await expectFilterParam(page, updatedFilter);
    await expectDeveloperFilter(page, "metrics-owner");
  });
});
