import { describe, expect, it } from "vitest";

import {
    reworkCoverageNote,
    reworkCoveragePercentText,
    withReworkCoverageNote,
} from "@/lib/metrics/coverageNote";

describe("reworkCoveragePercentText", () => {
    it.each([
        [null, null],
        [undefined, null],
        [Number.NaN, null],
        [0, null],
        [0.004, "<1%"],
        [0.0099, "<1%"],
        [0.01, "1%"],
        [0.0704, "7%"],
        [0.5, "50%"],
        [0.996, "99%"],
        [0.9951, "99%"],
        [1, null],
        [1.2, null],
    ])("%s -> %s", (coverage, text) => {
        expect(reworkCoveragePercentText(coverage as number | null | undefined)).toBe(text);
    });
});

describe("reworkCoverageNote", () => {
    const measured = { metric: "pr_rework_ratio", has_data: true, rate_state: "measured" };

    it("names the coverage of a measured rework ratio", () => {
        expect(reworkCoverageNote({ ...measured, rate_coverage: 0.0704 })).toBe(
            "Based on 7% of merged pull requests",
        );
        expect(reworkCoverageNote({ ...measured, rate_coverage: 0.004 })).toBe(
            "Based on <1% of merged pull requests",
        );
    });

    it("draws nothing at 1, null, 0, no data, a not-measured state or another metric", () => {
        expect(reworkCoverageNote({ ...measured, rate_coverage: 1 })).toBeNull();
        expect(reworkCoverageNote({ ...measured, rate_coverage: null })).toBeNull();
        expect(reworkCoverageNote({ ...measured, rate_coverage: 0 })).toBeNull();
        expect(reworkCoverageNote({ ...measured, has_data: false, rate_coverage: 0.5 })).toBeNull();
        expect(
            reworkCoverageNote({
                ...measured,
                rate_state: "unknown_no_review_evidence",
                rate_coverage: 0.5,
            }),
        ).toBeNull();
        expect(
            reworkCoverageNote({ ...measured, metric: "ci_success", rate_coverage: 0.5 }),
        ).toBeNull();
        expect(reworkCoverageNote(null)).toBeNull();
    });

    it("appends to a caption with a dot", () => {
        const row = { ...measured, rate_coverage: 0.5 };
        expect(withReworkCoverageNote("PRs requiring rework", row)).toBe(
            "PRs requiring rework · Based on 50% of merged pull requests",
        );
        expect(withReworkCoverageNote(undefined, row)).toBe("Based on 50% of merged pull requests");
        expect(withReworkCoverageNote("x", { ...row, rate_coverage: 1 })).toBe("x");
    });
});
