import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { ReworkThemeAllocation } from "@/lib/types";

import { ReworkThemeBars } from "./ReworkThemeBars";

// The token hook reads the document stylesheet and matchMedia: use the fallback roles.
// The raw series colors (--chart-color-1..5, dark). Unlabelled bars keep them (CHAOS-8510).
const SERIES = vi.hoisted(() => ["#0b8fb0", "#c98500", "#da2100", "#02a2bc", "#e8650a"]);

vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return {
        ...actual,
        useChartTokens: () => actual.fallbackTokens,
        useChartColors: () => SERIES,
    };
});

const row = (over: Partial<ReworkThemeAllocation>): ReworkThemeAllocation => ({
    theme: "quality",
    label: "Quality / Reliability",
    allocation: 0.4,
    allocation_pct: 40,
    prs_merged: 3,
    churn_loc: 2500,
    ...over,
});

const barColor = (item: HTMLElement) =>
    within(item).getByTestId("rework-theme-bar").style.backgroundColor;

describe("ReworkThemeBars", () => {
    it("keeps the row order and the label, percent, PR and churn texts", () => {
        render(
            <ReworkThemeBars
                rows={[
                    row({ theme: "risk", label: "Risk / Security", allocation_pct: 56.64 }),
                    row({ prs_merged: 1, churn_loc: 0 }),
                    row({ theme: "feature", label: "Feature Delivery", churn_loc: 30 }),
                ]}
            />,
        );

        const items = screen.getAllByRole("listitem");
        expect(items.map((item) => item.getAttribute("data-theme"))).toEqual([
            "risk",
            "quality",
            "feature",
        ]);
        expect(within(items[0]).getByText("Risk / Security")).toBeInTheDocument();
        expect(within(items[0]).getByText("56.6%")).toBeInTheDocument();
        expect(within(items[0]).getByText("3 PRs")).toBeInTheDocument();
        // The shared compact LOC format ("2.5K").
        expect(within(items[0]).getByText("2.5K churn LOC")).toBeInTheDocument();
        expect(within(items[1]).getByText("1 PR")).toBeInTheDocument();
        // A served 0 is 0; a served small value is never shown as 0 (it read "0k").
        expect(within(items[1]).getByText("0 churn LOC")).toBeInTheDocument();
        expect(within(items[2]).getByText("30 churn LOC")).toBeInTheDocument();
    });

    it("clamps the bar width at 100 %", () => {
        render(<ReworkThemeBars rows={[row({ allocation_pct: 140 })]} />);

        expect(screen.getByTestId("rework-theme-bar").style.width).toBe("100%");
    });

    it("gives each bar the fixed color of its investment theme", () => {
        render(
            <ReworkThemeBars
                rows={[row({ theme: "risk" }), row({ theme: "quality" }), row({ theme: "other" })]}
            />,
        );

        const [risk, quality, other] = screen.getAllByRole("listitem");
        const probe = document.createElement("div");
        probe.style.backgroundColor = SERIES[1];
        expect(barColor(risk)).toBe(probe.style.backgroundColor);
        probe.style.backgroundColor = SERIES[3];
        expect(barColor(quality)).toBe(probe.style.backgroundColor);
        // An unknown theme gets the neutral muted token, never the action color.
        expect(barColor(other)).toBe("var(--text-muted)");
    });
});

describe("ReworkThemeBars small-bar recipe", () => {
    it("draws no fill for a zero allocation and a 2 px minimum for a small one", () => {
        render(
            <ReworkThemeBars
                rows={[
                    row({ theme: "risk", allocation_pct: 0 }),
                    row({ theme: "quality", allocation_pct: 0.2 }),
                ]}
            />,
        );

        const [zero, small] = screen.getAllByRole("listitem");
        expect(within(zero).queryByTestId("rework-theme-bar")).toBeNull();
        const fill = within(small).getByTestId("rework-theme-bar");
        expect(fill.style.minWidth).toBe("2px");
        expect(fill).toHaveAttribute("aria-hidden", "true");
    });
});

describe("ReworkThemeBars measure (CHAOS-9624)", () => {
    const sized = (over: Partial<ReworkThemeAllocation>) =>
        row({
            measure: "ISSUE_SIZE",
            allocation: 30,
            denominator: 120,
            allocation_pct: 99,
            sizing_coverage: 0.8,
            unsized_unit_count: 4,
            work_unit_count: 20,
            ...over,
        });

    it("uses the denominator as the share base", () => {
        render(<ReworkThemeBars rows={[sized({})]} />);
        expect(screen.getByText("25%")).toBeInTheDocument();
        expect(screen.queryByText("99%")).not.toBeInTheDocument();
    });

    it("keeps the served percent when there is no denominator", () => {
        render(<ReworkThemeBars rows={[row({ allocation_pct: 40 })]} />);
        expect(screen.getByText("40%")).toBeInTheDocument();
        expect(screen.queryByTestId("theme-measure-note")).not.toBeInTheDocument();
    });

    it("ISSUE_SIZE with coverage at or above 50% shows the measure only", () => {
        render(<ReworkThemeBars rows={[sized({})]} />);
        expect(screen.getByTestId("theme-measure")).toHaveTextContent("Share of issue size.");
        expect(screen.queryByTestId("theme-sizing-note")).not.toBeInTheDocument();
    });

    it("ISSUE_SIZE below 50% says mostly unsized", () => {
        render(
            <ReworkThemeBars
                rows={[
                    sized({ sizing_coverage: 0.25, unsized_unit_count: 15, work_unit_count: 20 }),
                ]}
            />,
        );
        expect(screen.getByTestId("theme-sizing-note")).toHaveTextContent(
            "Mostly unsized: 5 of 20 work units have an issue size. The other 15 have no size, so each counts as 1 work unit.",
        );
    });

    it("says it counts for one unsized unit", () => {
        render(
            <ReworkThemeBars
                rows={[sized({ sizing_coverage: 0.4, unsized_unit_count: 3, work_unit_count: 5 })]}
            />,
        );
        expect(screen.getByTestId("theme-sizing-note")).toHaveTextContent(
            "Mostly unsized: 2 of 5 work units have an issue size. The other 3 have no size, so each counts as 1 work unit.",
        );
        cleanup();
        render(
            <ReworkThemeBars
                rows={[sized({ sizing_coverage: 0.25, unsized_unit_count: 3, work_unit_count: 4 })]}
            />,
        );
        expect(screen.getByTestId("theme-sizing-note")).toHaveTextContent("The other 3");
    });

    it("ISSUE_SIZE with null coverage says not measured, never 0", () => {
        render(
            <ReworkThemeBars
                rows={[
                    sized({
                        sizing_coverage: null,
                        unsized_unit_count: null,
                        work_unit_count: null,
                    }),
                ]}
            />,
        );
        expect(screen.getByTestId("theme-sizing-note")).toHaveTextContent(
            "The share of work units with an issue size was not reported for this window.",
        );
        expect(screen.queryByText("0%")).not.toBeInTheDocument();
    });

    it("WORK_UNITS shows work units and no sizing note", () => {
        render(
            <ReworkThemeBars
                rows={[
                    row({
                        measure: "WORK_UNITS",
                        allocation: 2,
                        denominator: 8,
                        sizing_coverage: null,
                        unsized_unit_count: null,
                        work_unit_count: null,
                    }),
                ]}
            />,
        );
        expect(screen.getByTestId("theme-measure")).toHaveTextContent("Share of work units.");
        expect(screen.queryByTestId("theme-sizing-note")).not.toBeInTheDocument();
        expect(screen.getByText("25%")).toBeInTheDocument();
    });
});
