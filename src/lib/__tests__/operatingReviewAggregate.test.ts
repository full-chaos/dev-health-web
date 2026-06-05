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
        expect(deliveryMetrics.find((metric) => metric.key === "wip")?.value).toBe(19);
        expect(aggregate.teamId).toBe("team-1, team-10");
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
                    makeMetric("wip", "WIP", "items", wip, priorWip),
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
