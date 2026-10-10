// CHAOS-9077: metricCardProps carries the metric's polarity to the tile.
// NEW behaviour (`polarity` in the returned props) is tested below; fails until implemented.
import { describe, it, expect } from "vitest";
import { MetricCard } from "@/components/metrics/MetricCard";
import { metricCardProps } from "../metricDisplay";
import { render, screen } from "@/test/utils";

const GOOD = "text-(--positive)";
const BAD = "text-(--accent-negative)";
const MUTED = "text-(--ink-muted)";

const row = (metric: string, delta_pct: number | null, extra: Record<string, unknown> = {}) => ({
    metric,
    value: 10,
    unit: "%",
    delta_pct,
    has_data: true,
    has_prior_data: true,
    ...extra,
});

const polarityOf = (r: Parameters<typeof metricCardProps>[0]) =>
    (metricCardProps(r) as { polarity?: string }).polarity;

describe("metricCardProps polarity", () => {
    it("is lowerIsBetter for pr_rework_ratio and change_failure_rate", () => {
        expect(polarityOf(row("pr_rework_ratio", 5))).toBe("lowerIsBetter");
        expect(polarityOf(row("change_failure_rate", 5))).toBe("lowerIsBetter");
    });

    it("is higherIsBetter for ci_success", () => {
        expect(polarityOf(row("ci_success", 5))).toBe("higherIsBetter");
    });

    it("is undefined for a metric with no catalog entry", () => {
        expect(polarityOf(row("not_in_the_catalog", 5))).toBeUndefined();
    });

    it("is undefined for a row with no metric key", () => {
        const { metric: _metric, ...noKey } = row("x", 5);
        expect(polarityOf(noKey)).toBeUndefined();
    });

    it("is undefined for a null row and for a no-data row", () => {
        expect(polarityOf(null)).toBeUndefined();
        expect(polarityOf(undefined)).toBeUndefined();
        expect(polarityOf(row("pr_rework_ratio", 5, { has_data: false }))).toBeUndefined();
    });
});

describe("<MetricCard {...metricCardProps(row)} /> change tone", () => {
    const tone = (r: ReturnType<typeof row>) => {
        render(<MetricCard label="X" {...metricCardProps(r)} />);
        return screen.getByTestId("metric-delta");
    };

    it("pr_rework_ratio: a rise is bad, a fall is good", () => {
        const { unmount } = render(
            <MetricCard label="X" {...metricCardProps(row("pr_rework_ratio", 5))} />,
        );
        expect(screen.getByTestId("metric-delta")).toHaveClass(BAD);
        unmount();
        expect(tone(row("pr_rework_ratio", -5))).toHaveClass(GOOD);
    });

    it("change_failure_rate: a rise is bad, a fall is good", () => {
        const { unmount } = render(
            <MetricCard label="X" {...metricCardProps(row("change_failure_rate", 5))} />,
        );
        expect(screen.getByTestId("metric-delta")).toHaveClass(BAD);
        unmount();
        expect(tone(row("change_failure_rate", -5))).toHaveClass(GOOD);
    });

    it("ci_success: a rise is good, a fall is bad", () => {
        const { unmount } = render(
            <MetricCard label="X" {...metricCardProps(row("ci_success", 5))} />,
        );
        expect(screen.getByTestId("metric-delta")).toHaveClass(GOOD);
        unmount();
        expect(tone(row("ci_success", -5))).toHaveClass(BAD);
    });

    it("a metric with no catalog entry is neutral both ways", () => {
        const { unmount } = render(
            <MetricCard label="X" {...metricCardProps(row("not_in_the_catalog", 5))} />,
        );
        expect(screen.getByTestId("metric-delta")).toHaveClass(MUTED);
        unmount();
        expect(tone(row("not_in_the_catalog", -5))).toHaveClass(MUTED);
    });

    it("changed from zero follows the polarity of the row", () => {
        const { unmount } = render(
            <MetricCard label="X" {...metricCardProps(row("pr_rework_ratio", null))} />,
        );
        expect(screen.getByTestId("metric-delta")).toHaveClass(BAD);
        unmount();
        expect(tone(row("ci_success", null))).toHaveClass(GOOD);
    });

    it("a no-data row draws no change", () => {
        render(
            <MetricCard
                label="X"
                {...metricCardProps(row("pr_rework_ratio", 5, { has_data: false }))}
            />,
        );
        expect(screen.queryByTestId("metric-delta")).toBeNull();
    });
});
