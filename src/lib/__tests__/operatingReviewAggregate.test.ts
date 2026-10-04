import { describe, expect, it } from "vitest";

import type { OperatingReview } from "@/lib/graphql/types";
import { aggregateOperatingReviews } from "@/lib/operatingReviewAggregate";

const allTeamsReview = makeReview(null, 15, 19, 9, 18);
const teamOneReview = makeReview("team-1", 15, 19, 9, 18);
const teamTenReview = makeReview("team-10", 7, 15, 5, 14);

describe("aggregateOperatingReviews", () => {
    it("caps additive selected-team metrics at the All Teams total", () => {
        const aggregate = aggregateOperatingReviews({
            ceilingReview: allTeamsReview,
            reviews: [teamOneReview, teamTenReview],
            teamIds: ["team-1", "team-10"],
        });

        const deliveryMetrics = aggregate.sections[0]?.metrics ?? [];
        expect(deliveryMetrics.find((metric) => metric.key === "throughput")?.value).toBe(15);
        expect(deliveryMetrics.find((metric) => metric.key === "wip_count")?.value).toBe(19);
        expect(aggregate.teamId).toBe("team-1, team-10");
    });

    it("sums investment metrics (delivery units) across teams instead of averaging", () => {
        // team-1: 8 ktlo_units, team-10: 6 ktlo_units, ceiling: 15
        // sum = 14 < ceiling 15, so should be 14 (not average = 7)
        const ceiling = makeReviewWithInvestment(null, 15, 15, 10, 10);
        const t1 = makeReviewWithInvestment("t1", 8, 10, 6, 8);
        const t2 = makeReviewWithInvestment("t2", 6, 8, 4, 6);
        const aggregate = aggregateOperatingReviews({
            ceilingReview: ceiling,
            reviews: [t1, t2],
            teamIds: ["t1", "t2"],
        });
        const investmentSection = aggregate.sections.find((s) => s.key === "investment");
        expect(investmentSection).toBeDefined();
        const ktlo = investmentSection?.metrics.find((m) => m.key === "ktlo_units");
        expect(ktlo?.value).toBe(14); // 8+6=14, capped at ceiling 15
        const newValue = investmentSection?.metrics.find((m) => m.key === "new_value_units");
        expect(newValue?.value).toBe(15); // 10+8=18, capped at ceiling 15
    });
});

