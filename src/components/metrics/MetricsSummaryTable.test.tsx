import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { MetricsSummaryTable } from "./MetricsSummaryTable";

const rows = [
    {
        metric: "cycle_time",
        label: "Cycle Time",
        valueText: "4.2d",
        delta: -12,
        inverseGood: true,
        href: "/explore?metric=cycle_time",
    },
    {
        metric: "throughput",
        label: "Throughput",
        valueText: "—",
        delta: null,
        inverseGood: false,
        href: "/explore?metric=throughput",
    },
];

describe("MetricsSummaryTable", () => {
    it("Metric / Current / Delta / Explore on the shared table, one row per metric, every cell a link", () => {
        render(<MetricsSummaryTable rows={rows} />);
        expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual([
            "Metric",
            "Current",
            "Delta",
            "Explore",
        ]);
        const body = screen.getAllByRole("row").slice(1);
        expect(body).toHaveLength(2);
        expect(within(body[0]).getAllByRole("link")).toHaveLength(4);
        for (const link of within(body[0]).getAllByRole("link")) {
            expect(link.getAttribute("href")).toBe("/explore?metric=cycle_time");
        }
    });

    it("no value is an em dash and no prior period says so (never a 0%)", () => {
        render(<MetricsSummaryTable rows={rows} />);
        const second = screen.getAllByRole("row")[2];
        expect(second).toHaveTextContent("—");
        expect(second).not.toHaveTextContent("--");
        expect(second).toHaveTextContent("No prior period");
        expect(second).not.toHaveTextContent("0%");
    });

    it("the delta follows the metric's polarity: a fall in a lower-is-better metric is good, a rise in the same metric is bad", () => {
        const { rerender } = render(<MetricsSummaryTable rows={rows} />);
        const first = () => within(screen.getAllByRole("row")[1]).getByText(/12%/);
        expect(first()).toHaveTextContent("↓ -12%");
        expect(first()).toHaveClass("text-(--positive)");
        rerender(<MetricsSummaryTable rows={[{ ...rows[0], delta: 12 }, rows[1]]} />);
        expect(first()).toHaveClass("text-(--accent-negative)");
        rerender(
            <MetricsSummaryTable rows={[{ ...rows[0], delta: 12, inverseGood: false }, rows[1]]} />,
        );
        expect(first()).toHaveClass("text-(--positive)");
    });
});
