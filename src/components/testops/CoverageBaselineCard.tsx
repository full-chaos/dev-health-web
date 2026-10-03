import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { MeterRows } from "@/components/ui/MeterRows";
import { formatPercent } from "@/lib/formatters";
import {
    baselineOf,
    baselineText,
    baselineTitle,
    type BaselineCell,
    type CoverageBaselinesState,
} from "@/lib/testops/coverageBaselines";
import { Inset } from "@/components/ui/Inset";
import { BRANCH_BREAKDOWN_TOP_N, type RepositoryCoverageRow } from "@/lib/testops/coverageRepos";

type CoverageBaselineCardProps = {
    repositories: RepositoryCoverageRow[];
    /** The served baseline of each repository, or the fact that its read failed. */
    baselines: CoverageBaselinesState;
    fetchFailed?: boolean;
};

/**
 * The approved "Coverage against baseline" card: per repository, its name, then one row per
 * coverage kind with the served value and the served baseline of that kind. Line and branch
 * coverage are the served breakdown values of the repository; a value that is not served reads
 * "Not reported" (never a made-up value, never 0). The baseline is served per repository (its own
 * 30-day average), joined by the repository id: a null value or a missing row reads "Not
 * reported", a failed read "Could not be read". The fill is the served coverage; nothing is
 * computed from the baseline.
 */

/**
 * One meter row of a served percent with its baseline. A coverage value that is not served is
 * null ("Not reported", empty track); a served baseline then stays beside the row name.
 */
const percentRow = (label: string, value: number | null, baseline: BaselineCell) => {
    if (value === null) {
        return baseline.kind === "value"
            ? { key: label, label: `${label} (baseline ${baselineText(baseline)})`, value }
            : { label, value };
    }
    return {
        label,
        value,
        display: `${formatPercent(value)} · baseline ${baselineText(baseline)}`,
        title: baselineTitle(baseline),
    };
};

export function CoverageBaselineCard({
    repositories,
    baselines,
    fetchFailed = false,
}: CoverageBaselineCardProps) {
    return (
        <Section
            title="Coverage against baseline"
            description="Coverage of each repository beside its own baseline."
            data-testid="testops-coverage-baseline"
        >
            {fetchFailed ? (
                <DataState
                    variant="error"
                    title="Coverage could not be loaded"
                    message="Coverage analytics could not be loaded. The repositories will reappear once the data service recovers."
                />
            ) : repositories.length === 0 ? (
                <DataState
                    variant="no-data-connected"
                    title="No repository coverage"
                    description="Repository coverage appears here once connected CI coverage data is available for this scope."
                />
            ) : (
                <div className="space-y-5">
                    {repositories.map((repo) => (
                        <div key={repo.id} data-testid="testops-coverage-baseline-repo">
                            <p
                                className="mb-2.5 text-sm font-semibold text-foreground"
                                title={repo.title}
                            >
                                {repo.name}
                            </p>
                            <MeterRows
                                max={100}
                                aria-label={`${repo.name} coverage`}
                                testId="testops-coverage-meters"
                                rows={[
                                    percentRow(
                                        "Line coverage",
                                        repo.lineCoverage,
                                        baselineOf(baselines, repo.id, "line"),
                                    ),
                                    // A repository outside a cut branch answer has no branch row:
                                    // its figure can exist, so "Not reported" would be false.
                                    ...(repo.branchOutsideList
                                        ? []
                                        : [
                                              percentRow(
                                                  "Branch coverage",
                                                  repo.branchCoverage,
                                                  baselineOf(baselines, repo.id, "branch"),
                                              ),
                                          ]),
                                ]}
                            />
                            {repo.branchOutsideList ? (
                                <p
                                    data-testid="testops-coverage-branch-outside-list"
                                    className="mt-2 text-xs text-(--ink-muted)"
                                >
                                    Branch coverage: this repository is outside the{" "}
                                    {BRANCH_BREAKDOWN_TOP_N} repositories the branch answer lists.
                                </p>
                            ) : null}
                        </div>
                    ))}
                    <Inset
                        flush
                        className="text-xs text-(--ink-muted)"
                        data-testid="testops-coverage-baseline-note"
                    >
                        The baseline of a repository is its own average coverage over the 30 days
                        that end on the last day of the window. A repository with fewer than 7 days
                        of coverage in those 30 days has no baseline.
                    </Inset>
                </div>
            )}
        </Section>
    );
}
