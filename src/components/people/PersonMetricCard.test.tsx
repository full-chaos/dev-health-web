import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PersonMetricCard } from "@/components/people/PersonMetricCard";
import type { MetricDelta } from "@/lib/types";

afterEach(cleanup);

const served = (over: Partial<MetricDelta>): MetricDelta => ({
    metric: "blocked_work",
    label: "Blocked Work",
    value: 0,
    unit: "items",
    delta_pct: 0,
    spark: [],
    ...over,
});

const draw = (over: Partial<MetricDelta>) =>
    render(<PersonMetricCard delta={served(over)} href="/people/p1/metrics/blocked_work" />);

describe("person metric tile states", () => {
    it("no data: the message, no value and no change line", () => {
        const { container } = draw({ has_data: false, has_prior_data: true });
        expect(screen.getByText("No data for this window")).toBeTruthy();
        expect(screen.queryByTestId("neutral-delta")).toBeNull();
        expect(screen.queryByText("No prior period")).toBeNull();
        expect(container.textContent).not.toMatch(/0%/);
    });

    it("no data in both windows reads as no data", () => {
        draw({ has_data: false, has_prior_data: false });
        expect(screen.getByText("No data for this window")).toBeTruthy();
        expect(screen.queryByText("No prior period")).toBeNull();
    });

    it("no prior: the value and No prior period, no percent", () => {
        const { container } = draw({ value: 7, has_data: true, has_prior_data: false });
        expect(screen.getByText("No prior period")).toBeTruthy();
        expect(screen.queryByTestId("neutral-delta")).toBeNull();
        expect(container.textContent).toContain("7");
        expect(container.textContent).not.toMatch(/-100%|0%/);
    });

    it("measured 0 with data in both windows still draws 0 and its change", () => {
        const { container } = draw({ has_data: true, has_prior_data: true });
        expect(screen.queryByText("No data for this window")).toBeNull();
        expect(screen.queryByText("No prior period")).toBeNull();
        expect(container.textContent).toContain("0");
        expect(screen.getByTestId("neutral-delta")).toBeTruthy();
    });

    it("flags absent reads as data", () => {
        draw({ value: 4, delta_pct: 25 });
        expect(screen.queryByText("No data for this window")).toBeNull();
        expect(screen.getByTestId("neutral-delta").textContent).toContain("25");
    });

    it("null percent with both windows measured: change from zero", () => {
        draw({ value: 5, delta_pct: null, has_data: true, has_prior_data: true });
        expect(screen.getByTestId("neutral-delta").textContent).toMatch(/\+5.*from 0/);
    });

    it("null percent with no prior: No prior period, not from zero", () => {
        draw({ value: 5, delta_pct: null, has_data: true, has_prior_data: false });
        expect(screen.getByText("No prior period")).toBeTruthy();
        expect(screen.queryByText(/from 0/)).toBeNull();
    });

    it("null percent with no data: the no-data message wins", () => {
        draw({ value: 0, delta_pct: null, has_data: false, has_prior_data: true });
        expect(screen.getByText("No data for this window")).toBeTruthy();
        expect(screen.queryByText(/from 0/)).toBeNull();
    });
});
