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
