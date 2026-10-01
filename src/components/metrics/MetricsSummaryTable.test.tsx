import { describe, expect, it } from "vitest";
import { render, screen, within } from "@/test/utils";

import { MetricsSummaryTable } from "./MetricsSummaryTable";

const rows = [
    {
        metric: "cycle_time",
        label: "Cycle Time",
        valueText: "4.2d",
        deltaText: "-12%",
        href: "/explore?metric=cycle_time",
    },
    {
        metric: "throughput",
        label: "Throughput",
        valueText: "--",
        deltaText: null,
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

    it("no value is '--' and no prior period says so (never a 0%)", () => {
        render(<MetricsSummaryTable rows={rows} />);
        const second = screen.getAllByRole("row")[2];
        expect(second).toHaveTextContent("--");
        expect(second).toHaveTextContent("No prior period");
        expect(second).not.toHaveTextContent("0%");
    });
});
