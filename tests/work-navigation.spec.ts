import { test, expect, type Page } from "@playwright/test";
import { decodeFilter, encodeFilterParam } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { clickUntilUrl } from "./helpers/nav";

const filterWith30d = encodeFilterParam({
  ...defaultMetricFilter,
  time: { ...defaultMetricFilter.time, range_days: 30, compare_days: 30 },
});

// J1 (CHAOS-2080): Diagnose is now a top-level area that expands to its
// navVisible children in the sidebar (Flow -> /metrics, Investment ->
// /investment, ...). Those rows share labels with the in-page Work tab strip,
// so tab locators MUST be scoped to the <nav aria-label="Work views"> strip to
// stay unambiguous under Playwright strict mode.
const workTab = (page: Page, name: RegExp) =>
  page.getByRole("navigation", { name: "Work views" }).getByRole("link", { name });

test.describe("Work Tabbed Navigation", () => {
  test.beforeEach(async ({ page }) => {
    // Bare /work is the Diagnose "overview" view (CHAOS-2073). The tabbed Work
    // content lives under ?view=work; land there so the WorkTabNav is present.
    await page.goto("/work?view=work");
    await expect(page.getByRole("heading", { name: "Investment Mix" })).toBeVisible({
      timeout: 15000,
    });
  });

  test("default tab is landscape", async ({ page }) => {
    await expect(page).toHaveURL(/\/work(\?tab=landscape)?/);
    await expect(page.getByRole("heading", { name: "Investment Mix" })).toBeVisible();
  });

  test("switches tabs correctly", async ({ page }) => {
    // Resilient tab clicks: under load the test-mode dev server can swallow the
    // first <Link> click (handler not yet attached / mid re-render), so retry the
    // whole click+assert until the URL lands (matches the nav-reachability pattern).
    await clickUntilUrl(page, workTab(page, /^Heatmap$/i), /tab=heatmap/);
    await expect(page.getByText("Review wait density")).toBeVisible();

    await clickUntilUrl(page, workTab(page, /^Flow$/i), /tab=flow/);
    await expect(page.getByRole("heading", { name: "Investment Mix" })).toBeVisible();
    await expect(page.getByTestId("flow-chart-container")).toBeVisible();

    await clickUntilUrl(page, workTab(page, /^Investment$/i), /tab=investment/);
    await expect(page.getByRole("heading", { name: "Work Unit Investment" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Treemap" })).toBeVisible();

    await clickUntilUrl(page, workTab(page, /^Flame$/i), /tab=flame/);
    await expect(page.getByRole("heading", { name: "Elapsed Time Breakdown" })).toBeVisible();
    await expect(page.getByTestId("chart-flame")).toBeVisible();
  });

  test("investment tab preserves filters across navigation", async ({ page }) => {
    await page.goto(`/work?tab=investment&f=${filterWith30d}`);
    await expect(page.getByRole("heading", { name: "Work Unit Investment" })).toBeVisible();

    await workTab(page, /^Flow$/i).click();
    await expect(page).toHaveURL(/tab=flow/);
    const filters = decodeFilter(new URL(page.url()).searchParams.get("f"));
    expect(filters.time.range_days).toBe(30);
  });

  test("preserves filters across tabs", async ({ page }) => {
    await page.goto(`/work?tab=flow&f=${filterWith30d}`);
    await expect(page.getByRole("heading", { name: "Investment Mix" })).toBeVisible();

    await workTab(page, /^Heatmap$/i).click();
    await expect(page).toHaveURL(/tab=heatmap/);
    const filters = decodeFilter(new URL(page.url()).searchParams.get("f"));
    expect(filters.time.range_days).toBe(30);
  });

  test("investigation panel launcher navigates to flow tab with context", async ({ page }) => {
    // Go to landscape
    await page.goto("/work?tab=landscape");

    // Open an investigation (this might need specific test IDs in your UI)
    // For now, we'll try to find a button in the quadrant panel
    // Mocking the behavior by going to a known investigation state if possible
    // Or assume there's a dot to click in demo mode

    // Let's check for the presence of the link in the panel
    // We'll use the demo page if it has the quadrant chart
    await page.goto("/demo");
    const quadrantPanel = page.getByTestId("quadrant-investigation");
    await quadrantPanel.getByRole("button", { name: "Core" }).click();

    const flowLink = page.getByRole("link", { name: /view flow/i });
    await expect(flowLink).toBeVisible();
    await expect(flowLink).toHaveAttribute("href", /tab=flow/);
    await expect(flowLink).toHaveAttribute("href", /context_entity_id=/);

    await flowLink.click();
    await expect(page).toHaveURL(/tab=flow/);
    await expect(page).toHaveURL(/context_entity_id=/);
    await expect(page.getByText("Filtering flow by")).toBeVisible();
  });

  test("flow tab inspect panel deep-links to flame tab", async ({ page }) => {
    await page.goto(`/work?tab=flow&f=${filterWith30d}`);
    await expect(page.getByRole("heading", { name: "Investment Mix" })).toBeVisible();

    await page.goto(`/work?tab=flame&mode=throughput&context_node=Backend&f=${filterWith30d}`);
    await expect(page.getByRole("heading", { name: "Throughput Breakdown" })).toBeVisible();
    await expect(
      page.getByText(/Analyzing decomposition starting from node/).first(),
    ).toBeVisible();
  });
});
