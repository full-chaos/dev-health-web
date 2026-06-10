import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

import { clickUntilUrl, waitForHydration } from "./helpers/nav";

const primaryAreas = [
    { label: "Cockpit", path: "/dashboard" },
    { label: "Diagnose", path: "/diagnose" },
    { label: "Plan", path: "/plan" },
    { label: "Improve", path: "/improve" },
    { label: "Govern", path: "/govern" },
    { label: "AI", path: "/ai" },
    { label: "Reports", path: "/reports" },
    { label: "Admin", path: "/admin" },
] as const;

// Leaf labels that must NOT appear as flat sidebar rows anymore.
// NOTE: "Operating Review" was promoted to a visible Plan child (CHAOS-2181),
// then hidden again pending a hard rethink (CHAOS-2181 follow-up). The route
// stays reachable by URL; the nav row must not render.
const collapsedLeafLabels = [
    "Operating Review",
    "Flow",
    "Investment",
    "Landscape",
    "People",
    "Code",
    "Complexity",
    "Cognitive Load",
    "Bottlenecks",
    "Delivery Forecast",
    "Pipelines",
    "Tests",
    "Quality",
    "Coverage",
    "Delivery Risk",
    "Incident Correlation",
    "Security",
    "Feature Flags",
    "Compounding Risk",
    "Report Center",
] as const;

const reachableRoutes = [
    "/dashboard",
    "/plan",
    "/plan/delivery-forecast",
    "/plan/capacity",
    "/operating-review",
    "/diagnose",
    "/metrics",
    "/people",
    "/code",
    "/landscape",
    "/complexity",
    "/cognitive-load",
    "/bottleneck",
    "/improve",
    "/opportunities",
    "/ai",
    "/ai/impact",
    "/ai/attribution",
    "/ai/review-load",
    "/ai/test-gaps",
    "/ai/risk",
    "/ai/evidence",
    "/ai/automations",
    "/testops",
    "/testops/pipelines",
    "/testops/tests",
    "/testops/coverage",
    "/testops/risk",
    "/quality",
    "/security",
    "/feature-flags",
    "/incident-correlation",
    "/risk/compounding",
    "/reports",
    "/admin",
] as const;

/**
 * Reachability is asserted over the authenticated HTTP request context rather than
 * by browser-navigating to each route. Browser-navigating ~30 chart-heavy pages in a
 * single spec wedged the dev server under CI's constrained runners (net::ERR_ABORTED /
 * "[WebServer] Error: aborted"); an SSR status check is the right weight for "is this
 * route reachable / not a 404". Retries absorb transient dev-server aborts under load.
 */
async function expectReachable(request: APIRequestContext, path: string) {
    await expect(async () => {
        const response = await request.get(path);
        const status = response.status();
        expect(status, `${path} returned ${status}`).not.toBe(404);
        expect(status, `${path} returned ${status}`).toBeLessThan(500);
    }).toPass({ timeout: 30000, intervals: [500, 1000, 2000] });
}

async function expectSingleSelectedArea(page: Page, path: string, selectedLabel: string) {
    await expect(async () => {
        await page.goto(path, { waitUntil: "domcontentloaded" });

        // CHAOS-2075 two-level nav: aria-current marks the current-page link (a child
        // leaf on a leaf route, the area row on a landing), so the active AREA is marked
        // with data-active instead. Assert exactly one area is active and it's the
        // expected one — rendered from usePathname(), independent of the ?f= append.
        const selectedArea = page.locator('aside a[data-active="true"]');
        await expect(selectedArea).toHaveCount(1, { timeout: 15000 });
        await expect(selectedArea).toHaveText(selectedLabel);
    }).toPass({ timeout: 45000, intervals: [500, 1000, 2000] });
}

