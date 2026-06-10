import { expect, test } from "@playwright/test";

import { clickUntilUrl, waitForHydration } from "./helpers/nav";

test.describe("IA rejection regressions", () => {
    test("Cockpit exposes the Lens control", async ({ page }) => {
        await page.goto("/dashboard");

        await expect(page.getByRole("radiogroup", { name: "Lens" })).toBeVisible();
    });

    test("Landscape does not show a selected Lens state", async ({ page }) => {
        await page.goto("/landscape?role=leadership");

        await expect(page.getByText(/Lens:/i)).not.toBeVisible();
        await expect(page.getByTestId("role-selector")).not.toBeVisible();
    });

    test("Diagnose overview keeps unavailable workflows compact", async ({ page }) => {
        await page.goto("/work");
        await waitForHydration(page);

        const grid = page.getByTestId("area-overview-grid");
        await expect(grid).toBeVisible();
        await expect(grid.getByTestId("area-signal-unavailable")).not.toHaveCount(0);
        await expect(grid.getByRole("link", { name: "People" })).not.toBeVisible();
        await expect(grid.getByRole("link", { name: "Landscape" })).toBeVisible();
        await expect(grid.getByRole("link", { name: "Cognitive Load" })).toBeVisible();

        // People remains reachable via the active Diagnose sidebar navigation
        const diagnoseNav = page.getByTestId("nav-children-diagnose");
        await expect(diagnoseNav.getByRole("link", { name: "People" })).toBeVisible();
        await clickUntilUrl(page, diagnoseNav.getByRole("link", { name: "People" }), /\/people/);
    });
});

test.describe("Cognitive Load dashboard", () => {
    test("renders privacy-first team/repo cognitive load signals", async ({ page }) => {
        await page.goto("/cognitive-load");

        const dashboard = page.getByTestId("cognitive-load-dashboard");
        await expect(dashboard).toBeVisible();
        await expect(
            dashboard.getByRole("heading", {
                name: /Focus fragmentation, not surveillance/i,
            }),
        ).toBeVisible();
        await expect(dashboard.getByText("PR interruption load")).toBeVisible();
        await expect(dashboard.getByText("Context spread", { exact: true })).toBeVisible();
        await expect(dashboard.getByText("Review request load", { exact: true })).toBeVisible();
        await expect(dashboard.getByText("After-hours trend", { exact: true })).toBeVisible();
        await expect(dashboard.getByText("Weekend trend", { exact: true })).toBeVisible();
        await expect(dashboard.getByText("Interpretive load view")).toBeVisible();
        await expect(dashboard.getByText("Sample data")).not.toBeVisible();
    });

    test("states the no-surveillance guardrails", async ({ page }) => {
        await page.goto("/cognitive-load");

        const dashboard = page.getByTestId("cognitive-load-dashboard");
        await expect(dashboard.getByText(/No leaderboards/i)).toBeVisible();
        await expect(dashboard.getByText(/No peer rankings/i)).toBeVisible();
        await expect(dashboard.getByText(/self-reflection/i)).toBeVisible();
    });

    test("allows individual self-reflection only for the current user", async ({ page }) => {
        await page.goto("/cognitive-load?scope_type=developer&scope_id=e2e-user-1");

        const dashboard = page.getByTestId("cognitive-load-dashboard");
        await expect(dashboard.getByText(/Self-reflection mode/i)).toBeVisible();
        await expect(
            dashboard.getByText(/Only you can open this individual cognitive-load view/i),
        ).toBeVisible();
        await expect(dashboard.getByText("PR interruption load")).toBeVisible();
    });

    test("blocks individual cognitive load for another person", async ({ page }) => {
        await page.goto("/cognitive-load?scope_type=developer&scope_id=other-user");

        const dashboard = page.getByTestId("cognitive-load-dashboard");
        await expect(dashboard.getByText(/Individual cognitive load is self-only/i)).toBeVisible();
        await expect(
            dashboard.getByRole("link", { name: /Return to team\/repo view/i }),
        ).toBeVisible();
        await expect(dashboard.getByText("PR interruption load")).not.toBeVisible();
    });
});
