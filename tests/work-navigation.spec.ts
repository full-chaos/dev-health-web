import { test, expect } from "@playwright/test";

import { decodeFilter, encodeFilterParam } from "../src/lib/filters/encode";
import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { clickUntilUrl, waitForHydration } from "./helpers/nav";

const filterWith30d = encodeFilterParam({
    ...defaultMetricFilter,
    time: { ...defaultMetricFilter.time, range_days: 30, compare_days: 30 },
});

const diagnoseChildren = [
    { label: "Overview", href: /\/work(?:[?#].*)?$/ },
    { label: "Flow", href: /\/metrics(?:[?#].*)?$/ },
    { label: "Investment", href: /\/investment(?:[?#].*)?$/ },
    { label: "Landscape", href: /\/landscape(?:[?#].*)?$/ },
    { label: "Work Lens", href: /\/work\?view=work(?:[&#].*)?$/ },
    { label: "People", href: /\/people(?:[?#].*)?$/ },
    { label: "Code", href: /\/code(?:[?#].*)?$/ },
    { label: "Complexity", href: /\/complexity(?:[?#].*)?$/ },
    { label: "Cognitive Load", href: /\/cognitive-load(?:[?#].*)?$/ },
    { label: "Bottlenecks", href: /\/bottleneck(?:[?#].*)?$/ },
] as const;

test.describe("Diagnose navigation", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/work");
        await waitForHydration(page);
        await expect(page.getByRole("heading", { name: "Diagnose", level: 1 })).toBeVisible({
            timeout: 15000,
        });
    });

    test("overview renders AreaOverview without Work tabs", async ({ page }) => {
        await expect(page.getByTestId("area-overview")).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Diagnose views" })).toHaveCount(0);
        await expect(page.getByRole("navigation", { name: "Work views" })).toHaveCount(0);
        // The overview must not expose an in-page "Work Lens" mode-tab. The sidebar
        // "Work Lens" destination (a Diagnose child) is intentional and lives in <aside>,
        // outside <main>.
        await expect(
            page.getByRole("main").getByRole("link", { name: "Work Lens", exact: true }),
        ).toHaveCount(0);
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

        await page.goto("/work");
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

        await page.goto("/work");
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
            { tab: "flow", targetPattern: /\/metrics(?:[?#].*)?$/ },
            { tab: "investment", targetPattern: /\/investment(?:[?#].*)?$/ },
            { tab: "landscape", targetPattern: /\/landscape(?:[?#].*)?$/ },
            { tab: "capacity", targetPattern: /\/plan\/capacity(?:[?#].*)?$/ },
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

    test("legacy Work deep links: WORK_TABS (flame/heatmap/evidence/graph) stay in the hub", async ({
        page,
    }) => {
        // WORK_TABS = [overview, heatmap, flame, evidence, graph] — these remain
        // in /work hub and are NOT redirected.
        const hubCases = [{ tab: "flame", label: "Flame" }] as const;

        for (const { tab, label } of hubCases) {
            await page.goto(`/work?tab=${tab}&f=${filterWith30d}`);
            await waitForHydration(page);

            // Stays in the hub — no redirect away to a first-class route.
            await expect(page).toHaveURL(new RegExp(`/work\\?tab=${tab}`));

            // The Work views tab strip is present and the deep-linked tab is active.
            const workNav = page.getByRole("tablist", { name: "Work views" });
            await expect(workNav).toBeVisible();
            await expect(workNav.getByRole("tab", { name: label, exact: true })).toHaveAttribute(
                "aria-current",
                "page",
            );

            // Filter context is preserved across the deep link.
            expect(decodeFilter(new URL(page.url()).searchParams.get("f")).time.range_days).toBe(
                30,
            );
        }
    });
});
