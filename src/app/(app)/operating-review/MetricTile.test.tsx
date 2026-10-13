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
        expect(screen.getByTestId("metric-value")).toHaveAttribute("data-value-kind", "value");
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
        expect(screen.getByTestId("metric-value")).toHaveAttribute("data-value-kind", "message");
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

// The API says per metric whether the team selection narrows it (`scope`). A metric of the whole
// organization is labeled when a team is selected, so its value is not read as the selection's.
describe("Operating Review metric tile: served scope", () => {
    const LABEL = "Whole organization";

    it("labels a whole-organization metric when a team is selected", () => {
        render(
            <MetricTile metric={metric({ scope: "ORGANIZATION" })} narrow={false} teamSelected />,
        );
        expect(text()).toContain(LABEL);
    });

    it("does not label a metric that follows the team selection", () => {
        render(<MetricTile metric={metric({ scope: "TEAM" })} narrow={false} teamSelected />);
        expect(text()).not.toContain(LABEL);
    });

    it("does not label when no team is selected: every value is the organization's then", () => {
        render(
            <MetricTile
                metric={metric({ scope: "ORGANIZATION" })}
                narrow={false}
                teamSelected={false}
            />,
        );
        expect(text()).not.toContain(LABEL);
    });

    it("does not label a metric with no served scope (an API before the field)", () => {
        render(<MetricTile metric={metric()} narrow={false} teamSelected />);
        expect(text()).not.toContain(LABEL);
    });

    it("keeps the label on a whole-organization metric with no data", () => {
        render(
            <MetricTile
                metric={metric({ scope: "ORGANIZATION", hasData: false, value: 0 })}
                narrow={false}
                teamSelected
            />,
        );
        expect(text()).toContain("No data for this window");
        expect(text()).toContain(LABEL);
    });

    // CHAOS-9564: the tile prints a ratio at the precision of the served sentences.
    describe("ratio and score precision", () => {
        const ratio = (prior: number, value: number, absolute: number) =>
            metric({ unit: "ratio", value }, { priorValue: prior, value, absolute, percent: 20 });

        it("prints a ratio move of 0.10 to 0.12 as +0.02 and the prior at two decimals", () => {
            render(<MetricTile metric={ratio(0.1, 0.12, 0.02)} narrow={false} />);
            expect(text()).toContain("Δ +0.02 ratio");
            expect(text()).toContain("Prior: 0.10 ratio");
            expect(screen.getByTestId("metric-value")).toHaveTextContent(/^0\.12\s*ratio/);
        });

        it("draws the headline ratio at two decimals", () => {
            render(<MetricTile metric={ratio(0.1, 0.104, 0.004)} narrow={false} />);
            expect(screen.getByTestId("metric-value")).toHaveTextContent(/^0\.10\s*ratio/);
        });

        it("prints a negative ratio move at two decimals", () => {
            render(<MetricTile metric={ratio(0.12, 0.1, -0.02)} narrow={false} />);
            expect(text()).toContain("Δ -0.02 ratio");
        });

        it("prints the small-number form only below two decimals, never +0.00 or -0.00", () => {
            const { unmount } = render(
                <MetricTile metric={ratio(0.1, 0.104, 0.004)} narrow={false} />,
            );
            expect(text()).toContain("Δ <0.01 ratio");
            expect(text()).not.toMatch(/\+<|\+0\.00|-0\.00/);
            unmount();
            render(<MetricTile metric={ratio(0.104, 0.1, -0.004)} narrow={false} />);
            expect(text()).toContain("Δ >-0.01 ratio");
        });

        it("keeps a score at one decimal", () => {
            render(
                <MetricTile
                    metric={metric(
                        { unit: "score", value: 7.25 },
                        { priorValue: 7.1, value: 7.25, absolute: 0.15 },
                    )}
                    narrow={false}
                />,
            );
            expect(screen.getByTestId("metric-value")).toHaveTextContent(/^7\.3\s*score/);
            expect(text()).toContain("Prior: 7.1 score");
            expect(text()).toContain("Δ +0.2 score");
        });
    });
});
