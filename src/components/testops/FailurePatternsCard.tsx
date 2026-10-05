import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { MeterRows } from "@/components/ui/MeterRows";
import { formatPercent } from "@/lib/formatters";
import { READ_FAILED_MESSAGE } from "@/lib/readFailure";
import { UNATTRIBUTED_LABEL, type FailurePatternsModel } from "@/lib/testops/failure-patterns";
import {
    jobFailureCutNote,
    jobFailureRows,
    jobFailuresFailed,
    type JobFailuresState,
} from "@/lib/testops/jobFailures";

type FailurePatternsCardProps = {
    /** `buildFailurePatternsModel` of the served failure-rate breakdown. */
    model: FailurePatternsModel;
    /** The analytics request failed: an error is shown, never an empty "no failures" state. */
    fetchFailed?: boolean;
    /**
     * The served failing workflows and jobs (TestOps Overview), or the fact that their read
     * failed. Left out on a page that does not read them: the card then has the team part only.
     */
    jobFailures?: JobFailuresState;
};

const STATE = "text-sm text-(--ink-muted)";
const PART_HEADING = "mb-2.5 text-label-caps uppercase text-(--ink-muted)";

/** "What fails": one meter row per served workflow and job group. Three states, apart. */
function JobFailures({ state }: { state: JobFailuresState }) {
    const cutNote = jobFailuresFailed(state) ? null : jobFailureCutNote(state);
    return (
        <div className="mb-5" data-testid="testops-job-failures">
            <h3 className={PART_HEADING}>Failing workflows and jobs</h3>
            {jobFailuresFailed(state) ? (
                <p className={STATE} data-testid="testops-job-failures-failed">
                    {READ_FAILED_MESSAGE}
                </p>
            ) : state.groups.length === 0 ? (
                <p className={STATE} data-testid="testops-job-failures-empty">
                    No data for this window
                </p>
            ) : (
                <>
                    <MeterRows
                        rows={jobFailureRows(state.groups)}
                        max={1}
                        aria-label="Failure rate by workflow and job"
                        testId="testops-job-failure-rows"
                    />
                    {cutNote ? (
                        <p
                            className="mt-3 text-xs text-(--ink-muted)"
                            data-testid="testops-job-failures-cut"
                        >
                            {cutNote}
                        </p>
                    ) : null}
                </>
            )}
        </div>
    );
}

/**
 * The "Failure patterns" section card (TestOps Overview and Pipelines).
 *
 * Two parts. "What fails": the served workflow and job groups as meter rows (TestOps Overview).
 * "Which team": the served failure-rate breakdown; nothing is computed here. Its four states:
 * request failed, no breakdown rows, only the Unattributed bucket (the approved empty state: an
 * attribution gap is not relabelled as a failure class), or real groups (the heatmap).
 */
export function FailurePatternsCard({
    model,
    fetchFailed = false,
    jobFailures,
}: FailurePatternsCardProps) {
    const groups = model.heatmap.axes.x;
    const onlyUnattributed = groups.length === 1 && groups[0] === UNATTRIBUTED_LABEL;
    const unattributedCell = model.heatmap.cells.find((cell) => cell.x === UNATTRIBUTED_LABEL);

    return (
        <Section
            title="Failure patterns"
            description="Failure rate within each group: a different denominator from the headline Failure Rate, so the figures are not directly comparable."
            data-testid="testops-failure-patterns"
        >
            {jobFailures ? <JobFailures state={jobFailures} /> : null}
            <div data-testid="testops-failure-teams">
                {jobFailures ? <h3 className={PART_HEADING}>By team</h3> : null}
                {fetchFailed ? (
                    <DataState
                        variant="error"
                        title="Failure patterns could not be loaded"
                        message="Pipeline analytics could not be loaded. The breakdown will reappear once the data service recovers."
                    />
                ) : model.isEmpty ? (
                    <DataState
                        variant="detector-enabled-no-findings"
                        title="No failure patterns"
                        description="No failure data surfaced for this window or scope."
                    />
                ) : onlyUnattributed ? (
                    <DataState
                        variant="insufficient-confidence"
                        title={UNATTRIBUTED_LABEL}
                        description={`Failures in this window have no attribution in the source data${
                            unattributedCell
                                ? ` (failure rate in this group: ${formatPercent(unattributedCell.value)})`
                                : ""
                        }. Read it as a data-quality gap, not a failure class.`}
                        data-testid="testops-failure-patterns-unattributed"
                    />
                ) : (
                    <>
                        {/* No fixed-height wrapper: the heatmap sets its own height and has a legend
                        under it; a 16rem box let it run out of the card. */}
                        <HeatmapChart data={model.heatmap} />
                        {model.hasUnattributed ? (
                            <p className="mt-3 text-xs text-(--ink-muted)">
                                &ldquo;{UNATTRIBUTED_LABEL}&rdquo; groups failures with no
                                attribution in the source data &mdash; read its share as a
                                data-quality caveat, not a real category.
                            </p>
                        ) : null}
                    </>
                )}
            </div>
        </Section>
    );
}
