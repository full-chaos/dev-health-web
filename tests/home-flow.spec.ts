import { test, expect } from "@playwright/test";

test("home loads and navigates to explore via panel", async ({ page }) => {
	await page.goto("/");
	await expect(
		page.getByRole("heading", { name: "Developer Health Ops Cockpit" }),
	).toBeVisible();

	await page.waitForFunction(() => {
		return new URL(window.location.href).searchParams.get("f");
	});
	const startFilter = new URL(page.url()).searchParams.get("f");

	// Open the evidence panel from the top ranked signal
	const firstSignal = page.getByTestId("signal-open-evidence").first();
	await firstSignal.click();

	// Panel should open with evidence - look for the "Open in Explore View" link
	const exploreLink = page.getByRole("link", {
		name: "Open in Explore View ↗",
	});
	await expect(exploreLink).toBeVisible();
	await exploreLink.click();

	// Should navigate to explore with filters preserved
	await expect(page).toHaveURL(/\/explore\?metric=.*&f=/);
	const nextFilter = new URL(page.url()).searchParams.get("f");
	expect(nextFilter).toBe(startFilter);
});

test("opportunities page renders", async ({ page }) => {
	await page.goto("/opportunities");
	await expect(
		page.getByRole("heading", { name: "Focus Cards" }),
	).toBeVisible();
});
