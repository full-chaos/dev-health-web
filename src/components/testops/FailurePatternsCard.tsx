import { HeatmapChart } from "@/components/charts/HeatmapChart";
import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { formatPercent } from "@/lib/formatters";
import { UNATTRIBUTED_LABEL, type FailurePatternsModel } from "@/lib/testops/failure-patterns";

type FailurePatternsCardProps = {
    /** `buildFailurePatternsModel` of the served failure-rate breakdown. */
    model: FailurePatternsModel;
    /** The analytics request failed: an error is shown, never an empty "no failures" state. */
    fetchFailed?: boolean;
};

/**
 * The "Failure patterns" section card (TestOps Overview and Pipelines).
 *
 * The values are the served failure-rate breakdown; nothing is computed here. Four states:
 * request failed, no breakdown rows, only the Unattributed bucket (the approved empty state: an
 * attribution gap is not relabelled as a failure class), or real groups (the heatmap).
 */
export function FailurePatternsCard({ model, fetchFailed = false }: FailurePatternsCardProps) {
    const groups = model.heatmap.axes.x;
    const onlyUnattributed = groups.length === 1 && groups[0] === UNATTRIBUTED_LABEL;
    const unattributedCell = model.heatmap.cells.find((cell) => cell.x === UNATTRIBUTED_LABEL);

    return (
        <Section
            title="Failure patterns"
            description="Failure rate within each group: a different denominator from the headline Failure Rate, so the figures are not directly comparable."
            data-testid="testops-failure-patterns"
        >
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
                    <div className="h-64">
                        <HeatmapChart data={model.heatmap} />
                    </div>
                    {model.hasUnattributed ? (
                        <p className="mt-3 text-xs text-(--ink-muted)">
                            &ldquo;{UNATTRIBUTED_LABEL}&rdquo; groups failures with no attribution
                            in the source data &mdash; read its share as a data-quality caveat, not
                            a real category.
                        </p>
                    ) : null}
                </>
            )}
        </Section>
    );
}
