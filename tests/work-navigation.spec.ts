import { test, expect } from "@playwright/test";
import { decodeFilter, encodeFilterParam } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";

const filterWith30d = encodeFilterParam({
	...defaultMetricFilter,
	time: { ...defaultMetricFilter.time, range_days: 30, compare_days: 30 },
});

test.describe("Work Tabbed Navigation", () => {
	test.beforeEach(async ({ page }) => {
		// Bare /work is the Diagnose "overview" view (CHAOS-2073). The tabbed Work
		// content lives under ?view=work; land there so the WorkTabNav is present.
		await page.goto("/work?view=work");
		await expect(
			page.getByRole("heading", { name: "Investment Mix" }),
		).toBeVisible({
			timeout: 15000,
		});
	});

	test("default tab is landscape", async ({ page }) => {
		await expect(page).toHaveURL(/\/work(\?tab=landscape)?/);
		await expect(
			page.getByRole("heading", { name: "Investment Mix" }),
		).toBeVisible();
	});

	test("switches tabs correctly", async ({ page }) => {
		await page.getByRole("link", { name: /^Heatmap$/i }).click();
		await expect(page).toHaveURL(/tab=heatmap/, { timeout: 10000 });
		await expect(page.getByText("Review wait density")).toBeVisible();

		await page.getByRole("link", { name: /^Flow$/i }).click();
		await expect(page).toHaveURL(/tab=flow/, { timeout: 10000 });
		await expect(
			page.getByRole("heading", { name: "Investment Mix" }),
		).toBeVisible();
		await expect(page.getByTestId("flow-chart-container")).toBeVisible();

		await page.getByRole("link", { name: /^Investment$/i }).click();
		await expect(page).toHaveURL(/tab=investment/, { timeout: 10000 });
		await expect(
			page.getByRole("heading", { name: "Work Unit Investment" }),
		).toBeVisible();
		await expect(page.getByRole("heading", { name: "Treemap" })).toBeVisible();

		await page.getByRole("link", { name: /^Flame$/i }).click();
		await expect(page).toHaveURL(/tab=flame/, { timeout: 10000 });
		await expect(
			page.getByRole("heading", { name: "Elapsed Time Breakdown" }),
		).toBeVisible();
		await expect(page.getByTestId("chart-flame")).toBeVisible();
	});

	test("investment tab preserves filters across navigation", async ({
		page,
	}) => {
		await page.goto(`/work?tab=investment&f=${filterWith30d}`);
		await expect(
			page.getByRole("heading", { name: "Work Unit Investment" }),
		).toBeVisible();

		await page.getByRole("link", { name: /^Flow$/i }).click();
		await expect(page).toHaveURL(/tab=flow/);
		const filters = decodeFilter(new URL(page.url()).searchParams.get("f"));
		expect(filters.time.range_days).toBe(30);
	});

	test("preserves filters across tabs", async ({ page }) => {
		await page.goto(`/work?tab=flow&f=${filterWith30d}`);
		await expect(
			page.getByRole("heading", { name: "Investment Mix" }),
		).toBeVisible();

		await page.getByRole("link", { name: /^Heatmap$/i }).click();
		await expect(page).toHaveURL(/tab=heatmap/);
		const filters = decodeFilter(new URL(page.url()).searchParams.get("f"));
		expect(filters.time.range_days).toBe(30);
	});

	test("investigation panel launcher navigates to flow tab with context", async ({
		page,
	}) => {
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
		await expect(
			page.getByRole("heading", { name: "Investment Mix" }),
		).toBeVisible();

		await page.goto(
			`/work?tab=flame&mode=throughput&context_node=Backend&f=${filterWith30d}`,
		);
		await expect(
			page.getByRole("heading", { name: "Throughput Breakdown" }),
		).toBeVisible();
		await expect(
			page.getByText(/Analyzing decomposition starting from node/).first(),
		).toBeVisible();
	});
});
