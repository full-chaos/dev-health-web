import { expect, test } from "@playwright/test";

// ── Improve / Overview landing (CHAOS-2217) ───────────────────────────────────
// The standalone /improve Overview must read as "TOP SIGNAL: <worst metric>"
// with Opportunities/Experiments/Automations as workflow cards below — NOT a
// self-referential "Opportunities" hero, and NOT a rainbow gradient phrase.
// Backed by the mock home deltas (Throughput worsened +8%) + opportunities
// (2 open, 1 evidence-linked). The Overview content is server-rendered, so the
// assertions rely on Playwright's locator auto-waiting rather than on the
// client `?f=` URL-rewrite (which `waitForHydration` polls and which flakes on a
// cold dev server) — the cards exist in the initial HTML regardless of hydration.

test.describe("Improve Overview landing", () => {
    test("renders the Improve overview header and one context bar", async ({ page }) => {
        await page.goto("/improve", { waitUntil: "domcontentloaded" });

        await expect(page.getByRole("heading", { level: 1, name: "Improve" })).toBeVisible();
        await expect(
            page.getByText(/each producing actions,\s*not dashboards/i).first(),
        ).toBeVisible();
        await expect(page.getByTestId("area-overview")).toBeVisible();
        // Exactly one context bar (no GlobalContextBar + FilterBar duplication).
        await expect(page.getByRole("region", { name: "Global context" })).toHaveCount(1);
    });

    test("promotes the worst metric to the TOP SIGNAL hero (not a self-referential Opportunities hero)", async ({
        page,
    }) => {
        await page.goto("/improve", { waitUntil: "domcontentloaded" });

        const hero = page.getByTestId("area-overview-hero");
        await expect(hero).toBeVisible();

        // The hero is the synthesized worst-opportunity lead, not the Opportunities card.
        const heroCard = hero.getByTestId("area-signal-card");
        await expect(heroCard).toHaveAttribute("data-signal-id", "improve-top-signal");
        await expect(hero.getByText("Top signal")).toBeVisible();
        await expect(hero.getByRole("heading", { name: /^Reduce / })).toBeVisible();

        // A SHORT signed-delta value, not a long rainbow phrase.
        await expect(hero.getByTestId("area-signal-value")).toHaveText(/^\+\d+%$/);

        // The hero must NOT just be "Opportunities", and it routes to a real opportunity.
        await expect(heroCard).not.toHaveAttribute("data-signal-id", "opportunities");
        await expect(heroCard).toHaveAttribute("href", /\/opportunities/);
    });

    test("drops Opportunities to a workflow card with a short value + secondary evidence line", async ({
        page,
    }) => {
        await page.goto("/improve", { waitUntil: "domcontentloaded" });

        const grid = page.getByTestId("area-overview-grid");
        const oppCard = grid.locator('[data-signal-id="opportunities"]');
        await expect(oppCard).toBeVisible();

        // The gradient VALUE span is a SHORT clean number ("N open") — the rainbow
        // bug was the long "N OPEN · M EVIDENCE-LINKED" phrase stretched across the
        // gradient. The evidence count must NOT live in the value span.
        const value = oppCard.getByTestId("area-signal-value");
        await expect(value).toHaveText(/^\d+ open$/);
        await expect(value).not.toContainText("·");
        await expect(value).not.toContainText(/evidence/i);

        // The evidence-linked count belongs on the SECONDARY (metricLabel) line,
        // stacked separately like the Penpot Overview ("2 OPEN" / "2 EVIDENCE-LINKED").
        await expect(oppCard).toContainText(/evidence-linked/i);

        // The card links to the Opportunities sub-area.
        await expect(oppCard).toHaveAttribute("href", /\/opportunities/);
    });

    test("both Experiments and Automations are now live links (CHAOS-2219 + CHAOS-2220)", async ({
        page,
    }) => {
        await page.goto("/improve", { waitUntil: "domcontentloaded" });

        const grid = page.getByTestId("area-overview-grid");
        await expect(grid).toBeVisible();

        // Experiments: promoted to a live area (CHAOS-2219) — navigable link, not a preview chip.
        const experimentsCard = grid.locator("[data-signal-id]", { hasText: "Experiments" });
        await expect(experimentsCard).not.toHaveAttribute("data-preview", "true");
        await expect(experimentsCard).not.toHaveAttribute("aria-disabled", "true");
        await expect(grid.getByRole("link", { name: "Experiments" })).toHaveCount(1);
        await expect(grid.getByRole("link", { name: "Experiments" })).toHaveAttribute(
            "href",
            /\/improve\/experiments/,
        );

        // Automations: promoted to a live area (CHAOS-2220) — navigable link, not a preview chip.
        await expect(grid.getByRole("link", { name: "Automations" })).toHaveCount(1);
        await expect(grid.getByRole("link", { name: "Automations" })).toHaveAttribute(
            "href",
            /\/improve\/automations/,
        );
    });

    test("marks Improve as the single selected area on /improve", async ({ page }) => {
        await page.goto("/improve", { waitUntil: "domcontentloaded" });

        const selectedArea = page.locator('aside a[data-active="true"]');
        await expect(selectedArea).toHaveCount(1);
        await expect(selectedArea).toHaveText("Improve");
        // The Improve area expands to Overview (first) + Opportunities sidebar rows.
        const improveChildren = page.getByTestId("nav-children-improve");
        await expect(
            improveChildren.getByRole("link", { name: "Overview", exact: true }),
        ).toHaveAttribute("href", /\/improve/);
        await expect(
            improveChildren.getByRole("link", { name: "Opportunities", exact: true }),
        ).toHaveAttribute("href", /\/opportunities/);
    });
});
