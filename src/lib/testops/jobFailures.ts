import { z } from "zod";

import type { MeterRow } from "@/components/ui/MeterRows";
import { formatNumber, formatPercent } from "@/lib/formatters";

/**
 * Failing workflows and jobs (CHAOS-8514): the answer of `testopsJobFailures`.
 *
 * One group per (workflow name, job name, provider), only groups with a failed run, most failed
 * runs first. `failureRate` is the served share of failed runs, from 0 to 1. The web writes the
 * served numbers; it computes none of them.
 */
export const JobFailureGroupSchema = z.object({
    /** Null = the job run has no stored pipeline row: the job name stands alone. */
    workflowName: z.string().nullable(),
    jobName: z.string(),
    provider: z.string().nullable(),
    runs: z.number(),
    failedRuns: z.number(),
    /** A share from 0 to 1, not a percent. Null = not served. */
    failureRate: z.number().nullable(),
});

export const JobFailuresResultSchema = z.object({
    groups: z.array(JobFailureGroupSchema),
    /** The number of groups before the limit. */
    totalCount: z.number(),
    /** More groups exist than were served. */
    truncated: z.boolean(),
});

export type JobFailureGroup = z.infer<typeof JobFailureGroupSchema>;
export type JobFailuresResult = z.infer<typeof JobFailuresResultSchema>;

/** What the card gets: the served answer, or the fact that the read failed. */
export type JobFailuresState = JobFailuresResult | { fetchFailed: true };

export const jobFailuresFailed = (state: JobFailuresState): state is { fetchFailed: true } =>
    "fetchFailed" in state;

const failedOfRuns = (group: JobFailureGroup) =>
    `${formatNumber(group.failedRuns)} of ${formatNumber(group.runs)} ${group.runs === 1 ? "run" : "runs"} failed`;

/**
 * One meter row per served group, in the served order. The fill is the served failure rate (a
 * full track is 1); the text is that rate as a percent and the served counts. A rate that is not
 * served is a row with no value ("Not reported"); its served counts then go beside the name.
 */
export function jobFailureRows(groups: readonly JobFailureGroup[]): MeterRow[] {
    return groups.map((group) => {
        const name = group.workflowName
            ? `${group.jobName} · ${group.workflowName}`
            : group.jobName;
        const key = [group.workflowName ?? "", group.jobName, group.provider ?? ""].join("\u0000");
        if (group.failureRate === null) {
            return { key, label: `${name} (${failedOfRuns(group)})`, value: null };
        }
        return {
            key,
            label: name,
            value: group.failureRate,
            display: `${formatPercent(group.failureRate * 100)} · ${failedOfRuns(group)}`,
        };
    });
}

/** The note for a cut list, from the served `truncated` flag and `totalCount`; null when complete. */
export function jobFailureCutNote(result: JobFailuresResult): string | null {
    if (!result.truncated) return null;
    return `Showing ${formatNumber(result.groups.length)} of ${formatNumber(result.totalCount)} job groups, the ones with the most failed runs.`;
}
