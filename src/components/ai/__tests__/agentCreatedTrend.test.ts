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
