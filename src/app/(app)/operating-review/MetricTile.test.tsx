import { describe, expect, it } from "vitest";

import { render, screen } from "@/test/utils";
import type { OperatingReviewMetric } from "@/lib/graphql/types";

import { MetricTile } from "./MetricTile";

const metric = (over: Partial<OperatingReviewMetric> = {}, delta = {}): OperatingReviewMetric => ({
    key: "throughput",
    label: "Throughput",
    value: 15,
    unit: "items",
    hasData: true,
    ...over,
    delta: {
        value: 15,
        priorValue: 9,
        absolute: 6,
        percent: 66.7,
        status: "improved",
        hasPriorData: true,
        ...delta,
    },
});

const tile = () => screen.getByTestId("operating-review-metric");
const text = () => tile().textContent ?? "";

// CHAOS-8115: the API says whether the week and the prior week hold a stored value. With no stored
// value the number it serves is a 0 placeholder: the tile says "No data for this window", never 0,
// and shows no change and no status that would compare with a placeholder.
describe("Operating Review metric tile", () => {
    it("shows the value, the status and the change when both weeks have data", () => {
        render(<MetricTile metric={metric()} narrow={false} />);
        expect(text()).toContain("15");
        expect(screen.getByTestId("operating-review-metric-status")).toHaveTextContent("improved");
        expect(text()).toContain("Prior: 9");
        expect(text()).toContain("+6");
        expect(text()).not.toContain("No data for this window");
        expect(text()).not.toContain("No prior period");
    });

    it("shows a stored 0 as 0: a stored zero is a value", () => {
        render(
            <MetricTile
                metric={metric({ value: 0 }, { value: 0, absolute: -9, status: "worsened" })}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveTextContent(/^0/);
        expect(text()).not.toContain("No data for this window");
        expect(screen.getByTestId("operating-review-metric-status")).toHaveTextContent("worsened");
    });

    it("says 'No data for this window' for a week with no stored value: no 0, no status, no change", () => {
        render(
            <MetricTile
                metric={metric(
                    { value: 0, hasData: false },
                    { value: 0, absolute: -9, percent: -100, status: "worsened" },
                )}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveTextContent("No data for this window");
        expect(screen.queryByTestId("operating-review-metric-status")).toBeNull();
        expect(text()).not.toContain("worsened");
        expect(text()).not.toContain("Δ");
        expect(text()).not.toContain("-100");
        // The prior week has a stored value: it is shown, with no change beside it.
        expect(text()).toContain("Prior: 9");
    });

    it("says 'No prior period' for a prior week with no stored value: the value stays, no status, no change", () => {
        render(
            <MetricTile
                metric={metric(
                    {},
                    {
                        priorValue: 0,
                        absolute: 15,
                        percent: null,
                        status: "improved",
                        hasPriorData: false,
                    },
                )}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveTextContent("15");
        expect(text()).toContain("No prior period");
        expect(text()).not.toContain("Prior: 0");
        expect(screen.queryByTestId("operating-review-metric-status")).toBeNull();
        expect(text()).not.toContain("improved");
        expect(text()).not.toContain("Δ");
    });

    it("says both when neither week has a stored value", () => {
        render(
            <MetricTile
                metric={metric(
                    { value: 0, hasData: false },
                    {
                        value: 0,
                        priorValue: 0,
                        absolute: 0,
                        percent: null,
                        status: "unchanged",
                        hasPriorData: false,
                    },
                )}
                narrow={false}
            />,
        );
        expect(screen.getByTestId("metric-value")).toHaveTextContent("No data for this window");
        expect(text()).toContain("No prior period");
        expect(screen.queryByTestId("operating-review-metric-status")).toBeNull();
        expect(text()).not.toContain("unchanged");
    });

    it("treats an answer with no flags (an API before the flags) as data, as before", () => {
        const old = metric();
        delete (old as { hasData?: boolean }).hasData;
        delete (old.delta as { hasPriorData?: boolean }).hasPriorData;
        render(<MetricTile metric={old} narrow={false} />);
        expect(screen.getByTestId("operating-review-metric-status")).toHaveTextContent("improved");
        expect(text()).toContain("Prior: 9");
    });
});
