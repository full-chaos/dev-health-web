import { describe, expect, it } from "vitest";

import {
    baselineEndDate,
    baselineOf,
    baselineText,
    baselineTitle,
    coverageBaselinesFailed,
    type RepoCoverageBaseline,
    scopeBaselineCell,
} from "../coverageBaselines";

const row = (over: Partial<RepoCoverageBaseline> = {}): RepoCoverageBaseline => ({
    repoId: "repo-1",
    repoName: "full-chaos/dev-health-web",
    lineBaselinePct: 58.2,
    lineDays: 22,
    branchBaselinePct: 51,
    branchDays: 20,
    ...over,
});

describe("baselineEndDate", () => {
    it("is the day after the last day of the window: the 30 days then end on that last day", () => {
        expect(baselineEndDate("2026-09-14")).toBe("2026-09-15");
    });

    it("crosses a month end and a year end", () => {
        expect(baselineEndDate("2026-09-30")).toBe("2026-10-01");
        expect(baselineEndDate("2026-12-31")).toBe("2027-01-01");
    });

    it("knows a leap day", () => {
        expect(baselineEndDate("2028-02-28")).toBe("2028-02-29");
        expect(baselineEndDate("2027-02-28")).toBe("2027-03-01");
    });
});

describe("baselineOf", () => {
    it("gives the served line and branch baseline of the repository with their days", () => {
        const rows = [row({ repoId: "repo-0", lineBaselinePct: 90 }), row()];
        expect(baselineOf(rows, "repo-1", "line")).toEqual({ kind: "value", pct: 58.2, days: 22 });
        expect(baselineOf(rows, "repo-1", "branch")).toEqual({ kind: "value", pct: 51, days: 20 });
    });

    it("a null baseline is no baseline: never 0", () => {
        const rows = [row({ lineBaselinePct: null, lineDays: 3 })];
        expect(baselineOf(rows, "repo-1", "line")).toEqual({ kind: "none" });
        // The branch baseline of the same row is still its own served value.
        expect(baselineOf(rows, "repo-1", "branch")).toEqual({ kind: "value", pct: 51, days: 20 });
    });

    it("a repository with no row has no baseline", () => {
        expect(baselineOf([row()], "repo-2", "line")).toEqual({ kind: "none" });
        expect(baselineOf([], "repo-1", "branch")).toEqual({ kind: "none" });
    });

    it("a served baseline of 0 is a value", () => {
        expect(baselineOf([row({ branchBaselinePct: 0 })], "repo-1", "branch")).toEqual({
            kind: "value",
            pct: 0,
            days: 20,
        });
    });

    it("a failed read is 'failed' for every repository, not 'no baseline'", () => {
        expect(baselineOf({ fetchFailed: true }, "repo-1", "line")).toEqual({ kind: "failed" });
        expect(coverageBaselinesFailed({ fetchFailed: true })).toBe(true);
        expect(coverageBaselinesFailed([])).toBe(false);
    });
});

describe("baselineText and baselineTitle", () => {
    it("writes a served baseline as a percent, with the days as its title", () => {
        const cell = baselineOf([row()], "repo-1", "line");
        expect(baselineText(cell)).toBe("58%");
        expect(baselineTitle(cell)).toBe("30-day average of 22 days");
        expect(baselineTitle({ kind: "value", pct: 70, days: 1 })).toBe("30-day average of 1 day");
    });

    it("writes 'Not reported' for no baseline and 'Could not be read' for a failed read", () => {
        expect(baselineText({ kind: "none" })).toBe("Not reported");
        expect(baselineText({ kind: "failed" })).toBe("Could not be read");
        expect(baselineTitle({ kind: "none" })).toBeUndefined();
        expect(baselineTitle({ kind: "failed" })).toBeUndefined();
    });

    it("writes a served 0 as '0%'", () => {
        expect(baselineText({ kind: "value", pct: 0, days: 9 })).toBe("0%");
    });
});

// The baseline of the whole scope (`coverageScopeBaseline`): one served value, the 30-day mean of
// the day values the Line Coverage Trend draws.
describe("scopeBaselineCell", () => {
    it("gives the served value with its days", () => {
        expect(scopeBaselineCell({ lineBaselinePct: 82.6, lineDays: 30 })).toEqual({
            kind: "value",
            pct: 82.6,
            days: 30,
        });
    });

    it("a null baseline is no baseline: never 0", () => {
        expect(scopeBaselineCell({ lineBaselinePct: null, lineDays: 4 })).toEqual({ kind: "none" });
    });

    it("a served 0 is a value", () => {
        expect(scopeBaselineCell({ lineBaselinePct: 0, lineDays: 12 })).toEqual({
            kind: "value",
            pct: 0,
            days: 12,
        });
    });

    it("a failed read is 'failed', not 'no baseline'", () => {
        expect(scopeBaselineCell({ fetchFailed: true })).toEqual({ kind: "failed" });
    });
});
