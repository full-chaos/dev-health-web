import { describe, expect, it, vi } from "vitest";

import type { MetricFilter } from "@/lib/filters/types";
import { render, screen, within } from "@/test/utils";

vi.mock("@/components/charts/TimeseriesChart", () => ({
    TimeseriesChart: () => <div data-testid="timeseries" />,
}));

import { ContextSwitchingView, OverviewView, contextSpreadSummary } from "./CognitiveLoadViews";

const windowLabel = { sinceDate: "2026-06-01", untilDate: "2026-06-03" };
const filters = {
    scope: { level: "team" as const, ids: ["team-1"] },
    time: { range_days: 30 },
    what: { repos: [] },
} as unknown as MetricFilter;

const endsOnGap = [
    { day: "2026-06-01", value: 4, label: "06-01" },
    { day: "2026-06-02", value: 12, label: "06-02" },
    { day: "2026-06-03", value: null, label: "06-03" },
];
const allGaps = [
    { day: "2026-06-01", value: null, label: "06-01" },
    { day: "2026-06-02", value: null, label: "06-02" },
];
const endsMeasured = [
    { day: "2026-06-01", value: null, label: "06-01" },
    { day: "2026-06-02", value: 9, label: "06-02" },
];

const latestChip = () => document.querySelector('[data-annotation="Chart threshold"]');

describe("contextSpreadSummary with gaps (Latest is the chronologically last day)", () => {
    it("a window that ends on a gap has no latest value; the peak is over measured days", () => {
        expect(contextSpreadSummary(endsOnGap)).toEqual({ hasData: true, latest: null, peak: 12 });
    });

    it("a window of only gaps has no data", () => {
        expect(contextSpreadSummary(allGaps)).toEqual({ hasData: false, latest: null, peak: null });
    });

    it("control: a measured last day is the latest value, gaps before it do not matter", () => {
        expect(contextSpreadSummary(endsMeasured)).toEqual({ hasData: true, latest: 9, peak: 9 });
    });
});

describe("Latest badge on the context spread chart", () => {
    it("Context Switching: a window that ends on a gap keeps the badge and shows the no-data mark, not the earlier reading", () => {
        render(<ContextSwitchingView trend={endsOnGap} window={windowLabel} />);

        const chip = latestChip();
        expect(chip).not.toBeNull();
        expect(chip).toHaveTextContent("Latest");
        expect(chip).toHaveTextContent("—");
        expect(chip).not.toHaveTextContent("12");
        expect(screen.getByText("Window peak")).toBeInTheDocument();
    });

    it("Overview: the same window shows the same badge", () => {
        render(
            <OverviewView
                signals={null}
                window={windowLabel}
                filters={filters}
                activeRole="engineer"
                trend={endsOnGap}
            />,
        );
        expect(screen.getByText("What is pulling attention apart?")).toBeInTheDocument();
        const chip = latestChip();
        expect(chip).toHaveTextContent("Latest");
        expect(chip).toHaveTextContent("—");
        expect(chip).not.toHaveTextContent("12");
    });

    it("a window of only gaps shows the existing empty state and no badge", () => {
        render(<ContextSwitchingView trend={allGaps} window={windowLabel} />);

        expect(screen.getByText("No context-spread data")).toBeInTheDocument();
        expect(latestChip()).toBeNull();
    });

    it("control: a measured last day shows its value", () => {
        render(<ContextSwitchingView trend={endsMeasured} window={windowLabel} />);

        const chip = latestChip();
        expect(chip).toHaveTextContent("Latest");
        expect(within(chip as HTMLElement).getByText("9")).toBeInTheDocument();
    });
});
