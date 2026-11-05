import { describe, expect, it } from "vitest";

import {
    INVESTMENT_BREAKDOWN_QUERY,
    INVESTMENT_BREAKDOWN_REPOSITORY_QUERY,
    INVESTMENT_BREAKDOWN_TEAM_QUERY,
    TEAM_WORK_ITEM_BREAKDOWN_QUERY,
} from "../queries";

// CHAOS-12738: ops registers InvestmentBreakdownTeam and
// InvestmentBreakdownRepository with the InvestmentBreakdown body under their
// own names, and the wire-parity manifest compares these exports with them.
// The body must stay the InvestmentBreakdown body exactly; only the name moves.
const PREFIX = "query InvestmentBreakdown(";

function bodyAfter(query: string, name: string): string {
    const marker = `query ${name}(`;
    const at = query.indexOf(marker);
    expect(at).toBeGreaterThanOrEqual(0);
    expect(query.indexOf(marker, at + 1)).toBe(-1);
    return query.slice(0, at) + query.slice(at + marker.length);
}

describe("scoped investment breakdown queries", () => {
    it("keep the InvestmentBreakdown body under their own operation names", () => {
        const base = bodyAfter(INVESTMENT_BREAKDOWN_QUERY, "InvestmentBreakdown");
        expect(bodyAfter(INVESTMENT_BREAKDOWN_TEAM_QUERY, "InvestmentBreakdownTeam")).toBe(base);
        expect(
            bodyAfter(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY, "InvestmentBreakdownRepository"),
        ).toBe(base);
        expect(bodyAfter(TEAM_WORK_ITEM_BREAKDOWN_QUERY, "TeamWorkItemBreakdown")).toBe(base);
    });

    it("no longer carry the InvestmentBreakdown operation name", () => {
        expect(INVESTMENT_BREAKDOWN_TEAM_QUERY).not.toContain(PREFIX);
        expect(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY).not.toContain(PREFIX);
        expect(INVESTMENT_BREAKDOWN_TEAM_QUERY).not.toBe(INVESTMENT_BREAKDOWN_REPOSITORY_QUERY);
        expect(TEAM_WORK_ITEM_BREAKDOWN_QUERY).not.toContain(PREFIX);
        expect(TEAM_WORK_ITEM_BREAKDOWN_QUERY).not.toBe(INVESTMENT_BREAKDOWN_TEAM_QUERY);
    });
});
