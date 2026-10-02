import { describe, expect, it } from "vitest";

import type { AiImpactBucketRow } from "@/lib/graphql/__generated__/types";
import { agentCreatedTrend } from "../utils";

// CHAOS-7983: the Impact agent-created trend. Today (before `day` exists on the API) the x label is
// the 1-based row index, one point per agent_created row; this pins that so the date change is visible.
function row(bucket: string, prsTotal: number, extra: Record<string, unknown> = {}) {
    return { bucket, prsTotal, ...extra } as unknown as AiImpactBucketRow;
}

describe("agentCreatedTrend", () => {
    it("keeps one point per agent_created row, labelled by 1-based row index", () => {
        expect(
            agentCreatedTrend([
                row("agent_created", 4),
                row("human", 9),
                row("AGENT_CREATED", 6),
                row("ai_assisted", 2),
            ]),
        ).toEqual([
            { day: "1", value: 4 },
            { day: "2", value: 6 },
        ]);
    });

    it("is empty when there is no agent_created row", () => {
        expect(agentCreatedTrend([row("human", 3)])).toEqual([]);
        expect(agentCreatedTrend([])).toEqual([]);
    });
});

// CHAOS-7983 (A2): with the `day` the API now returns, the label is the calendar date. One point per
// row is kept (rows are per repository, team and bucket, so a date can repeat): no per-day sum.
describe("agentCreatedTrend with day", () => {
    it("labels each point by its date, in the order the rows arrive", () => {
        expect(
            agentCreatedTrend([
                row("agent_created", 4, { day: "2026-08-01" }),
                row("human", 9, { day: "2026-08-01" }),
                row("agent_created", 6, { day: "2026-08-12" }),
            ]),
        ).toEqual([
            { day: "Aug 1", value: 4 },
            { day: "Aug 12", value: 6 },
        ]);
    });

    it("keeps two rows of the same date as two points, never a sum", () => {
        expect(
            agentCreatedTrend([
                row("agent_created", 4, { day: "2026-08-02" }),
                row("agent_created", 6, { day: "2026-08-02" }),
            ]),
        ).toEqual([
            { day: "Aug 2", value: 4 },
            { day: "Aug 2", value: 6 },
        ]);
    });

    it("reads the date as a UTC calendar day, whatever the viewer's time zone", () => {
        expect(agentCreatedTrend([row("agent_created", 1, { day: "2026-03-01" })])).toEqual([
            { day: "Mar 1", value: 1 },
        ]);
    });

    it("falls back to the row index for a row without a day, never to a made-up date", () => {
        expect(
            agentCreatedTrend([
                row("agent_created", 4, { day: "2026-08-01" }),
                row("agent_created", 5),
            ]),
        ).toEqual([
            { day: "Aug 1", value: 4 },
            { day: "2", value: 5 },
        ]);
    });
});
