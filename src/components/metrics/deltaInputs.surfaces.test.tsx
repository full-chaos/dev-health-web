import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MetricCard } from "@/components/metrics/MetricCard";
import { PersonMetricCard } from "@/components/people/PersonMetricCard";
import { compareByChangeMagnitude } from "@/lib/metrics/catalog";
import {
    DELTA_INPUTS,
    FROM_ZERO_TEXT,
    NO_DATA_TEXT,
    NO_PRIOR_TEXT,
} from "@/lib/metrics/__tests__/deltaInputs.fixtures";
import { metricCardProps } from "@/lib/metrics/metricDisplay";
import type { MetricDelta } from "@/lib/types";

afterEach(cleanup);

const served = (input: (typeof DELTA_INPUTS)[number]): MetricDelta => ({
    metric: "churn_loc",
    label: "Churn LOC",
    unit: "loc",
    value: input.value,
    delta_pct: input.delta_pct,
    has_data: input.has_data,
    has_prior_data: input.has_prior_data,
    spark: [],
});

function expectState(text: string, state: (typeof DELTA_INPUTS)[number]["state"]) {
    expect(text).not.toMatch(/Not reported|0%|NaN|null/);
    if (state === "from-zero") expect(text).toMatch(FROM_ZERO_TEXT);
    else {
        expect(text).not.toContain("from 0");
        expect(text).toContain(state === "no-data" ? NO_DATA_TEXT : NO_PRIOR_TEXT);
    }
}

// CHAOS-9110: pins for the surfaces that already read the flags. Each must fail if the flag
// check is removed from the shared rule.
describe("tiles (metricCardProps) for the four served inputs", () => {
    for (const input of DELTA_INPUTS) {
        it(input.name, () => {
            const { container } = render(
                <MetricCard label="Churn LOC" {...metricCardProps(served(input))} />,
            );
            expectState(container.textContent ?? "", input.state);
        });
    }
});

describe("person tiles for the four served inputs", () => {
    for (const input of DELTA_INPUTS) {
        it(input.name, () => {
            const { container } = render(<PersonMetricCard delta={served(input)} href="/p" />);
            expectState(container.textContent ?? "", input.state);
        });
    }
});

describe("sort of changes", () => {
    const base = (over: Partial<MetricDelta>): MetricDelta => ({
        ...served(DELTA_INPUTS[0]),
        ...over,
    });
    it("a null percent with no data or no prior ranks last, never first, never as a percent", () => {
        const measured = base({ metric: "m1", delta_pct: 3 });
        const fromZero = base({ metric: "m2", delta_pct: null, value: 5 });
        const noData = base({ metric: "m3", delta_pct: null, has_data: false, value: 0 });
        const noPrior = base({ metric: "m4", delta_pct: null, has_prior_data: false, value: 9 });
        const placeholder = base({ metric: "m5", delta_pct: 0, has_data: false, value: 0 });
        const order = [placeholder, noPrior, measured, noData, fromZero]
            .sort(compareByChangeMagnitude)
            .map((d) => d.metric);
        expect(order[0]).toBe("m2");
        expect(order[1]).toBe("m1");
        expect(new Set(order.slice(2))).toEqual(new Set(["m3", "m4", "m5"]));
    });
    it("a measured percent outranks a placeholder 0 percent on a no-data side", () => {
        const measured = base({ metric: "m1", delta_pct: 0.5 });
        const placeholder = base({ metric: "m5", delta_pct: 0, has_data: false, value: 0 });
        expect([placeholder, measured].sort(compareByChangeMagnitude).map((d) => d.metric)).toEqual(
            ["m1", "m5"],
        );
    });
});
