import { expect, test } from "@playwright/test";

// Structure A (CHAOS-2084 / Penpot "03 Plan Correction"):
//   - /plan/delivery-forecast is a Next.js server redirect → /plan (NOT a real page).
//   - /plan renders the Delivery Forecast dashboard directly; h1 is "Overview".
//   - /plan/capacity is the Capacity Forecast surface (Monte Carlo method label only).
//   - There is NO "Plan forecast views" tab strip on either page.

test.describe("Plan area forecast pages", () => {
	test("/plan/delivery-forecast redirects to /plan and shows forecast content", async ({
		page,
	}) => {
		await page.goto("/plan/delivery-forecast");

		// Server redirect: final URL must be /plan (Playwright follows the redirect).
		await expect(page).toHaveURL(/\/plan(?:[?#].*)?$/);
		// /plan h1 is "Overview" (not "Delivery Forecast").
		await expect(
			page.getByRole("heading", { name: "Overview", level: 1 }),
		).toBeVisible();
		await expect(
			page.getByText(/Backlog and scope are derived from the filter bar/i),
		).toBeVisible();
	});

	test("shows the empty-state card when the backend is unreachable", async ({
		page,
	}) => {
		await page.goto("/plan");

		// CHAOS-1783: sample data is gone. Without a reachable forecast the
		// page renders an honest empty state instead of placeholder numbers.
		await expect(
			page.getByRole("heading", { name: /No forecast available/i }),
		).toBeVisible();
		await expect(page.getByText(/Scope:/i)).toBeVisible();
		await expect(page.getByText(/Showing sample data/i)).not.toBeVisible();
	});

	test("does not expose a manual backlog or team input", async ({ page }) => {
		await page.goto("/plan");

		// Both inputs were deleted in CHAOS-1783 — backlog is derived from
		// the filter scope server-side.
		await expect(page.locator('input[name="team"]')).toHaveCount(0);
		await expect(page.locator('input[name="backlog"]')).toHaveCount(0);
	});

	test("scope label reflects All teams when no team is selected", async ({
		page,
	}) => {
		await page.goto("/plan");

		await expect(page.getByText(/Scope:\s*All teams/i)).toBeVisible();
	});

	test("there is NO Plan forecast views tab strip (forecast folded into single-surface)", async ({
		page,
	}) => {
		await page.goto("/plan");

		// Structure A: Delivery Forecast and Capacity Forecast are distinct first-class
		// pages — no shared tab strip labeled "Plan forecast views" exists.
		await expect(
			page.getByRole("navigation", { name: "Plan forecast views" }),
		).toHaveCount(0);
	});

	test("/plan/capacity renders Capacity Forecast with Monte Carlo method label and no tab nav", async ({
		page,
	}) => {
		await page.goto("/plan/capacity");

		await expect(
			page.getByRole("heading", { name: "Capacity Forecast", level: 1 }),
		).toBeVisible();
		// Method label — not a tab or heading.
		await expect(
			page.getByText(
				/Monte Carlo is the method behind this completion projection/i,
			),
		).toBeVisible();
		// Structure A: no shared "Plan forecast views" navigation.
		await expect(
			page.getByRole("navigation", { name: "Plan forecast views" }),
		).toHaveCount(0);
	});

	test("renders the unified global context bar above the forecast (CHAOS-2081)", async ({
		page,
	}) => {
		await page.goto("/plan");

		const contextBar = page.getByTestId("global-context-bar");
		await expect(contextBar).toBeVisible();
		await expect(contextBar).toHaveAttribute("aria-label", "Global context");
	});
});
