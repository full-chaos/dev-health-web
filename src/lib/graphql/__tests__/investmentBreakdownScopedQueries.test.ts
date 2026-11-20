import { describe, expect, it } from "vitest";

import {
    INVESTMENT_BREAKDOWN_QUERY,
    INVESTMENT_BREAKDOWN_REPOSITORY_QUERY,
    INVESTMENT_BREAKDOWN_TEAM_QUERY,
    TEAM_WORK_ITEM_BREAKDOWN_QUERY,
} from "../queries";

// CHAOS-12738 / CHAOS-14428: ops registers InvestmentBreakdownTeam,
// InvestmentBreakdownRepository and TeamWorkItemBreakdown under their own
// names, and the wire-parity manifest compares these exports with them. The
// current ops text selects evidenceQualityStats.sizedUnitCount, which the
// org-level InvestmentBreakdown text does not, so the scoped bodies are pinned
// here to the ops text itself and are no longer the org body under another name.
const PREFIX = "query InvestmentBreakdown(";

function scopedText(name: string): string {
    return `
query ${name}($orgId: String!, $batch: AnalyticsRequestInput!) {
  analytics(orgId: $orgId, batch: $batch) {
    breakdowns {
      dimension
      measure
      items {
        key
        value
      }
    }
    evidenceQualityDistribution
    evidenceQualityStats {
      mean
      stddev
      total
      bandCounts
      uncategorizedCount
      sizedUnitCount
    }
  }
}
`;
}

describe("scoped investment breakdown queries", () => {
    it("are the current ops text of each operation, selecting sizedUnitCount", () => {
        expect(INVESTMENT_BREAKDOWN_TEAM_QUERY).toBe(scopedText("InvestmentBreakdownTeam"));
        expect(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY).toBe(
            scopedText("InvestmentBreakdownRepository"),
        );
        expect(TEAM_WORK_ITEM_BREAKDOWN_QUERY).toBe(scopedText("TeamWorkItemBreakdown"));
    });

    it("leave the org-level InvestmentBreakdown text without sizedUnitCount", () => {
        expect(INVESTMENT_BREAKDOWN_QUERY).not.toContain("sizedUnitCount");
    });

    it("no longer carry the InvestmentBreakdown operation name", () => {
        expect(INVESTMENT_BREAKDOWN_TEAM_QUERY).not.toContain(PREFIX);
        expect(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY).not.toContain(PREFIX);
        expect(INVESTMENT_BREAKDOWN_TEAM_QUERY).not.toBe(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY);
        expect(TEAM_WORK_ITEM_BREAKDOWN_QUERY).not.toContain(PREFIX);
        expect(TEAM_WORK_ITEM_BREAKDOWN_QUERY).not.toBe(INVESTMENT_BREAKDOWN_TEAM_QUERY);
    });
});
