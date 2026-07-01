import { test, expect, type Page } from "@playwright/test";

import { clickUntilUrl, waitForHydration } from "./helpers/nav";
import { defaultMetricFilter } from "../src/lib/filters/defaults";
import { encodeFilter } from "../src/lib/filters/encode";

/**
 * CHAOS-2213: AI-area E2E journey.
 *
 * Unlike the per-page AI specs, each test here walks a contiguous user path
 * through the first-class AI area (post CHAOS-2180 Wave 2 IA: 5 sidebar
 * children, Governance Risk tabs, impact PR-evidence drilldown) and asserts
 * the `f` filter scope survives every hop. Degraded-mode coverage uses the
 * `team-missing` mock scope (dataAvailable=false), which must render explicit
 * unavailable states — never empty states.
 */

const populatedFilter = encodeFilter({
    ...defaultMetricFilter,
    time: { range_days: 30, compare_days: 30 },
});

const missingDataFilter = encodeFilter({
    ...defaultMetricFilter,
    scope: { level: "team", ids: ["team-missing"] },
    time: { range_days: 30, compare_days: 30 },
});

const aiTabStrip = (page: Page) => page.getByRole("navigation", { name: "AI views" });
const riskTabStrip = (page: Page) =>
    page.getByRole("navigation", { name: "Governance Risk views" });

const expectFilterParam = async (page: Page) => {
    await expect(page).toHaveURL(/[?&]f=/);
};

