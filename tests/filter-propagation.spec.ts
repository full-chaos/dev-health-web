import { test, expect, Page } from "@playwright/test";

const getFilterParam = (url: string) => new URL(url).searchParams.get("f");

const waitForFilterParam = async (page: Page) => {
  await page.waitForFunction(() => new URL(window.location.href).searchParams.get("f"));
  const value = getFilterParam(page.url());
  expect(value).toBeTruthy();
  return value as string;
};

const updateDeveloperFilter = async (page: Page, value: string, previous: string) => {
  await page.getByRole("button", { name: "Advanced filters" }).click();
  await page.locator("summary", { hasText: "Who" }).click();
  await page.getByPlaceholder("alice, bob").fill(value);
  await page.waitForFunction(
    (prev) => {
      const current = new URL(window.location.href).searchParams.get("f");
      return Boolean(current && current !== prev);
    },
    previous
  );
  const nextValue = getFilterParam(page.url());
  expect(nextValue).toBeTruthy();
  return nextValue as string;
};

const expectFilterParam = async (page: Page, expected: string) => {
  await page.waitForFunction(
    (value) => new URL(window.location.href).searchParams.get("f") === value,
    expected
  );
};

test.describe("filter propagation", () => {
  test("primary routes retain filter param", async ({ page }) => {
    await page.goto("/");
    const initialFilter = await waitForFilterParam(page);
    const updatedFilter = await updateDeveloperFilter(
      page,
      "dev-health-web",
      initialFilter
    );

    const nav = page.locator("aside nav");
    const routes = [
      { label: /People/i, url: /\/people/ },
      { label: /Metrics/i, url: /\/metrics/ },
      { label: /Landscape/i, url: /\/explore\/landscape/ },
      { label: /Work/i, url: /\/work/ },
      { label: /Code/i, url: /\/code/ },
      { label: /Quality/i, url: /\/quality/ },
      { label: /Opportunities/i, url: /\/opportunities/ },
      { label: /Home/i, url: /\/\?f=/ },
    ];

    for (const route of routes) {
      await nav.getByRole("link", { name: route.label }).click();
      await expect(page).toHaveURL(route.url);
      await expectFilterParam(page, updatedFilter);
    }
  });

  test("filter change updates URL and persists across nav", async ({ page }) => {
    await page.goto("/metrics?tab=dora");
    const initialFilter = await waitForFilterParam(page);
    const updatedFilter = await updateDeveloperFilter(
      page,
      "metrics-owner",
      initialFilter
    );
    expect(updatedFilter).not.toBe(initialFilter);

    const nav = page.locator("aside nav");
    await nav.getByRole("link", { name: /Work/i }).click();
    await expect(page).toHaveURL(/\/work/);
    await expectFilterParam(page, updatedFilter);
  });
});
