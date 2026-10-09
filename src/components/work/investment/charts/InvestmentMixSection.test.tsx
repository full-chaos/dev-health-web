/**
 * The Sunburst state of the Investment mix card (prototype `sunburstChart`, charts-b.js): the chart
 * at the left and plain meter rows at the right (theme share of the mix, theme colour). A theme row
 * drills into the theme's subcategories; the Work Graph link stays reachable.
 */
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { renderWithEvidenceDrawer as render } from "@/test/evidenceDrawer";
import { fireEvent, screen, within } from "@/test/utils";
import type { MetricFilter } from "@/lib/filters/types";

import { InvestmentMixSection } from "./InvestmentMixSection";

vi.mock("next/navigation", () => ({
    usePathname: () => "/investment",
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return { ...actual, useChartTheme: () => ({ grid: "#e5e7eb" }) };
});
vi.mock("@/components/charts/InvestmentMixSunburst", () => ({
    InvestmentMixSunburst: () => <div data-testid="sunburst-chart" />,
}));

const filters: MetricFilter = {
    scope: { level: "org", ids: [] },
    time: { range_days: 90, compare_days: 90 },
    who: { developers: [] },
    what: { repos: [] },
    why: { work_category: [] },
    how: {},
};

const mix = {
    theme_distribution: { feature_delivery: 60, maintenance: 30, risk: 10 },
    subcategory_distribution: {
        "feature_delivery.roadmap": 45,
        "feature_delivery.customer": 15,
        "maintenance.refactor": 30,
    },
    evidence_quality_distribution: {},
    unit: "work_units",
};

// Bars carry no label, so they take the series colors (themeBarColorMap), not the darker tile colors.
const BAR_COLORS = new Map([
    ["feature_delivery", "var(--series-a)"],
    ["maintenance", "var(--series-b)"],
    ["risk", "var(--series-c)"],
]);
const COLORS = new Map([
    ["feature_delivery", "var(--chart-color-1)"],
    ["maintenance", "var(--chart-color-2)"],
    ["risk", "var(--chart-color-3)"],
]);

function Harness({ mixFailed }: { mixFailed?: boolean } = {}) {
    const [focusTheme, setFocusTheme] = useState<string | null>(null);
    const [focusSubcategory, setFocusSubcategory] = useState<string | null>(null);
    return (
        <InvestmentMixSection
            filters={filters}
            investmentMix={mix as never}
            isLoading={false}
            isMixLoading={false}
            mixFailed={mixFailed}
            workUnits={[]}
            effortUnit="work units"
            focusTheme={focusTheme}
            focusSubcategory={focusSubcategory}
            setFocusTheme={setFocusTheme}
            setFocusSubcategory={setFocusSubcategory}
            themeColorMap={COLORS}
            themeBarColorMap={BAR_COLORS}
        />
    );
}

const showSunburst = () => fireEvent.click(screen.getByRole("radio", { name: /sunburst/i }));

describe("Investment mix, Sunburst state", () => {
    it("draws the chart and plain meter rows of the themes: label, share of the mix, theme colour", () => {
        render(<Harness />);
        showSunburst();
        expect(screen.getByTestId("sunburst-chart")).toBeInTheDocument();
        const panel = screen.getByTestId("mix-sunburst-panel");
        // No legacy card: no upper-case head, no bordered button rows.
        expect(panel.className).not.toContain("border");
        expect(panel).not.toHaveTextContent(/^Themes/);
        const rows = within(screen.getByRole("list", { name: "Themes" })).getAllByTestId(
            "meter-row",
        );
        expect(rows.map((row) => row.textContent)).toEqual([
            "Feature Delivery60%",
            "Maintenance30%",
            "Risk10%",
        ]);
        const fill = within(rows[0]).getByTestId("meter-fill");
        expect(fill.style.width).toBe("60%");
        expect(fill.style.background).toBe("var(--series-a)");
        expect(within(rows[1]).getByTestId("meter-fill").style.background).toBe("var(--series-b)");
        expect(panel).not.toHaveTextContent("feature_delivery");
    });

    it("a theme row drills into its subcategories (share of the theme); the Work Graph link stays reachable", () => {
        render(<Harness />);
        showSunburst();
        expect(screen.queryByTestId("mix-sunburst-work-graph")).toBeNull();
        fireEvent.click(screen.getByRole("button", { name: "Feature Delivery" }));

        const list = screen.getByRole("list", { name: "Feature Delivery subcategories" });
        const rows = within(list).getAllByTestId("meter-row");
        expect(rows.map((row) => within(row).getByTestId("meter-value").textContent)).toEqual([
            "75%",
            "25%",
        ]);
        const link = screen.getByTestId("mix-sunburst-work-graph");
        expect(link).toHaveTextContent("Open Work Graph");
        expect(link.getAttribute("href")).toContain("work-graph");
        // Ghost small action, icon before the text.
        expect(link.className).toContain("border-transparent");
        expect(link.firstElementChild?.tagName.toLowerCase()).toBe("svg");

        // A subcategory row selects that subcategory.
        const first = within(rows[0]).getByRole("button");
        fireEvent.click(first);
        expect(within(rows[0]).getByRole("button")).toHaveAttribute("aria-pressed", "true");
    });
});

describe("Investment mix, failed read", () => {
    it("draws the failure state and no chart or rows when the mix query failed (even with a mix held)", () => {
        render(<Harness mixFailed />);
        showSunburst();
        expect(screen.getByText("Investment mix unavailable")).toBeInTheDocument();
        expect(
            screen.getByText("The investment mix could not be loaded for this scope and window."),
        ).toBeInTheDocument();
        expect(screen.queryByTestId("sunburst-chart")).not.toBeInTheDocument();
    });

    it("draws the chart and no failure state when the read succeeded", () => {
        render(<Harness />);
        showSunburst();
        expect(screen.getByTestId("sunburst-chart")).toBeInTheDocument();
        expect(screen.queryByText("Investment mix unavailable")).not.toBeInTheDocument();
    });
});