// CHAOS-8115: a metric with no stored value carries a 0 placeholder. The combined metric of several
// teams leaves such a team out, for the week and for the prior week apart.
describe("aggregateOperatingReviews with no-data metrics", () => {
    const throughputOf = (review: OperatingReview) =>
        review.sections[0].metrics.find((metric) => metric.key === "throughput")!;
    const withFlags = (review: OperatingReview, hasData: boolean, hasPriorData: boolean) => {
        const copy: OperatingReview = structuredClone(review);
        const metric = throughputOf(copy);
        metric.hasData = hasData;
        metric.delta.hasPriorData = hasPriorData;
        if (!hasData) metric.value = 0;
        if (!hasPriorData) metric.delta.priorValue = 0;
        return copy;
    };
    const combine = (reviews: OperatingReview[]) =>
        throughputOf(
            aggregateOperatingReviews({
                ceilingReview: makeReview(null, 100, 100, 100, 100),
                reviews,
                teamIds: reviews.map((review) => review.teamId ?? ""),
            }),
        );

    it("leaves a team with no data out of the combined value, and stays 'has data'", () => {
        const metric = combine([
            withFlags(makeReview("t1", 7, 1, 5, 1), true, true),
            withFlags(makeReview("t2", 0, 1, 4, 1), false, true),
        ]);
        expect(metric.value).toBe(7);
        expect(metric.hasData).toBe(true);
        // Both teams have a prior week: it is their sum.
        expect(metric.delta.priorValue).toBe(9);
        expect(metric.delta.hasPriorData).toBe(true);
    });

    it("is 'no data' when no selected team has data for the week", () => {
        const metric = combine([
            withFlags(makeReview("t1", 0, 1, 5, 1), false, true),
            withFlags(makeReview("t2", 0, 1, 4, 1), false, true),
        ]);
        expect(metric.hasData).toBe(false);
        expect(metric.delta.hasPriorData).toBe(true);
        expect(metric.delta.priorValue).toBe(9);
    });

    it("leaves a team with no prior data out of the combined prior value; none at all is 'no prior data'", () => {
        const one = combine([
            withFlags(makeReview("t1", 7, 1, 5, 1), true, true),
            withFlags(makeReview("t2", 3, 1, 0, 1), true, false),
        ]);
        expect([one.value, one.delta.priorValue, one.delta.hasPriorData]).toEqual([10, 5, true]);

        const none = combine([
            withFlags(makeReview("t1", 7, 1, 0, 1), true, false),
            withFlags(makeReview("t2", 3, 1, 0, 1), true, false),
        ]);
        expect([none.value, none.hasData, none.delta.hasPriorData]).toEqual([10, true, false]);
    });

    it("does not pull an AVERAGED metric down with a placeholder 0 (week and prior week)", () => {
        // cycle_time is not additive: the combined value is the average of the teams that have one.
        const cycle = (
            teamId: string | null,
            value: number,
            prior: number,
            hasData: boolean,
            hasPriorData: boolean,
        ) => {
            const review = makeReview(teamId, 1, 1, 1, 1);
            review.sections[0].metrics = [
                {
                    key: "cycle_time",
                    label: "Cycle time",
                    value,
                    unit: "hours",
                    hasData,
                    delta: {
                        value,
                        priorValue: prior,
                        absolute: value - prior,
                        percent: null,
                        status: "changed",
                        hasPriorData,
                    },
                },
            ];
            return review;
        };
        const combined = aggregateOperatingReviews({
            ceilingReview: cycle(null, 99, 99, true, true),
            reviews: [cycle("t1", 10, 8, true, true), cycle("t2", 0, 0, false, false)],
            teamIds: ["t1", "t2"],
        }).sections[0].metrics[0];
        // 10 and 8, the values of the one team that has them; not 5 and 4.
        expect([combined.value, combined.delta.priorValue]).toEqual([10, 8]);
        expect([combined.hasData, combined.delta.hasPriorData]).toEqual([true, true]);
    });

    it("keeps the flags true when every team has data (and when an old answer has no flags)", () => {
        const flagged = combine([
            withFlags(makeReview("t1", 7, 1, 5, 1), true, true),
            withFlags(makeReview("t2", 3, 1, 4, 1), true, true),
        ]);
        expect([flagged.hasData, flagged.delta.hasPriorData]).toEqual([true, true]);
        const old = combine([makeReview("t1", 7, 1, 5, 1), makeReview("t2", 3, 1, 4, 1)]);
        expect([old.value, old.delta.priorValue]).toEqual([10, 9]);
        expect(old.hasData).not.toBe(false);
        expect(old.delta.hasPriorData).not.toBe(false);
    });
});

function makeReview(
    teamId: string | null,
    throughput: number,
    wip: number,
    priorThroughput: number,
    priorWip: number,
): OperatingReview {
    return {
        orgId: "org-1",
        teamId,
        weekStart: "2026-05-18",
        priorWeekStart: "2026-05-11",
        recommendations: [],
        recommendationsEmptyState: "No recommendations.",
        sections: [
            {
                key: "delivery_movement",
                title: "Delivery movement",
                changed: [],
                improved: [],
                worsened: [],
                metrics: [
                    makeMetric(
                        "throughput",
                        "Throughput",
                        "items completed",
                        throughput,
                        priorThroughput,
                    ),
                    makeMetric("wip_count", "WIP", "items", wip, priorWip),
                ],
            },
        ],
    };
}

function makeMetric(key: string, label: string, unit: string, value: number, priorValue: number) {
    return {
        key,
        label,
        unit,
        value,
        delta: {
            value,
            priorValue,
            absolute: value - priorValue,
            percent: ((value - priorValue) / priorValue) * 100,
            status: "changed" as const,
        },
    };
}

function makeReviewWithInvestment(
    teamId: string | null,
    ktloUnits: number,
    newValueUnits: number,
    priorKtlo: number,
    priorNewValue: number,
): OperatingReview {
    return {
        orgId: "org-1",
        teamId,
        weekStart: "2026-05-18",
        priorWeekStart: "2026-05-11",
        recommendations: [],
        recommendationsEmptyState: "No recommendations.",
        sections: [
            {
                key: "investment",
                title: "Investment",
                changed: [],
                improved: [],
                worsened: [],
                metrics: [
                    makeMetric("ktlo_units", "KTLO", "delivery units", ktloUnits, priorKtlo),
                    makeMetric(
                        "new_value_units",
                        "New value",
                        "delivery units",
                        newValueUnits,
                        priorNewValue,
                    ),
                ],
            },
        ],
    };
}
