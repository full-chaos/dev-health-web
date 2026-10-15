import type { SankeyResponse } from "@/lib/types";

export type FlowCoverage = {
    /** Backend-produced team coverage, or `null` when the backend did not produce one. */
    team: number | null;
    /** Backend-produced repo coverage, or `null` when the backend did not produce one. */
    repo: number | null;
};

/** A value counts as produced only when it is a finite number. `0` is produced. */
const produced = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Read the team/repo coverage a sankey response carries.
 *
 * Missing is not zero: when the backend's coverage query fails it degrades
 * coverage to null, and a null / absent / non-finite leaf must stay `null`
 * here so callers render "unavailable" instead of a measured-looking 0 %.
 * Only a finite number the backend produced (including 0) is returned as a
 * number. Never use a falsy check on the result -- 0 is a produced value.
 */
export function readFlowCoverage(flow: SankeyResponse | null | undefined): FlowCoverage {
    if (!flow) {
        return { team: null, repo: null };
    }
    return {
        team: produced(flow.coverage?.team) ?? produced(flow.team_coverage),
        repo: produced(flow.coverage?.repo) ?? produced(flow.repo_coverage),
    };
}

/** Plain reason shown wherever a coverage value was not produced. */
export const COVERAGE_UNAVAILABLE_REASON = "Coverage could not be computed for this window";

export type SizingReading =
    | { state: "not-measured" }
    | { state: "measured"; coverage: number; unsized: number | null; mostlyCount: boolean };

/** Below this share of sized work units, most units count 1: the answer is mostly a count. */
export const MOSTLY_COUNT_BELOW = 0.5;

/**
 * Read the issue-size coverage of an ISSUE_SIZE answer. Missing is not healthy: a coverage the
 * backend did not produce is "not-measured", never a full or a fine reading. `0` is produced.
 */
export function readSizingCoverage(
    coverage: number | null | undefined,
    unsized: number | null | undefined,
): SizingReading {
    const share = produced(coverage);
    if (share === null) {
        return { state: "not-measured" };
    }
    return {
        state: "measured",
        coverage: share,
        unsized: produced(unsized),
        mostlyCount: share < MOSTLY_COUNT_BELOW,
    };
}

/** The sizing reading of the first flow that carries one. */
export function readFlowSizing(...flows: Array<SankeyResponse | null | undefined>): SizingReading {
    for (const flow of flows) {
        const reading = readSizingCoverage(flow?.coverage?.sizing, flow?.coverage?.unsized_units);
        if (reading.state === "measured") {
            return reading;
        }
    }
    return { state: "not-measured" };
}