test.describe("AI area journey (CHAOS-2213)", () => {
    // In test mode getAISignals returns the deterministic SAMPLE_AI_* constants
    // (src/lib/ai/sample-data.ts, testops fetcher convention) through the real
    // severity derivation, so the hub renders a stable mix of states.
    test("overview hub renders populated signal values in test mode", async ({ page }) => {
        await page.goto(`/ai?f=${populatedFilter}`);
        await expect(page.getByTestId("area-overview")).toBeVisible();

        const card = (id: string) => page.locator(`[data-signal-id="${id}"]`);

        await expect(card("ai-impact")).toHaveAttribute("data-state", "low");
        await expect(card("ai-impact").getByTestId("area-signal-value")).toHaveText(
            "34% AI-assisted",
        );

        await expect(card("ai-review-load")).toHaveAttribute("data-state", "medium");
        await expect(card("ai-review-load").getByTestId("area-signal-value")).toHaveText(
            "1.7× amplification",
        );

        await expect(card("ai-governance-risk")).toHaveAttribute("data-state", "high");
        await expect(card("ai-governance-risk").getByTestId("area-signal-value")).toHaveText(
            "3 violations",
        );

        await expect(card("ai-automations")).toHaveAttribute("data-state", "neutral");
        await expect(card("ai-automations").getByTestId("area-signal-value")).toHaveText(
            "2 opportunities",
        );

        // Sample data is a severity mix by design — nothing collapses into the
        // unavailable tier.
        await expect(page.getByTestId("area-overview-empty-tier")).toHaveCount(0);
    });

    test("overview hub → impact → PR evidence drilldown → back to impact, filters intact", async ({
        page,
    }) => {
        test.slow();
        await page.goto(`/ai?f=${populatedFilter}`);
        await waitForHydration(page);

        await expect(page.getByTestId("area-overview")).toBeVisible();

        // Sidebar owns exactly the five visible AI children; the retired and
        // preview routes are absent (CHAOS-2197 / CHAOS-2200).
        const sidebar = page.getByTestId("nav-children-ai");
        for (const label of [
            "Overview",
            "Impact",
            "Review Load",
            "Governance Risk",
            "Automations",
        ]) {
            await expect(
                sidebar.getByRole("link", { name: new RegExp(`^${label}$`) }),
            ).toBeVisible();
        }
        await expect(sidebar.getByRole("link")).toHaveCount(5);
        for (const retired of ["Test Gaps", "Evidence", "Attribution"]) {
            await expect(sidebar.getByRole("link", { name: retired })).toHaveCount(0);
        }

        // Hub → Impact. The hub cards render sample-populated links in test
        // mode (asserted in the populated-hub test above); navigate via the
        // AI tab strip, the canonical entry point this journey exercises.
        await clickUntilUrl(
            page,
            aiTabStrip(page).getByRole("link", { name: /^Impact$/ }),
            /\/ai\/impact/,
        );
        await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();
        await expectFilterParam(page);

        // Ranked repo/team breakdown renders real rollups (CHAOS-2186 consumer)
        // and links into the PR-evidence drilldown (CHAOS-2196).
        const breakdown = page.getByTestId("ai-impact-breakdown");
        await expect(breakdown).toBeVisible();
        await expect(breakdown.getByTestId("ai-impact-rollup-row").first()).toBeVisible();
        await clickUntilUrl(
            page,
            breakdown.getByRole("link", { name: /Open evidence/ }),
            /\/ai\/impact\/evidence/,
        );
        await expectFilterParam(page);

        // Evidence list: provenance badges per row, Work Graph evidence on select.
        const list = page.getByTestId("ai-impact-evidence-list");
        await expect(list.getByTestId("ai-impact-evidence-row")).toHaveCount(3);
        await expect(list.getByTestId("ai-attribution-badge").first()).toBeVisible();
        await list.getByTestId("ai-impact-evidence-row").first().click();
        await expect(list.getByTestId("ai-drilldown-evidence")).toBeVisible();

        // Pagination is honest about a single page: 3 rows < page size, so both
        // controls are disabled (the mock honors limit/offset — CHAOS-2196 fix).
        await expect(list.getByRole("button", { name: "Previous" })).toBeDisabled();
        await expect(list.getByRole("button", { name: "Next" })).toBeDisabled();

        // Single return path (A5): BackLink → Impact, filters intact.
        await clickUntilUrl(
            page,
            page.getByRole("link", { name: "Back to Impact" }),
            /\/ai\/impact(\?|$)/,
        );
        await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();
        await expectFilterParam(page);
    });

    test("impact → review load → governance risk tabs → automations, filters intact", async ({
        page,
    }) => {
        test.slow();
        await page.goto(`/ai/impact?f=${populatedFilter}`);
        await waitForHydration(page);
        await expect(page.getByTestId("ai-impact-dashboard")).toBeVisible();

        // Review Load: the real Wave-2 metrics replace the old proxies (CHAOS-2194).
        await clickUntilUrl(
            page,
            aiTabStrip(page).getByRole("link", { name: /^Review Load$/ }),
            /\/ai\/review-load/,
        );
        const reviewLoad = page.getByTestId("ai-review-load-dashboard");
        await expect(reviewLoad.getByText("Pickup latency")).toBeVisible();
        await expect(reviewLoad.getByText("Review comments per LOC")).toBeVisible();
        await expectFilterParam(page);

        // Governance Risk: Overview tab active by default.
        await clickUntilUrl(
            page,
            aiTabStrip(page).getByRole("link", { name: /^Governance Risk$/ }),
            /\/ai\/risk/,
        );
        await expect(page.getByTestId("ai-risk-dashboard")).toBeVisible();
        await expect(riskTabStrip(page).getByRole("link", { name: "Overview" })).toHaveAttribute(
            "aria-current",
            "page",
        );

        // Test Gaps tab: aggregate-only by design — the population behind the
        // gap counts is not addressable per-PR yet, so no drilldown affordance
        // may exist (CHAOS-2197 review verdict).
        await riskTabStrip(page).getByRole("link", { name: "Test Gaps" }).click();
        await expect(page).toHaveURL(/view=test-gaps/);
        const gaps = page.getByTestId("ai-test-gaps-panel");
        await expect(gaps).toBeVisible();
        await expect(gaps.getByTestId("ai-test-gap-evidence-note")).toBeVisible();
        await expect(gaps.getByRole("button", { name: /evidence|drill/i })).toHaveCount(0);
        await expectFilterParam(page);

        // Evidence tab: the PR-evidence explorer renders its table + search.
        await riskTabStrip(page).getByRole("link", { name: "Evidence" }).click();
        await expect(page).toHaveURL(/view=evidence/);
        await expect(page.getByTestId("ai-evidence-panel")).toBeVisible();
        await expect(page.getByTestId("ai-drilldown-search")).toBeVisible();
        await expectFilterParam(page);

        // Automations: opportunities include the CHAOS-2189 expansion kinds,
        // rendered through the uniform kind eyebrow.
        await clickUntilUrl(
            page,
            aiTabStrip(page).getByRole("link", { name: /^Automations$/ }),
            /\/ai\/automations/,
        );
        const automations = page.getByTestId("ai-automations-dashboard");
        await expect(automations).toBeVisible();
        await expect(automations.getByText(/DEPENDENCY UPDATES/).first()).toBeVisible();
        await expect(automations.getByText(/TEST GENERATION/).first()).toBeVisible();
        await expectFilterParam(page);
    });

    test("retired standalone routes deep-link into the Governance Risk tabs with scope preserved", async ({
        page,
    }) => {
        await page.goto(`/ai/test-gaps?f=${populatedFilter}`);
        await expect(page).toHaveURL(/\/ai\/risk\?.*view=test-gaps/);
        await expectFilterParam(page);
        await expect(page.getByTestId("ai-test-gaps-panel")).toBeVisible();

        await page.goto(`/ai/evidence?f=${populatedFilter}`);
        await expect(page).toHaveURL(/\/ai\/risk\?.*view=evidence/);
        await expectFilterParam(page);
        await expect(page.getByTestId("ai-evidence-panel")).toBeVisible();
    });

    test("Improve opportunities cross-links to canonical AI Automations with filters intact", async ({
        page,
    }) => {
        test.slow();
        await page.goto(`/opportunities?f=${populatedFilter}`);
        await waitForHydration(page);

        const crosslink = page.getByTestId("improve-ai-automations-crosslink");
        await expect(crosslink).toBeVisible();
        await clickUntilUrl(
            page,
            crosslink.getByRole("link", { name: /See AI Automations/ }),
            /\/ai\/automations/,
        );
        await expect(page.getByTestId("ai-automations-dashboard")).toBeVisible();
        await expectFilterParam(page);
    });

    test("degraded journey: missing scope renders honest unavailable states, never empties", async ({
        page,
    }) => {
        // Overview hub: server-side test-mode sample data is deliberately
        // scope-independent (the testops fetcher convention — samples never
        // simulate per-scope outages), so the hub renders its sample cards for
        // this scope too. The missing-vs-populated contrast is asserted on the
        // CLIENT-side surfaces below, where the MSW harness honors the
        // `team-missing` scope with dataAvailable=false.
        await page.goto(`/ai?f=${missingDataFilter}`);
        await expect(page.getByTestId("area-overview")).toBeVisible();
        await expect(page.getByTestId("area-signal-value").first()).toBeVisible();

        // Evidence tab: explicit missing-data panel, not the honest-zero empty
        // state (unavailable ≠ empty — CHAOS-2197 review verdict).
        await page.goto(`/ai/risk?view=evidence&f=${missingDataFilter}`);
        const panel = page.getByTestId("ai-evidence-panel");
        await expect(panel.getByTestId("ai-evidence-unavailable")).toBeVisible();
        await expect(panel.getByTestId("ai-missing-data-panel")).toBeVisible();
        await expect(panel.getByTestId("ai-drilldown-empty")).toHaveCount(0);
    });

    test("attribution renders the live resolver-backed dashboard (CHAOS-2744)", async ({
        page,
    }) => {
        await page.goto(`/ai/attribution?f=${populatedFilter}`);

        await expect(page.getByRole("heading", { name: "Attribution" })).toBeVisible();

        // CHAOS-2744 replaced the static preview stub (AITabPreview + preview
        // badge) with the live aiAttributionOverview-backed dashboard. The
        // Playwright mock backend does not yet stub aiAttributionOverview, so
        // the honest "unavailable" DataState -- not the removed preview
        // markers -- is the deterministic outcome here.
        await expect(page.getByTestId("data-state-detector-unavailable")).toBeVisible();
        await expect(page.getByText("AI attribution data unavailable")).toBeVisible();
        await expect(page.getByTitle("This feature is in preview.")).toHaveCount(0);
        await expect(page.getByTestId("ai-tab-preview")).toHaveCount(0);
    });
});
