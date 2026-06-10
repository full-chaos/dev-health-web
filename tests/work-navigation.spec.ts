import { test, expect } from "@playwright/test";

import { decodeFilter, encodeFilterParam } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { clickUntilUrl, waitForHydration } from "./helpers/nav";

const filterWith30d = encodeFilterParam({
    ...defaultMetricFilter,
    time: { ...defaultMetricFilter.time, range_days: 30, compare_days: 30 },
});

const diagnoseChildren = [
    { label: "Overview", href: /\/diagnose(?:[?#].*)?$/ },
    { label: "Flow", href: /\/metrics(?:[?#].*)?$/ },
    { label: "Investment", href: /\/investment(?:[?#].*)?$/ },
    { label: "Landscape", href: /\/landscape(?:[?#].*)?$/ },
    { label: "Work Graph", href: /\/diagnose\/work-graph(?:[?#].*)?$/ },
    { label: "Complexity", href: /\/complexity(?:[?#].*)?$/ },
    { label: "Cognitive Load", href: /\/cognitive-load(?:[?#].*)?$/ },
    { label: "Bottlenecks", href: /\/bottleneck(?:[?#].*)?$/ },
    { label: "People", href: /\/people(?:[?#].*)?$/ },
    { label: "Code", href: /\/code(?:[?#].*)?$/ },
] as const;

test.describe("Diagnose navigation", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/diagnose");
        await waitForHydration(page);
        await expect(page.getByRole("heading", { name: "Diagnose", level: 1 })).toBeVisible({
            timeout: 15000,
        });
    });

    test("overview renders AreaOverview without Work tabs", async ({ page }) => {
        await expect(page.getByTestId("area-overview")).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Diagnose views" })).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Work views" })).toHaveCount(0);
        await expect(page.getByRole("link", { name: "Work", exact: true })).toHaveCount(0);
    });

    test("sidebar exposes first-class Diagnose children", async ({ page }) => {
        const children = page.getByTestId("nav-children-diagnose");
        await expect(children).toBeVisible();

        for (const child of diagnoseChildren) {
            await expect(
                children.getByRole("link", { name: child.label, exact: true }),
            ).toHaveAttribute("href", child.href);
        }
    });

    test("routes Flow Investment and Landscape as Diagnose destinations", async ({ page }) => {
        const children = page.getByTestId("nav-children-diagnose");

        await clickUntilUrl(
            page,
            children.getByRole("link", { name: "Flow", exact: true }),
            /\/metrics(?:[?#].*)?$/,
        );
        await expect(page.getByRole("heading", { name: "Monitoring view" })).toBeVisible();

        await page.goto("/diagnose");
        await clickUntilUrl(
            page,
            page.getByTestId("nav-children-diagnose").getByRole("link", {
                name: "Investment",
                exact: true,
            }),
            /\/investment(?:[?#].*)?$/,
        );
        await expect(page.getByRole("heading", { name: "Unlock investment view" })).toBeVisible();
        await expect(page.getByRole("link", { name: "Upgrade to Team" })).toBeVisible();

        await page.goto("/diagnose");
        await clickUntilUrl(
            page,
            page.getByTestId("nav-children-diagnose").getByRole("link", {
                name: "Landscape",
                exact: true,
            }),
            /\/landscape(?:[?#].*)?$/,
        );
        await expect(page.getByRole("heading", { name: "Landscape" })).toBeVisible();
    });

    test("legacy Work deep links: removed tabs redirect to first-class destinations", async ({
        page,
    }) => {
        // REMOVED_WORK_TAB_REDIRECTS (workPageView.ts): these tabs no longer render
        // in the hub — the server redirects to the first-class destination and
        // forwards the f= filter param.
        const redirectCases = [
            { tab: "overview", targetPattern: /\/diagnose(?:[?#].*)?$/ },
            { tab: "flow", targetPattern: /\/metrics(?:[?#].*)?$/ },
            { tab: "investment", targetPattern: /\/investment(?:[?#].*)?$/ },
            { tab: "landscape", targetPattern: /\/landscape(?:[?#].*)?$/ },
            { tab: "capacity", targetPattern: /\/plan\/capacity(?:[?#].*)?$/ },
            { tab: "heatmap", targetPattern: /\/cognitive-load(?:[?#].*)?$/ },
            { tab: "flame", targetPattern: /\/complexity(?:[?#].*)?$/ },
            { tab: "graph", targetPattern: /\/diagnose\/work-graph(?:[?#].*)?$/ },
            { tab: "evidence", targetPattern: /\/diagnose\/work-graph(?:[?#].*)?$/ },
        ] as const;

        for (const { tab, targetPattern } of redirectCases) {
            await page.goto(`/work?tab=${tab}&f=${filterWith30d}`);
            await waitForHydration(page);

            // Server redirect: final URL must match the first-class destination.
            await expect(page).toHaveURL(targetPattern);

            // Filter context is forwarded to the redirect target.
            expect(decodeFilter(new URL(page.url()).searchParams.get("f")).time.range_days).toBe(
                30,
            );
        }
    });

    test("legacy Work deep links: bare work view redirects to Work Graph instead of overview", async ({
        page,
    }) => {
        await page.goto(`/work?view=work&f=${filterWith30d}`);
        await waitForHydration(page);

        await expect(page).toHaveURL(/\/diagnose\/work-graph(?:[?#].*)?$/);
        await expect(page.getByRole("heading", { name: "Work Graph", level: 1 })).toBeVisible();
        await expect(page.getByRole("tablist", { name: "Work views" })).toHaveCount(0);
        expect(decodeFilter(new URL(page.url()).searchParams.get("f")).time.range_days).toBe(30);
    });
});
