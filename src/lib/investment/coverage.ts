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
