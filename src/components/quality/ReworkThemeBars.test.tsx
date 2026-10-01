import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { fallbackTokens } from "@/components/charts/chartTheme";
import type { ReworkThemeAllocation } from "@/lib/types";

import { ReworkThemeBars } from "./ReworkThemeBars";

// The token hook reads the document stylesheet and matchMedia: use the fallback roles.
vi.mock("@/components/charts/chartTheme", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/components/charts/chartTheme")>();
    return { ...actual, useChartTokens: () => actual.fallbackTokens };
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
                ]}
            />,
        );

        const items = screen.getAllByRole("listitem");
        expect(items.map((item) => item.getAttribute("data-theme"))).toEqual(["risk", "quality"]);
        expect(within(items[0]).getByText("Risk / Security")).toBeInTheDocument();
        expect(within(items[0]).getByText("56.6%")).toBeInTheDocument();
        expect(within(items[0]).getByText("3 PRs")).toBeInTheDocument();
        expect(within(items[0]).getByText("2.5k churn LOC")).toBeInTheDocument();
        expect(within(items[1]).getByText("1 PR")).toBeInTheDocument();
        expect(within(items[1]).getByText("0k churn LOC")).toBeInTheDocument();
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
        probe.style.backgroundColor = fallbackTokens.themeRisk;
        expect(barColor(risk)).toBe(probe.style.backgroundColor);
        probe.style.backgroundColor = fallbackTokens.themeQuality;
        expect(barColor(quality)).toBe(probe.style.backgroundColor);
        // An unknown theme keeps the production color token, never an empty bar.
        expect(barColor(other)).toBe("var(--accent-2)");
    });
});
