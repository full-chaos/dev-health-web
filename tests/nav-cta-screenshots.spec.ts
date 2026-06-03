import { test, type Page } from "@playwright/test";

import { waitForHydration } from "./helpers/nav";
import { encodeFilter } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";

/**
 * CHAOS-2056 / CHAOS-2058 visual evidence.
 *
 * Captures the nav/CTA surfaces consolidated onto the shared ModeTabs,
 * FilterPills, Button and BackLink primitives, plus the typed CTA registry.
 * Not an assertion suite — it exists to produce reviewable after-screenshots.
 */

const f = encodeFilter({
	...defaultMetricFilter,
	time: { range_days: 30, compare_days: 30 },
});

async function shoot(page: Page, path: string, name: string) {
	await page.goto(path.includes("?") ? `${path}&f=${f}` : `${path}?f=${f}`);
	await waitForHydration(page).catch(() => {});
	await page.waitForTimeout(600);
	await page.screenshot({
		path: `.screenshots/after-navcta-${name}.png`,
		fullPage: true,
	});
}

test.describe("CHAOS-2056/2058 nav + CTA surfaces", () => {
	test("work area (ModeTabs + BackLink)", async ({ page }) => {
		await shoot(page, "/work", "work");
	});

	test("work flow tab (Flow ModeTabs + InspectPanel CTAs)", async ({
		page,
	}) => {
		await shoot(page, "/work?tab=flow", "work-flow");
	});

	test("metrics (ModeTabs strip + BackLink)", async ({ page }) => {
		await shoot(page, "/metrics", "metrics");
	});

	test("ai workflows (AITabNav ModeTabs)", async ({ page }) => {
		await shoot(page, "/ai", "ai");
	});

	test("explore (Flame/Landscape buttons + BackLink exits)", async ({
		page,
	}) => {
		await shoot(page, "/explore?metric=throughput", "explore");
	});

	test("capacity (BackLink)", async ({ page }) => {
		await shoot(page, "/capacity", "capacity");
	});

	test("investment (BackLink to landscape)", async ({ page }) => {
		await shoot(page, "/investment", "investment");
	});

	test("risk compounding (BackLink)", async ({ page }) => {
		await shoot(page, "/risk/compounding", "risk-compounding");
	});
});
