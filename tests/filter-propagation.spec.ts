import { test, expect, Page } from "@playwright/test";

import { decodeFilter } from "../src/lib/filters/encode";
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
  test("primary area routes retain filter param", async ({ page }) => {
    await page.goto("/dashboard");
    const initialFilter = await waitForFilterParam(page);
    const updatedFilter = await updateDeveloperFilter(page, "dev-health-web", initialFilter);

    const nav = page.locator("aside nav");
    const areas = [
      { label: /^Diagnose$/, path: "/work" },
      { label: /^Plan$/, path: "/plan" },
      { label: /^Improve$/, path: "/opportunities" },
      { label: /^Govern$/, path: "/testops" },
      { label: /^AI$/, path: "/ai" },
      { label: /^Cockpit$/, path: "/dashboard" },
    ];

    for (const area of areas) {
      await clickUntilUrl(
        page,
        nav.getByRole("link", { name: area.label }),
        new RegExp(`${area.path}(?:[?#].*)?$`),
      );
      await expectFilterParam(page, updatedFilter);
      await expectDeveloperFilter(page, "dev-health-web");
    }
  });

  test("diagnose child routes retain filter param", async ({ page }) => {
    await page.goto("/dashboard");
    const initialFilter = await waitForFilterParam(page);
    const updatedFilter = await updateDeveloperFilter(page, "diagnose-owner", initialFilter);

    const nav = page.locator("aside nav");
    await clickUntilUrl(page, nav.getByRole("link", { name: /^Diagnose$/ }), /\/work(?:[?#].*)?$/);

    for (const child of [
      { label: /^Flow$/, path: "/metrics" },
      { label: /^Investment$/, path: "/investment" },
      { label: /^Landscape$/, path: "/landscape" },
    ]) {
      const children = page.getByTestId("nav-children-diagnose");
      await clickUntilUrl(
        page,
        children.getByRole("link", { name: child.label }),
        new RegExp(`${child.path}(?:[?#].*)?$`),
      );
      await expectFilterParam(page, updatedFilter);
      await expectDeveloperFilter(page, "diagnose-owner");
      await page.goto(`/work?f=${updatedFilter}`);
    }
  });

  test("filter change updates URL and persists across nav", async ({ page }) => {
    await page.goto("/metrics?tab=dora");
    const initialFilter = await waitForFilterParam(page);
    const updatedFilter = await updateDeveloperFilter(page, "metrics-owner", initialFilter);
    expect(updatedFilter).not.toBe(initialFilter);

    const nav = page.locator("aside nav");
    await clickUntilUrl(page, nav.getByRole("link", { name: /^Govern$/ }), /\/testops(?:[?#].*)?$/);
    await expectFilterParam(page, updatedFilter);
    await expectDeveloperFilter(page, "metrics-owner");
  });
});
