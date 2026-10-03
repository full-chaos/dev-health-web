import { DataState } from "@/components/ui/DataState";
import { Section } from "@/components/ui/Section";
import { MeterRows } from "@/components/ui/MeterRows";
import { formatPercent } from "@/lib/formatters";
import type { RepositoryCoverageRow } from "@/lib/testops/coverageRepos";

type CoverageBaselineCardProps = {
    repositories: RepositoryCoverageRow[];
    /** The one product target baseline (percent). */
    baselinePct: number;
    fetchFailed?: boolean;
};

/**
 * The approved "Coverage against baseline" card: per repository, its name, then one row per
 * coverage kind with the served value. Line and branch coverage are the served breakdown values
 * of the repository; a value that is not served reads "Not reported" (never a made-up value, never
 * 0). The baseline is the one product target, shown once in the card head.
 */

/** One meter row of a served percent; null = not served ("Not reported", empty track). */
const percentRow = (label: string, value: number | null) =>
    value === null ? { label, value } : { label, value, display: formatPercent(value) };

export function CoverageBaselineCard({
    repositories,
    baselinePct,
    fetchFailed = false,
}: CoverageBaselineCardProps) {
    const baselineLabel = `${formatPercent(baselinePct)} baseline`;
    return (
        <Section
            title="Coverage against baseline"
            description="Coverage of each repository; the baseline is the one line-coverage target."
            action={
                <span
                    data-testid="testops-coverage-baseline-pill"
                    className="inline-flex items-center rounded-full bg-(--info)/12 px-2.25 py-0.5 text-label-caps text-(--info)"
                >
                    {baselineLabel}
                </span>
            }
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
                                    percentRow("Line coverage", repo.lineCoverage),
                                    percentRow("Branch coverage", repo.branchCoverage),
                                ]}
                            />
                        </div>
                    ))}
                    <div className="rounded-(--radius-sm) bg-background p-3.75 text-xs text-(--ink-muted)">
                        The baseline is one product target ({formatPercent(baselinePct)} line
                        coverage) for every repository. A per-repository baseline is not reported
                        yet.
                    </div>
                </div>
            )}
        </Section>
    );
}