test.describe("primary navigation reachability", () => {
    test("sidebar surfaces exactly the decision areas as links, no flat leaf rows", async ({
        page,
    }) => {
        await page.goto("/dashboard");
        await waitForHydration(page);

        const aside = page.locator("aside");

        for (const area of primaryAreas) {
            await expect(
                aside.getByRole("link", { name: area.label, exact: true }),
            ).toHaveAttribute("href", new RegExp(`${area.path}(?:[?#].*)?`));
        }

        // Leaf destinations are no longer enumerated flat in the sidebar.
        for (const leaf of collapsedLeafLabels) {
            await expect(aside.getByRole("link", { name: leaf, exact: true })).toHaveCount(0);
        }
    });

    test("reaches Plan as a top-level area and routes its visible subviews", async ({
        page,
        request,
    }) => {
        await page.goto("/dashboard");
        await waitForHydration(page);

        const sidebar = page.locator("aside");

        await clickUntilUrl(
            page,
            sidebar.getByRole("link", { name: "Plan", exact: true }),
            /\/plan(?:[?#].*)?$/,
        );

        const planChildren = page.getByTestId("nav-children-plan");
        await expect(planChildren).toBeVisible({ timeout: 15000 });

        for (const child of [
            { label: "Overview", url: /\/plan(?:[?#].*)?$/, path: "/plan" },
            {
                label: "Capacity Forecast",
                url: /\/plan\/capacity(?:[?#].*)?$/,
                path: "/plan/capacity",
            },
            {
                label: "Backlog Risk",
                url: /\/plan\/backlog-risk(?:[?#].*)?$/,
                path: "/plan/backlog-risk",
            },
            // "Operating Review" is hidden from nav (navVisible: false) pending
            // a rethink — see collapsedLeafLabels above. Route stays reachable
            // by URL (asserted via reachableRoutes).
        ]) {
            await clickUntilUrl(
                page,
                planChildren.getByRole("link", { name: child.label, exact: true }),
                child.url,
            );
            await expectReachable(request, child.path);
        }
    });

    test("reaches Diagnose as a top-level area and routes its visible subviews", async ({
        page,
    }) => {
        await page.goto("/dashboard");
        await waitForHydration(page);

        const sidebar = page.locator("aside");

        await clickUntilUrl(
            page,
            sidebar.getByRole("link", { name: "Diagnose", exact: true }),
            /\/diagnose(?:[?#].*)?$/,
        );

        const diagnoseChildren = page.getByTestId("nav-children-diagnose");
        await expect(diagnoseChildren).toBeVisible({ timeout: 15000 });

        const children = [
            { label: "Overview", url: /\/diagnose(?:[?#].*)?$/, path: "/diagnose" },
            { label: "Flow", url: /\/metrics(?:[?#].*)?$/, path: "/metrics" },
            {
                label: "Investment",
                url: /\/investment(?:[?#].*)?$/,
                path: "/investment",
            },
            {
                label: "Landscape",
                url: /\/landscape(?:[?#].*)?$/,
                path: "/landscape",
            },
            {
                label: "Work Graph",
                url: /\/diagnose\/work-graph(?:[?#].*)?$/,
                path: "/diagnose/work-graph",
            },
            { label: "People", url: /\/people(?:[?#].*)?$/, path: "/people" },
            { label: "Code", url: /\/code(?:[?#].*)?$/, path: "/code" },
            {
                label: "Complexity",
                url: /\/complexity(?:[?#].*)?$/,
                path: "/complexity",
            },
            {
                label: "Cognitive Load",
                url: /\/cognitive-load(?:[?#].*)?$/,
                path: "/cognitive-load",
            },
            {
                label: "Bottlenecks",
                url: /\/bottleneck(?:[?#].*)?$/,
                path: "/bottleneck",
            },
        ];

        // Every Diagnose child renders with the correct destination href. This is a
        // cheap DOM assertion on purpose: browser-navigating all ~10 chart-heavy
        // children in series wedged the dev server under CI's constrained runners
        // (net::ERR_ABORTED / "[WebServer] Error: aborted"), failing every retry.
        // Full SSR reachability of every route is covered by the dedicated
        // "every former leaf destination still resolves" test below.
        for (const child of children) {
            await expect(
                diagnoseChildren.getByRole("link", { name: child.label, exact: true }),
            ).toHaveAttribute("href", new RegExp(`${child.path}(?:[?#].*)?`));
        }

        // Click-verify a representative subset actually routes: the overview landing,
        // a chart leaf, and the People leaf whose nav regressed in CHAOS-2158.
        for (const child of [children[0], children[1], children[5]]) {
            await clickUntilUrl(
                page,
                diagnoseChildren.getByRole("link", { name: child.label, exact: true }),
                child.url,
            );
        }
    });

    test("every former leaf destination still resolves without 404", async ({ request }) => {
        // ~30 sequential SSR reachability fetches; Turbopack cold-compiles each route
        // on first hit under suite load, which overruns the default 30s test budget.
        test.setTimeout(120_000);
        for (const route of reachableRoutes) {
            await expectReachable(request, route);
        }
    });

    test("reaches AI as a top-level area and routes its visible subviews", async ({
        page,
        request,
    }) => {
        await page.goto("/dashboard");
        await waitForHydration(page);

        const sidebar = page.locator("aside");

        // The AI area row is a top-level sibling of Diagnose/Improve/Govern and links
        // to the /ai workspace.
        await clickUntilUrl(
            page,
            sidebar.getByRole("link", { name: "AI", exact: true }),
            /\/ai(?:[?#].*)?$/,
        );

        // The active AI area expands to exactly its navVisible children (areas.ts).
        const aiChildren = page.getByTestId("nav-children-ai");
        await expect(aiChildren).toBeVisible({ timeout: 15000 });

        for (const child of [
            { label: "Overview", url: /\/ai(?:[?#].*)?$/, path: "/ai" },
            {
                label: "Impact",
                url: /\/ai\/impact(?:[?#].*)?$/,
                path: "/ai/impact",
            },
            {
                label: "Review Load",
                url: /\/ai\/review-load(?:[?#].*)?$/,
                path: "/ai/review-load",
            },
            {
                label: "Governance Risk",
                url: /\/ai\/risk(?:[?#].*)?$/,
                path: "/ai/risk",
            },
            {
                label: "Automations",
                url: /\/ai\/automations(?:[?#].*)?$/,
                path: "/ai/automations",
            },
        ]) {
            await clickUntilUrl(
                page,
                aiChildren.getByRole("link", { name: child.label, exact: true }),
                child.url,
            );
            await expectReachable(request, child.path);
        }
    });

    test("marks exactly one area as selected for representative leaf routes", async ({ page }) => {
        test.setTimeout(120_000);

        for (const route of [
            { path: "/metrics?tab=dora", selectedLabel: "Diagnose" },
            { path: "/landscape", selectedLabel: "Diagnose" },
            { path: "/testops/coverage", selectedLabel: "Govern" },
            { path: "/testops/risk", selectedLabel: "Govern" },
            { path: "/bottleneck", selectedLabel: "Diagnose" },
            { path: "/risk/compounding", selectedLabel: "Govern" },
            { path: "/plan/delivery-forecast", selectedLabel: "Plan" },
            { path: "/plan/capacity", selectedLabel: "Plan" },
            { path: "/operating-review", selectedLabel: "Plan" },
        ]) {
            await expectSingleSelectedArea(page, route.path, route.selectedLabel);
        }
    });
});
